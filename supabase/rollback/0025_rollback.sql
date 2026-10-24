-- =====================================================================
-- supabase/rollback/0025_rollback.sql
--
-- ROLLBACK FOR 0025_request_authorization.sql
--
-- 0025 added a party guard to resolve_order_request(). The rollback
-- restores the LATEST PRIOR definition — the one 0013_reconcile_marketplace
-- wrote, which is what the database actually ran before 0025. It is 0013's
-- body verbatim, with the party guard removed and nothing else changed.
--
-- Rolling this back RE-OPENS the hole: any signed-in caller who knows a
-- request id can dismiss or approve it. It is provided because a migration
-- that changes authorization must be reversible under pressure, not because
-- this is a state anyone should want to run in.
--
-- mark_notifications_read() is not touched — 0025 never redefined it, and
-- 0013's ownership guard stays in place either way.
--
-- Safe to re-run.
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
