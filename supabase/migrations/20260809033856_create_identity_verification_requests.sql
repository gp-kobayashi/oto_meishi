create type "IdentityVerificationRequestStatus" as enum (
  'pending',
  'verified',
  'rejected',
  'expired'
);

create table public."IdentityVerificationRequest" (
  "id" uuid primary key default gen_random_uuid(),
  "profileId" text not null
    references public."Profile" ("id") on delete cascade,
  "moderationCaseId" uuid not null
    references public."ModerationCase" ("id") on delete cascade,
  "socialLinkId" text
    references public."SocialLink" ("id") on delete set null,
  "socialUrl" varchar(2048) not null,
  "plannedContent" varchar(500) not null,
  "status" "IdentityVerificationRequestStatus" not null default 'pending',
  "postingDeadlineAt" timestamptz(3) not null,
  "reviewedByAdminUserId" uuid
    references public."AdminUser" ("id") on delete set null,
  "reviewNote" varchar(500) not null default '',
  "reviewedAt" timestamptz(3),
  "createdAt" timestamptz(3) not null default current_timestamp,
  "updatedAt" timestamptz(3) not null default current_timestamp,
  constraint "IdentityVerificationRequest_socialUrl_check"
    check (char_length("socialUrl") between 1 and 2048 and "socialUrl" ~ '^https://'),
  constraint "IdentityVerificationRequest_plannedContent_check"
    check (char_length(btrim("plannedContent")) between 1 and 500),
  constraint "IdentityVerificationRequest_postingDeadlineAt_check"
    check ("postingDeadlineAt" > "createdAt"),
  constraint "IdentityVerificationRequest_review_check"
    check (
      ("status" = 'pending' and "reviewedAt" is null and "reviewedByAdminUserId" is null)
      or ("status" = 'expired' and "reviewedAt" is null and "reviewedByAdminUserId" is null)
      or (
        "status" in ('verified', 'rejected')
        and "reviewedAt" is not null
        and "reviewedByAdminUserId" is not null
        and char_length(btrim("reviewNote")) between 1 and 500
      )
    )
);

create unique index "IdentityVerificationRequest_one_pending_per_case_idx"
  on public."IdentityVerificationRequest" ("moderationCaseId")
  where "status" = 'pending';
create index "IdentityVerificationRequest_profileId_createdAt_idx"
  on public."IdentityVerificationRequest" ("profileId", "createdAt" desc);
create index "IdentityVerificationRequest_caseId_createdAt_idx"
  on public."IdentityVerificationRequest" ("moderationCaseId", "createdAt" desc);
create index "IdentityVerificationRequest_socialLinkId_idx"
  on public."IdentityVerificationRequest" ("socialLinkId");
create index "IdentityVerificationRequest_status_deadline_idx"
  on public."IdentityVerificationRequest" ("status", "postingDeadlineAt");
create index "IdentityVerificationRequest_reviewer_reviewedAt_idx"
  on public."IdentityVerificationRequest" ("reviewedByAdminUserId", "reviewedAt");

create trigger update_identity_verification_request_updated_at
before update on public."IdentityVerificationRequest"
for each row
execute function public.update_updated_at_column();

alter table public."IdentityVerificationRequest" enable row level security;
revoke all on table public."IdentityVerificationRequest" from anon, authenticated;

comment on table public."IdentityVerificationRequest" is
  'Server-only record of a planned social post used to verify control of a registered social account.';
