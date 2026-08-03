alter table public."UserNotification"
  alter column "message" type varchar(500);

alter table public."UserNotification"
  drop constraint "UserNotification_message_check",
  add constraint "UserNotification_message_check"
    check (char_length(btrim("message")) between 1 and 500);
