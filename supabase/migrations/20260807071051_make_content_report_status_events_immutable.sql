create trigger prevent_content_report_status_event_update_or_delete
before update or delete on public."ContentReportStatusEvent"
for each row
execute function public.prevent_moderation_action_mutation();
