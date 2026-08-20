import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/app/error";

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("安全な案内、再試行ボタン、トップページへの導線を表示すること", () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("秘密の内部エラー"), {
      name: "InternalSecretError",
      stack: "秘密のスタック",
      digest: "digest-123",
    });

    render(<ErrorBoundary error={error} retry={retry} />);

    expect(
      screen.getByRole("heading", { name: "問題が発生しました" }),
    ).toBeDefined();
    expect(
      screen.getByText(
        "一時的な問題が発生しました。時間をおいてから、もう一度お試しください。",
      ),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "もう一度試す" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(
      screen
        .getByRole("link", { name: "トップページへ戻る" })
        .getAttribute("href"),
    ).toBe("/");
    expect(
      screen.queryByText(/秘密の内部エラー|InternalSecretError|秘密のスタック/),
    ).toBeNull();
  });

  it("raw errorをログへ渡さずdigestだけを固定スコープで記録すること", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = Object.assign(new Error("raw message"), {
      name: "RawErrorName",
      stack: "raw stack",
      digest: "digest-456",
    });

    render(<ErrorBoundary error={error} retry={vi.fn()} />);

    expect(consoleError).toHaveBeenCalledWith("oto_meishi error boundary", {
      scope: "route",
      digest: "digest-456",
    });
    expect(consoleError.mock.calls.flat()).not.toContain(error);
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "raw message",
    );
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("raw stack");
  });

  it("digestがない場合も固定情報だけをログへ記録すること", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = new Error("hidden message");

    render(<ErrorBoundary error={error} retry={vi.fn()} />);

    expect(consoleError).toHaveBeenCalledWith("oto_meishi error boundary", {
      scope: "route",
      digest: undefined,
    });
    expect(consoleError.mock.calls.flat()).not.toContain(error);
  });

  it.each(["raw message", "<script>alert(1)</script>", "a".repeat(129)])(
    "識別子形式でないdigestをログへ記録しないこと: %s",
    (digest) => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const error = Object.assign(new Error("hidden message"), { digest });

      render(<ErrorBoundary error={error} retry={vi.fn()} />);

      expect(consoleError).toHaveBeenCalledWith("oto_meishi error boundary", {
        scope: "route",
        digest: undefined,
      });
      expect(consoleError.mock.calls.flat().join(" ")).not.toContain(digest);
    },
  );
});
