-- Architect 2.0: initial schema
-- Paste this whole file into Supabase → SQL Editor → Run (safe to run once on a new project).
--
-- Design: the whole project design (screens, agents, data, connections) lives in
-- projects.blueprint (jsonb) and is snapshotted into checkpoints.blueprint.
-- Everything with its own lifecycle (activity, usage, runs, handoffs, comments,
-- deployments) is its own table. Row-level security on every table; the only
-- publicly readable table is live_sites.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  budget_cap_credits int not null default 500,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'Guest'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- When a guest links Google/GitHub, pick up their real name and avatar.
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set display_name = coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', display_name),
         avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', avatar_url)
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();

-- ---------------------------------------------------------------- projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  vertical text not null default 'custom',
  source text not null default 'describe',          -- describe | import
  brief text not null default '',
  blueprint jsonb not null,
  current_checkpoint_id uuid,
  settings jsonb not null default '{"budgetCapCredits": 200, "houseRules": [], "region": "us"}'::jsonb,
  import_report jsonb,
  build_state text not null default 'draft',          -- draft | building | built
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- checkpoints (save points)
create table if not exists public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  seq int not null,
  label text not null,
  kind text not null,                                 -- blueprint | build | repair | restore | ship | teammate | tweak | change | import
  blueprint jsonb not null,
  summary text,
  created_at timestamptz not null default now(),
  unique (project_id, seq)
);

-- ---------------------------------------------------------------- ledger (activity rail, blame ledger, changelog)
create table if not exists public.ledger_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  checkpoint_id uuid references public.checkpoints(id) on delete set null,
  lane text not null,                                 -- thought | did | checked
  kind text not null,                                 -- brief | work_order | build_step | repair | tweak | change | handoff | comment | ship | restore | rehearsal | budget | import | agent_run
  blame text not null default 'user',                 -- user | system_fix | teammate | agent
  title text not null,
  body text,
  object_ref jsonb,
  meta jsonb,
  credits numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- work orders (estimate before work)
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  request text not null,
  kind text not null default 'build',                 -- build | change
  estimate jsonb not null,
  proposal jsonb,
  status text not null default 'proposed',            -- proposed | approved | running | done | rejected
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- handoffs ("Ask a teammate")
create table if not exists public.handoffs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  object_ref jsonb not null,
  prompt text not null,
  context jsonb not null default '{}'::jsonb,
  assignee text not null,
  status text not null default 'open',                -- open | in_progress | resolved
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- comments pinned on the preview
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  screen_id text not null,
  block_id text,
  x numeric not null,
  y numeric not null,
  body text not null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- deployments
create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  env text not null,                                  -- test | live
  target text not null,                               -- architect_cloud | vercel | vpc
  checkpoint_id uuid references public.checkpoints(id) on delete set null,
  status text not null,                               -- live | rolled_back | sandbox
  preflight jsonb,
  url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- live sites (the only public table)
create table if not exists public.live_sites (
  slug text primary key,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  checkpoint_id uuid,
  blueprint jsonb not null,
  published_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- agent runs (playground traces = replay + audit log)
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  agent_id text not null,
  checkpoint_id uuid,
  transcript jsonb not null default '[]'::jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  approvals jsonb not null default '[]'::jsonb,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  mode text not null default 'live',                  -- live | scripted
  status text not null default 'ok',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- usage (the real spend meter)
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind text not null,                                 -- llm | tweak | build | agent_run | change | import
  provider text,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  credits numeric(10, 2) not null default 0,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- integrations (sandbox connections per user)
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'connected',
  meta jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- ---------------------------------------------------------------- indexes
create index if not exists projects_owner_idx on public.projects (owner_id, updated_at desc);
create index if not exists checkpoints_project_idx on public.checkpoints (project_id, seq desc);
create index if not exists ledger_project_idx on public.ledger_events (project_id, created_at desc);
create index if not exists work_orders_project_idx on public.work_orders (project_id, created_at desc);
create index if not exists handoffs_project_idx on public.handoffs (project_id, created_at desc);
create index if not exists comments_project_idx on public.comments (project_id);
create index if not exists deployments_project_idx on public.deployments (project_id, created_at desc);
create index if not exists agent_runs_project_idx on public.agent_runs (project_id, created_at desc);
create index if not exists usage_user_idx on public.usage_events (user_id, created_at desc);
create index if not exists usage_project_idx on public.usage_events (project_id);

-- ---------------------------------------------------------------- row-level security
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.checkpoints enable row level security;
alter table public.ledger_events enable row level security;
alter table public.work_orders enable row level security;
alter table public.handoffs enable row level security;
alter table public.comments enable row level security;
alter table public.deployments enable row level security;
alter table public.live_sites enable row level security;
alter table public.agent_runs enable row level security;
alter table public.usage_events enable row level security;
alter table public.integrations enable row level security;

-- Guests (anonymous sign-ins) are role "authenticated" with is_anonymous = true,
-- so the ownership policies below cover them too. Linking Google keeps auth.uid().

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Anti-abuse: a guest can hold at most 8 projects. The count runs in a
-- security-definer function so the policy doesn't recurse into itself.
create or replace function public.owned_project_count(uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.projects where owner_id = uid
$$;
revoke all on function public.owned_project_count(uuid) from public;
grant execute on function public.owned_project_count(uuid) to authenticated;

drop policy if exists "guest project cap" on public.projects;
create policy "guest project cap" on public.projects as restrictive for insert to authenticated
  with check (
    coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) is false
    or public.owned_project_count((select auth.uid())) < 8
  );

-- One pattern for every child table: you can touch rows of projects you own.
do $$
declare t text;
begin
  foreach t in array array['checkpoints', 'ledger_events', 'work_orders', 'handoffs', 'comments', 'deployments', 'agent_runs']
  loop
    execute format('drop policy if exists "via project" on public.%I', t);
    execute format(
      'create policy "via project" on public.%I for all to authenticated
         using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
         with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))',
      t);
  end loop;
end $$;

drop policy if exists "own usage" on public.usage_events;
create policy "own usage" on public.usage_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own integrations" on public.integrations;
create policy "own integrations" on public.integrations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "public live sites" on public.live_sites;
create policy "public live sites" on public.live_sites for select to anon, authenticated using (true);

drop policy if exists "owner publishes" on public.live_sites;
create policy "owner publishes" on public.live_sites for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists "owner republishes" on public.live_sites;
create policy "owner republishes" on public.live_sites for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists "owner unpublishes" on public.live_sites;
create policy "owner unpublishes" on public.live_sites for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

-- Explicit grants (RLS still decides which rows).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.live_sites to anon;
