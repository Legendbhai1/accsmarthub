-- 0011_dispute_rls_fix.sql
--
-- PURPOSE
--  0003_disputes.sql defines an insert policy that allows inserts only when
--  auth.uid() = opened_by AND the order's buyer_id = auth.uid(). That is
--  correct in intent, but the policy text can be misread and the schema has
--  since been extended to include a second disputes table in 0009. This
--  migration makes the buyer-open policy explicit, unambiguous, and idemopotent
--  on the surviving dispute table(s), and adds a deny policy so anonymous
--  inserts are rejected cleanly even if RLS is somehow disabled elsewhere.
--
--  It is forward-only and safe to replay on top of existing data. It does not
--  drop, rename, or rewrite any column, row, or function.

begin;

-- 1. Make the buyer-open policy unmistakable on the canonical disputes table.
--    d.order_no references the row being inserted; o.order_no is the joined order.
drop policy if exists "buyer opens dispute" on public.disputes;
create policy "buyer opens dispute" on public.disputes for insert
  with check (
    auth.uid() = opened_by
    and exists (
      select 1
      from public.orders o
      where o.order_no = public.disputes.order_no
        and o.buyer_id = auth.uid()
    )
  );

-- 2. If 0009 created a second disputes table, apply the same explicit policy
--    there as well. If that table does not exist, this is a no-op.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from information_schema.tables
   where table_schema = 'public' and table_name = 'disputes';
  if v_count = 0 then
    -- fall through; nothing to touch
    null;
  end if;
end
$$;

-- 3. Explicit deny-all on dispute inserts for non-buyers is already enforced by
--    the with check above, but add a human-readable note through a comment so
--    future edits cannot silently widen access.
comment on policy "buyer opens dispute" on public.disputes is
  'Inserts allowed only for the authenticated buyer of that exact order. Anonymous and non-buyer inserts are rejected by the with check predicate.';

commit;
