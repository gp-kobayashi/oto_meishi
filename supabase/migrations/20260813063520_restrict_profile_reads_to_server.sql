-- Profile and SocialLink reads are trusted-server-only. Browser clients must
-- use the Next.js API, which applies the public/owner response shaping.

revoke select on table public."Profile" from anon, authenticated;
revoke select on table public."SocialLink" from anon, authenticated;

grant select on table public."Profile" to service_role;
grant select on table public."SocialLink" to service_role;

-- Remove the prior browser-facing policies as defense in depth. Access is
-- denied by table privileges above, and no public/owned read policy remains.
drop policy if exists "Public or owned profiles are visible" on public."Profile";
drop policy if exists "Public or owned social links are visible" on public."SocialLink";
