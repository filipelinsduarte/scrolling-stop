import { describe, expect, it } from "vitest";

import {
  calculatePercentage,
  formatSavedTime,
  normalizeAnalytics,
  recordBlockedAttempt,
  recordFocusReturn,
} from "../src/analytics.js";

describe("attention analytics", () => {
  it("records attempts separately for each blocked domain", () => {
    const firstAttempt = recordBlockedAttempt({}, "linkedin.com");
    const secondAttempt = recordBlockedAttempt(firstAttempt, "x.com");
    const thirdAttempt = recordBlockedAttempt(secondAttempt, "linkedin.com");

    expect(thirdAttempt).toEqual({
      totalBlockedAttempts: 3,
      focusReturns: 0,
      estimatedMinutesSaved: 0,
      blockedByDomain: {
        "linkedin.com": 2,
        "x.com": 1,
      },
    });
  });

  it("only estimates saved time after an intentional focus return", () => {
    const attempt = recordBlockedAttempt({}, "linkedin.com");
    const returnToFocus = recordFocusReturn(attempt);

    expect(attempt.estimatedMinutesSaved).toBe(0);
    expect(returnToFocus.focusReturns).toBe(1);
    expect(returnToFocus.estimatedMinutesSaved).toBe(5);
  });

  it("normalizes corrupt values and formats longer durations", () => {
    expect(normalizeAnalytics({
      totalBlockedAttempts: -4,
      focusReturns: 13,
      estimatedMinutesSaved: 999,
      blockedByDomain: { "x.com": 3, broken: -1 },
    })).toEqual({
      totalBlockedAttempts: 0,
      focusReturns: 13,
      estimatedMinutesSaved: 65,
      blockedByDomain: { "x.com": 3 },
    });
    expect(formatSavedTime(65)).toBe("1h 5m");
  });

  it("calculates bounded chart percentages", () => {
    expect(calculatePercentage(1, 4)).toBe(25);
    expect(calculatePercentage(3, 2)).toBe(100);
    expect(calculatePercentage(1, 0)).toBe(0);
    expect(calculatePercentage(-1, 10)).toBe(0);
  });
});
