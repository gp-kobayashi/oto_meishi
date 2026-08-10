import { describe, expect, it } from "vitest";

import { decideModerationDeadlineAction } from "@/lib/moderationDeadline";

const now = new Date("2026-08-08T00:00:00.000Z");

const state = {
  accountStatus: "active" as const,
  suspensionAppealDueAt: null,
  deletionScheduledAt: null,
  overdueUnsubmittedCaseCount: 0,
  hasPendingAdminReview: false,
  hasPendingAppeal: false,
};

describe("モデレーション期限判定", () => {
  it("60日を過ぎても修正されていないケースがあれば利用停止する", () => {
    expect(
      decideModerationDeadlineAction(
        { ...state, overdueUnsubmittedCaseCount: 1 },
        now,
      ),
    ).toEqual({ action: "suspend" });
  });

  it("別ケースが管理者確認中なら期限超過ケースがあっても利用停止しない", () => {
    expect(
      decideModerationDeadlineAction(
        {
          ...state,
          overdueUnsubmittedCaseCount: 1,
          hasPendingAdminReview: true,
        },
        now,
      ),
    ).toEqual({ action: "none" });
  });

  it("利用停止から60日間申請がなければさらに60日後を削除予定日にする", () => {
    expect(
      decideModerationDeadlineAction(
        {
          ...state,
          accountStatus: "suspended",
          suspensionAppealDueAt: new Date("2026-08-07T23:59:59.000Z"),
        },
        now,
      ),
    ).toEqual({
      action: "scheduleDeletion",
      deletionScheduledAt: new Date("2026-10-07T00:00:00.000Z"),
    });
  });

  it("削除予定日が到来したら削除対象にする", () => {
    expect(
      decideModerationDeadlineAction(
        {
          ...state,
          accountStatus: "deletionPending",
          deletionScheduledAt: new Date("2026-08-08T00:00:00.000Z"),
        },
        now,
      ),
    ).toEqual({ action: "delete" });
  });

  it.each([
    { hasPendingAdminReview: true, hasPendingAppeal: false },
    { hasPendingAdminReview: false, hasPendingAppeal: true },
  ])("管理者審査または解除申請中は削除予定へ進めない", (pending) => {
    expect(
      decideModerationDeadlineAction(
        {
          ...state,
          accountStatus: "suspended",
          suspensionAppealDueAt: new Date("2026-08-01T00:00:00.000Z"),
          ...pending,
        },
        now,
      ),
    ).toEqual({ action: "none" });
  });

  it("審査中は削除予定日が過ぎても削除しない", () => {
    expect(
      decideModerationDeadlineAction(
        {
          ...state,
          accountStatus: "deletionPending",
          deletionScheduledAt: new Date("2026-08-01T00:00:00.000Z"),
          hasPendingAdminReview: true,
        },
        now,
      ),
    ).toEqual({ action: "none" });
  });

  it("期限前は状態を変更しない", () => {
    expect(
      decideModerationDeadlineAction(
        {
          ...state,
          accountStatus: "suspended",
          suspensionAppealDueAt: new Date("2026-08-09T00:00:00.000Z"),
        },
        now,
      ),
    ).toEqual({ action: "none" });
  });
});
