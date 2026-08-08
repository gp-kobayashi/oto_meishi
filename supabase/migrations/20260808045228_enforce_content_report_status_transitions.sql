create or replace function public.prevent_invalid_content_report_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old."status" = new."status" then
    return new;
  end if;

  if (
    old."status" = 'pending'
    and new."status" in ('reviewed', 'resolved', 'dismissed')
  ) or (
    old."status" = 'reviewed'
    and new."status" in ('resolved', 'dismissed')
  ) then
    return new;
  end if;

  raise exception 'Invalid ContentReport status transition from % to %', old."status", new."status"
    using errcode = 'check_violation';
end;
$$;

revoke all on function public.prevent_invalid_content_report_status_transition()
  from public, anon, authenticated;

create trigger prevent_invalid_content_report_status_transition
before update of "status" on public."ContentReport"
for each row
execute function public.prevent_invalid_content_report_status_transition();
