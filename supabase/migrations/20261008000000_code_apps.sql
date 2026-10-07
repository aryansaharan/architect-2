-- Prod AI: apps written as real code.
-- A project is either a business app (a Blueprint shown by the renderer, as before) or a code app:
-- source files Claude writes, a manifest of what data it keeps and who may read it, and the latest
-- real build. Versions keep the files; a published code app serves its build from /run/live/<slug>.
-- Paste into Supabase → SQL Editor → Run, after the earlier migrations. Safe to run more than once.

alter table public.projects add column if not exists kind text not null default 'business';
alter table public.projects drop constraint if exists projects_kind;
alter table public.projects add constraint projects_kind check (kind in ('business', 'code'));
-- { files: [{ path, content }], manifest: {...} } for a code app; null for a business app.
alter table public.projects add column if not exists code jsonb;
-- The latest build of the code: { ok, at, hash, js, css, errors: [...] } (lib/code-apps/build.ts).
alter table public.projects add column if not exists build jsonb;
-- A business app's last real build: its steps, the code it compiled and each test run Claude played (lib/build).
alter table public.projects add column if not exists build_report jsonb;

alter table public.checkpoints add column if not exists code jsonb;

alter table public.live_sites add column if not exists kind text not null default 'business';
alter table public.live_sites drop constraint if exists live_sites_kind;
alter table public.live_sites add constraint live_sites_kind check (kind in ('business', 'code'));
-- What a published code app runs: { js, css, manifest, hash } (never its builder-only files).
alter table public.live_sites add column if not exists build jsonb;

-- Sizes: a code app's files stay under 400 KB, a build under 1 MB.
alter table public.projects drop constraint if exists projects_code_sizes;
alter table public.projects add constraint projects_code_sizes check (
  octet_length(coalesce(code::text, '')) <= 400000 and octet_length(coalesce(build::text, '')) <= 1000000
  and octet_length(coalesce(build_report::text, '')) <= 300000
) not valid;
alter table public.checkpoints drop constraint if exists checkpoints_code_sizes;
alter table public.checkpoints add constraint checkpoints_code_sizes check (
  octet_length(coalesce(code::text, '')) <= 400000
) not valid;
alter table public.live_sites drop constraint if exists live_sites_build_sizes;
alter table public.live_sites add constraint live_sites_build_sizes check (
  octet_length(coalesce(build::text, '')) <= 1000000
) not valid;
