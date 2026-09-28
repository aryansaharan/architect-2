-- Prod AI: launch hardening.
-- Some rows must only ever be written by the server's admin connection (lib/supabase/admin.ts):
--   the spend meter, rate limits, model budget holds, published sites and abuse reports.
-- People keep read access to their own rows. Everything else keeps its row-level security.
-- Paste into Supabase → SQL Editor → Run on the launch project. Safe to run more than once.

-- ---------------------------------------------------------------- usage: the server records spend
drop policy if exists "own usage" on public.usage_events;
drop policy if exists "read own usage" on public.usage_events;
drop policy if exists "add own usage" on public.usage_events;
create policy "read own usage" on public.usage_events for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.usage_events from authenticated, anon;

alter table public.usage_events drop constraint if exists usage_amounts_valid;
alter table public.usage_events add constraint usage_amounts_valid check (
  input_tokens >= 0 and output_tokens >= 0 and (
    (kind = 'refund' and credits <= 0 and cost_usd = 0)
    or (kind <> 'refund' and credits >= 0 and cost_usd >= 0))
) not valid;
create index if not exists usage_created_idx on public.usage_events (created_at desc);

-- ---------------------------------------------------------------- rate limits (fixed windows)
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- One hit against a key; true while the key is within its limit for the current window.
create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  fresh boolean;
  n int;
begin
  insert into public.rate_limits as t (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when t.window_start < now() - make_interval(secs => p_window_seconds) then now() else t.window_start end,
    hits = case when t.window_start < now() - make_interval(secs => p_window_seconds) then 1 else t.hits + 1 end
  returning hits into n;
  return n <= p_max;
end
$$;

-- ---------------------------------------------------------------- model budget: hold before a call, meter after it
create table if not exists public.model_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  estimate_usd numeric(12, 6) not null check (estimate_usd >= 0),
  created_at timestamptz not null default now()
);
alter table public.model_holds enable row level security;
revoke all on public.model_holds from anon, authenticated;

-- Real model spend in USD since a time, for one person or (p_user null) the whole site.
-- Each row counts the larger of what was charged in credits (1 credit = $0.01) and what the model cost.
create or replace function public.model_spend_usd(p_since timestamptz, p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(greatest(credits * 0.01, cost_usd)), 0)
  from public.usage_events
  where created_at >= p_since
    and model is not null
    and kind in ('llm', 'import', 'agent_run')
    and (p_user is null or user_id = p_user)
$$;

-- Holds an estimate against the person's and the site's 24-hour budgets, or returns null when either is spent.
-- Decisions are taken one at a time, so parallel requests can't all pass the same check.
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
  hold_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('prodai.model_budget'));
  -- A hold outlives its call only if the server died mid-call; ten minutes is longer than any model timeout.
  delete from public.model_holds where created_at < now() - interval '10 minutes';
  select coalesce(sum(estimate_usd), 0) into held_site from public.model_holds;
  select coalesce(sum(estimate_usd), 0) into held_user from public.model_holds where user_id = p_user;
  if public.model_spend_usd(since, p_user) + held_user + p_estimate_usd > p_user_cap_usd then return null; end if;
  if public.model_spend_usd(since, null) + held_site + p_estimate_usd > p_site_cap_usd then return null; end if;
  insert into public.model_holds (user_id, estimate_usd) values (p_user, p_estimate_usd) returning id into hold_id;
  return hold_id;
end
$$;

