-- =====================================================================
-- 0025_request_authorization.sql
--
-- ONE REMAINING AUTHORIZATION HOLE.
--
-- Reproduced against a database built from this repository's own
-- migrations; pinned by tests/request_authorization.sql.
--
--   H1  resolve_order_request() guarded WHO MAY APPROVE a cancellation or a
--       replacement, but not who may DISMISS one — and not whether the
--       caller was a party to the order at all.
--
--       Reproduced (as a signed-in stranger who knows a request id):
--         set local role authenticated;
--         select public.resolve_order_request('<id>', 'dismissed', 'x');
--         --> the row is closed
--
--       The `select ... for update` reads the request with the owner's
--       rights, so RLS does not hide the row from the caller. A dismissed
--       CANCELLATION is the denial-of-refund primitive: the buyer's request
--       is gone and the money stays held. A dismissed REPLACEMENT leaves the
--       buyer with credentials that never worked and no recourse.
--
-- WHAT IS NOT CHANGED, AND WHY. An earlier draft of this migration also
-- redefined mark_notifications_read() from its 0009 shape. That was a
-- mistake twice over: 0013 had ALREADY added the ownership check, and 0009's
-- body ends in `return sql%rowcount`, which is not valid PL/pgSQL (the
-- correct form is `get diagnostics v_n = row_count`). Redefining it from
-- 0009 would have replaced a working guard with a function that raises
-- `column "sql" does not exist` on every call. It is left exactly as 0013
-- wrote it. The rule this file follows: when a later migration has already
-- superseded an earlier definition, copy the LATEST one forward.
--
-- The body below is therefore 0013's resolve_order_request verbatim, with
-- the party guard added. Nothing else is altered.
--
-- Apply with:
--   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \
--     node scripts/migrate.mjs supabase/migrations/0025_request_authorization.sql
-- =====================================================================

create or replace function public.resolve_order_request(
  p_request_id uuid, p_outcome text, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_r public.order_requests%rowtype; v_o public.orders%rowtype;
begin
  if p_request_id is null then raise exception 'Request is required'; end if;
  if p_outcome is null or p_outcome not in ('approved','dismissed') then
    raise exception 'Outcome must be approved or dismissed';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'Please keep the note under 2000 characters';
  end if;

  select * into v_r from public.order_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_r.status <> 'pending' then raise exception 'This request is already resolved'; end if;

  select * into v_o from public.orders where order_no = v_r.order_no for update;
  if not found then raise exception 'Order not found for this request'; end if;

  -- The caller must be a party to the order, and must not be the person who
  -- filed the request — a request is adjudicated by the other side or by an
  -- administrator, never by its own author. Without this, any signed-in
  -- stranger who knows a request id can close it, and a dismissed
  -- cancellation leaves the buyer's money held with no request on file.
  if not public.can_moderate() then
    if auth.uid() is distinct from v_o.buyer_id
       and auth.uid() is distinct from v_o.seller_id then
      raise exception 'Only a party to the order or an administrator can resolve this request';
    end if;
    if auth.uid() is not distinct from v_r.requested_by then
      raise exception 'You cannot resolve a request you filed yourself';
    end if;
  end if;

  if v_r.kind = 'cancellation' and p_outcome = 'approved' then
    if not public.can_moderate() then
      raise exception 'Only an administrator can approve a cancellation';
    end if;
    if v_o.status <> 'in_escrow' then
      raise exception 'An order that is not in escrow cannot be cancelled';
    end if;
    if v_o.delivery_status = 'buyer_confirmed' then
      raise exception 'A confirmed order cannot be cancelled';
    end if;
  end if;

  if v_r.kind = 'replacement' and p_outcome = 'approved' then
    if auth.uid() <> v_o.seller_id and not public.can_moderate() then
      raise exception 'Only the seller or an administrator can approve a replacement';
    end if;
    if v_o.status <> 'in_escrow' then
      raise exception 'An order that is not in escrow cannot be replaced';
    end if;
  end if;

  if v_r.kind = 'dismissed' then
    raise exception 'Unreachable';
  end if;

  perform set_config('app.trusted_write','on',true);
  update public.order_requests
     set status = p_outcome, resolved_by = auth.uid(),
         resolution_note = p_note, resolved_at = now()
   where id = p_request_id;

  if v_r.kind = 'cancellation' and p_outcome = 'approved' then
    perform public.settle_order_refund(v_o.order_no, v_o.total_usd, 'refund_buyer',
      coalesce(p_note, 'cancellation approved'),
      null, 'cancel:' || p_request_id::text);
    perform public.log_admin_audit(auth.uid(), 'order.cancel', 'order_request',
      p_request_id, v_o.order_no, coalesce(p_note, ''));
    perform public.notify(v_o.buyer_id, 'cancelled',
      'Order cancelled — refunded',
      format('Your cancellation of order %s was approved and your payment was refunded.', v_o.order_no),
      v_o.order_no);
    perform public.notify(v_o.seller_id, 'cancelled',
      'Order cancelled',
      format('Order %s was cancelled after review.', v_o.order_no),
      v_o.order_no);

  elsif v_r.kind = 'replacement' and p_outcome = 'approved' then
    -- Back to pending delivery so the seller can deliver again. The buyer must
    -- still confirm afterwards; approving a replacement does not release funds.
    update public.orders
       set delivery_status = 'pending',
           delivered_at = null,
           delivery_method = null,
           delivery_note = null
     where order_no = v_o.order_no;
    perform public.notify(v_o.buyer_id, 'replacement_requested',
      'Replacement approved',
      format('The seller agreed to replace order %s. You will get a new delivery notice.', v_o.order_no),
      v_o.order_no);
    perform public.notify(v_o.seller_id, 'replacement_requested',
      'Replacement approved',
      format('Mark a new delivery for order %s.', v_o.order_no),
      v_o.order_no);

  else
    perform public.notify(v_o.buyer_id, 'dispute_resolved',
      'Request dismissed',
      format('Your %s request for order %s was dismissed.', v_r.kind, v_o.order_no),
      v_o.order_no);
    perform public.notify(v_o.seller_id, 'dispute_resolved',
      'Request dismissed',
      format('The %s request for order %s was dismissed.', v_r.kind, v_o.order_no),
      v_o.order_no);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Assert the guard is live and the body was not regressed. A failure rolls
-- the whole transaction back.
-- ---------------------------------------------------------------------
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.resolve_order_request(uuid,text,text)'::regprocedure);

  if v_def not like '%Only a party to the order or an administrator can resolve this request%'
     or v_def not like '%cannot resolve a request you filed yourself%' then
    raise exception 'resolve_order_request is missing its party guard';
  end if;

  -- The 0013 refinements must survive the redefinition.
  if v_def not like '%2000 characters%' then
    raise exception 'resolve_order_request lost the 0013 note-length check';
  end if;
  if v_def not like '%A confirmed order cannot be cancelled%' then
    raise exception 'resolve_order_request lost the 0013 confirmed-order check';
  end if;
  if v_def not like '%settle_order_refund%' then
    raise exception 'resolve_order_request lost the 0013 settlement path';
  end if;
end
$$;

-- mark_notifications_read is deliberately NOT redefined here. 0013 already
-- enforces ownership, and its body is the one that actually runs.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.mark_notifications_read(uuid)'::regprocedure);
  if v_def not like '%only mark your own notifications as read%' then
    raise exception 'mark_notifications_read lost its ownership guard';
  end if;
  if v_def like '%sql%rowcount%' then
    raise exception 'mark_notifications_read has the invalid sql%%rowcount body';
  end if;
end
$$;
