alter table public."Profile"
  add column "moderatedAt" timestamptz(3);

update public."Profile"
set "moderatedAt" = "updatedAt"
where "moderatedAt" is null;

alter table public."Profile"
  alter column "moderatedAt" set default CURRENT_TIMESTAMP,
  alter column "moderatedAt" set not null;

create index "Profile_moderatedAt_id_idx"
  on public."Profile" ("moderatedAt" desc, id desc);
