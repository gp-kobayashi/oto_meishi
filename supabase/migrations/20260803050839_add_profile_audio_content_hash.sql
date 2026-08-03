alter table public."Profile"
  add column "audioContentHash" varchar(64);

alter table public."Profile"
  add constraint "Profile_audioContentHash_sha256_check"
  check (
    "audioContentHash" is null
    or "audioContentHash" ~ '^[0-9a-f]{64}$'
  );
