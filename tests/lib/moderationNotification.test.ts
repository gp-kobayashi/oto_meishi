import { describe, expect, it } from "vitest";
import { getModerationNotification } from "@/lib/moderationNotification";

describe("getModerationNotification", () => {
  it("音声を非公開にした通知文を返す", () => {
    expect(getModerationNotification("audio", "hide")).toEqual({
      title: "音声の公開状態について",
      message: "規約違反が確認されたため、音声を非公開にしました。",
    });
  });

  it("プロフィールを利用停止にした通知文を返す", () => {
    expect(getModerationNotification("profile", "suspend")).toEqual({
      title: "プロフィールの利用停止について",
      message:
        "規約違反が確認されたため、プロフィールを利用停止にしました。",
    });
  });

  it("リンクを復旧した通知文を返す", () => {
    expect(getModerationNotification("socialLink", "restore")).toEqual({
      title: "リンクの公開状態について",
      message: "確認の結果、リンクを再公開しました。",
    });
  });
});
