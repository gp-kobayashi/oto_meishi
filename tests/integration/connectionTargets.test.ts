import { describe, expect, it } from "vitest";
import { assertAllowedIntegrationTestTargets } from "./connectionTargets";

const localTargets = {
  supabaseUrl: "http://127.0.0.1:54321",
  databaseUrl: "postgresql://postgres:postgres@localhost:54322/postgres",
};

describe("assertAllowedIntegrationTestTargets", () => {
  it.each([
    {
      supabaseUrl: "http://localhost:54321",
      databaseUrl: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
    },
    {
      supabaseUrl: "http://host.docker.internal:54321",
      databaseUrl:
        "postgresql://postgres:postgres@host.docker.internal:54322/postgres",
    },
    {
      supabaseUrl: "http://[::1]:54321",
      databaseUrl: "postgresql://postgres:postgres@[::1]:54322/postgres",
    },
  ])("ローカル接続先を許可する", (targets) => {
    expect(() => assertAllowedIntegrationTestTargets(targets)).not.toThrow();
  });

  it.each([
    {
      name: "Supabase URL",
      targets: {
        ...localTargets,
        supabaseUrl: "https://example.supabase.co",
      },
    },
    {
      name: "DB接続先",
      targets: {
        ...localTargets,
        databaseUrl:
          "postgresql://postgres:password@production.example.com:5432/postgres",
      },
    },
  ])("許可されていない$nameを拒否する", ({ targets }) => {
    expect(() => assertAllowedIntegrationTestTargets(targets)).toThrow(
      /not allowed/,
    );
  });

  it.each([
    {
      name: "Supabase URL",
      targets: { ...localTargets, supabaseUrl: undefined },
    },
    {
      name: "DB接続先",
      targets: { ...localTargets, databaseUrl: " " },
    },
  ])("未設定の$nameを拒否する", ({ targets }) => {
    expect(() => assertAllowedIntegrationTestTargets(targets)).toThrow(
      /is required/,
    );
  });

  it.each([
    {
      name: "形式不正なSupabase URL",
      targets: { ...localTargets, supabaseUrl: "http://[invalid" },
    },
    {
      name: "形式不正なDB接続先",
      targets: { ...localTargets, databaseUrl: "not-a-database-url" },
    },
  ])("$nameを拒否する", ({ targets }) => {
    expect(() => assertAllowedIntegrationTestTargets(targets)).toThrow(
      /valid URL/,
    );
  });

  it.each([
    {
      name: "Supabase URL",
      targets: { ...localTargets, supabaseUrl: "ftp://localhost:54321" },
    },
    {
      name: "DB接続先",
      targets: {
        ...localTargets,
        databaseUrl: "https://localhost:54322/postgres",
      },
    },
  ])("不正なプロトコルの$nameを拒否する", ({ targets }) => {
    expect(() => assertAllowedIntegrationTestTargets(targets)).toThrow(
      /unsupported protocol/,
    );
  });

  it("ホスト名に許可文字列を含むだけの接続先を拒否する", () => {
    expect(() =>
      assertAllowedIntegrationTestTargets({
        ...localTargets,
        supabaseUrl: "https://localhost.example.com",
      }),
    ).toThrow(/not allowed/);
  });
});
