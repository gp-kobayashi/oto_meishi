alter table public."ContentReport"
  add column "reviewedByAdminUserId" uuid,
  add column "reviewedAt" timestamp(3);

alter table public."ContentReport"
  add constraint "ContentReport_reviewedByAdminUserId_fkey"
  foreign key ("reviewedByAdminUserId")
  references public."AdminUser" ("id")
  on delete set null;

create index "ContentReport_reviewedByAdminUserId_idx"
  on public."ContentReport" ("reviewedByAdminUserId");
