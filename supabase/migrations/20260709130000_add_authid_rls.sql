-- Add authId to Profile and update RLS policies to use authId
alter table public."Profile"
  add column if not exists "authId" text;

do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey)
    where n.nspname = 'public'
      and t.relname = 'Profile'
      and a.attname = 'authId'
      and i.indisunique
  ) then
    create unique index "idx_profile_authId" on public."Profile"("authId");
  end if;
end $$;

-- Ensure profile ownership is populated from the authenticated user
create or replace function public.set_profile_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new."userId" is null then
    new."userId" := auth.uid()::text;
  end if;

  if new."authId" is null then
    new."authId" := auth.uid()::text;
  end if;

  return new;
end;
$$;

revoke all on function public.set_profile_owner() from public, anon, authenticated;

drop trigger if exists trg_profile_set_owner on public."Profile";
create trigger trg_profile_set_owner
before insert or update on public."Profile"
for each row
execute function public.set_profile_owner();

-- Profile policies using authId as the authenticated owner identifier
 drop policy if exists "Users can insert own profile" on public."Profile";
create policy "Users can insert own profile"
on public."Profile"
for insert
to authenticated
with check ((select auth.uid())::text = "authId");

drop policy if exists "Users can update own profile" on public."Profile";
create policy "Users can update own profile"
on public."Profile"
for update
to authenticated
using ((select auth.uid())::text = "authId")
with check ((select auth.uid())::text = "authId");

drop policy if exists "Users can delete own profile" on public."Profile";
create policy "Users can delete own profile"
on public."Profile"
for delete
to authenticated
using ((select auth.uid())::text = "authId");

-- SocialLink policies should authorize based on profile authId
 drop policy if exists "Users can insert own social links" on public."SocialLink";
create policy "Users can insert own social links"
on public."SocialLink"
for insert
to authenticated
with check (
  exists (
    select 1
    from public."Profile" p
    where p.id = "profileId"
      and p."authId" = (select auth.uid())::text
  )
);

drop policy if exists "Users can update own social links" on public."SocialLink";
create policy "Users can update own social links"
on public."SocialLink"
for update
to authenticated
using (
  exists (
    select 1
    from public."Profile" p
    where p.id = "profileId"
      and p."authId" = (select auth.uid())::text
  )
)
with check (
  exists (
    select 1
    from public."Profile" p
    where p.id = "profileId"
      and p."authId" = (select auth.uid())::text
  )
);

drop policy if exists "Users can delete own social links" on public."SocialLink";
create policy "Users can delete own social links"
on public."SocialLink"
for delete
to authenticated
using (
  exists (
    select 1
    from public."Profile" p
    where p.id = "profileId"
      and p."authId" = (select auth.uid())::text
  )
);
