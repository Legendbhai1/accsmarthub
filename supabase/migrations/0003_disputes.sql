-- Disputes.
--
-- The Convex build had a `disputes` table with a full evidence thread. The
-- Supabase port never created one — `orders.status` could become 'disputed'
-- but there was no way to get there and nothing recorded who said what — so
-- the buyer-facing dispute UI was dead on arrival. This adds it back.
--
-- Escrow stays frozen while a dispute is open: `open_dispute` flips the order
-- to 'disputed' but moves no money, and only `resolve_dispute` releases or
-- refunds it.

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_no text not null references public.orders(order_no) on delete cascade,
  opened_by uuid not null references auth.users(id),
  reason text not null,
  detail text not null,
  status text not null default 'open'
    check (status in ('open','under_review','resolved_buyer','resolved_seller','dismissed')),
  resolution_note text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open dispute per order: a second claim on the same order updates the
-- existing row rather than stacking claims.
create unique index if not exists disputes_one_open_per_order
  on public.disputes (order_no)
  where status in ('open','under_review');

create index if not exists disputes_order_idx on public.disputes (order_no);
create index if not exists disputes_status_idx on public.disputes (status, created_at desc);

-- Evidence thread. Append-only: neither party can edit or delete what the
-- other side has already written.
create table if not exists public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists dispute_messages_dispute_idx
  on public.dispute_messages (dispute_id, created_at);

alter table public.disputes enable row level security;
alter table public.dispute_messages enable row level security;

-- The dispute parties are read from the linked order.
create or replace function public.is_dispute_party(p_dispute_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.disputes d
      join public.orders o on o.order_no = d.order_no
     where d.id = p_dispute_id
       and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  ) or public.can_moderate();
$$;

drop policy if exists "parties read disputes" on public.disputes;
create policy "parties read disputes" on public.disputes for select
  using (public.is_dispute_party(id));

-- Only the order buyer may open a dispute on their own order.
drop policy if exists "buyer opens dispute" on public.disputes;
create policy "buyer opens dispute" on public.disputes for insert
  with check (
    auth.uid() = opened_by
    and exists (
      select 1 from public.orders o
       where o.order_no = order_no and o.buyer_id = auth.uid()
    )
  );

drop policy if exists "parties read dispute messages" on public.dispute_messages;
create policy "parties read dispute messages" on public.dispute_messages for select
  using (public.is_dispute_party(dispute_id));

drop policy if exists "parties post dispute messages" on public.dispute_messages;
create policy "parties post dispute messages" on public.dispute_messages for insert
  with check (auth.uid() = author_id and public.is_dispute_party(dispute_id));

