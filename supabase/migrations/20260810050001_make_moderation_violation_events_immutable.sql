create trigger prevent_moderation_violation_event_update_or_delete
before update or delete on public."ModerationViolationEvent"
for each row
execute function public.prevent_moderation_action_mutation();

comment on trigger prevent_moderation_violation_event_update_or_delete
  on public."ModerationViolationEvent" is
  'Keeps confirmed and revoked violation history immutable outside permanent account deletion.';
