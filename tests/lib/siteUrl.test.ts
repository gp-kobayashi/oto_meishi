import { describe, expect, it } from "vitest";
import { buildSiteUrl, DEFAULT_SITE_URL, getSiteUrl } from "@/lib/siteUrl";

describe("siteUrl", () => {
  it("環境変数が未設定の場合は正式URLを使用すること", () => {
    expect(getSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(getSiteUrl("   ")).toBe(DEFAULT_SITE_URL);
  });

  it("設定されたURLの末尾スラッシュを除去すること", () => {
    expect(getSiteUrl("https://example.com/")).toBe("https://example.com");
  });

  it("ローカル開発ではHTTPのlocalhostを許可すること", () => {
    expect(getSiteUrl("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    expect(getSiteUrl("http://127.0.0.1:3000/")).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("公開URLのパスを重複スラッシュなしで組み立てること", () => {
    expect(buildSiteUrl("/sample-user", "https://example.com/")).toBe(
      "https://example.com/sample-user",
    );
    expect(buildSiteUrl("sample-user", "https://example.com")).toBe(
      "https://example.com/sample-user",
    );
  });

  it("不正なURLを拒否すること", () => {
    expect(() => getSiteUrl("not-a-url")).toThrow(
      "NEXT_PUBLIC_SITE_URLには有効な公開URLを設定してください。",
    );
  });

  it("公開環境のHTTP URLを拒否すること", () => {
    expect(() => getSiteUrl("http://example.com")).toThrow(
      "NEXT_PUBLIC_SITE_URLはHTTPS URLを設定してください。",
    );
  });

  it("パスやクエリを含むURLを拒否すること", () => {
    expect(() => getSiteUrl("https://example.com/app")).toThrow(
      "NEXT_PUBLIC_SITE_URLにはパスやクエリを含まないオリジンを設定してください。",
    );
    expect(() => getSiteUrl("https://example.com?source=test")).toThrow(
      "NEXT_PUBLIC_SITE_URLにはパスやクエリを含まないオリジンを設定してください。",
    );
  });
});
