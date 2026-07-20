import { describe, expect, it } from "vitest";
import { readJsonBody } from "@/lib/requestJson";

describe("readJsonBody", () => {
  it("上限以内のJSONを解析する", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ name: "音の名刺" }),
    });

    await expect(readJsonBody(request, 64)).resolves.toEqual({
      ok: true,
      value: { name: "音の名刺" },
    });
  });

  it("不正なJSONを拒否する", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{invalid",
    });

    await expect(readJsonBody(request, 64)).resolves.toEqual({
      ok: false,
      error: "invalid_json",
    });
  });

  it("Content-Lengthが上限を超える場合は本文を読まずに拒否する", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Length": "65" },
      body: "{}",
    });

    await expect(readJsonBody(request, 64)).resolves.toEqual({
      ok: false,
      error: "too_large",
    });
    expect(request.bodyUsed).toBe(false);
  });

  it("Content-Lengthがなくても読み込み中に上限超過を検出する", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"value":"'));
        controller.enqueue(encoder.encode("a".repeat(100)));
        controller.enqueue(encoder.encode('"}'));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readJsonBody(request, 32)).resolves.toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("日本語をUTF-8のバイト数で制限する", async () => {
    const body = JSON.stringify({ value: "あ" });
    const bodyBytes = new TextEncoder().encode(body).byteLength;
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body,
    });

    await expect(readJsonBody(request, bodyBytes - 1)).resolves.toEqual({
      ok: false,
      error: "too_large",
    });
  });
});
