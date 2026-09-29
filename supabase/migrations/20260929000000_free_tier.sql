-- Prod AI: fits the free tiers it launches on (Supabase Free: 500 MB).
-- Tighter caps, faster guest cleanup, fewer kept versions, and a monthly credit meter per person.
-- Paste into Supabase → SQL Editor → Run on the launch project, after 20260928020000_app_data.sql.

-- ---------------------------------------------------------------- project caps: 5 for a guest, 25 for a member
drop policy if exists "project cap" on public.projects;
create policy "project cap" on public.projects as restrictive for insert to authenticated
  with check (
    public.my_project_count() < case when coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) then 5 else 25 end
  );

-- ---------------------------------------------------------------- at most 2,000 records per published app
create or replace function public.app_records_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.app_records where project_id = new.project_id) >= 2000 then
    raise exception 'app record cap' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function public.app_records_cap() from public, anon, authenticated;

-- ---------------------------------------------------------------- housekeeping: guests idle for a week, the newest 30 versions
create or replace function public.stale_guest_ids(p_limit int)
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '7 days'
  order by u.created_at
  limit p_limit
$$;

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
end
$$;
revoke all on function public.stale_guest_ids(int) from public, anon, authenticated;
revoke all on function public.prune_housekeeping() from public, anon, authenticated;
grant execute on function public.stale_guest_ids(int) to service_role;
grant execute on function public.prune_housekeeping() to service_role;

-- ---------------------------------------------------------------- the monthly credit meter (lib/pricing.ts)
-- Credits a person spent since a time: every charge and refund on the meter.
create or replace function public.credits_used_since(p_user uuid, p_since timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(credits), 0) from public.usage_events where user_id = p_user and created_at >= p_since
$$;
revoke all on function public.credits_used_since(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.credits_used_since(uuid, timestamptz) to service_role;
