create type "ModerationSnapshotKind" as enum (
  'reported',
  'corrected'
);

create type "ModerationActorType" as enum (
  'admin',
  'user',
  'system'
);

create type "ModerationCaseEventType" as enum (
  'created',
  'contentChanged',
  'contentDeleted',
  'statusChanged',
  'reviewApproved',
  'reviewRejected',
  'accountSuspended',
  'appealSubmitted',
  'accountRestored',
  'deletionScheduled',
  'autoConfirmed'
);

create table public."ModerationSnapshot" (
  "id" uuid primary key default gen_random_uuid(),
  "moderationCaseId" uuid not null
    references public."ModerationCase" ("id") on delete cascade,
  "kind" "ModerationSnapshotKind" not null,
  "content" jsonb not null,
  "contentHash" varchar(128),
  "storageObjectKey" varchar(1024),
  "expiresAt" timestamp(3) not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  constraint "ModerationSnapshot_content_object_check"
    check (jsonb_typeof("content") = 'object'),
  constraint "ModerationSnapshot_contentHash_check"
    check (
      "contentHash" is null
      or char_length(btrim("contentHash")) between 1 and 128
    ),
  constraint "ModerationSnapshot_storageObjectKey_check"
    check (
      "storageObjectKey" is null
      or char_length(btrim("storageObjectKey")) between 1 and 1024
    )
);

create index "ModerationSnapshot_caseId_kind_createdAt_idx"
  on public."ModerationSnapshot" (
    "moderationCaseId",
    "kind",
    "createdAt"
  );
create index "ModerationSnapshot_expiresAt_idx"
  on public."ModerationSnapshot" ("expiresAt");

create table public."ModerationCaseEvent" (
  "id" uuid primary key default gen_random_uuid(),
  "moderationCaseId" uuid not null
    references public."ModerationCase" ("id") on delete cascade,
  "eventType" "ModerationCaseEventType" not null,
  "actorType" "ModerationActorType" not null,
  "actorId" varchar(128),
  "previousStatus" "ModerationCaseStatus",
  "newStatus" "ModerationCaseStatus",
  "details" jsonb,
  "createdAt" timestamp(3) not null default current_timestamp,
  constraint "ModerationCaseEvent_actorId_check"
    check (
      ("actorType" = 'system' and "actorId" is null)
      or (
        "actorType" <> 'system'
        and "actorId" is not null
        and char_length(btrim("actorId")) between 1 and 128
      )
    ),
  constraint "ModerationCaseEvent_details_object_check"
    check ("details" is null or jsonb_typeof("details") = 'object')
);

create index "ModerationCaseEvent_caseId_createdAt_idx"
  on public."ModerationCaseEvent" ("moderationCaseId", "createdAt");
create index "ModerationCaseEvent_eventType_createdAt_idx"
  on public."ModerationCaseEvent" ("eventType", "createdAt");

alter table public."ModerationSnapshot" enable row level security;
alter table public."ModerationCaseEvent" enable row level security;

revoke all on table public."ModerationSnapshot" from anon, authenticated;
revoke all on table public."ModerationCaseEvent" from anon, authenticated;

comment on table public."ModerationSnapshot" is
  'Immutable before-and-after content snapshots retained for moderation review.';
comment on table public."ModerationCaseEvent" is
  'Immutable chronological audit events for a moderation remediation case.';

create trigger prevent_moderation_snapshot_update_or_delete
before update or delete on public."ModerationSnapshot"
for each row
execute function public.prevent_moderation_action_mutation();

create trigger prevent_moderation_case_event_update_or_delete
before update or delete on public."ModerationCaseEvent"
for each row
execute function public.prevent_moderation_action_mutation();
