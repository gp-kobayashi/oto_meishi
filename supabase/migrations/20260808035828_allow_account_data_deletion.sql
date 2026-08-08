create or replace function public.prevent_moderation_action_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if
    tg_op = 'DELETE'
    and current_setting('app.account_deletion', true) = 'enabled'
  then
    return old;
  end if;

  raise insufficient_privilege
    using message = 'Moderation history is immutable outside account deletion.';
end;
$$;

revoke all on function public.prevent_moderation_action_mutation()
  from public, anon, authenticated;

comment on function public.prevent_moderation_action_mutation() is
  'Rejects audit mutations, except deletes inside the server-only account deletion transaction.';
