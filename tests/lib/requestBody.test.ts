// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readMultipartFormData } from "@/lib/requestBody";

function requestFromBody(body: BodyInit, headers?: HeadersInit) {
  return new Request("http://localhost/upload", {
    method: "POST",
    headers,
    body,
  } as RequestInit & { duplex: "half" });
}

function multipartRequest(fileBytes = "audio") {
  const formData = new FormData();
  formData.append(
    "file",
    new File([fileBytes], "voice.mp3", { type: "audio/mpeg" }),
  );
  formData.append("userId", "user-1");
  return requestFromBody(formData);
}

describe("readMultipartFormData", () => {
  it("小さいmultipartを正常にparseする", async () => {
    const result = await readMultipartFormData(multipartRequest(), 1024 * 1024);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formData.get("userId")).toBe("user-1");
  });

  it("ヘッダーなしでも実サイズ超過を拒否する", async () => {
    const request = requestFromBody(new Uint8Array([1, 2, 3]));
    await expect(readMultipartFormData(request, 2)).resolves.toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("過少Content-Lengthでも実読して拒否する", async () => {
    const request = requestFromBody(new Uint8Array([1, 2, 3]), {
      "Content-Length": "1",
    });
    await expect(readMultipartFormData(request, 2)).resolves.toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("Content-Length超過は読み取り前に拒否する", async () => {
    const cancel = vi.fn();
    const request = {
      headers: new Headers({ "Content-Length": "3" }),
      body: new ReadableStream({ cancel }),
    } as unknown as Request;
    await expect(readMultipartFormData(request, 2)).resolves.toEqual({
      ok: false,
      error: "too_large",
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("空bodyとinvalid multipartを拒否する", async () => {
    await expect(
      readMultipartFormData(requestFromBody(new Uint8Array()), 2),
    ).resolves.toEqual({ ok: false, error: "invalid_body" });
    await expect(
      readMultipartFormData(requestFromBody(new Uint8Array([1, 2, 3])), 10),
    ).resolves.toEqual({ ok: false, error: "invalid_body" });
  });
});
