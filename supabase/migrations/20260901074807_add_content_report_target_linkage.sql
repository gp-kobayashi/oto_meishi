-- Preserve the reported target and historical content for every report. Legacy
-- reports did not store a target snapshot, so mark that information as
-- unavailable instead of reconstructing a possibly inaccurate past state.
alter table public."ContentReport"
  add column "targetType" "ModerationTargetType",
  add column "targetId" text,
  add column "targetSnapshot" jsonb,
  add column "moderationCaseId" uuid,
  add column "moderationActionId" uuid;

update public."ContentReport"
set
  "targetType" = 'profile'::"ModerationTargetType",
  "targetId" = "profileId",
  "targetSnapshot" = jsonb_build_object(
    'source', 'legacy',
    'available', false,
    'reason', 'target snapshot was not recorded when this report was created'
  )
where "targetType" is null
   or "targetId" is null
   or "targetSnapshot" is null;

alter table public."ContentReport"
  alter column "targetType" set not null,
  alter column "targetId" set not null,
  alter column "targetSnapshot" set not null;

alter table public."ContentReport"
  add constraint "ContentReport_moderationCaseId_fkey"
    foreign key ("moderationCaseId")
    references public."ModerationCase" ("id")
    on delete set null,
  add constraint "ContentReport_moderationActionId_fkey"
    foreign key ("moderationActionId")
    references public."ModerationAction" ("id")
    on delete set null;

create index "ContentReport_profile_target_createdAt_idx"
  on public."ContentReport" ("profileId", "targetType", "targetId", "createdAt");
create index "ContentReport_moderationCaseId_idx"
  on public."ContentReport" ("moderationCaseId");
create index "ContentReport_moderationActionId_idx"
  on public."ContentReport" ("moderationActionId");
