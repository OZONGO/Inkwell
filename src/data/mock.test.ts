import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { formatTime } from "../lib/format";

describe("formatTime", () => {
  beforeEach(() => {
    // 锁定"今天"为 2026-07-04 12:30 本地时间，避免跨日测试不稳定
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 4, 12, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns HH:MM for a timestamp on the same day", () => {
    // Arrange — 同一天上午 9:05
    const ts = new Date(2026, 6, 4, 9, 5, 0).getTime();
    // Act
    const result = formatTime(ts);
    // Assert
    expect(result).toBe("09:05");
  });

  test("returns HH:MM for a timestamp later same day", () => {
    // Arrange — 同一天下午 18:45
    const ts = new Date(2026, 6, 4, 18, 45, 0).getTime();
    expect(formatTime(ts)).toBe("18:45");
  });

  test("pads single-digit hours and minutes with leading zeros", () => {
    // Arrange — 边界值：1:2 → 01:02
    const ts = new Date(2026, 6, 4, 1, 2, 0).getTime();
    expect(formatTime(ts)).toBe("01:02");
  });

  test("returns MM/DD HH:MM for a timestamp on a different day", () => {
    // Arrange — 前一天 23:50
    const ts = new Date(2026, 6, 3, 23, 50, 0).getTime();
    expect(formatTime(ts)).toBe("07/03 23:50");
  });

  test("returns MM/DD HH:MM for a timestamp in a previous month", () => {
    // Arrange — 6月15日 08:00
    const ts = new Date(2026, 5, 15, 8, 0, 0).getTime();
    expect(formatTime(ts)).toBe("06/15 08:00");
  });

  test("handles midnight boundary (00:00 same day)", () => {
    // Arrange — 当天凌晨 0:00
    const ts = new Date(2026, 6, 4, 0, 0, 0).getTime();
    expect(formatTime(ts)).toBe("00:00");
  });

  test("treats previous-day midnight as different day", () => {
    // Arrange — 前一天 0:00
    const ts = new Date(2026, 6, 3, 0, 0, 0).getTime();
    expect(formatTime(ts)).toBe("07/03 00:00");
  });
});
