import { describe, expect, it } from "vitest";
import {
  SETTINGS_CONFIRMATION_STEPS,
  SETTINGS_HOLD_DURATION_MS,
  advanceSettingsChallenge,
  createSettingsMiniChallenge,
  isSettingsMiniChallengeAnswer,
} from "../src/settings-challenge.js";

describe("settings challenge", () => {
  it("requires two five-second hold steps", () => {
    expect(SETTINGS_HOLD_DURATION_MS).toBe(5_000);
    expect(SETTINGS_CONFIRMATION_STEPS).toHaveLength(2);
    expect(advanceSettingsChallenge(0)).toEqual({
      stepIndex: 1,
      shouldShowMiniChallenge: false,
    });
    expect(advanceSettingsChallenge(1)).toEqual({
      stepIndex: 2,
      shouldShowMiniChallenge: true,
    });
  });

  it("only accepts the exact final answer", () => {
    const challenge = createSettingsMiniChallenge();
    expect(challenge.prompt).toContain("7 × 4 + 3");
    expect(isSettingsMiniChallengeAnswer(challenge, "31")).toBe(true);
    expect(isSettingsMiniChallengeAnswer(challenge, "30")).toBe(false);
  });
});
