create type "ModerationViolationEventType" as enum ('confirmed', 'revoked');

create table public."ModerationViolationEvent" (
  "id" uuid primary key default gen_random_uuid(),
  "profileId" text not null
    references public."Profile" ("id") on delete cascade,
  "moderationCaseId" uuid not null
    references public."ModerationCase" ("id") on delete cascade,
  "adminUserId" uuid
    references public."AdminUser" ("id") on delete set null,
  "adminAuthId" varchar(128),
  "adminRole" "AdminRole",
  "eventType" "ModerationViolationEventType" not null,
  "reasonCode" "ModerationReasonCode" not null,
  "originalViolationEventId" uuid
    references public."ModerationViolationEvent" ("id") on delete cascade,
  "suspensionTriggered" boolean not null default false,
  "note" varchar(500) not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  constraint "ModerationViolationEvent_shape_check" check (
    (
      "eventType" = 'confirmed'
      and "originalViolationEventId" is null
    )
    or (
      "eventType" = 'revoked'
      and "originalViolationEventId" is not null
      and "suspensionTriggered" = false
    )
  ),
  constraint "ModerationViolationEvent_note_check"
    check (char_length(btrim("note")) between 1 and 500)
);

create index "ViolationEvent_profile_reason_type_created_idx"
  on public."ModerationViolationEvent"
    ("profileId", "reasonCode", "eventType", "createdAt");
create index "ViolationEvent_case_created_idx"
  on public."ModerationViolationEvent" ("moderationCaseId", "createdAt");
create index "ViolationEvent_original_idx"
  on public."ModerationViolationEvent" ("originalViolationEventId");
create index "ViolationEvent_admin_created_idx"
  on public."ModerationViolationEvent" ("adminUserId", "createdAt");

create unique index "ModerationViolationEvent_case_confirmed_key"
  on public."ModerationViolationEvent" ("moderationCaseId")
  where "eventType" = 'confirmed';
create unique index "ModerationViolationEvent_original_revoked_key"
  on public."ModerationViolationEvent" ("originalViolationEventId")
  where "eventType" = 'revoked';

alter table public."ModerationViolationEvent" enable row level security;
revoke all on table public."ModerationViolationEvent" from anon, authenticated;

comment on table public."ModerationViolationEvent" is
  'Server-only history of confirmed and revoked moderation violations.';
