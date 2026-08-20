import { describe, expect, it, vi } from "vitest";
import { getSafeErrorDigest, logErrorBoundary } from "@/lib/errorBoundaryLog";

describe("errorBoundaryLog", () => {
  it("識別子形式で128文字以内のdigestだけを許可すること", () => {
    expect(getSafeErrorDigest("abc-123._x")).toBe("abc-123._x");
    expect(getSafeErrorDigest("a".repeat(128))).toBe("a".repeat(128));
    expect(getSafeErrorDigest("raw message")).toBeUndefined();
    expect(getSafeErrorDigest("<script>alert(1)</script>")).toBeUndefined();
    expect(getSafeErrorDigest("a".repeat(129))).toBeUndefined();
  });

  it("Errorオブジェクト自体をログへ渡さずscopeと安全なdigestだけを記録すること", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = Object.assign(new Error("raw message"), {
      digest: "safe-123",
    });

    logErrorBoundary(error, "route");

    expect(consoleError).toHaveBeenCalledWith("oto_meishi error boundary", {
      scope: "route",
      digest: "safe-123",
    });
    expect(consoleError.mock.calls.flat()).not.toContain(error);
    consoleError.mockRestore();
  });
});
