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
});
