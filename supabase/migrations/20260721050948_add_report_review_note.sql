alter table public."ContentReport"
  add column "reviewNote" varchar(500) not null default '';

alter table public."ContentReport"
  add constraint "ContentReport_reviewNote_check"
  check (char_length("reviewNote") <= 500);
