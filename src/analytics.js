export const ESTIMATED_MINUTES_PER_FOCUS_RETURN = 5;

export const DEFAULT_ANALYTICS = Object.freeze({
  totalBlockedAttempts: 0,
  focusReturns: 0,
  estimatedMinutesSaved: 0,
  blockedByDomain: Object.freeze({}),
});

function normalizeCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

export function normalizeAnalytics(input) {
  const safeInput = input && typeof input === "object" ? input : {};
  const safeDomains = safeInput.blockedByDomain
    && typeof safeInput.blockedByDomain === "object"
    && !Array.isArray(safeInput.blockedByDomain)
    ? safeInput.blockedByDomain
    : {};
  const blockedByDomain = {};

  for (const [domain, count] of Object.entries(safeDomains)) {
    if (typeof domain !== "string" || !domain.trim()) {
      continue;
    }
    const normalizedCount = normalizeCount(count);
    if (normalizedCount > 0) {
      blockedByDomain[domain] = normalizedCount;
    }
  }

  const totalBlockedAttempts = normalizeCount(safeInput.totalBlockedAttempts);
  const focusReturns = normalizeCount(safeInput.focusReturns);

  return {
    totalBlockedAttempts,
    focusReturns,
    estimatedMinutesSaved: focusReturns * ESTIMATED_MINUTES_PER_FOCUS_RETURN,
    blockedByDomain,
  };
}

export function recordBlockedAttempt(analytics, domain) {
  const current = normalizeAnalytics(analytics);
  const blockedByDomain = { ...current.blockedByDomain };
  blockedByDomain[domain] = (blockedByDomain[domain] || 0) + 1;

  return {
    ...current,
    totalBlockedAttempts: current.totalBlockedAttempts + 1,
    blockedByDomain,
  };
}

export function recordFocusReturn(analytics) {
  const current = normalizeAnalytics(analytics);
  const focusReturns = current.focusReturns + 1;

  return {
    ...current,
    focusReturns,
    estimatedMinutesSaved: focusReturns * ESTIMATED_MINUTES_PER_FOCUS_RETURN,
  };
}

export function formatSavedTime(minutes) {
  const safeMinutes = normalizeCount(minutes);
  if (safeMinutes < 60) {
    return `${safeMinutes}m`;
  }

  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

export function calculatePercentage(part, total) {
  const safePart = normalizeCount(part);
  const safeTotal = normalizeCount(total);
  if (safeTotal === 0) {
    return 0;
  }

  return Math.min(100, Math.round((safePart / safeTotal) * 100));
}
