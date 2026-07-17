create type "ProfileStatus" as enum ('active', 'hidden', 'suspended');
create type "AudioModerationStatus" as enum ('active', 'hidden', 'removed');
create type "SocialLinkModerationStatus" as enum ('active', 'hidden');

alter table public."Profile"
  add column "status" "ProfileStatus" not null default 'active',
  add column "audioStatus" "AudioModerationStatus" not null default 'active';

alter table public."SocialLink"
  add column "status" "SocialLinkModerationStatus" not null default 'active';

create index "Profile_status_idx" on public."Profile" ("status");
create index "Profile_audioStatus_idx" on public."Profile" ("audioStatus");
create index "SocialLink_status_idx" on public."SocialLink" ("status");

-- Hidden content stays visible to its owner, but not to anonymous visitors.
drop policy if exists "Anyone can view public profiles" on public."Profile";
create policy "Public or owned profiles are visible"
on public."Profile"
for select
to anon, authenticated
using (
  "status" = 'active'
  or "authId" = (select auth.uid())::text
);

drop policy if exists "Anyone can view public social links" on public."SocialLink";
create policy "Public or owned social links are visible"
on public."SocialLink"
for select
to anon, authenticated
using (
  (
    "status" = 'active'
    and exists (
      select 1
      from public."Profile" p
      where p.id = "profileId"
        and p."status" = 'active'
    )
  )
  or exists (
    select 1
    from public."Profile" p
    where p.id = "profileId"
      and p."authId" = (select auth.uid())::text
  )
);

-- Moderation state is managed only through trusted server-side database access.
create or replace function public.prevent_client_moderation_status_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_table_name = 'Profile'
      and (
        new."status" is distinct from old."status"
        or new."audioStatus" is distinct from old."audioStatus"
      ) then
      raise insufficient_privilege
        using message = 'Moderation status can only be changed by the server.';
    end if;

    if tg_table_name = 'SocialLink'
      and new."status" is distinct from old."status" then
      raise insufficient_privilege
        using message = 'Moderation status can only be changed by the server.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_client_moderation_status_change()
  from public, anon, authenticated;

create trigger prevent_client_profile_moderation_status_change
before update on public."Profile"
for each row
execute function public.prevent_client_moderation_status_change();

create trigger prevent_client_social_link_moderation_status_change
before update on public."SocialLink"
for each row
execute function public.prevent_client_moderation_status_change();
