-- =====================================================================
-- 0023_listing_delivery_mode.sql
--
-- MAKE THE DELIVERY MODE EXPLICIT, INSTEAD OF INFERRED AFTER THE FACT.
--
-- HOW IT WORKS TODAY (before this file)
--
-- `listings` has no delivery-mode column. Whether a listing is
-- credential-backed or delivered by hand is inferred *after* the order is
-- created, by counting claimed credential rows:
--
--   `finish_single_order_delivery()`  ->  if claimed > 0 then 'digital'
--
-- and `upload_credentials()` is what ties the two together, by setting
-- `listings.stock` to the number of *unclaimed* credential rows:
--
--   select count(*) into v_free from public.listing_credentials
--    where listing_id = p_listing_id and claimed_by_order is null;
--   update public.listings set stock = v_free where id = p_listing_id;
--
-- So `stock` is normally the size of the free credential pool, and a
-- credential listing that has sold out ends at `stock = 0`.
--
-- WHY INFERENCE IS NOT ENOUGH
--
-- The 0022 guard asserted `claimed in (0, quantity)` for every listing. That
-- cannot distinguish the two legitimate cases from the bug:
--
--   manual listing,  claimed = 0            -> legitimate
--   credential listing, claimed = quantity  -> legitimate
--   credential listing, claimed = 0         -> THE BUG, and 0022 lets it pass
--
-- The last case is reachable. `stock` and the credential pool can drift,
-- because the stock-restore paths (order expiry/refund/cancel) add back
-- `stock` without returning any credential row, while the unclaim paths
-- return the row. Any path that restores the counter without the pool, on a
-- listing whose pool is now empty, leaves a positive `stock` with zero free
-- units — and a checkout against it claims 0 and is treated as a
-- manual-delivery order. The buyer is charged for a digital product that is
-- silently delivered as "nothing to download".
--
-- There is also a second, opposite bug: `place_order` (Buy Now) requires
-- `v_free >= p_quantity` before it will proceed, so a manual-delivery listing
-- (which has no credential rows at all) can never be bought with Buy Now —
-- it always fails with "Not enough accounts in stock". Only the cart path
-- works for manual listings. Making the mode explicit fixes that too.
--
-- THE MODEL
--
--   delivery_mode = 'credential'  -> units must be handed over
--                                    claim must equal quantity
--   delivery_mode = 'manual'      -> nothing is handed over by the platform
--                                    the claim is skipped entirely (zero units)
--
-- `delivery_mode` is pinned by the moderation trigger for a non-trusted
-- writer, the same way `status` and `stock` are. It is set at insert
-- (default 'manual'), promoted to 'credential' by `upload_credentials()`, and
-- otherwise changed only by a trusted (server or admin) writer.
--
-- Backfill: a listing that has any credential row — claimed or free — is
-- 'credential'; anything else is 'manual'. A sold-out credential listing
-- still has its claimed rows, so it stays 'credential'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The column, the backfill and the constraint.
--
-- The default is 'manual': a listing that has not attached any units is
-- delivered by hand. `upload_credentials()` promotes it to 'credential' the
-- moment units exist, so a listing is never sold as credential-backed before
-- it can actually deliver. Every listing is created with `stock = 0` and
-- becomes buyable only once an admin approves it, by which point the mode is
-- settled.
-- ---------------------------------------------------------------------
alter table public.listings
  add column if not exists delivery_mode text not null default 'manual';

-- Backfill for existing rows: anything that has ever had a credential row is
-- credential-backed, including one that has sold out (its claimed rows
-- remain). Everything else is manual. This runs before the constraint, so an
-- unexpected value would be caught rather than silently accepted.
update public.listings l
   set delivery_mode = 'credential'
 where exists (
   select 1 from public.listing_credentials c where c.listing_id = l.id
 );

alter table public.listings drop constraint if exists listings_delivery_mode_check;
alter table public.listings
  add constraint listings_delivery_mode_check
  check (delivery_mode in ('credential','manual'));

-- ---------------------------------------------------------------------
-- 2. Pin the mode in the moderation guard, and only allow it to change
--    while the listing is still unused.
-- ---------------------------------------------------------------------
create or replace function public.guard_listing_moderation()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_trusted_write() then return new; end if;
  if new.seller_id <> old.seller_id then raise exception 'Cannot transfer a listing'; end if;
  if new.status is distinct from old.status then new.status := old.status; end if;
  if new.stock is distinct from old.stock then new.stock := old.stock; end if;
  if new.moderation_note is distinct from old.moderation_note then
    new.moderation_note := old.moderation_note;
  end if;
  if new.moderated_at is distinct from old.moderated_at then
    new.moderated_at := old.moderated_at;
  end if;
  if new.moderated_by is distinct from old.moderated_by then
    new.moderated_by := old.moderated_by;
  end if;

  -- The delivery mode is part of what the buyer is promised, and it decides
  -- which claim assertion runs at checkout. A non-trusted writer cannot change
  -- it at all, the same way it cannot change `status` or `stock`; the mode is
  -- set once at insert, promoted to 'credential' by upload_credentials(), and
  -- otherwise changed only by a trusted (server/admin) writer.
  if new.delivery_mode is distinct from old.delivery_mode then
    new.delivery_mode := old.delivery_mode;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Uploading credentials promotes the listing to 'credential'.
