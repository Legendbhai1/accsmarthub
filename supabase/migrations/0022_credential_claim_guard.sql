-- =====================================================================
-- 0022_credential_claim_guard.sql
--
-- A CHECKOUT MUST RECEIVE EXACTLY THE UNITS IT PAID FOR.
--
-- Every checkout path reserves stock (`listings.stock`) and then claims the
-- matching number of credential rows by flipping `claimed_by_order`:
--
--     update public.listing_credentials
--        set claimed_by_order = <order>, claimed_at = now()
--      where id in (
--        select id from public.listing_credentials
--         where listing_id = <listing> and claimed_by_order is null
--         order by created_at limit <quantity> for update skip locked
--      );
--
-- That statement is a *bounded* update: it claims at most <quantity> rows and
-- silently claims fewer when fewer are free. The surrounding code decrements
-- `listings.stock` by the full <quantity> and charges the buyer for the full
-- <quantity> regardless, so when the credential pool is smaller than the
-- stock counter the buyer is charged for units the order can never deliver.
--
-- `place_order` is the only path that guards this today, with a
-- count-before-claim check (`if v_free < p_quantity then raise`). `checkout`
-- (the cart branch, and Buy Now via `place_order`) and the provider capture
-- path `verify_order_payment_webhook` do not, so:
--
--   * a cart can be checked out at a quantity greater than the credential
--     pool, and
--   * a provider payment can be captured against a listing whose credential
--     pool shrank while the invoice was open.
--
-- THE INVARIANT
--
-- A listing is either credential-backed (it has units to hand out) or
-- manual-delivery (it has none, and the seller delivers by hand). It is never
-- legitimate to claim *some* of the units:
--
--     claimed = 0            -> manual-delivery listing; the seller delivers
--     claimed = quantity     -> digital listing; every unit was handed over
--     0 < claimed < quantity -> BROKEN; the buyer paid for undelivered units
--
-- So the guard is `claimed not in (0, quantity)`, not `claimed = quantity`.
-- Requiring an exact match would break every manual-delivery listing, and
-- asserting the count *before* the claim cannot see a pool that shrank under
-- the `for update skip locked` in the claim statement itself. Counting what
-- was actually claimed, after the fact, is the only check that cannot race.
--
-- `get diagnostics` reports the row count of the immediately preceding
-- statement. It is not allowed directly after `perform`, so each claim site is
-- rewritten as a plain `update` with the diagnostics read straight after it.
-- The raise rolls the whole enclosing transaction back, so a failed checkout
-- charges nobody and reserves nothing.
--
-- This file is a pure `create or replace` of the three functions plus their
-- grants, so it is safe to re-run. Applied on top of 0001-0021, it changes
-- nothing else.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. place_order (Buy Now, and the cart's per-item path via checkout)
-- ---------------------------------------------------------------------
create or replace function public.place_order(
  p_listing_id uuid, p_quantity integer, p_idempotency_key text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_listing public.listings%rowtype;
  v_commission numeric(12,2); v_fee numeric(12,2);
  v_total numeric(12,2); v_net numeric(12,2);
  v_order_no text; v_free integer; v_balance numeric(12,2);
  v_claimed integer;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128 then
    raise exception 'An idempotency key of 8-128 characters is required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception 'Quantity must be between 1 and 1000';
  end if;

  -- Serialise identical concurrent requests on ONE row lock before any
  -- check runs. The unique index alone only catches the race at INSERT
  -- time; this makes the read-check-write sequence atomic too.
  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || p_idempotency_key, 0));

  select order_no into v_order_no from public.orders
   where buyer_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then return v_order_no; end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_listing.status <> 'active' or v_listing.hidden then
    raise exception 'This listing is not available';
  end if;
  if v_listing.seller_id = auth.uid() then
    raise exception 'You cannot buy your own listing';
  end if;
  if not exists (select 1 from public.stores
                  where user_id = v_listing.seller_id and status = 'approved') then
    raise exception 'This seller is not currently approved';
  end if;

  select count(*) into v_free from public.listing_credentials
   where listing_id = p_listing_id and claimed_by_order is null;
  if v_free < p_quantity then
    raise exception 'Not enough accounts in stock for this listing';
  end if;
  if v_listing.stock < p_quantity then
    raise exception 'Not enough stock available';
  end if;

  select balance_usd into v_balance from public.wallets
   where user_id = auth.uid() for update;

  v_commission := round(v_listing.price_usd * p_quantity * 0.10, 2);
  v_fee        := round(v_listing.price_usd * p_quantity * 0.03, 2);
  v_total      := v_listing.price_usd * p_quantity + v_fee;
  v_net        := v_listing.price_usd * p_quantity - v_commission;

  if coalesce(v_balance,0) < v_total then
    raise exception 'Insufficient balance. Add funds to your wallet first.';
  end if;

  perform set_config('app.trusted_write','on',true);
  v_order_no := 'AMH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  -- Buyer pays the full total; the seller's share is held on the SELLER's
  -- wallet until the buyer confirms. gross = commission + net, and every
  -- term is stored on the order so the split is auditable.
  perform public.apply_wallet(auth.uid(), -v_total, 0, 'purchase', v_order_no, null);
  perform public.apply_wallet(v_listing.seller_id, 0, v_net,
                              'escrow_hold', v_order_no, null);

  update public.listings set stock = stock - p_quantity where id = p_listing_id;

  insert into public.orders (
    order_no, listing_id, listing_title, brand, buyer_id, seller_id, quantity,
    unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
    commission_rate, commission_amount, seller_net_amount,
    idempotency_key, escrow_expires_at)
  values (v_order_no, v_listing.id, v_listing.title, v_listing.brand,
          auth.uid(), v_listing.seller_id, p_quantity, v_listing.price_usd,
          v_listing.price_usd * p_quantity, v_fee, v_total,
          0.1, v_commission, v_net, p_idempotency_key, now() + interval '14 days');

  -- A plain `update` (not `perform`) so `get diagnostics` can read the row
  -- count of the claim itself.
  update public.listing_credentials
     set claimed_by_order = v_order_no, claimed_at = now()
   where id in (
     select id from public.listing_credentials
      where listing_id = p_listing_id and claimed_by_order is null
      order by created_at limit p_quantity for update skip locked);
  get diagnostics v_claimed = row_count;

  -- 0 units is a manual-delivery listing and is legitimate; a partial claim
  -- means the pool shrank under the claim statement. Fail closed and roll the
  -- whole order back rather than charge for units we cannot deliver.
  if v_claimed not in (0, p_quantity) then
    raise exception
      'Not enough accounts in stock for this listing (claimed % of %)',
      v_claimed, p_quantity;
  end if;

  return v_order_no;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. checkout (cart branch; Buy Now delegates to place_order)
