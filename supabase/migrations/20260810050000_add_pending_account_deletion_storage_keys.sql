alter table public."AccountDeletionRecord"
  add column "pendingStorageObjectKeys" text[] not null default '{}';

comment on column public."AccountDeletionRecord"."pendingStorageObjectKeys" is
  'Temporary R2 object keys awaiting cleanup after account data deletion. Cleared when deletion completes.';
