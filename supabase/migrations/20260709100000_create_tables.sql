-- Create Theme enum
create type if not exists "Theme" as enum ('normal', 'dark', 'light', 'colorful');

-- Create SocialService enum
create type if not exists "SocialService" as enum (
  'x', 'instagram', 'youtube', 'tiktok', 'github', 
  'discord', 'facebook', 'linkedin', 'bluesky', 'threads', 'note', 'website', 'other'
);

-- Create Profile table
create table if not exists "Profile" (
  id text primary key default gen_random_uuid(),
  "userId" text unique not null,
  theme "Theme" not null default 'normal',
  "displayName" text not null,
  bio text not null,
  "audioUrl" text not null,
  "audioTitle" text not null,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

-- Create SocialLink table
create table if not exists "SocialLink" (
  id text primary key default gen_random_uuid(),
  "profileId" text not null references "Profile"(id) on delete cascade,
  service "SocialService" not null,
  url text not null,
  label text not null,
  "sortOrder" integer not null default 0
);

-- Create index on SocialLink.profileId
create index if not exists "idx_social_link_profileId" on "SocialLink"("profileId");

-- Create index on Profile.userId
create index if not exists "idx_profile_userId" on "Profile"("userId");

-- Create trigger to update updatedAt timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_profile_updated_at on "Profile";
create trigger update_profile_updated_at
  before update on "Profile"
  for each row
  execute function update_updated_at_column();