-- ---------------------------------------------------------------------
create or replace function public.upload_credentials(p_listing_id uuid, p_units jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_l public.listings%rowtype; v_n integer := 0; v_u jsonb; v_free integer;
begin
  select * into v_l from public.listings where id = p_listing_id;
  if not found then raise exception 'Listing not found'; end if;
  if v_l.seller_id <> auth.uid() then raise exception 'You do not own this listing'; end if;
  if jsonb_typeof(p_units) <> 'array' then raise exception 'Expected an array'; end if;
  if jsonb_array_length(p_units) > 10000 then raise exception 'Too many units'; end if;

  perform set_config('app.trusted_write','on',true);
  for v_u in select * from jsonb_array_elements(p_units) loop
    if length(coalesce(v_u->>'ciphertext','')) > 87384 then
      raise exception 'A credential file may not exceed 64 KB';
    end if;
    insert into public.listing_credentials
      (listing_id, seller_id, unit_key, ciphertext, file_name)
    values (p_listing_id, auth.uid(),
            coalesce(nullif(v_u->>'unitKey',''), gen_random_uuid()::text),
            decode(v_u->>'ciphertext','base64'),
            coalesce(nullif(v_u->>'fileName',''),'account.txt'))
    on conflict (listing_id, unit_key) do update
      set ciphertext = excluded.ciphertext, file_name = excluded.file_name
      where public.listing_credentials.claimed_by_order is null;
    v_n := v_n + 1;
  end loop;

  select count(*) into v_free from public.listing_credentials
   where listing_id = p_listing_id and claimed_by_order is null;
  -- Attaching units is what makes a listing credential-backed.
  update public.listings
     set stock = v_free,
         delivery_mode = case when v_free > 0 then 'credential' else delivery_mode end
   where id = p_listing_id;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. place_order: mode-aware precheck and post-claim assertion.
--    (Re-defines the 0022 version; the only changes are marked MODE.)
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

  -- MODE: only a credential listing is limited by the credential pool. A
  -- manual listing has no units, so this precheck must not apply to it.
  if v_listing.delivery_mode = 'credential' then
    select count(*) into v_free from public.listing_credentials
     where listing_id = p_listing_id and claimed_by_order is null;
    if v_free < p_quantity then
      raise exception 'Not enough accounts in stock for this listing';
    end if;
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

  -- MODE: only a credential listing hands units over. A manual listing claims
  -- nothing, so the claim is skipped entirely — otherwise stray credential
  -- rows sitting on a manual listing would be wrongly attached to the order.
  v_claimed := 0;
  if v_listing.delivery_mode = 'credential' then
    update public.listing_credentials
       set claimed_by_order = v_order_no, claimed_at = now()
     where id in (
       select id from public.listing_credentials
        where listing_id = p_listing_id and claimed_by_order is null
        order by created_at limit p_quantity for update skip locked);
    get diagnostics v_claimed = row_count;
    if v_claimed <> p_quantity then
      raise exception
        'Not enough accounts in stock for this listing (claimed % of %)',
        v_claimed, p_quantity;
    end if;
  end if;

  return v_order_no;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. checkout: mode-aware post-claim assertion in the cart branch.
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

  -- MODE: `l.delivery_mode` is selected into the loop record so the claim can
  -- be checked against what the listing promises.
  for v_item in
    select c.listing_id, c.quantity, l.title, l.brand, l.price_usd, l.seller_id,
           l.delivery_mode
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

      -- MODE: a manual listing hands nothing over, so the claim is skipped
      -- entirely; a credential listing must claim every unit it charged for.
      -- Accepting 0 for a credential listing is the slip-through this closes.
      v_claimed := 0;
      if v_item.delivery_mode = 'credential' then
        update public.listing_credentials
           set claimed_by_order = v_item_no, claimed_at = now()
         where id in (
           select id from public.listing_credentials
            where listing_id = v_item.listing_id and claimed_by_order is null
            order by created_at limit v_item.quantity for update skip locked
         );
        get diagnostics v_claimed = row_count;
        if v_claimed <> v_item.quantity then
          raise exception
            'Not enough accounts in stock for this listing (claimed % of %)',
            v_claimed, v_item.quantity;
        end if;
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
-- 6. verify_order_payment_webhook: mode-aware post-claim assertion.
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

  -- MODE
  if v_listing.delivery_mode = 'credential' and v_claimed <> v_payment.quantity then
    raise exception
      'Not enough accounts in stock for this listing (claimed % of %)',
      v_claimed, v_payment.quantity;
  end if;
  if v_listing.delivery_mode = 'manual' and v_claimed <> 0 then
    raise exception 'A manual-delivery listing cannot claim credential units';
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
-- Grants: unchanged.
-- ---------------------------------------------------------------------
grant execute on function public.place_order(uuid, integer, text) to authenticated;
grant execute on function public.checkout(uuid, uuid[], integer, text) to authenticated;
grant execute on function public.upload_credentials(uuid, jsonb) to authenticated;
revoke all on function public.verify_order_payment_webhook(
  text, text, text, text, numeric, text, bytea, text) from public, anon, authenticated;
grant execute on function public.verify_order_payment_webhook(
  text, text, text, text, numeric, text, bytea, text) to service_role;
