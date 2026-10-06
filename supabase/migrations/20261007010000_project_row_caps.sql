-- Prod AI: per-project row caps, so no one (a guest included) can fill the free 500 MB database
-- through the tables a project owner may write with their own session.
-- Paste into Supabase → SQL Editor → Run on the launch project, after 20261007000000_model_budget_limits.sql.
--
-- Caps per project: checkpoints 200, ledger_events 2,000, agent_runs 300, work_orders 300,
-- handoffs 200, comments 500, deployments 200. Same pattern as app_records_cap (20260929000000_free_tier.sql).
-- The daily housekeeping keeps the two logs (ledger_events, agent_runs) and old quotes (work_orders)
-- well under their caps, so a project in long, normal use never reaches them.
-- A saved test conversation (agent_runs) is at most 100 KB, down from 750 KB.

-- ---------------------------------------------------------------- the cap
create or replace function public.project_rows_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap int := tg_argv[0]::int;
  found boolean;
  n int;
begin
  -- An upsert of a row that already exists (a test conversation saved again) is an update, not a new row.
  execute format('select exists (select 1 from public.%I where id = $1)', tg_table_name) into found using new.id;
  if found then return new; end if;
  execute format('select count(*) from public.%I where project_id = $1', tg_table_name) into n using new.project_id;
  if n >= cap then
    raise exception 'project row cap reached on %', tg_table_name using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function public.project_rows_cap() from public, anon, authenticated;

drop trigger if exists checkpoints_cap on public.checkpoints;
create trigger checkpoints_cap before insert on public.checkpoints for each row execute function public.project_rows_cap('200');
drop trigger if exists ledger_events_cap on public.ledger_events;
create trigger ledger_events_cap before insert on public.ledger_events for each row execute function public.project_rows_cap('2000');
drop trigger if exists agent_runs_cap on public.agent_runs;
create trigger agent_runs_cap before insert on public.agent_runs for each row execute function public.project_rows_cap('300');
drop trigger if exists work_orders_cap on public.work_orders;
create trigger work_orders_cap before insert on public.work_orders for each row execute function public.project_rows_cap('300');
drop trigger if exists handoffs_cap on public.handoffs;
create trigger handoffs_cap before insert on public.handoffs for each row execute function public.project_rows_cap('200');
drop trigger if exists comments_cap on public.comments;
create trigger comments_cap before insert on public.comments for each row execute function public.project_rows_cap('500');
drop trigger if exists deployments_cap on public.deployments;
create trigger deployments_cap before insert on public.deployments for each row execute function public.project_rows_cap('200');

-- ---------------------------------------------------------------- a saved test conversation: 100 KB
alter table public.agent_runs drop constraint if exists agent_runs_sizes;
alter table public.agent_runs add constraint agent_runs_sizes check (
  octet_length(transcript::text) + octet_length(tool_calls::text) + octet_length(approvals::text) <= 100000
) not valid;

-- ---------------------------------------------------------------- housekeeping: also trim the logs
-- Everything 20260929000000_free_tier.sql did, plus: the newest 1,500 history entries, 200 test
-- conversations and 200 quotes per project are kept (the studio shows far fewer).
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
    and ranked.rn > 30
    and not exists (select 1 from public.projects p where p.current_checkpoint_id = c.id)
    and not exists (select 1 from public.deployments d where d.checkpoint_id = c.id)
    and not exists (select 1 from public.live_sites l where l.checkpoint_id = c.id);
  -- The change history keeps 90 days; records themselves are kept.
  delete from public.app_record_changes where created_at < now() - interval '90 days';
  delete from public.ledger_events e
  using (select id, row_number() over (partition by project_id order by created_at desc) as rn from public.ledger_events) ranked
  where e.id = ranked.id and ranked.rn > 1500;
  delete from public.agent_runs r
  using (select id, row_number() over (partition by project_id order by created_at desc) as rn from public.agent_runs) ranked
  where r.id = ranked.id and ranked.rn > 200;
  delete from public.work_orders w
  using (select id, row_number() over (partition by project_id order by created_at desc) as rn from public.work_orders) ranked
  where w.id = ranked.id and ranked.rn > 200;
end
$$;
revoke all on function public.prune_housekeeping() from public, anon, authenticated;
grant execute on function public.prune_housekeeping() to service_role;