-- Buyer opens a dispute. Freezes escrow by flipping the order status; no
-- balance moves until an admin resolves it.
create or replace function public.open_dispute(
  p_order_no text, p_reason text, p_detail text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_d uuid;
begin
  if length(trim(coalesce(p_detail, ''))) < 10 then
    raise exception 'Please describe the problem in at least 10 characters';
  end if;

  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can open a dispute on this order';
  end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'This order can no longer be disputed';
  end if;

  insert into public.disputes (order_no, opened_by, reason, detail)
  values (p_order_no, auth.uid(), p_reason, p_detail)
  returning id into v_d;

  perform set_config('app.trusted_write','on',true);
  update public.orders set status = 'disputed' where order_no = p_order_no;
  return v_d;
end;
$$;

-- Add evidence to an open dispute.
create or replace function public.add_dispute_message(
  p_dispute_id uuid, p_body text
) returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if length(trim(coalesce(p_body, ''))) < 5 then
    raise exception 'Message is too short';
  end if;
  if not public.is_dispute_party(p_dispute_id) then
    raise exception 'You are not a party to this dispute';
  end if;

  select d.status into v_status from public.disputes d where d.id = p_dispute_id;
  if not found then raise exception 'Dispute not found'; end if;
  if v_status not in ('open','under_review') then
    raise exception 'This dispute is closed';
  end if;

  insert into public.dispute_messages (dispute_id, author_id, body)
  values (p_dispute_id, auth.uid(), p_body);
end;
$$;

-- Admin resolves a dispute. Refund the buyer or release to the seller.
--
-- The escrow hold for an in-escrow order lives in the SELLER's locked balance
-- (that is what complete_order releases), so either outcome is a single
-- locked_usd movement plus a ledger row.
create or replace function public.resolve_dispute(
  p_dispute_id uuid, p_outcome text, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_d public.disputes%rowtype; v_o public.orders%rowtype; v_locked numeric(12,2);
begin
  if not public.can_moderate() then raise exception 'Administrators only'; end if;
  if p_outcome not in ('resolved_buyer','resolved_seller','dismissed') then
    raise exception 'Invalid dispute outcome';
  end if;

  select * into v_d from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found'; end if;
  if v_d.status not in ('open','under_review') then
    raise exception 'This dispute is already resolved';
  end if;

  select * into v_o from public.orders where order_no = v_d.order_no for update;

  select locked_usd into v_locked from public.wallets
   where user_id = v_o.seller_id for update;
  if not found or v_locked < v_o.seller_net_amount then
    raise exception 'Escrow hold is missing for this order.';
  end if;

  if p_outcome = 'resolved_buyer' then
    -- Seller's escrow hold is released back; the buyer is refunded in full.
    perform public.apply_wallet(v_o.seller_id, 0, -v_o.seller_net_amount,
                                'escrow_release', v_o.order_no, 'dispute refund');
    perform public.apply_wallet(v_o.buyer_id, v_o.gross_amount, 0,
                                'refund', v_o.order_no, 'dispute resolved for buyer');
    perform set_config('app.trusted_write','on',true);
    update public.orders set status = 'refunded' where order_no = v_o.order_no;
  elsif p_outcome = 'resolved_seller' then
    perform public.apply_wallet(v_o.seller_id, v_o.seller_net_amount,
                                -v_o.seller_net_amount,
                                'escrow_release', v_o.order_no, 'dispute resolved for seller');
    perform set_config('app.trusted_write','on',true);
    update public.orders set status = 'completed' where order_no = v_o.order_no;
  else
    -- Dismissed: the dispute was unfounded, so escrow releases as normal.
    perform public.apply_wallet(v_o.seller_id, v_o.seller_net_amount,
                                -v_o.seller_net_amount,
                                'escrow_release', v_o.order_no, 'dispute dismissed');
    perform set_config('app.trusted_write','on',true);
    update public.orders set status = 'completed' where order_no = v_o.order_no;
  end if;

  perform set_config('app.trusted_write','on',true);
  update public.disputes
     set status = p_outcome, resolution_note = p_note,
         resolved_by = auth.uid(), resolved_at = now()
   where id = p_dispute_id;
end;
$$;

grant execute on function public.open_dispute(text, text, text) to authenticated;
grant execute on function public.add_dispute_message(uuid, text) to authenticated;
grant execute on function public.resolve_dispute(uuid, text, text) to authenticated;

-- How many credential units a listing has attached vs. how many are still
-- unclaimed. Used by the seller vault UI and by the upload Edge Function after
-- a save. Returns counts only — never ciphertext.
create or replace function public.credential_status(p_listing_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_total integer; v_free integer;
begin
  select count(*), count(*) filter (where claimed_by_order is null)
    into v_total, v_free
    from public.listing_credentials
   where listing_id = p_listing_id;

  -- A caller who is neither the seller nor an admin gets zeros rather than an
  -- error, so this can never be used to probe other sellers' inventory.
  if not exists (
    select 1 from public.listings l
     where l.id = p_listing_id and (l.seller_id = auth.uid() or public.is_admin())
  ) then
    return jsonb_build_object('attached', false, 'totalUnits', 0, 'availableUnits', 0);
  end if;

  return jsonb_build_object(
    'attached', v_total > 0,
    'totalUnits', v_total,
    'availableUnits', v_free
  );
end;
$$;

grant execute on function public.credential_status(uuid) to authenticated;