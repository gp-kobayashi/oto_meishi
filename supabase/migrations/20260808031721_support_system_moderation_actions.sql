alter type "ModerationActionType" add value if not exists 'scheduleDeletion';

alter table public."ModerationAction"
  drop constraint "ModerationAction_adminUserId_fkey",
  alter column "adminUserId" drop not null,
  add column "actorType" "ModerationActorType" not null default 'admin',
  add constraint "ModerationAction_adminUserId_fkey"
    foreign key ("adminUserId") references public."AdminUser" ("id")
    on delete set null,
  add constraint "ModerationAction_actor_check"
    check (
      ("actorType" = 'admin' and "adminUserId" is not null)
      or ("actorType" = 'system' and "adminUserId" is null)
    );

comment on column public."ModerationAction"."actorType" is
  'Actor responsible for the immutable moderation action: admin or system.';
