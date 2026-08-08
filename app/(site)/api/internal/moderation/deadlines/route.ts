import { timingSafeEqual } from "node:crypto";
import { processModerationDeadlines } from "@/lib/moderationDeadlineProcessor";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "private, no-store" };

function hasValidCleanupSecret(request: Request): boolean {
  const expectedSecret = process.env.MODERATION_CLEANUP_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const providedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!expectedSecret || !providedSecret) return false;

  const expectedBuffer = Buffer.from(expectedSecret);
  const providedBuffer = Buffer.from(providedSecret);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function POST(request: Request) {
  if (!hasValidCleanupSecret(request)) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders },
    );
  }

  try {
    const result = await processModerationDeadlines();
    return Response.json(result, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Failed to process moderation deadlines:", error);
    return Response.json(
      { error: "Deadline processing failed" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
