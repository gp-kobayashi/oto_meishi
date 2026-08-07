import type { ModerationReasonCode } from "@/lib/moderationRemediation";

export type ViolationHistoryEvent = {
  id: string;
  eventType: "confirmed" | "revoked";
  reasonCode: ModerationReasonCode;
  originalViolationEventId: string | null;
};

export type ViolationSuspensionReason =
  | "immediate"
  | "sameTypeRepeated"
  | "cumulative"
  | "none";

export type ViolationSuspensionDecision = {
  shouldSuspend: boolean;
  reason: ViolationSuspensionReason;
  activeViolationCount: number;
  sameTypeViolationCount: number;
};

const immediateSuspensionReasonCodes = new Set<ModerationReasonCode>([
  "impersonation",
  "threatOrPersonalData",
]);

export function getActiveViolationEvents(
  events: readonly ViolationHistoryEvent[],
): ViolationHistoryEvent[] {
  const revokedViolationIds = new Set(
    events
      .filter((event) => event.eventType === "revoked")
      .map((event) => event.originalViolationEventId)
      .filter((id): id is string => Boolean(id)),
  );

  return events.filter(
    (event) =>
      event.eventType === "confirmed" && !revokedViolationIds.has(event.id),
  );
}

/**
 * これから確定する違反を含めた停止判定を返す。
 * 通報件数ではなく、取り消されていない確定違反だけを数える。
 */
export function decideViolationSuspension(
  events: readonly ViolationHistoryEvent[],
  incomingReasonCode: ModerationReasonCode,
): ViolationSuspensionDecision {
  const activeViolations = getActiveViolationEvents(events);
  const activeViolationCount = activeViolations.length + 1;
  const sameTypeViolationCount =
    activeViolations.filter(
      (event) => event.reasonCode === incomingReasonCode,
    ).length + 1;

  if (immediateSuspensionReasonCodes.has(incomingReasonCode)) {
    return {
      shouldSuspend: true,
      reason: "immediate",
      activeViolationCount,
      sameTypeViolationCount,
    };
  }

  if (sameTypeViolationCount >= 2) {
    return {
      shouldSuspend: true,
      reason: "sameTypeRepeated",
      activeViolationCount,
      sameTypeViolationCount,
    };
  }

  if (activeViolationCount >= 3) {
    return {
      shouldSuspend: true,
      reason: "cumulative",
      activeViolationCount,
      sameTypeViolationCount,
    };
  }

  return {
    shouldSuspend: false,
    reason: "none",
    activeViolationCount,
    sameTypeViolationCount,
  };
}
