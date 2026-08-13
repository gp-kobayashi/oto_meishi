-- Server-owned queue for R2 objects whose deletion must be retried safely.
create table if not exists public."PendingR2ObjectDeletion" (
  "id" uuid primary key default gen_random_uuid(),
  "objectKey" varchar(1024) not null unique,
  "attemptCount" integer not null default 0,
  "lastAttemptAt" timestamptz(3),
  "lastError" varchar(2000),
  "createdAt" timestamptz(3) not null default now(),
  "updatedAt" timestamptz(3) not null default now()
);
create index if not exists "PendingR2ObjectDeletion_updatedAt_idx" on public."PendingR2ObjectDeletion" ("updatedAt");
alter table public."PendingR2ObjectDeletion" enable row level security;
revoke all on table public."PendingR2ObjectDeletion" from anon, authenticated;
grant select, insert, update, delete on table public."PendingR2ObjectDeletion" to service_role;
