-- Prod AI: tighter limits on model spend and plan size.
-- Paste into Supabase → SQL Editor → Run on the launch project, after 20260929000000_free_tier.sql.
--
-- 1. A person (or a published app's owner) holds at most 2 model calls at once. A third call in
--    parallel takes its scripted path, so many requests at the same moment can't each pass the
--    budget check with an estimate that hasn't been spent yet.
-- 2. A saved plan is at most 300 KB (it was 1.5 MB). Real plans are well under 100 KB. NOT VALID:
--    rows written before this are left alone; new and changed rows are checked.

-- ---------------------------------------------------------------- at most 2 open model holds per payer
create or replace function public.model_budget_hold(p_user uuid, p_estimate_usd numeric, p_user_cap_usd numeric, p_site_cap_usd numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - interval '24 hours';
  held_user numeric;
  held_site numeric;
  open_user int;
  hold_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('prodai.model_budget'));
  -- A hold outlives its call only if the server died mid-call; ten minutes is longer than any model timeout.
  delete from public.model_holds where created_at < now() - interval '10 minutes';
  select count(*), coalesce(sum(estimate_usd), 0) into open_user, held_user from public.model_holds where user_id = p_user;
  if open_user >= 2 then return null; end if;
  select coalesce(sum(estimate_usd), 0) into held_site from public.model_holds;
  if public.model_spend_usd(since, p_user) + held_user + p_estimate_usd > p_user_cap_usd then return null; end if;
  if public.model_spend_usd(since, null) + held_site + p_estimate_usd > p_site_cap_usd then return null; end if;
  insert into public.model_holds (user_id, estimate_usd) values (p_user, p_estimate_usd) returning id into hold_id;
  return hold_id;
end
$$;
revoke all on function public.model_budget_hold(uuid, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.model_budget_hold(uuid, numeric, numeric, numeric) to service_role;

-- ---------------------------------------------------------------- plans: 300 KB
alter table public.projects drop constraint if exists projects_sizes;
alter table public.projects add constraint projects_sizes check (
  octet_length(blueprint::text) <= 300000
  and char_length(name) <= 120
  and char_length(brief) <= 8000
  and octet_length(settings::text) <= 20000
  and octet_length(coalesce(import_report::text, '')) <= 200000
) not valid;

alter table public.checkpoints drop constraint if exists checkpoints_sizes;
alter table public.checkpoints add constraint checkpoints_sizes check (
  octet_length(blueprint::text) <= 300000 and char_length(label) <= 200 and char_length(coalesce(summary, '')) <= 2000
) not valid;

alter table public.live_sites drop constraint if exists live_sites_sizes;
alter table public.live_sites add constraint live_sites_sizes check (
  octet_length(blueprint::text) <= 300000 and slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'
) not valid;
