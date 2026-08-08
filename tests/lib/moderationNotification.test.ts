import { describe, expect, it } from "vitest";
import {
  getModerationNotification,
  getModerationNotificationGuidance,
} from "@/lib/moderationNotification";

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

  it("旧事後確認方式の通知も管理者確認まで非公開の案内を返す", () => {
    expect(
      getModerationNotificationGuidance("audio", "hide", "postReview"),
    ).toEqual({
      actionLabel: "非公開",
      guidance: "音声を修正しても、管理者の確認が完了するまで公開されません。",
      actionUrl: "/profile/edit",
      actionLinkLabel: "音声を修正",
    });
  });

  it("事前確認では確認完了まで非公開の案内を返す", () => {
    expect(
      getModerationNotificationGuidance("socialLink", "hide", "preReview"),
    ).toEqual({
      actionLabel: "非公開",
      guidance:
        "リンクを修正しても、管理者の確認が完了するまで公開されません。",
      actionUrl: "/profile/edit",
      actionLinkLabel: "リンクを修正",
    });
  });

  it("利用停止通知は非公開の修正と解除申請を案内する", () => {
    expect(
      getModerationNotificationGuidance("profile", "suspend", null),
    ).toEqual({
      actionLabel: "利用停止",
      guidance:
        "利用停止中も登録内容は非公開のまま修正できます。すべて修正したうえで、解除申請に修正内容と申請理由を記載してください。",
      actionUrl: "/profile/edit",
      actionLinkLabel: "プロフィールを修正",
    });
  });
});
