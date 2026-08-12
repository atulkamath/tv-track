import { describe, expect, it } from "vitest";
import { formatWatchTime } from "./format-watch-time";

describe("formatWatchTime", () => {
  it("formats zero minutes as 0h 0m", () => {
    expect(formatWatchTime(0)).toBe("0h 0m");
  });

  it("formats minutes under an hour", () => {
    expect(formatWatchTime(45)).toBe("0h 45m");
  });

  it("formats hours and minutes under a day, per docs/design.md's '4h 20m'", () => {
    expect(formatWatchTime(4 * 60 + 20)).toBe("4h 20m");
  });

  it("formats exactly one day", () => {
    expect(formatWatchTime(24 * 60)).toBe("1d 0h");
  });

  it("drops minutes once a full day has accrued, per docs/design.md's '29d 2h'", () => {
    expect(formatWatchTime(29 * 24 * 60 + 2 * 60)).toBe("29d 2h");
  });

  it("still shows days right up to the 30-day mark", () => {
    expect(formatWatchTime(29 * 24 * 60 + 23 * 60)).toBe("29d 23h");
  });

  it("adds a months unit at 30 days, keeping the leftover days and hours exact", () => {
    expect(formatWatchTime((4 * 30 + 1) * 24 * 60 + 60)).toBe("4mo 1d 1h");
  });

  it("drops empty units rather than padding them with zeros", () => {
    expect(formatWatchTime(30 * 24 * 60)).toBe("1mo");
    expect(formatWatchTime(89 * 24 * 60)).toBe("2mo 29d");
    expect(formatWatchTime(4 * 30 * 24 * 60 + 60)).toBe("4mo 1h");
  });

  it("rounds fractional minutes", () => {
    expect(formatWatchTime(90.6)).toBe("1h 31m");
  });
});
