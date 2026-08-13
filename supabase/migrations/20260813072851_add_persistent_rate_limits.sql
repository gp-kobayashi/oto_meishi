-- Persistent fixed-window counters; raw keys are never stored.
create table if not exists public."RateLimitCounter" (
  "scope" varchar(64) not null,
  "key_hash" char(64) not null,
  "count" integer not null check ("count" >= 1),
  "reset_at" timestamptz(3) not null,
  "created_at" timestamptz(3) not null default now(),
  "updated_at" timestamptz(3) not null default now(),
  primary key ("scope", "key_hash")
);
create index if not exists "RateLimitCounter_reset_at_idx" on public."RateLimitCounter" ("reset_at");
alter table public."RateLimitCounter" enable row level security;
revoke all on table public."RateLimitCounter" from anon, authenticated;
grant select, insert, update, delete on table public."RateLimitCounter" to service_role;

comment on table public."RateLimitCounter" is
  'Server-owned fixed-window rate-limit counters. Keys are stored only as SHA-256 hashes.';
