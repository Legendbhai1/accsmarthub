-- =====================================================================
-- 0018_cart_checkout_stock_guard.sql
--
-- THE CART CHECKOUT'S OVERSELL GUARD WAS DEAD CODE. THIS REPLACES IT.
--
-- `0009_buying_to_delivery_lifecycle.sql` declares
--
--     v_listing public.listings%rowtype;
--
-- and assigns it only on the Buy Now path (`select * into v_listing ...`).
-- The cart branch of the same function then guarded with
--
--     if v_listing.stock < v_item.quantity then
--
-- but on that path `v_listing` is still NULL. `NULL < n` is NULL, and an
-- `if NULL then` body does not execute, so the guard never fired. A cart
-- checkout could therefore buy a quantity larger than the listing's stock,
-- and the `update public.listings set stock = stock - v_item.quantity` below
-- it would drive stock negative.
--
-- The fix reads and locks the listing the loop already selected, so the check
-- is against the same row that is decremented and a concurrent checkout of the
-- last unit cannot also pass. `coalesce` treats a row that has since vanished
-- as zero stock rather than as "unknown", which also fails closed.
--
-- This file is a pure `create or replace` of one function plus its grant, so
-- it is safe to re-run and changes nothing else. It is written to be applied
-- on top of the production schema (0001-0006, then 0013+), which already has
-- this function from 0009.
-- =====================================================================

create or replace function public.checkout(
  p_listing_id uuid,                      -- Buy Now: single listing
  p_cart_ids uuid[],                      -- cart: multi-item; ignored when empty
  p_quantity integer,                     -- Buy Now quantity
  p_idempotency_key text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  -- The cart loop below selects a per-item projection, not a listings row, so
  -- it needs its own record type. Assigning that projection to a
  -- `listings%rowtype` variable raises "invalid input syntax for type uuid"
  -- because the first column is a uuid and the second is text.
  v_item record;
  -- The cart branch used to guard on `v_listing.stock`, but `v_listing` is only
  -- assigned on the Buy Now path, so in the cart branch it was still NULL. The
  -- comparison was therefore `NULL < n`, which is NULL, and an `if NULL then`
  -- body does not run -- the oversell guard was dead code and a buyer could
  -- check out more than the stock. This holds the availability read instead.
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
  -- Derived per-item keys: key || ':' || listing_id. If ANY item already has
  -- an order under a derived key this whole checkout is a retry — return the
  -- first existing order and do not create anything (the function is atomic,
  -- so a partial can never have landed; this is strictly a retry guard).
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

  -- One order per cart item, all in this transaction.
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
    begin
      -- Re-read and lock the listing so the availability check is against the
      -- same row that is decremented below, and two concurrent checkouts of the
      -- last unit cannot both pass it.
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

      -- Written after the order row, which order_payments.order_no references.
      insert into public.order_payments (order_no, method, amount_usd, status, captured_at)
        values (v_item_no, 'wallet', v_total, 'captured', now());

      update public.listing_credentials
         set claimed_by_order = v_item_no, claimed_at = now()
       where id in (
         select id from public.listing_credentials
          where listing_id = v_item.listing_id and claimed_by_order is null
          order by created_at limit v_item.quantity for update skip locked
       );

      perform public.finish_single_order_delivery(v_item_no, v_user);
      if v_first_order_no is null then v_first_order_no := v_item_no; end if;
    end;
  end loop;

  delete from public.cart_items
    where user_id = v_user and listing_id = any(p_cart_ids);

  return coalesce(v_first_order_no, v_order_no);
end;
$$;

grant execute on function public.checkout(uuid, uuid[], integer, text) to authenticated;
