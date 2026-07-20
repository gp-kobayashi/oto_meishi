export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; error: "invalid_json" | "too_large" };

function exceedsContentLength(request: Request, maxBytes: number) {
  const contentLength = request.headers.get("Content-Length");
  if (!contentLength) {
    return false;
  }

  const size = Number(contentLength);
  return Number.isSafeInteger(size) && size > maxBytes;
}

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<JsonBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }

  if (exceedsContentLength(request, maxBytes)) {
    return { ok: false, error: "too_large" };
  }

  if (!request.body) {
    return { ok: false, error: "invalid_json" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: "too_large" };
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: "invalid_json" };
  } finally {
    reader.releaseLock();
  }
}
