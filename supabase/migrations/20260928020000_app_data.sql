-- Prod AI: published apps keep real data.
-- A published app (live_sites) now has its own records, the people invited to use it, a history of
-- every change (for undo and audit) and a log of the emails it sent. People who use a published app
-- are usually not the project's owner, so every read and write goes through the server's admin
-- connection after it checks who is asking (lib/apps/*). Owners can read their own apps' rows.
-- Paste into Supabase → SQL Editor → Run on the launch project, after 20260928010000_launch_security.sql.

-- ---------------------------------------------------------------- who may use an app's team screens
create table if not exists public.app_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  user_id uuid references auth.users(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (project_id, email)
);
create index if not exists app_members_user_idx on public.app_members (user_id);

-- ---------------------------------------------------------------- an app's records
create table if not exists public.app_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity_id text not null check (char_length(entity_id) <= 80),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000),
  is_sample boolean not null default false,
  source text not null default 'team' check (source in ('sample', 'form', 'team', 'helper')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_records_list_idx on public.app_records (project_id, entity_id, created_at desc);

-- At most 5,000 records per app, so one app can't fill the database.
create or replace function public.app_records_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.app_records where project_id = new.project_id) >= 5000 then
    raise exception 'app record cap' using errcode = 'P0001';
  end if;
  return new;
end
$$;
drop trigger if exists app_records_cap on public.app_records;
create trigger app_records_cap before insert on public.app_records for each row execute function public.app_records_cap();

drop trigger if exists app_records_touch on public.app_records;
create trigger app_records_touch before update on public.app_records for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- every change to a record: undo and audit
create table if not exists public.app_record_changes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  record_id uuid references public.app_records(id) on delete set null,
  entity_id text not null,
  before jsonb check (octet_length(coalesce(before::text, '')) <= 20000),
  after jsonb check (octet_length(coalesce(after::text, '')) <= 20000),
  actor text not null check (actor in ('member', 'helper', 'visitor', 'owner')),
  actor_id uuid references auth.users(id) on delete set null,
  run_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists app_record_changes_idx on public.app_record_changes (project_id, created_at desc);

-- ---------------------------------------------------------------- emails an app sent (invitations and AI helpers)
create table if not exists public.app_emails (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('invite', 'helper')),
  to_hash text not null,
  subject text not null check (char_length(subject) <= 200),
  status text not null check (status in ('sent', 'failed', 'not_configured')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists app_emails_idx on public.app_emails (project_id, created_at desc);

-- ---------------------------------------------------------------- live AI helper runs are saved with who ran them
alter table public.agent_runs add column if not exists actor_id uuid references auth.users(id) on delete set null;
alter table public.agent_runs add column if not exists surface text not null default 'studio';
alter table public.agent_runs drop constraint if exists agent_runs_surface;
alter table public.agent_runs add constraint agent_runs_surface check (surface in ('studio', 'live'));

-- ---------------------------------------------------------------- access: owners read their apps' rows; the server writes
alter table public.app_members enable row level security;
alter table public.app_records enable row level security;
alter table public.app_record_changes enable row level security;
alter table public.app_emails enable row level security;

do $$
declare t text;
begin
  foreach t in array array['app_members', 'app_records', 'app_record_changes', 'app_emails']
  loop
    execute format('drop policy if exists "owner reads" on public.%I', t);
    execute format(
      'create policy "owner reads" on public.%I for select to authenticated
         using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))',
      t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

revoke all on function public.app_records_cap() from public, anon, authenticated;
