export const SETTINGS_HOLD_DURATION_MS = 5000;

export const SETTINGS_CONFIRMATION_STEPS = Object.freeze([
  Object.freeze({
    title: "Pause before changing the guardrail.",
    message: "You chose to protect your attention. Hold to confirm that you really want to change it.",
    holdLabel: "Hold for 5 seconds to continue",
  }),
  Object.freeze({
    title: "Make the choice intentional.",
    message: "Changing this makes the next detour easier. Hold again if that is genuinely what you want.",
    holdLabel: "Hold for 5 seconds to unlock the final check",
  }),
]);

export function advanceSettingsChallenge(stepIndex) {
  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    return { stepIndex: 0, shouldShowMiniChallenge: false };
  }

  if (stepIndex < SETTINGS_CONFIRMATION_STEPS.length - 1) {
    return { stepIndex: stepIndex + 1, shouldShowMiniChallenge: false };
  }

  return {
    stepIndex: SETTINGS_CONFIRMATION_STEPS.length,
    shouldShowMiniChallenge: true,
  };
}

export function createSettingsMiniChallenge() {
  return Object.freeze({
    prompt: "What is 7 × 4 + 3?",
    answer: "31",
  });
}

export function isSettingsMiniChallengeAnswer(challenge, input) {
  return Boolean(challenge)
    && String(input ?? "").trim() === challenge.answer;
}

export function requiresSettingsChallenge(currentEnabled, desiredEnabled) {
  return currentEnabled === true && desiredEnabled === false;
}

// The popup pause button lowers the guardrail for every blocked site at
// once, so starting a pause earns the same challenge as disabling blocking.
// Turning blocking back on and ending a pause early stay friction-free.
export function getPauseButtonAction(settings) {
  if (!settings || settings.enabled !== true) {
    return "enable";
  }

  if (settings.isPaused === true) {
    return "resume";
  }

  return "challengePause";
}
