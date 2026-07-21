create type "ReportReason" as enum (
  'inappropriate_audio',
  'harassment',
  'unsafe_link',
  'impersonation',
  'other'
);

create type "ReportStatus" as enum (
  'pending',
  'reviewed',
  'resolved',
  'dismissed'
);

create table public."ContentReport" (
  "id" uuid primary key default gen_random_uuid(),
  "profileId" text not null
    references public."Profile" ("id") on delete cascade,
  "reason" "ReportReason" not null,
  "details" varchar(500) not null default '',
  "status" "ReportStatus" not null default 'pending',
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  constraint "ContentReport_details_check"
    check (char_length("details") <= 500)
);

create index "ContentReport_status_createdAt_idx"
  on public."ContentReport" ("status", "createdAt");
create index "ContentReport_profileId_createdAt_idx"
  on public."ContentReport" ("profileId", "createdAt");

alter table public."ContentReport" enable row level security;
revoke all on table public."ContentReport" from anon, authenticated;

comment on table public."ContentReport" is
  'Server-managed reports submitted for public profile moderation.';
