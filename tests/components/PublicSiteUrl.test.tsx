import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "@/app/(site)/page";
import UserIdInputPage from "@/app/(site)/useridInput/page";
import QRCode from "@/components/card/QRCode/QRCode";
import ProfileShare from "@/components/card/profileShare/ProfileShare";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: null,
}));

vi.mock("qrcode.react", () => ({
  QRCodeCanvas: ({ value }: { value: string }) => (
    <div data-testid="qr-code-value">{value}</div>
  ),
}));

describe("公開URLを使用する画面", () => {
  it("トップページの製作者リンクに共通設定を使用する", () => {
    render(<Home />);

    const link = screen.getByRole("link", {
      name: "https://oto-meishi.com/seisakusya",
    });
    expect(link.getAttribute("href")).toBe(
      "https://oto-meishi.com/seisakusya",
    );
  });

  it("ユーザーID入力欄に共通設定のURLを表示する", () => {
    render(<UserIdInputPage />);

    expect(screen.getByText("https://oto-meishi.com/")).toBeDefined();
  });

  it("予約済みユーザーIDを送信せずにエラー表示する", () => {
    const fetchMock = vi.fn();
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<UserIdInputPage />);
      fireEvent.change(screen.getByLabelText("ユーザーID"), {
        target: { value: "Admin" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存してマイページへ" }));

      expect(
        screen.getByText(
          "このユーザーIDは使用できません。別のユーザーIDを入力してください。",
        ),
      ).toBeDefined();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("QRコードに共通設定から生成したプロフィールURLを設定する", () => {
    render(<QRCode username="sample-user" />);

    expect(screen.getByTestId("qr-code-value").textContent).toBe(
      "https://oto-meishi.com/sample-user",
    );
  });

  it("QRコードと同じ公開プロフィールURLを共有欄に表示する", () => {
    render(<ProfileShare username="sample-user" />);

    const profileLink = screen.getByRole("link", {
      name: "https://oto-meishi.com/sample-user",
    });
    expect(profileLink.getAttribute("href")).toBe(
      "https://oto-meishi.com/sample-user",
    );
    expect(screen.getByTestId("qr-code-value").textContent).toBe(
      "https://oto-meishi.com/sample-user",
    );
  });

  it("公開プロフィールURLをコピーして完了メッセージを表示する", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ProfileShare username="sample-user" />);

    fireEvent.click(screen.getByRole("button", { name: "URLをコピー" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "URLをコピーしました。",
    );
    expect(writeText).toHaveBeenCalledWith(
      "https://oto-meishi.com/sample-user",
    );
  });

  it("URLのコピーに失敗した場合はエラーを表示する", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("copy failed")),
      },
    });
    render(<ProfileShare username="sample-user" />);

    fireEvent.click(screen.getByRole("button", { name: "URLをコピー" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "URLをコピーできませんでした。",
    );
  });

  it("Web Share API対応端末では公開プロフィールを共有する", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    render(<ProfileShare username="sample-user" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "端末で共有" }),
    );

    expect((await screen.findByRole("status")).textContent).toBe(
      "プロフィールを共有しました。",
    );
    expect(share).toHaveBeenCalledWith({
      title: "oto_meishi",
      text: "oto_meishiのプロフィールを共有します。",
      url: "https://oto-meishi.com/sample-user",
    });
  });

  it("端末共有に失敗した場合はエラーを表示する", async () => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("share failed")),
    });
    render(<ProfileShare username="sample-user" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "端末で共有" }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "プロフィールを共有できませんでした。",
    );
  });

  it("Web Share API未対応の場合は端末共有ボタンを表示しない", () => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    render(<ProfileShare username="sample-user" />);

    expect(screen.queryByRole("button", { name: "端末で共有" })).toBeNull();
  });
});
