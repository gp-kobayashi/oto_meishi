create type "RegistrationBanStatus" as enum ('active', 'revoked');
create type "RegistrationBanIdentifierType" as enum ('email', 'providerIdentity');

create table public."AccountDeletionRecord" (
  "id" uuid primary key default gen_random_uuid(),
  "formerAuthId" uuid not null unique,
  "reason" varchar(500) not null,
  "deletedAt" timestamp(3) not null default current_timestamp,
  "banStatus" "RegistrationBanStatus" not null default 'active',
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  constraint "AccountDeletionRecord_reason_check"
    check (char_length(btrim("reason")) between 1 and 500)
);

create table public."RegistrationBanIdentifier" (
  "id" uuid primary key default gen_random_uuid(),
  "accountDeletionRecordId" uuid not null
    references public."AccountDeletionRecord" ("id") on delete cascade,
  "identifierType" "RegistrationBanIdentifierType" not null,
  "provider" varchar(64),
  "fingerprint" char(64) not null unique,
  "createdAt" timestamp(3) not null default current_timestamp,
  constraint "RegistrationBanIdentifier_fingerprint_check"
    check ("fingerprint" ~ '^[0-9a-f]{64}$'),
  constraint "RegistrationBanIdentifier_provider_check"
    check (
      ("identifierType" = 'email' and "provider" is null)
      or (
        "identifierType" = 'providerIdentity'
        and char_length(btrim("provider")) between 1 and 64
      )
    )
);

create index "AccountDeletionRecord_banStatus_deletedAt_idx"
  on public."AccountDeletionRecord" ("banStatus", "deletedAt");
create index "RegistrationBanIdentifier_recordId_createdAt_idx"
  on public."RegistrationBanIdentifier" ("accountDeletionRecordId", "createdAt");

create trigger update_account_deletion_record_updated_at
before update on public."AccountDeletionRecord"
for each row
execute function public.update_updated_at_column();

alter table public."AccountDeletionRecord" enable row level security;
alter table public."RegistrationBanIdentifier" enable row level security;

revoke all on table public."AccountDeletionRecord" from anon, authenticated;
revoke all on table public."RegistrationBanIdentifier" from anon, authenticated;

comment on table public."AccountDeletionRecord" is
  'Server-only minimal record retained after permanent account deletion.';
comment on table public."RegistrationBanIdentifier" is
  'Server-only non-reversible fingerprints used to prevent prohibited re-registration.';
