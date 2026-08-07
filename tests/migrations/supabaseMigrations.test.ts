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
});
