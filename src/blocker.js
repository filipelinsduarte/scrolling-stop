import { DEFAULT_ANALYTICS, normalizeAnalytics } from "./analytics.js";

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  blockedDomains: Object.freeze(["linkedin.com", "x.com", "twitter.com"]),
  focusGoals: Object.freeze([]),
  pausedUntil: 0,
  analytics: DEFAULT_ANALYTICS,
});

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_FOCUS_GOALS = 5;
const MAX_GOAL_CHARACTERS = 120;

export function normalizeDomain(input) {
  if (typeof input !== "string") {
    return null;
  }

  const candidate = input.trim();
  if (!candidate) {
    return null;
  }

  let parsedUrl;
  try {
    const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate);
    parsedUrl = new URL(hasProtocol ? candidate : `https://${candidate}`);
  } catch {
    return null;
  }

  if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const isLocalHost = hostname === "localhost" || hostname.endsWith(".localhost");
  const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

  if (!hostname.includes(".") || isLocalHost || isIpAddress) {
    return null;
  }

  return hostname;
}

export function normalizeDomainList(domains) {
  if (!Array.isArray(domains)) {
    return [];
  }

  const normalizedDomains = [];
  const seenDomains = new Set();

  for (const domain of domains) {
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain || seenDomains.has(normalizedDomain)) {
      continue;
    }

    seenDomains.add(normalizedDomain);
    normalizedDomains.push(normalizedDomain);
  }

  return normalizedDomains;
}

export function normalizeFocusGoals(input) {
  const candidates = typeof input === "string" ? input.split(/\r?\n/) : input;
  if (!Array.isArray(candidates)) {
    return [];
  }

  const goals = [];
  const seenGoals = new Set();

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const goal = candidate
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, MAX_GOAL_CHARACTERS)
      .trim();
    const goalIdentity = goal.toLocaleLowerCase();

    if (!goal || seenGoals.has(goalIdentity)) {
      continue;
    }

    seenGoals.add(goalIdentity);
    goals.push(goal);

    if (goals.length === MAX_FOCUS_GOALS) {
      break;
    }
  }

  return goals;
}

export function getEffectiveSettings(rawSettings, defaults, now = Date.now()) {
  const safeRawSettings = rawSettings && typeof rawSettings === "object"
    ? rawSettings
    : {};

  const enabled = typeof safeRawSettings.enabled === "boolean"
    ? safeRawSettings.enabled
    : defaults.enabled;

  const storedDomains = Array.isArray(safeRawSettings.blockedDomains)
    ? safeRawSettings.blockedDomains
    : defaults.blockedDomains;
  const blockedDomains = normalizeDomainList(storedDomains);

  const storedGoals = Array.isArray(safeRawSettings.focusGoals)
    ? safeRawSettings.focusGoals
    : defaults.focusGoals;
  const focusGoals = normalizeFocusGoals(storedGoals);

  const storedPause = Number(safeRawSettings.pausedUntil);
  const pausedUntil = Number.isFinite(storedPause) && storedPause > now
    ? storedPause
    : 0;
  const analytics = normalizeAnalytics(safeRawSettings.analytics);

  return {
    enabled,
    blockedDomains,
    focusGoals,
    pausedUntil,
    analytics,
  };
}

export function buildBlockingRules(settings, now = Date.now()) {
  const isPaused = settings.pausedUntil > now;
  if (!settings.enabled || isPaused) {
    return [];
  }

  return normalizeDomainList(settings.blockedDomains).map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}`,
      },
    },
    condition: {
      urlFilter: `||${domain}/`,
      resourceTypes: ["main_frame"],
    },
  }));
}
