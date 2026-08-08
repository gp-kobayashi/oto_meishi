alter table public."Profile"
  add column "deletionProcessingStartedAt" timestamp(3);

create index "Profile_accountStatus_deletionProcessingStartedAt_idx"
  on public."Profile" (
    "accountModerationStatus",
    "deletionProcessingStartedAt"
  );

comment on column public."Profile"."deletionProcessingStartedAt" is
  'Temporary claim that prevents concurrent permanent account deletion attempts.';
