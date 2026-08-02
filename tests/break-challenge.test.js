import { describe, expect, it } from "vitest";

import {
  advanceBreakChallenge,
  BREAK_CHALLENGE_STEPS,
  BREAK_DURATION_MINUTES,
  BREAK_DURATION_MS,
  getBreakChallengeStep,
  getBlockedSiteLabel,
} from "../src/break-challenge.js";

describe("break challenge", () => {
  it("requires both reflection steps before starting a break", () => {
    const firstAction = advanceBreakChallenge(-1);
    const secondAction = advanceBreakChallenge(firstAction.stepIndex);
    const finalAction = advanceBreakChallenge(secondAction.stepIndex);

    expect(firstAction).toEqual({ stepIndex: 0, shouldStartBreak: false });
    expect(secondAction).toEqual({ stepIndex: 1, shouldStartBreak: false });
    expect(finalAction).toEqual({ stepIndex: 1, shouldStartBreak: true });
    expect(BREAK_CHALLENGE_STEPS).toHaveLength(2);
  });

  it("limits an approved break to two minutes", () => {
    expect(BREAK_DURATION_MINUTES).toBe(2);
    expect(BREAK_DURATION_MS).toBe(120_000);
  });

  it("uses the website that triggered the blocked screen in both prompts", () => {
    expect(getBreakChallengeStep(0, "x.com").message).toContain("X can wait.");
    expect(getBreakChallengeStep(1, "x.com").message).toContain("check on X");
    expect(getBreakChallengeStep(0, "linkedin.com").message).toContain(
      "LinkedIn can wait.",
    );
    expect(getBlockedSiteLabel("twitter.com")).toBe("X");
    expect(getBlockedSiteLabel("reddit.com")).toBe("reddit.com");
  });
});
