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

    expect(sql).toContain('set "status" = \'hidden\'');
    expect(sql).toContain('profile."status" = \'active\'');
    expect(sql).toContain('set "audioStatus" = \'hidden\'');
    expect(sql).toContain('profile."audioStatus" = \'active\'');
    expect(sql).toContain('update public."SocialLink"');
    expect(sql).toContain('insert into public."ModerationCaseEvent"');
    expect(sql).toContain('"reviewMode" = \'preReview\'');
    expect(sql).toContain('"status" = \'preReviewPending\'');
    expect(sql).toContain('where "status" = \'postReviewPending\'');
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
    expect(sql).toContain('"previousStatus" = \'pending\'');
    expect(sql).toContain('"previousStatus" = \'reviewed\'');
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
    expect(sql).toContain(
      'constraint "ModerationViolationEvent_shape_check"',
    );
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
    expect(sql).toContain('constraint "RegistrationBanIdentifier_provider_check"');
    expect(sql).toContain(
      'alter table public."AccountDeletionRecord" enable row level security',
    );
    expect(sql).toContain(
      'revoke all on table public."RegistrationBanIdentifier" from anon, authenticated',
    );
  });
});
