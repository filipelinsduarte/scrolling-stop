import { describe, expect, it } from "vitest";

import {
  advanceBreakChallenge,
  BREAK_CHALLENGE_STEPS,
  BREAK_DURATION_MINUTES,
  BREAK_DURATION_MS,
  BREAK_HOLD_DURATION_MS,
  createBreakMiniChallenge,
  getBreakChallengeStep,
  getBlockedSiteLabel,
  isBreakMiniChallengeAnswer,
} from "../src/break-challenge.js";

describe("break challenge", () => {
  it("requires both reflection holds before showing the mini challenge", () => {
    const firstAction = advanceBreakChallenge(-1);
    const secondAction = advanceBreakChallenge(firstAction.stepIndex);
    const finalAction = advanceBreakChallenge(secondAction.stepIndex);

    expect(firstAction).toEqual({ stepIndex: 0, shouldShowChallenge: false });
    expect(secondAction).toEqual({ stepIndex: 1, shouldShowChallenge: false });
    expect(finalAction).toEqual({ stepIndex: 1, shouldShowChallenge: true });
    expect(BREAK_CHALLENGE_STEPS).toHaveLength(2);
    expect(BREAK_HOLD_DURATION_MS).toBe(5_000);
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
    expect(getBlockedSiteLabel("reddit.com")).toBe("Reddit");
    expect(getBlockedSiteLabel("old.reddit.com")).toBe("Reddit");
    expect(getBlockedSiteLabel("youtube.com")).toBe("YouTube");
    expect(getBlockedSiteLabel("example.co.uk")).toBe("Example");
    expect(getBlockedSiteLabel("my-focus-site.com")).toBe("My Focus Site");
    expect(getBreakChallengeStep(0, "reddit.com").message).toContain(
      "Reddit can wait.",
    );
  });

  it("creates a deterministic arithmetic challenge and validates only its answer", () => {
    const firstChallenge = createBreakMiniChallenge("x.com");
    const repeatedChallenge = createBreakMiniChallenge("x.com");
    const redditChallenge = createBreakMiniChallenge("reddit.com");

    expect(firstChallenge).toEqual(repeatedChallenge);
    expect(firstChallenge.prompt).toMatch(/^What is \d+ \+ \d+\?$/);
    expect(redditChallenge.prompt).not.toBe(firstChallenge.prompt);
    expect(isBreakMiniChallengeAnswer(firstChallenge, String(firstChallenge.answer))).toBe(true);
    expect(isBreakMiniChallengeAnswer(firstChallenge, ` ${firstChallenge.answer} `)).toBe(true);
    expect(isBreakMiniChallengeAnswer(firstChallenge, firstChallenge.answer + 1)).toBe(false);
    expect(isBreakMiniChallengeAnswer(firstChallenge, "not a number")).toBe(false);
  });
});
