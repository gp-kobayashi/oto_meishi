import { describe, expect, it } from "vitest";

import {
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
