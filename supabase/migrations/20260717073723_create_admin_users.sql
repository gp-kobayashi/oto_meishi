create type "AdminRole" as enum ('moderator', 'admin');

create table "AdminUser" (
  "id" uuid primary key default gen_random_uuid(),
  "authId" text not null unique,
  "role" "AdminRole" not null default 'moderator',
  "isActive" boolean not null default true,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);

alter table "AdminUser" enable row level security;

revoke all on table "AdminUser" from anon, authenticated;

comment on table "AdminUser" is
  'Server-only allowlist for moderation access. Do not expose through browser clients.';
