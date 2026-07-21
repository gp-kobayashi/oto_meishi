create table public."UserNotification" (
  "id" uuid primary key default gen_random_uuid(),
  "profileId" text not null
    references public."Profile" ("id") on delete cascade,
  "moderationActionId" uuid not null unique
    references public."ModerationAction" ("id") on delete cascade,
  "title" varchar(100) not null,
  "message" varchar(300) not null,
  "readAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp,
  constraint "UserNotification_title_check"
    check (char_length(btrim("title")) between 1 and 100),
  constraint "UserNotification_message_check"
    check (char_length(btrim("message")) between 1 and 300)
);

create index "UserNotification_profileId_readAt_createdAt_idx"
  on public."UserNotification" ("profileId", "readAt", "createdAt" desc);

alter table public."UserNotification" enable row level security;
revoke all on table public."UserNotification" from anon, authenticated;

comment on table public."UserNotification" is
  'Server-managed notifications shown to profile owners after moderation actions.';
