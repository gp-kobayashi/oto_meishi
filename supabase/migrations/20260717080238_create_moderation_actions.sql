create type "ModerationTargetType" as enum ('profile', 'audio', 'socialLink');
create type "ModerationActionType" as enum ('hide', 'restore', 'suspend', 'remove');

create table public."ModerationAction" (
  "id" uuid primary key default gen_random_uuid(),
  "adminUserId" uuid not null references public."AdminUser" ("id"),
  "profileId" text not null,
  "targetType" "ModerationTargetType" not null,
  "targetId" text not null,
  "action" "ModerationActionType" not null,
  "previousStatus" varchar(32) not null,
  "newStatus" varchar(32) not null,
  "reason" varchar(500) not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  constraint "ModerationAction_reason_check"
    check (char_length(btrim("reason")) between 1 and 500)
);

create index "ModerationAction_profileId_createdAt_idx"
  on public."ModerationAction" ("profileId", "createdAt");
create index "ModerationAction_targetType_targetId_createdAt_idx"
  on public."ModerationAction" ("targetType", "targetId", "createdAt");
create index "ModerationAction_adminUserId_createdAt_idx"
  on public."ModerationAction" ("adminUserId", "createdAt");

alter table public."ModerationAction" enable row level security;
revoke all on table public."ModerationAction" from anon, authenticated;

comment on table public."ModerationAction" is
  'Immutable server-only audit trail for moderation status changes.';

create or replace function public.prevent_moderation_action_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise insufficient_privilege
    using message = 'Moderation action history is immutable.';
end;
$$;

revoke all on function public.prevent_moderation_action_mutation()
  from public, anon, authenticated;

create trigger prevent_moderation_action_update_or_delete
before update or delete on public."ModerationAction"
for each row
execute function public.prevent_moderation_action_mutation();
