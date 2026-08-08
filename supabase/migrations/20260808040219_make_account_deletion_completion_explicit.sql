alter table public."AccountDeletionRecord"
  alter column "deletedAt" drop default,
  alter column "deletedAt" drop not null;

comment on column public."AccountDeletionRecord"."deletedAt" is
  'Set only after Auth, R2, and application data deletion have completed.';
