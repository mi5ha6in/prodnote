import { describe, expect, it } from "vitest";
import { DAILY_KEEP, pruneBackups } from "./backups";

const NOW = new Date("2026-07-02T20:00:00.000Z");

function record(iso: string): { id: string; createdAt: string } {
  return { id: `backup_${iso}`, createdAt: iso };
}

describe("pruneBackups", () => {
  it("keeps the newest snapshot per day within the daily window", () => {
    const records = [
      record("2026-07-02T08:00:00.000Z"),
      record("2026-07-02T18:00:00.000Z"),
      record("2026-07-01T10:00:00.000Z"),
    ];

    const dropped = pruneBackups(records, NOW);
    expect(dropped).toEqual(["backup_2026-07-02T08:00:00.000Z"]);
  });

  it("keeps at most one weekly snapshot beyond the daily window and drops ancient ones", () => {
    const records = [
      record("2026-07-02T18:00:00.000Z"), // daily
      record("2026-06-20T10:00:00.000Z"), // weekly zone
      record("2026-06-19T10:00:00.000Z"), // same week → dropped
      record("2026-01-01T10:00:00.000Z"), // ancient → dropped
    ];

    const dropped = pruneBackups(records, NOW);
    expect(dropped).toContain("backup_2026-06-19T10:00:00.000Z");
    expect(dropped).toContain("backup_2026-01-01T10:00:00.000Z");
    expect(dropped).not.toContain("backup_2026-06-20T10:00:00.000Z");
  });

  it("keeps a snapshot for each of the last daily-window days", () => {
    const records = Array.from({ length: DAILY_KEEP }, (_, index) => {
      const date = new Date(NOW.getTime() - index * 24 * 60 * 60 * 1000);
      return record(date.toISOString());
    });

    expect(pruneBackups(records, NOW)).toHaveLength(0);
  });
});
