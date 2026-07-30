create type "AccountModerationStatus" as enum (
  'active',
  'suspended',
  'deletionPending'
);

create type "ModerationReasonCode" as enum (
  'inappropriateContent',
  'copyrightConcern',
  'harassment',
  'unsafeLink',
  'serviceMismatch',
  'impersonation',
  'other'
);

create type "ModerationReviewMode" as enum (
  'postReview',
  'preReview'
);

create type "ModerationCaseStatus" as enum (
  'correctionRequired',
  'postReviewPending',
  'preReviewPending',
  'confirmed'
);

alter table public."Profile"
  add column "accountModerationStatus" "AccountModerationStatus"
    not null default 'active',
  add column "suspensionAppealDueAt" timestamp(3),
  add column "deletionScheduledAt" timestamp(3);

-- Keep existing suspended profiles restricted while account state is separated
-- from profile visibility in later application changes.
update public."Profile"
set
  "accountModerationStatus" = 'suspended',
  "suspensionAppealDueAt" = current_timestamp + interval '60 days'
where "status" = 'suspended';

create index "Profile_accountModerationStatus_suspensionAppealDueAt_idx"
  on public."Profile" (
    "accountModerationStatus",
    "suspensionAppealDueAt"
  );
create index "Profile_deletionScheduledAt_idx"
  on public."Profile" ("deletionScheduledAt");

create table public."ModerationCase" (
  "id" uuid primary key default gen_random_uuid(),
  "profileId" text not null
    references public."Profile" ("id") on delete cascade,
  "targetType" "ModerationTargetType" not null,
  "targetId" text not null,
  "reasonCode" "ModerationReasonCode" not null,
  "reviewMode" "ModerationReviewMode" not null,
  "status" "ModerationCaseStatus" not null default 'correctionRequired',
  "userMessage" varchar(500) not null,
  "reviewDueAt" timestamp(3) not null
    default (current_timestamp + interval '60 days'),
  "retentionExpiresAt" timestamp(3) not null
    default (current_timestamp + interval '60 days'),
  "resolvedAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  constraint "ModerationCase_userMessage_check"
    check (char_length(btrim("userMessage")) between 1 and 500),
  constraint "ModerationCase_resolution_check"
    check (
      ("status" = 'confirmed' and "resolvedAt" is not null)
      or ("status" <> 'confirmed' and "resolvedAt" is null)
    )
);

create index "ModerationCase_profileId_status_createdAt_idx"
  on public."ModerationCase" ("profileId", "status", "createdAt");
create index "ModerationCase_status_reviewDueAt_idx"
  on public."ModerationCase" ("status", "reviewDueAt");
create index "ModerationCase_retentionExpiresAt_idx"
  on public."ModerationCase" ("retentionExpiresAt");
create index "ModerationCase_targetType_targetId_createdAt_idx"
  on public."ModerationCase" ("targetType", "targetId", "createdAt");

create unique index "ModerationCase_open_target_key"
  on public."ModerationCase" ("targetType", "targetId")
  where "status" in (
    'correctionRequired',
    'postReviewPending',
    'preReviewPending'
  );

alter table public."ModerationCase" enable row level security;
revoke all on table public."ModerationCase" from anon, authenticated;

comment on table public."ModerationCase" is
  'Server-managed remediation workflow for moderated profile content.';

create trigger update_moderation_case_updated_at
before update on public."ModerationCase"
for each row
execute function public.update_updated_at_column();
