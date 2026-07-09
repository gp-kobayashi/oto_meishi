-- Ensure the identifier column exists before applying policies
alter table public."Profile"
  add column if not exists "userId" text;

create index if not exists "idx_profile_userId"
  on public."Profile" ("userId");

-- Enable row level security on profile and social link tables
alter table public."Profile" enable row level security;
alter table public."SocialLink" enable row level security;

-- Ensure profile ownership is populated from the authenticated user
create or replace function public.set_profile_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new."userId" is null then
    new."userId" := auth.uid()::text;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profile_set_owner on public."Profile";
create trigger trg_profile_set_owner
before insert or update of "userId"
on public."Profile"
for each row
execute function public.set_profile_owner();

-- Profile policies
 drop policy if exists "Anyone can view public profiles" on public."Profile";
create policy "Anyone can view public profiles"
on public."Profile"
for select
using (true);

drop policy if exists "Users can insert own profile" on public."Profile";
create policy "Users can insert own profile"
on public."Profile"
for insert
with check (auth.uid()::text = "userId");

drop policy if exists "Users can update own profile" on public."Profile";
create policy "Users can update own profile"
on public."Profile"
for update
using (auth.uid()::text = "userId")
with check (auth.uid()::text = "userId");

drop policy if exists "Users can delete own profile" on public."Profile";
create policy "Users can delete own profile"
on public."Profile"
for delete
using (auth.uid()::text = "userId");

-- SocialLink policies
 drop policy if exists "Anyone can view public social links" on public."SocialLink";
create policy "Anyone can view public social links"
on public."SocialLink"
for select
using (true);

drop policy if exists "Users can insert own social links" on public."SocialLink";
create policy "Users can insert own social links"
on public."SocialLink"
for insert
with check (
  exists (
    select 1
    from public."Profile" p
    where p.id = "profileId"
      and p."userId" = auth.uid()::text
  )
);

drop policy if exists "Users can update own social links" on public."SocialLink";
create policy "Users can update own social links"
on public."SocialLink"
for update
using (
  exists (
    select 1
    from public."Profile" p
    where p.id = "profileId"
      and p."userId" = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public."Profile" p
    where p.id = "profileId"
      and p."userId" = auth.uid()::text
  )
);

drop policy if exists "Users can delete own social links" on public."SocialLink";
create policy "Users can delete own social links"
on public."SocialLink"
for delete
using (
  exists (
    select 1
    from public."Profile" p
    where p.id = "profileId"
      and p."userId" = auth.uid()::text
  )
);
