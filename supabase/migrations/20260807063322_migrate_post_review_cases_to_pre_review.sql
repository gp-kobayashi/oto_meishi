begin;

-- Legacy post-review cases may still point at publicly visible content.
-- Hide only content that is currently active; deleted audio remains removed.
update public."Profile" as profile
set "status" = 'hidden'
where profile."status" = 'active'
  and exists (
    select 1
    from public."ModerationCase" as moderation_case
    where moderation_case."profileId" = profile."id"
      and moderation_case."targetType" = 'profile'
      and moderation_case."targetId" = profile."id"
      and moderation_case."status" = 'postReviewPending'
  );

update public."Profile" as profile
set "audioStatus" = 'hidden'
where profile."audioStatus" = 'active'
  and exists (
    select 1
    from public."ModerationCase" as moderation_case
    where moderation_case."profileId" = profile."id"
      and moderation_case."targetType" = 'audio'
      and moderation_case."targetId" = profile."id"
      and moderation_case."status" = 'postReviewPending'
  );

update public."SocialLink" as social_link
set "status" = 'hidden'
where social_link."status" = 'active'
  and exists (
    select 1
    from public."ModerationCase" as moderation_case
    where moderation_case."profileId" = social_link."profileId"
      and moderation_case."targetType" = 'socialLink'
      and moderation_case."targetId" = social_link."id"
      and moderation_case."status" = 'postReviewPending'
  );

insert into public."ModerationCaseEvent" (
  "moderationCaseId",
  "eventType",
  "actorType",
  "actorId",
  "previousStatus",
  "newStatus",
  "details"
)
select
  moderation_case."id",
  'statusChanged',
  'system',
  null,
  'postReviewPending',
  'preReviewPending',
  jsonb_build_object(
    'reason', 'postReviewRetired',
    'targetType', moderation_case."targetType"
  )
from public."ModerationCase" as moderation_case
where moderation_case."status" = 'postReviewPending';

update public."ModerationCase"
set
  "reviewMode" = 'preReview',
  "status" = 'preReviewPending'
where "status" = 'postReviewPending';

commit;
