-- Keep immutable ModerationSnapshot rows unchanged while storing mutable
-- retention and physical-deletion state in a separate one-to-one record.
create table public."ModerationSnapshotEvidenceLifecycle" (
  "snapshotId" uuid primary key
    references public."ModerationSnapshot" ("id") on delete cascade,
  "retainUntil" timestamp(3),
  "deletedAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);

create index "ModerationSnapshotEvidenceLifecycle_due_idx"
  on public."ModerationSnapshotEvidenceLifecycle" ("deletedAt", "retainUntil");

alter table public."ModerationSnapshotEvidenceLifecycle" enable row level security;

revoke all on table public."ModerationSnapshotEvidenceLifecycle" from anon, authenticated;
grant select, insert, update, delete
  on table public."ModerationSnapshotEvidenceLifecycle" to service_role;

comment on table public."ModerationSnapshotEvidenceLifecycle" is
  'Mutable retention and physical-deletion state for immutable moderation audio evidence snapshots.';

drop trigger if exists update_moderation_snapshot_evidence_lifecycle_updated_at
  on public."ModerationSnapshotEvidenceLifecycle";
create trigger update_moderation_snapshot_evidence_lifecycle_updated_at
before update on public."ModerationSnapshotEvidenceLifecycle"
for each row
execute function public.update_updated_at_column();

-- Existing audio evidence keeps its original immutable snapshot key. Confirmed
-- cases are retained from review completion; unresolved evidence falls back to
-- the existing snapshot expiry so this migration is safe for older rows.
insert into public."ModerationSnapshotEvidenceLifecycle" (
  "snapshotId",
  "retainUntil",
  "createdAt",
  "updatedAt"
)
select
  snapshot."id",
  case
    when moderation_case."status" = 'confirmed' then
      coalesce(moderation_case."resolvedAt", moderation_case."updatedAt")
      + interval '60 days'
    else snapshot."expiresAt"
  end,
  snapshot."createdAt",
  snapshot."createdAt"
from public."ModerationSnapshot" as snapshot
left join public."ModerationCase" as moderation_case
  on moderation_case."id" = snapshot."moderationCaseId"
where snapshot."storageObjectKey" is not null
on conflict ("snapshotId") do nothing;
