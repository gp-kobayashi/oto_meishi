import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GlobalError from "@/app/global-error";

describe("GlobalError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("完全な文書構造と安全な案内を表示すること", () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("秘密の内部エラー"), {
      name: "InternalSecretError",
      stack: "秘密のスタック",
      digest: "global-123",
    });

    render(<GlobalError error={error} retry={retry} />);

    expect(document.documentElement.getAttribute("lang")).toBe("ja");
    expect(document.body).toBeDefined();
    expect(document.title).toBe("問題が発生しました | oto_meishi");
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

  it("global scopeと安全なdigestだけをログへ記録すること", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = Object.assign(new Error("raw message"), {
      name: "RawErrorName",
      stack: "raw stack",
      digest: "global-456",
    });

    render(<GlobalError error={error} retry={vi.fn()} />);

    expect(consoleError).toHaveBeenCalledWith("oto_meishi error boundary", {
      scope: "global",
      digest: "global-456",
    });
    expect(consoleError.mock.calls.flat()).not.toContain(error);
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "raw message",
    );
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("raw stack");
  });
});
