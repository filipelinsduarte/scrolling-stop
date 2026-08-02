export const BREAK_DURATION_MINUTES = 2;
export const BREAK_DURATION_MS = BREAK_DURATION_MINUTES * 60 * 1000;

export const BREAK_CHALLENGE_STEPS = Object.freeze([
  Object.freeze({
    title: "Do you really need this break?",
    continueLabel: "I still need a break",
  }),
  Object.freeze({
    title: "What will these 2 minutes cost?",
    continueLabel: "Start my 2-minute break",
  }),
]);

export function getBlockedSiteLabel(domain) {
  const labels = {
    "linkedin.com": "LinkedIn",
    "twitter.com": "X",
    "x.com": "X",
  };
  return labels[domain] || domain || "This site";
}

export function getBreakChallengeStep(stepIndex, domain) {
  const step = BREAK_CHALLENGE_STEPS[stepIndex];
  if (!step) {
    return null;
  }

  const siteLabel = getBlockedSiteLabel(domain);
  const messages = [
    `${siteLabel} can wait. Will opening it help the focus you chose, or pull you further away from it?`,
    `A quick check on ${siteLabel} can restart the scroll loop. If you continue, keep it intentional and return when the timer ends.`,
  ];

  return {
    ...step,
    message: messages[stepIndex],
  };
}

export function advanceBreakChallenge(currentStepIndex) {
  const safeStepIndex = Number.isInteger(currentStepIndex)
    ? currentStepIndex
    : -1;
  const nextStepIndex = safeStepIndex + 1;
  const shouldStartBreak = nextStepIndex >= BREAK_CHALLENGE_STEPS.length;

  return {
    stepIndex: shouldStartBreak
      ? BREAK_CHALLENGE_STEPS.length - 1
      : nextStepIndex,
    shouldStartBreak,
  };
}