create or replace function public.model_budget_release(p_hold uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.model_holds where id = p_hold
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke all on function public.model_spend_usd(timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.model_budget_hold(uuid, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.model_budget_release(uuid) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
grant execute on function public.model_spend_usd(timestamptz, uuid) to service_role;
grant execute on function public.model_budget_hold(uuid, numeric, numeric, numeric) to service_role;
grant execute on function public.model_budget_release(uuid) to service_role;

-- ---------------------------------------------------------------- published sites: the server publishes, owners read
alter table public.live_sites add column if not exists blocked_at timestamptz;
alter table public.live_sites add column if not exists blocked_reason text;

drop policy if exists "public live sites" on public.live_sites;
drop policy if exists "owner publishes" on public.live_sites;
drop policy if exists "owner republishes" on public.live_sites;
drop policy if exists "owner unpublishes" on public.live_sites;
drop policy if exists "owner reads live site" on public.live_sites;
create policy "owner reads live site" on public.live_sites for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
revoke all on public.live_sites from anon;
revoke insert, update, delete on public.live_sites from authenticated;

-- ---------------------------------------------------------------- abuse reports from published pages
create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  reason text not null check (char_length(reason) <= 40),
  details text check (char_length(details) <= 2000),
  reporter_hash text,
  created_at timestamptz not null default now()
);
alter table public.abuse_reports enable row level security;
revoke all on public.abuse_reports from anon, authenticated;

-- ---------------------------------------------------------------- project caps: 8 for a guest, 100 for a member
-- The count takes no argument, so nobody can ask how many projects someone else has.
create or replace function public.my_project_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.projects where owner_id = (select auth.uid())
$$;
revoke all on function public.my_project_count() from public, anon;
grant execute on function public.my_project_count() to authenticated;

drop policy if exists "guest project cap" on public.projects;
drop policy if exists "project cap" on public.projects;
create policy "project cap" on public.projects as restrictive for insert to authenticated
  with check (
    public.my_project_count() < case when coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) then 8 else 100 end
  );
drop function if exists public.owned_project_count(uuid);

-- ---------------------------------------------------------------- size limits, so nobody can fill the database
-- NOT VALID: new and changed rows are checked; rows written before these limits are left alone.
alter table public.projects drop constraint if exists projects_sizes;
alter table public.projects add constraint projects_sizes check (
  octet_length(blueprint::text) <= 1500000
  and char_length(name) <= 120
  and char_length(brief) <= 8000
  and octet_length(settings::text) <= 20000
  and octet_length(coalesce(import_report::text, '')) <= 200000
) not valid;

alter table public.checkpoints drop constraint if exists checkpoints_sizes;
alter table public.checkpoints add constraint checkpoints_sizes check (
  octet_length(blueprint::text) <= 1500000 and char_length(label) <= 200 and char_length(coalesce(summary, '')) <= 2000
) not valid;

alter table public.ledger_events drop constraint if exists ledger_sizes;
alter table public.ledger_events add constraint ledger_sizes check (
  char_length(title) <= 300 and char_length(coalesce(body, '')) <= 6000
  and octet_length(coalesce(meta::text, '')) <= 50000 and octet_length(coalesce(object_ref::text, '')) <= 2000
) not valid;

alter table public.work_orders drop constraint if exists work_orders_sizes;
alter table public.work_orders add constraint work_orders_sizes check (
  char_length(request) <= 4000 and octet_length(estimate::text) <= 20000 and octet_length(coalesce(proposal::text, '')) <= 500000
) not valid;

alter table public.handoffs drop constraint if exists handoffs_sizes;
alter table public.handoffs add constraint handoffs_sizes check (
  char_length(prompt) <= 4000 and char_length(assignee) <= 120 and char_length(coalesce(resolution, '')) <= 4000
  and octet_length(context::text) <= 200000 and octet_length(object_ref::text) <= 2000
) not valid;

alter table public.comments drop constraint if exists comments_sizes;
alter table public.comments add constraint comments_sizes check (
  char_length(body) <= 2000 and char_length(screen_id) <= 120 and char_length(coalesce(block_id, '')) <= 120
  and char_length(coalesce(author_name, '')) <= 120
) not valid;

alter table public.deployments drop constraint if exists deployments_sizes;
alter table public.deployments add constraint deployments_sizes check (
  octet_length(coalesce(preflight::text, '')) <= 50000 and char_length(coalesce(url, '')) <= 500
) not valid;

alter table public.agent_runs drop constraint if exists agent_runs_sizes;
alter table public.agent_runs add constraint agent_runs_sizes check (
  octet_length(transcript::text) <= 500000 and octet_length(tool_calls::text) <= 200000 and octet_length(approvals::text) <= 50000
) not valid;

alter table public.live_sites drop constraint if exists live_sites_sizes;
alter table public.live_sites add constraint live_sites_sizes check (
  octet_length(blueprint::text) <= 1500000 and slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'
) not valid;

-- ---------------------------------------------------------------- housekeeping (run daily by /api/cron/cleanup)
-- Guests who haven't been back for two weeks. The cron route deletes them through the admin API.
create or replace function public.stale_guest_ids(p_limit int)
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '14 days'
  order by u.created_at
  limit p_limit
$$;

-- Old rate-limit windows and holds, and all but the newest 100 versions of each project
-- (never one a project, deployment or published site still points at).
create or replace function public.prune_housekeeping()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  delete from public.model_holds where created_at < now() - interval '1 hour';
  delete from public.checkpoints c
  using (
    select id, row_number() over (partition by project_id order by seq desc) as rn from public.checkpoints
  ) ranked
  where c.id = ranked.id
    and ranked.rn > 100
    and not exists (select 1 from public.projects p where p.current_checkpoint_id = c.id)
    and not exists (select 1 from public.deployments d where d.checkpoint_id = c.id)
    and not exists (select 1 from public.live_sites l where l.checkpoint_id = c.id);
end
$$;

revoke all on function public.stale_guest_ids(int) from public, anon, authenticated;
revoke all on function public.prune_housekeeping() from public, anon, authenticated;
grant execute on function public.stale_guest_ids(int) to service_role;
grant execute on function public.prune_housekeeping() to service_role;
