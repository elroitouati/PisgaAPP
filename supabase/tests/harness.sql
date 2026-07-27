-- Minimal stand-in for the parts of a Supabase database the migrations depend
-- on (auth schema, roles, auth.uid()). Used by scripts/verify-sql.sh to run the
-- migrations against a throwaway Postgres; not applied to a real project.

create schema if not exists auth;

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;

-- Supabase grants these at project creation, before any user migration runs,
-- which is why the migrations themselves contain no GRANT statements. Mirror
-- that here so the RLS tests exercise the same privilege set as production.
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase reads the user id out of the request JWT. The test harness reads it
-- out of a session GUC instead, so tests can switch identity with set_local.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
