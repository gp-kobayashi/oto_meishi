import { describe, expect, it } from "vitest";

import {
  decideActiveViolationSuspension,
  decideViolationSuspension,
  getActiveViolationEvents,
  type ViolationHistoryEvent,
} from "@/lib/moderationViolation";

const confirmed = (
  id: string,
  reasonCode: ViolationHistoryEvent["reasonCode"],
): ViolationHistoryEvent => ({
  id,
  eventType: "confirmed",
  reasonCode,
  originalViolationEventId: null,
});

const revoked = (
  id: string,
  originalViolationEventId: string,
  reasonCode: ViolationHistoryEvent["reasonCode"],
): ViolationHistoryEvent => ({
  id,
  eventType: "revoked",
  reasonCode,
  originalViolationEventId,
});

describe("違反回数による利用停止判定", () => {
  it.each(["impersonation", "threatOrPersonalData"] as const)(
    "%sは初回で利用停止と判定する",
    (reasonCode) => {
      expect(decideViolationSuspension([], reasonCode)).toEqual({
        shouldSuspend: true,
        reason: "immediate",
        activeViolationCount: 1,
        sameTypeViolationCount: 1,
      });
    },
  );

  it("同種の違反は2回目で利用停止と判定する", () => {
    expect(
      decideViolationSuspension(
        [confirmed("violation-1", "unsafeLink")],
        "unsafeLink",
      ),
    ).toEqual({
      shouldSuspend: true,
      reason: "sameTypeRepeated",
      activeViolationCount: 2,
      sameTypeViolationCount: 2,
    });
  });

  it("異なる違反でも累計3回目で利用停止と判定する", () => {
    expect(
      decideViolationSuspension(
        [
          confirmed("violation-1", "unsafeLink"),
          confirmed("violation-2", "harassment"),
        ],
        "copyrightConcern",
      ),
    ).toEqual({
      shouldSuspend: true,
      reason: "cumulative",
      activeViolationCount: 3,
      sameTypeViolationCount: 1,
    });
  });

  it("初回の通常違反では利用停止しない", () => {
    expect(decideViolationSuspension([], "serviceMismatch")).toEqual({
      shouldSuspend: false,
      reason: "none",
      activeViolationCount: 1,
      sameTypeViolationCount: 1,
    });
  });

  it("取り消された違反を回数から除外する", () => {
    const events = [
      confirmed("violation-1", "harassment"),
      revoked("revocation-1", "violation-1", "harassment"),
      confirmed("violation-2", "unsafeLink"),
    ];

    expect(getActiveViolationEvents(events).map((event) => event.id)).toEqual([
      "violation-2",
    ]);
    expect(decideViolationSuspension(events, "copyrightConcern")).toEqual({
      shouldSuspend: false,
      reason: "none",
      activeViolationCount: 2,
      sameTypeViolationCount: 1,
    });
  });
});

describe("確定済み違反による利用停止継続判定", () => {
  it.each(["impersonation", "threatOrPersonalData"] as const)(
    "%sが残っていれば初回でも利用停止を継続する",
    (reasonCode) => {
      expect(
        decideActiveViolationSuspension([confirmed("violation-1", reasonCode)]),
      ).toEqual({
        shouldSuspend: true,
        reason: "immediate",
        activeViolationCount: 1,
        sameTypeViolationCount: 1,
      });
    },
  );

  it("同種の確定違反が2件あれば利用停止を継続する", () => {
    expect(
      decideActiveViolationSuspension([
        confirmed("violation-1", "unsafeLink"),
        confirmed("violation-2", "unsafeLink"),
      ]),
    ).toEqual({
      shouldSuspend: true,
      reason: "sameTypeRepeated",
      activeViolationCount: 2,
      sameTypeViolationCount: 2,
    });
  });

  it("異なる確定違反が3件あれば利用停止を継続する", () => {
    expect(
      decideActiveViolationSuspension([
        confirmed("violation-1", "unsafeLink"),
        confirmed("violation-2", "harassment"),
        confirmed("violation-3", "copyrightConcern"),
      ]),
    ).toEqual({
      shouldSuspend: true,
      reason: "cumulative",
      activeViolationCount: 3,
      sameTypeViolationCount: 1,
    });
  });

  it("通常違反が1件だけなら利用停止を継続しない", () => {
    expect(
      decideActiveViolationSuspension([confirmed("violation-1", "unsafeLink")]),
    ).toEqual({
      shouldSuspend: false,
      reason: "none",
      activeViolationCount: 1,
      sameTypeViolationCount: 1,
    });
  });

  it("取り消された違反を利用停止判定から除外する", () => {
    expect(
      decideActiveViolationSuspension([
        confirmed("violation-1", "unsafeLink"),
        revoked("revocation-1", "violation-1", "unsafeLink"),
        confirmed("violation-2", "harassment"),
      ]),
    ).toEqual({
      shouldSuspend: false,
      reason: "none",
      activeViolationCount: 1,
      sameTypeViolationCount: 1,
    });
  });

  it("取り消し履歴や無関係な履歴があっても有効な違反だけを数える", () => {
    expect(
      decideActiveViolationSuspension([
        confirmed("violation-1", "unsafeLink"),
        revoked("revocation-1", "violation-1", "unsafeLink"),
        confirmed("violation-2", "harassment"),
        confirmed("violation-3", "copyrightConcern"),
        confirmed("violation-4", "serviceMismatch"),
      ]),
    ).toEqual({
      shouldSuspend: true,
      reason: "cumulative",
      activeViolationCount: 3,
      sameTypeViolationCount: 1,
    });
  });
});
