import { describe, expect, it } from "vitest";

import { mergeUnresolvedWithRecentHistory } from "@/lib/adminModeration";

type HistoryItem = {
  id: string;
  status: string;
  createdAt: Date;
};

describe("mergeUnresolvedWithRecentHistory", () => {
  it("keeps every unresolved item and only the latest completed history", () => {
    const now = Date.now();
    const completed = Array.from({ length: 51 }, (_, index): HistoryItem => ({
      id: `completed-${index}`,
      status: "resolved",
      createdAt: new Date(now - index * 1000),
    }));
    const unresolved: HistoryItem = {
      id: "old-pending",
      status: "pending",
      createdAt: new Date(now - 100_000),
    };

    const result = mergeUnresolvedWithRecentHistory(
      [...completed, unresolved],
      ["pending", "reviewed"],
    );

    expect(result).toHaveLength(51);
    expect(result.map((item) => item.id)).toContain("old-pending");
    expect(result.map((item) => item.id)).not.toContain("completed-50");
    expect(new Set(result.map((item) => item.id)).size).toBe(result.length);
  });

  it("orders equal timestamps by id descending and removes duplicate ids", () => {
    const timestamp = new Date("2026-09-02T00:00:00.000Z");
    const items: HistoryItem[] = [
      { id: "a", status: "resolved", createdAt: timestamp },
      { id: "c", status: "resolved", createdAt: timestamp },
      { id: "b", status: "resolved", createdAt: timestamp },
      { id: "c", status: "resolved", createdAt: timestamp },
    ];

    expect(
      mergeUnresolvedWithRecentHistory(items, ["pending"]).map(
        (item) => item.id,
      ),
    ).toEqual(["c", "b", "a"]);
  });
});
