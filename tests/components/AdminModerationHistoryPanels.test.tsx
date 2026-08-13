import { render, screen } from "@testing-library/react";
import { it, expect, describe, beforeEach, afterEach, vi } from "vitest";
import AdminModerationHistoryPanels from "@/app/(site)/admin/moderation/[profileId]/AdminModerationHistoryPanels";
import { createAdminModerationDetail } from "@/tests/fixtures/adminModerationDetail";
describe("AdminModerationHistoryPanels", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());
  it("違反集計、停止、取消、理由、システム履歴を表示する", async () => {
    const d = createAdminModerationDetail();
    render(
      <AdminModerationHistoryPanels
        violationSummary={d.profile.violationSummary}
        violationEvents={d.profile.violationEvents}
        history={d.profile.history}
      />,
    );
    expect(screen.getByText("有効 1件")).toBeDefined();
    expect(screen.getByText("この違反確定により利用停止")).toBeDefined();
    expect(screen.getByText("違反回数の取り消し")).toBeDefined();
    expect(screen.getByText("なりすましを確認")).toBeDefined();
    expect(screen.getByText("本人確認により取り消し")).toBeDefined();
    expect(screen.getByText("実行者: システム")).toBeDefined();
  });
});
