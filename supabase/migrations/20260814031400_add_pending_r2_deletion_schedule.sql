alter table public."PendingR2ObjectDeletion"
  add column if not exists "nextAttemptAt" timestamptz(3) not null default now();

update public."PendingR2ObjectDeletion"
set "nextAttemptAt" = coalesce("nextAttemptAt", "updatedAt", now())
where "nextAttemptAt" is null;

create index if not exists "PendingR2ObjectDeletion_nextAttemptAt_updatedAt_idx"
  on public."PendingR2ObjectDeletion" ("nextAttemptAt", "updatedAt");

drop index if exists "PendingR2ObjectDeletion_updatedAt_idx";
