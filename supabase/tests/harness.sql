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

-- Minimal stand-in for Supabase Storage — just enough for the avatars bucket
-- policies in 0006_profile_features.sql to install and be tested.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
alter default privileges in schema storage grant all on tables to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- The real extension splits a storage path on '/'; same behaviour, SQL-only.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

-- Minimal stand-in for the Dashboard's Database Webhooks trigger function
-- (supabase_functions.http_request), used by 0007_push_notifications.sql. The
-- real one fires an async HTTP POST via pg_net; this just logs that it would
-- have, so tests can assert a trigger fired without a live Edge Function.
create schema if not exists supabase_functions;
grant usage on schema supabase_functions to anon, authenticated, service_role;
alter default privileges in schema supabase_functions grant all on tables to anon, authenticated, service_role;

create table if not exists supabase_functions.http_request_log (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  table_name text not null,
  op         text not null,
  logged_at  timestamptz not null default now()
);

create or replace function supabase_functions.http_request()
returns trigger
language plpgsql
as $$
begin
  insert into supabase_functions.http_request_log (url, table_name, op)
  values (TG_ARGV[0], TG_TABLE_NAME, TG_OP);
  return coalesce(new, old);
end;
$$;
