create type "ModerationRequestKind" as enum (
  'inquiry',
  'accountAppeal'
);

create type "ModerationRequestStatus" as enum (
  'pending',
  'resolved',
  'rejected'
);

create table public."ModerationRequest" (
  "id" uuid primary key default gen_random_uuid(),
  "profileId" text not null
    references public."Profile" ("id") on delete cascade,
  "kind" "ModerationRequestKind" not null,
  "status" "ModerationRequestStatus" not null default 'pending',
  "message" varchar(500) not null,
  "responseMessage" varchar(500) not null default '',
  "resolvedAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  constraint "ModerationRequest_message_check"
    check (char_length(btrim("message")) between 1 and 500),
  constraint "ModerationRequest_response_check"
    check (char_length("responseMessage") <= 500),
  constraint "ModerationRequest_resolution_check"
    check (
      ("status" = 'pending' and "resolvedAt" is null)
      or
      ("status" in ('resolved', 'rejected') and "resolvedAt" is not null)
    )
);

create index "ModerationRequest_profileId_createdAt_idx"
  on public."ModerationRequest" ("profileId", "createdAt" desc);
create index "ModerationRequest_status_createdAt_idx"
  on public."ModerationRequest" ("status", "createdAt");
create unique index "ModerationRequest_pending_profile_kind_key"
  on public."ModerationRequest" ("profileId", "kind")
  where "status" = 'pending';

alter table public."ModerationRequest" enable row level security;
revoke all on table public."ModerationRequest" from anon, authenticated;

create trigger set_moderation_request_updated_at
before update on public."ModerationRequest"
for each row
execute function public.update_updated_at_column();

comment on table public."ModerationRequest" is
  'Server-only user inquiries and account suspension appeals.';
