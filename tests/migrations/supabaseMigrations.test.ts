import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const migrationsDirectory = path.resolve(
  process.cwd(),
  "supabase",
  "migrations",
);
const migrationFiles = fs
  .readdirSync(migrationsDirectory)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();
describe("Supabase migrations", () => {
  it("SQLマイグレーションが存在する", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it("永続レート制限をサーバー専用テーブルとして作成する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_add_persistent_rate_limits.sql"),
    );
    expect(migrationFile).toBeDefined();

    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain(
      'create table if not exists public."RateLimitCounter"',
    );
    expect(sql).toContain('primary key ("scope", "key_hash")');
    expect(sql).toContain('check ("count" >= 1)');
    expect(sql).toContain(
      'create index if not exists "RateLimitCounter_reset_at_idx"',
    );
    expect(sql).toContain(
      'alter table public."RateLimitCounter" enable row level security',
    );
    expect(sql).toContain(
      'revoke all on table public."RateLimitCounter" from anon, authenticated',
    );
    expect(sql).toContain(
      'grant select, insert, update, delete on table public."RateLimitCounter" to service_role',
    );
  });
  it("pending R2削除キューをサービス専用で作成する", () => {
    const file = migrationFiles.find((name) =>
      name.includes("add_pending_r2_object_deletions"),
    );
    expect(file).toBeDefined();
    const sql = fs.readFileSync(path.join(migrationsDirectory, file!), "utf8");
    expect(sql).toContain(
      'create table if not exists public."PendingR2ObjectDeletion"',
    );
    expect(sql).toContain("enable row level security");
    expect(sql).toContain(
      'revoke all on table public."PendingR2ObjectDeletion" from anon, authenticated',
    );
    expect(sql).toContain(
      'grant select, insert, update, delete on table public."PendingR2ObjectDeletion" to service_role',
    );
    expect(sql).toContain("PendingR2ObjectDeletion_updatedAt_idx");
  });
  it("pending R2削除キューへ再試行スケジュールを追加する", () => {
    const file = migrationFiles.find((name) =>
      name.endsWith("_add_pending_r2_deletion_schedule.sql"),
    );
    expect(file).toBeDefined();
    const sql = fs.readFileSync(path.join(migrationsDirectory, file!), "utf8");
    expect(sql).toContain('add column if not exists "nextAttemptAt"');
    expect(sql).toContain(
      "PendingR2ObjectDeletion_nextAttemptAt_updatedAt_idx",
    );
    expect(sql).toContain(
      'drop index if exists "PendingR2ObjectDeletion_updatedAt_idx"',
    );
  });
  it.each(migrationFiles)(
    "%sでPostgreSQL非対応のCREATE TYPE IF NOT EXISTSを使用しない",
    (fileName) => {
      const sql = fs.readFileSync(
        path.join(migrationsDirectory, fileName),
        "utf8",
      );
      expect(sql).not.toMatch(/\bcreate\s+type\s+if\s+not\s+exists\b/i);
    },
  );
  it("旧事後確認ケースを対象別に非公開化して事前確認へ移行する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_migrate_post_review_cases_to_pre_review.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain("set \"status\" = 'hidden'");
    expect(sql).toContain("profile.\"status\" = 'active'");
    expect(sql).toContain("set \"audioStatus\" = 'hidden'");
    expect(sql).toContain("profile.\"audioStatus\" = 'active'");
    expect(sql).toContain('update public."SocialLink"');
    expect(sql).toContain('insert into public."ModerationCaseEvent"');
    expect(sql).toContain("\"reviewMode\" = 'preReview'");
    expect(sql).toContain("\"status\" = 'preReviewPending'");
    expect(sql).toContain("where \"status\" = 'postReviewPending'");
  });
  it("通報状態履歴を外部非公開かつ前方向遷移だけで保存する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_create_content_report_status_events.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain('create table public."ContentReportStatusEvent"');
    expect(sql).toContain(
      'alter table public."ContentReportStatusEvent" enable row level security',
    );
    expect(sql).toContain(
      'revoke all on table public."ContentReportStatusEvent" from anon, authenticated',
    );
    expect(sql).toContain(
      'constraint "ContentReportStatusEvent_transition_check"',
    );
    expect(sql).toContain("\"previousStatus\" = 'pending'");
    expect(sql).toContain("\"previousStatus\" = 'reviewed'");
    expect(sql).toContain('insert into public."ContentReportStatusEvent"');
    expect(sql).toContain('"isBackfilled"');
  });
  it("通報状態履歴の更新と削除をDBトリガーで禁止する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_make_content_report_status_events_immutable.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain(
      "create trigger prevent_content_report_status_event_update_or_delete",
    );
    expect(sql).toContain(
      'before update or delete on public."ContentReportStatusEvent"',
    );
    expect(sql).toContain(
      "execute function public.prevent_moderation_action_mutation()",
    );
  });
  it("確定した違反と取り消しを外部非公開の履歴として保存する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_create_moderation_violation_events.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain('create table public."ModerationViolationEvent"');
    expect(sql).toContain("'confirmed', 'revoked'");
    expect(sql).toContain('constraint "ModerationViolationEvent_shape_check"');
    expect(sql).toContain(
      'create unique index "ModerationViolationEvent_case_confirmed_key"',
    );
    expect(sql).toContain(
      'create unique index "ModerationViolationEvent_original_revoked_key"',
    );
    expect(sql).toContain(
      'alter table public."ModerationViolationEvent" enable row level security',
    );
    expect(sql).toContain(
      'revoke all on table public."ModerationViolationEvent" from anon, authenticated',
    );
  });
  it("違反履歴の更新と削除を完全削除時以外はDBトリガーで禁止する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_make_moderation_violation_events_immutable.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain(
      "create trigger prevent_moderation_violation_event_update_or_delete",
    );
    expect(sql).toContain(
      'before update or delete on public."ModerationViolationEvent"',
    );
    expect(sql).toContain(
      "execute function public.prevent_moderation_action_mutation()",
    );
  });
  it("issue #102で定めた違反分類を追加する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_add_moderation_reason_codes.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain("'threatOrPersonalData'");
    expect(sql).toContain("'unofficialThirdPartyProfile'");
    expect(sql).toContain("'politicalReligiousPromotion'");
  });
  it("アカウント削除後に再試行するR2キーを一時保存する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_add_pending_account_deletion_storage_keys.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain(
      "add column \"pendingStorageObjectKeys\" text[] not null default '{}'",
    );
  });
  it("期限処理を管理者操作と区別して監査履歴へ保存する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_support_system_moderation_actions.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain("'scheduleDeletion'");
    expect(sql).toContain('add column "actorType" "ModerationActorType"');
    expect(sql).toContain('alter column "adminUserId" drop not null');
    expect(sql).toContain('constraint "ModerationAction_actor_check"');
    expect(sql).toContain("\"actorType\" = 'admin'");
    expect(sql).toContain("\"actorType\" = 'system'");
    expect(sql).toContain("on delete set null");
  });
  it("完全削除後の最小記録と復元困難な再登録照合値を外部非公開で保持する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_create_registration_bans.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain('create table public."AccountDeletionRecord"');
    expect(sql).toContain('create table public."RegistrationBanIdentifier"');
    expect(sql).toContain('"formerAuthId" uuid not null unique');
    expect(sql).toContain('"fingerprint" char(64) not null unique');
    expect(sql).toContain(
      'constraint "RegistrationBanIdentifier_provider_check"',
    );
    expect(sql).toContain(
      'alter table public."AccountDeletionRecord" enable row level security',
    );
    expect(sql).toContain(
      'revoke all on table public."RegistrationBanIdentifier" from anon, authenticated',
    );
  });
  it("完全削除専用トランザクションだけ追記型履歴の削除を許可する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_allow_account_data_deletion.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain("tg_op = 'DELETE'");
    expect(sql).toContain(
      "current_setting('app.account_deletion', true) = 'enabled'",
    );
    expect(sql).toContain("return old");
    expect(sql).toContain("raise insufficient_privilege");
    expect(sql).not.toContain("tg_op = 'UPDATE'");
    expect(sql).toContain(
      "revoke all on function public.prevent_moderation_action_mutation()",
    );
  });
  it("外部サービスを含む完全削除が完了した時だけ削除日時を記録する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_make_account_deletion_completion_explicit.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain('alter column "deletedAt" drop default');
    expect(sql).toContain('alter column "deletedAt" drop not null');
  });
  it("完全削除の重複実行を防ぐ一時的な取得日時を追加する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_add_account_deletion_claim.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain('add column "deletionProcessingStartedAt"');
    expect(sql).toContain(
      'create index "Profile_accountStatus_deletionProcessingStartedAt_idx"',
    );
  });
  it("審査完了後から音声証拠の保持期限を数え直す", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_retain_evidence_until_case_review_complete.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain('update public."ModerationCase"');
    expect(sql).not.toContain('update public."ModerationSnapshot"');
    expect(sql).toContain("\"status\" = 'confirmed'");
    expect(sql).toContain("interval '60 days'");
  });
  it("不変な音声証拠と可変な保持状態を分離する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_separate_moderation_snapshot_evidence_lifecycle.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain(
      'create table public."ModerationSnapshotEvidenceLifecycle"',
    );
    expect(sql).toContain(
      'references public."ModerationSnapshot" ("id") on delete cascade',
    );
    expect(sql).toContain('"retainUntil" timestamp(3)');
    expect(sql).toContain('"deletedAt" timestamp(3)');
    expect(sql).toContain(
      'create index "ModerationSnapshotEvidenceLifecycle_due_idx"',
    );
    expect(sql).toContain(
      'alter table public."ModerationSnapshotEvidenceLifecycle" enable row level security',
    );
    expect(sql).toContain(
      'revoke all on table public."ModerationSnapshotEvidenceLifecycle" from anon, authenticated',
    );
    const normalizedSql = sql.replace(/\r\n/g, "\n");
    expect(normalizedSql).toContain(
      'grant select, insert, update, delete\n  on table public."ModerationSnapshotEvidenceLifecycle" to service_role',
    );
    expect(sql).toContain('where snapshot."storageObjectKey" is not null');
    expect(sql).toContain(
      'coalesce(moderation_case."resolvedAt", moderation_case."updatedAt")',
    );
    expect(sql).toContain('on conflict ("snapshotId") do nothing');
  });
  it("終了済み通報を含む状態の逆遷移をDBで禁止する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_enforce_content_report_status_transitions.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain(
      "create trigger prevent_invalid_content_report_status_transition",
    );
    expect(sql).toContain(
      'before update of "status" on public."ContentReport"',
    );
    expect(sql).toContain("old.\"status\" = 'pending'");
    expect(sql).toContain("old.\"status\" = 'reviewed'");
    expect(sql).toContain("errcode = 'check_violation'");
    expect(sql).toContain(
      "revoke all on function public.prevent_invalid_content_report_status_transition()",
    );
  });
  it("通報対象と過去時点の内容、審査関連を安全に保持する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_add_content_report_target_linkage.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain('add column "targetType" "ModerationTargetType"');
    expect(sql).toContain('add column "targetId" text');
    expect(sql).toContain('add column "targetSnapshot" jsonb');
    expect(sql).toContain('"targetType" = \'profile\'::"ModerationTargetType"');
    expect(sql).toContain("'source', 'legacy'");
    expect(sql).toContain("'available', false");
    expect(sql).toContain('alter column "targetType" set not null');
    expect(sql).toContain('alter column "targetId" set not null');
    expect(sql).toContain('alter column "targetSnapshot" set not null');
    expect(sql).toMatch(
      /ContentReport_moderationCaseId_fkey[\s\S]*on delete set null/i,
    );
    expect(sql).toMatch(
      /ContentReport_moderationActionId_fkey[\s\S]*on delete set null/i,
    );
    expect(sql).toContain(
      'create index "ContentReport_profile_target_createdAt_idx"',
    );
    expect(sql).toContain('create index "ContentReport_moderationCaseId_idx"');
    expect(sql).toContain(
      'create index "ContentReport_moderationActionId_idx"',
    );
  });
  it("プロフィールの管理日時を既存更新日時から初期化する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_add_profile_moderated_at.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toContain('add column "moderatedAt" timestamptz(3)');
    expect(sql).toMatch(
      /set\s+"moderatedAt"\s*=\s*"updatedAt"[\s\S]*where\s+"moderatedAt"\s+is\s+null/i,
    );
    expect(sql).toMatch(/alter column "moderatedAt" set not null/i);
    expect(sql).toContain('create index "Profile_moderatedAt_id_idx"');
  });
  it("回答用の管理操作種別を追加する", () => {
    const migrationFile = migrationFiles.find((fileName) =>
      fileName.endsWith("_add_respond_moderation_action.sql"),
    );
    expect(migrationFile).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, migrationFile!),
      "utf8",
    );
    expect(sql).toMatch(
      /alter\s+type\s+public\."ModerationActionType"\s+add\s+value\s+'respond'/i,
    );
  });
});
