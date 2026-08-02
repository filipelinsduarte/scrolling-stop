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
  if (typeof domain !== "string" || !domain.trim()) {
    return "This site";
  }

  const normalizedDomain = domain.trim().toLowerCase().replace(/^www\./, "");
  const domainParts = normalizedDomain.split(".").filter(Boolean);
  const commonCompoundSuffixes = new Set([
    "co.uk",
    "com.au",
    "com.br",
    "com.mx",
    "co.nz",
    "co.jp",
  ]);
  const compoundSuffix = domainParts.slice(-2).join(".");
  const hasCompoundSuffix = commonCompoundSuffixes.has(compoundSuffix);
  const labelIndex = hasCompoundSuffix && domainParts.length >= 3
    ? domainParts.length - 3
    : Math.max(0, domainParts.length - 2);
  const rawLabel = domainParts[labelIndex] || normalizedDomain;
  const knownLabels = {
    github: "GitHub",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    reddit: "Reddit",
    tiktok: "TikTok",
    twitter: "X",
    x: "X",
    youtube: "YouTube",
  };

  if (knownLabels[rawLabel]) {
    return knownLabels[rawLabel];
  }

  return rawLabel
    .split("-")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
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
