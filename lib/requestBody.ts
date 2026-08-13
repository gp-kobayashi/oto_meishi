type ReadRequestBodyResult =
  | { ok: true; body: Uint8Array }
  | { ok: false; error: "too_large" | "invalid_body" };

async function readRequestBody(
  request: Request,
  maxBytes: number,
): Promise<ReadRequestBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }
  const contentLength = request.headers.get("Content-Length");
  if (contentLength) {
    const parsed = Number(contentLength.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0 && parsed > maxBytes) {
      return { ok: false, error: "too_large" };
    }
  }
  if (!request.body) return { ok: false, error: "invalid_body" };
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return { ok: false, error: "invalid_body" };
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || typeof value.byteLength !== "number") {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: "invalid_body" };
      }
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: "too_large" };
      }
      chunks.push(chunk);
    }
  } catch {
    return { ok: false, error: "invalid_body" };
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) return { ok: false, error: "invalid_body" };
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body };
}

export type ReadMultipartFormDataResult =
  | { ok: true; formData: FormData }
  | { ok: false; error: "too_large" | "invalid_body" };

export async function readMultipartFormData(
  request: Request,
  maxBytes: number,
): Promise<ReadMultipartFormDataResult> {
  const bodyResult = await readRequestBody(request, maxBytes);
  if (!bodyResult.ok) return bodyResult;
  try {
    const headers = new Headers(request.headers);
    headers.delete("Content-Length");
    const bodyRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: bodyResult.body as unknown as BodyInit,
    });
    return { ok: true, formData: await bodyRequest.formData() };
  } catch {
    return { ok: false, error: "invalid_body" };
  }
}
