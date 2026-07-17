alter table public."Profile"
  add column if not exists "audioKey" text not null default '';
