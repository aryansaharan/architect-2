-- Prod AI: the usage meter is append-only.
-- The daily model budget (lib/llm/guard.ts) adds up usage_events, so people must not be able to
-- edit or delete what they spent, or record negative spend. They can still read their own rows,
-- and the server (acting as them) can add rows. Only refunds are negative.
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

drop policy if exists "own usage" on public.usage_events;
drop policy if exists "read own usage" on public.usage_events;
drop policy if exists "add own usage" on public.usage_events;

create policy "read own usage" on public.usage_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy "add own usage" on public.usage_events for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke update, delete on public.usage_events from authenticated, anon;

alter table public.usage_events drop constraint if exists usage_amounts_valid;
-- NOT VALID: checks every new row without failing on rows written before this rule existed.
alter table public.usage_events add constraint usage_amounts_valid check (
  input_tokens >= 0
  and output_tokens >= 0
  and (
    (kind = 'refund' and credits <= 0 and cost_usd = 0)
    or (kind <> 'refund' and credits >= 0 and cost_usd >= 0)
  )
) not valid;
