-- Profile and SocialLink mutations are trusted-server-only. Browser clients
-- may continue to use the existing SELECT policies, but cannot write these
-- tables through the Supabase Data API.

revoke insert, update, delete on table public."Profile" from anon, authenticated;
revoke insert, update, delete on table public."SocialLink" from anon, authenticated;

grant select, insert, update, delete on table public."Profile" to service_role;
grant select, insert, update, delete on table public."SocialLink" to service_role;

drop policy if exists "Users can insert own profile" on public."Profile";
drop policy if exists "Users can update own profile" on public."Profile";
drop policy if exists "Users can delete own profile" on public."Profile";

drop policy if exists "Users can insert own social links" on public."SocialLink";
drop policy if exists "Users can update own social links" on public."SocialLink";
drop policy if exists "Users can delete own social links" on public."SocialLink";
