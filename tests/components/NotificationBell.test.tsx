import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotificationBell from "@/components/header/NotificationBell";

describe("NotificationBell", () => {
  afterEach(() => vi.restoreAllMocks());

  it("未読件数を表示し、ベルを押すと通知一覧を開く", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => new Response(
        String(input).endsWith("/read")
          ? JSON.stringify({ success: true, updatedCount: 1 })
          : JSON.stringify({
              notifications: [
                {
                  id: "notification-1",
                  title: "音声の公開状態について",
                  message:
                    "規約違反が確認されたため、音声を非公開にしました。",
                  readAt: null,
                  createdAt: "2026-07-21T06:00:00.000Z",
                },
              ],
              unreadCount: 1,
            }),
        { status: 200 },
      ),
    );
    render(<NotificationBell accessToken="access-token" />);

    expect(await screen.findByLabelText("未読通知1件")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "通知を開く" }));

    expect(
      await screen.findByText(
        "規約違反が確認されたため、音声を非公開にしました。",
      ),
    ).toBeDefined();
    expect(screen.getByRole("heading", { name: "通知" })).toBeDefined();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/notifications/read", {
      method: "PATCH",
      headers: { Authorization: "Bearer access-token" },
    });
    expect(screen.queryByLabelText("未読通知1件")).toBeNull();
    expect(screen.getByRole("button", { name: "通知を閉じる" })).toBeDefined();
  });

  it("通知がない場合は空のメッセージを表示する", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ notifications: [], unreadCount: 0 }), {
        status: 200,
      }),
    );
    render(<NotificationBell accessToken="access-token" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "通知を開く" })).toBeDefined(),
    );
    fireEvent.click(screen.getByRole("button", { name: "通知を開く" }));

    expect(await screen.findByText("通知はありません。")).toBeDefined();
  });

  it("Escapeキーで閉じ、ベルへフォーカスを戻す", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ notifications: [], unreadCount: 0 }), {
        status: 200,
      }),
    );
    render(<NotificationBell accessToken="access-token" />);
    fireEvent.click(screen.getByRole("button", { name: "通知を開く" }));
    expect(await screen.findByRole("heading", { name: "通知" })).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });

    const trigger = screen.getByRole("button", { name: "通知を開く" });
    expect(screen.queryByRole("heading", { name: "通知" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("パネルの外側を押すと閉じる", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ notifications: [], unreadCount: 0 }), {
        status: 200,
      }),
    );
    render(<NotificationBell accessToken="access-token" />);
    fireEvent.click(screen.getByRole("button", { name: "通知を開く" }));
    expect(await screen.findByRole("heading", { name: "通知" })).toBeDefined();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("heading", { name: "通知" })).toBeNull();
  });
});
