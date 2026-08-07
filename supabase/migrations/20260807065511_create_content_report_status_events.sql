create table public."ContentReportStatusEvent" (
  "id" uuid primary key default gen_random_uuid(),
  "reportId" uuid not null
    references public."ContentReport" ("id") on delete cascade,
  "adminUserId" uuid
    references public."AdminUser" ("id") on delete set null,
  "adminAuthId" varchar(128),
  "adminRole" "AdminRole",
  "previousStatus" "ReportStatus",
  "newStatus" "ReportStatus" not null,
  "note" varchar(500) not null,
  "isBackfilled" boolean not null default false,
  "createdAt" timestamp(3) not null default current_timestamp,
  constraint "ContentReportStatusEvent_note_check"
    check (char_length("note") <= 500),
  constraint "ContentReportStatusEvent_transition_check"
    check (
      (
        "isBackfilled" = true
        and "previousStatus" is null
      )
      or (
        "isBackfilled" = false
        and (
          (
            "previousStatus" = 'pending'
            and "newStatus" in ('reviewed', 'resolved', 'dismissed')
          )
          or (
            "previousStatus" = 'reviewed'
            and "newStatus" in ('resolved', 'dismissed')
          )
        )
      )
    )
);

create index "ContentReportStatusEvent_reportId_createdAt_idx"
  on public."ContentReportStatusEvent" ("reportId", "createdAt" desc);
create index "ContentReportStatusEvent_adminUserId_createdAt_idx"
  on public."ContentReportStatusEvent" ("adminUserId", "createdAt" desc);

alter table public."ContentReportStatusEvent" enable row level security;
revoke all on table public."ContentReportStatusEvent" from anon, authenticated;

comment on table public."ContentReportStatusEvent" is
  'Append-only audit history for administrative report status changes.';

insert into public."ContentReportStatusEvent" (
  "reportId",
  "adminUserId",
  "adminAuthId",
  "adminRole",
  "previousStatus",
  "newStatus",
  "note",
  "isBackfilled",
  "createdAt"
)
select
  report."id",
  report."reviewedByAdminUserId",
  admin_user."authId",
  admin_user."role",
  null,
  report."status",
  report."reviewNote",
  true,
  report."reviewedAt"
from public."ContentReport" as report
left join public."AdminUser" as admin_user
  on admin_user."id" = report."reviewedByAdminUserId"
where report."status" <> 'pending'
  and report."reviewedAt" is not null;