-- ---------------------------------------------------------------------
create or replace function public.checkout(
  p_listing_id uuid,
  p_cart_ids uuid[],
  p_quantity integer,
  p_idempotency_key text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_item record;
  v_available integer;
  v_order_no text;
  v_first_order_no text := null;
  v_any_existing boolean := false;
begin
  if v_user is null then raise exception 'Signed in only'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'An idempotency key of at least 8 characters is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_idempotency_key, 0));

  -- ---- Buy Now (single item) ----
  if p_cart_ids is null or array_length(p_cart_ids, 1) is null
     or array_length(p_cart_ids, 1) = 0 then
    if p_listing_id is null then
      raise exception 'A listing is required for a Buy Now checkout';
    end if;
    if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
      raise exception 'Quantity must be between 1 and 1000';
    end if;

    select order_no into v_order_no from public.orders
      where buyer_id = v_user and idempotency_key = p_idempotency_key;
    if found then return v_order_no; end if;

    v_order_no := public.place_order(p_listing_id, p_quantity, p_idempotency_key);
    perform public.finish_single_order_delivery(v_order_no, v_user);
    return v_order_no;
  end if;

  -- ---- Cart (multi-item) ----
  for v_item in
    select id from public.listings where id = any(p_cart_ids) for update skip locked loop
    if exists (select 1 from public.orders
               where buyer_id = v_user
                 and idempotency_key = (p_idempotency_key || ':' || v_item.id::text)) then
      v_any_existing := true;
    end if;
  end loop;

  if v_any_existing then
    select order_no into v_order_no from public.orders
      where buyer_id = v_user
        and idempotency_key like (p_idempotency_key || ':%')
      order by created_at asc limit 1;
    return v_order_no;
  end if;

  for v_item in
    select c.listing_id, c.quantity, l.title, l.brand, l.price_usd, l.seller_id
      from public.cart_items c
      join public.listings l on l.id = c.listing_id
      where c.user_id = v_user and c.listing_id = any(p_cart_ids)
      order by c.added_at
      for update skip locked loop
    declare
      v_derived text := p_idempotency_key || ':' || v_item.listing_id::text;
      v_subtotal numeric(12,2);
      v_escrow_fee numeric(12,2);
      v_total numeric(12,2);
      v_commission numeric(12,2);
      v_net numeric(12,2);
      v_balance numeric(12,2);
      v_item_no text;
      v_claimed integer;
    begin
      select stock into v_available
        from public.listings where id = v_item.listing_id for update;
      if coalesce(v_available, 0) < v_item.quantity then
        raise exception 'One of your cart items is out of stock';
      end if;
      if v_item.seller_id = v_user then
        raise exception 'You cannot buy your own listing';
      end if;

      v_subtotal := v_item.price_usd * v_item.quantity;
      v_escrow_fee := round(v_subtotal * 0.03, 2);
      v_total := v_subtotal + v_escrow_fee;
      v_commission := round(v_subtotal * 0.10, 2);
      v_net := v_subtotal - v_commission;

      select balance_usd into v_balance from public.wallets
        where user_id = v_user for update;
      if coalesce(v_balance,0) < v_total then
        raise exception 'Insufficient wallet balance';
      end if;

      perform set_config('app.trusted_write','on',true);
      v_item_no := 'AMH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
      perform public.apply_wallet(v_user, -v_total, 0, 'purchase', v_item_no, null);
      perform public.apply_wallet(v_item.seller_id, 0, v_net, 'escrow_hold', v_item_no, null);

      update public.listings set stock = stock - v_item.quantity
        where id = v_item.listing_id;

      insert into public.orders (
        order_no, listing_id, listing_title, brand, buyer_id, seller_id, quantity,
        unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
        commission_rate, commission_amount, seller_net_amount,
        payment_method, status, idempotency_key, escrow_expires_at,
        delivery_status, inspection_deadline)
      values (v_item_no, v_item.listing_id, v_item.title, v_item.brand,
              v_user, v_item.seller_id, v_item.quantity, v_item.price_usd,
              v_subtotal, v_escrow_fee, v_total,
              0.10, v_commission, v_net,
              'wallet', 'in_escrow', v_derived, now() + interval '14 days',
              'pending', now() + interval '14 days');

      insert into public.order_payments (order_no, method, amount_usd, status, captured_at)
        values (v_item_no, 'wallet', v_total, 'captured', now());

      -- Plain `update` so the claimed count can be read back below.
      update public.listing_credentials
         set claimed_by_order = v_item_no, claimed_at = now()
       where id in (
         select id from public.listing_credentials
          where listing_id = v_item.listing_id and claimed_by_order is null
          order by created_at limit v_item.quantity for update skip locked
       );
      get diagnostics v_claimed = row_count;

      if v_claimed not in (0, v_item.quantity) then
        raise exception
          'Not enough accounts in stock for this listing (claimed % of %)',
          v_claimed, v_item.quantity;
      end if;

      perform public.finish_single_order_delivery(v_item_no, v_user);
      if v_first_order_no is null then v_first_order_no := v_item_no; end if;
    end;
  end loop;

  delete from public.cart_items
    where user_id = v_user and listing_id = any(p_cart_ids);

  return coalesce(v_first_order_no, v_order_no);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. verify_order_payment_webhook (provider capture)
-- ---------------------------------------------------------------------
create or replace function public.verify_order_payment_webhook(
  p_provider text,
  p_track_id text,
  p_event_id text,
  p_provider_status text,
  p_provider_amount numeric,
  p_currency text,
  p_webhook_body bytea,
  p_signature text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_payment public.order_payments%rowtype;
  v_listing public.listings%rowtype;
  v_secret text;
  v_body text;
  v_expected text;
  v_order_no text;
  v_claimed integer;
begin
  if not public.is_trusted_write() then
    raise exception 'Payment webhook verification is server-only';
  end if;
  if p_provider is null or p_track_id is null or p_event_id is null then
    raise exception 'provider, track id and event id are required';
  end if;

  select * into v_payment from public.order_payments
    where provider_track_id = p_track_id
      and method = 'provider'
      and status = 'pending'
    for update;
  if not found then
    return null;
  end if;

  if v_payment.webhook_idempotency_key = p_event_id then
    return v_payment.id;
  end if;

  v_secret := current_setting('app.payment_webhook_secret', true);
  if v_secret is null or v_secret = '' then
    raise exception 'Payment webhook secret is not configured';
  end if;
  v_body := convert_from(p_webhook_body, 'UTF8');
  v_expected := encode(hmac(v_body, v_secret, 'sha512'), 'hex');
  if v_expected <> lower(p_signature) then
    update public.order_payments
      set provider_status = p_provider_status, webhook_payload = p_webhook_body
      where id = v_payment.id;
    raise exception 'Webhook signature mismatch';
  end if;

  if lower(p_provider_status) not in ('paid','successful','completed') then
    update public.order_payments
      set provider_status = p_provider_status,
          webhook_payload = p_webhook_body,
          webhook_idempotency_key = p_event_id,
          status = 'failed'
    where id = v_payment.id;
    if v_payment.listing_id is not null then
      update public.listings set stock = stock + v_payment.quantity
        where id = v_payment.listing_id;
    end if;
    perform public.notify(v_payment.buyer_id, 'payment_failed',
      'Payment failed',
      format('Your payment via %s could not be completed.', p_provider),
      '');
    return v_payment.id;
  end if;

  if v_payment.listing_id is null then
    update public.order_payments
      set provider_status = p_provider_status, webhook_payload = p_webhook_body,
          webhook_idempotency_key = p_event_id, status = 'failed'
    where id = v_payment.id;
    raise exception 'No listing attached to this payment';
  end if;
  select * into v_listing from public.listings
    where id = v_payment.listing_id and status = 'active' and hidden = false
    for update;
  if not found then
    update public.order_payments
      set provider_status = p_provider_status, webhook_payload = p_webhook_body,
          webhook_idempotency_key = p_event_id, status = 'failed'
    where id = v_payment.id;
    update public.listings set stock = stock + v_payment.quantity
      where id = v_payment.listing_id;
    perform public.notify(v_payment.buyer_id, 'payment_failed',
      'Payment failed',
      'The listing is no longer available.',
      '');
    return v_payment.id;
  end if;
  if v_listing.stock < v_payment.quantity then
    update public.order_payments
      set provider_status = p_provider_status, webhook_payload = p_webhook_body,
          webhook_idempotency_key = p_event_id, status = 'failed'
    where id = v_payment.id;
    update public.listings set stock = stock + v_payment.quantity
      where id = v_payment.listing_id;
    perform public.notify(v_payment.buyer_id, 'payment_failed',
      'Payment failed',
      'The listing is out of stock.',
      '');
    return v_payment.id;
  end if;

  declare
    v_subtotal numeric(12,2) := v_listing.price_usd * v_payment.quantity;
    v_total numeric(12,2) := v_subtotal + round(v_subtotal * 0.03, 2);
  begin
    if abs(p_provider_amount - v_total) > 0.009 then
      update public.order_payments
        set provider_status = p_provider_status, provider_amount = p_provider_amount,
            webhook_payload = p_webhook_body, webhook_idempotency_key = p_event_id,
            status = 'failed'
      where id = v_payment.id;
      update public.listings set stock = stock + v_payment.quantity
        where id = v_payment.listing_id;
      perform public.notify(v_payment.buyer_id, 'payment_failed',
        'Payment failed',
        'The amount charged does not match this order.',
        '');
      return v_payment.id;
    end if;
  end;

  perform set_config('app.trusted_write','on',true);
  v_order_no := 'AMH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  update public.order_payments
    set provider_status = p_provider_status,
        provider_amount = p_provider_amount,
        status = 'captured',
        captured_at = now(),
        webhook_payload = p_webhook_body,
        webhook_idempotency_key = p_event_id,
        order_no = v_order_no
    where id = v_payment.id;

  insert into public.orders (
    order_no, listing_id, listing_title, brand, buyer_id, seller_id, quantity,
    unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
    commission_rate, commission_amount, seller_net_amount,
    payment_method, status, idempotency_key, escrow_expires_at,
    delivery_status, inspection_deadline)
  values (v_order_no, v_listing.id, v_listing.title, v_listing.brand,
    v_payment.buyer_id, v_listing.seller_id, v_payment.quantity, v_listing.price_usd,
    v_subtotal, round(v_subtotal * 0.03, 2), v_total,
    0.10, round(v_subtotal * 0.10, 2), v_subtotal - round(v_subtotal * 0.10, 2),
    'provider', 'in_escrow', p_event_id, now() + interval '14 days',
    'pending', now() + interval '14 days');

  update public.listing_credentials
     set claimed_by_order = v_order_no, claimed_at = now()
   where id in (
     select id from public.listing_credentials
      where listing_id = v_listing.id and claimed_by_order is null
      order by created_at limit v_payment.quantity for update skip locked
   );
  get diagnostics v_claimed = row_count;

  -- The stock precheck above only proves the counter; this proves the units.
  if v_claimed not in (0, v_payment.quantity) then
    raise exception
      'Not enough accounts in stock for this listing (claimed % of %)',
      v_claimed, v_payment.quantity;
  end if;

  perform public.finish_single_order_delivery(v_order_no, v_payment.buyer_id);

  perform public.apply_wallet(v_listing.seller_id, 0, v_subtotal - round(v_subtotal * 0.10, 2),
    'escrow_hold', v_order_no, 'provider payment captured');

  perform public.notify(v_payment.buyer_id, 'payment_captured',
    'Payment received',
    format('Your payment for order %s was received and is held until you confirm delivery.', v_order_no),
    v_order_no);

  return v_payment.id;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants: unchanged from 0017/0018/0009. apply_wallet and the sweeper stay
-- server-only; these three keep exactly the callers they already had.
-- ---------------------------------------------------------------------
grant execute on function public.place_order(uuid, integer, text) to authenticated;
grant execute on function public.checkout(uuid, uuid[], integer, text) to authenticated;
revoke all on function public.verify_order_payment_webhook(
  text, text, text, text, numeric, text, bytea, text) from public, anon, authenticated;
grant execute on function public.verify_order_payment_webhook(
  text, text, text, text, numeric, text, bytea, text) to service_role;
