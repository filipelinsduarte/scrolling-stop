import { DEFAULT_ANALYTICS, normalizeAnalytics } from "./analytics.js";

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  blockedDomains: Object.freeze(["linkedin.com", "x.com"]),
  focusGoals: Object.freeze([]),
  pausedUntil: 0,
  pausedDomain: null,
  analytics: DEFAULT_ANALYTICS,
});

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_GOAL_CHARACTERS = 120;
const DOMAIN_ALIASES = Object.freeze({
  x: "x.com",
  "x.com": "x.com",
  "twitter.com": "x.com",
});

export function normalizeDomain(input) {
  if (typeof input !== "string") {
    return null;
  }

  const candidate = input.trim();
  if (!candidate) {
    return null;
  }

  const aliasedCandidate = DOMAIN_ALIASES[candidate.toLowerCase()] || candidate;

  let parsedUrl;
  try {
    const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(aliasedCandidate);
    parsedUrl = new URL(
      hasProtocol ? aliasedCandidate : `https://${aliasedCandidate}`,
    );
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

  return DOMAIN_ALIASES[hostname] || hostname;
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
  const pausedDomain = pausedUntil > 0
    ? normalizeDomain(safeRawSettings.pausedDomain)
    : null;
  const analytics = normalizeAnalytics(safeRawSettings.analytics);

  return {
    enabled,
    blockedDomains,
    focusGoals,
    pausedUntil,
    pausedDomain,
    analytics,
  };
}

export function buildBlockingRules(settings, now = Date.now()) {
  const activeDomains = getActiveBlockedDomains(settings, now);

  return activeDomains.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}`,
      },
    },
    condition: {
      // Match the bare hostname as well as paths such as /home. A filter
      // ending in a slash can miss an initial navigation serialized as
      // https://example.com without an explicit path.
      urlFilter: `||${domain}`,
      resourceTypes: ["main_frame"],
    },
  }));
}

export function getActiveBlockedDomains(settings, now = Date.now()) {
  const hasActivePause = settings.pausedUntil > now;
  const pausedDomain = hasActivePause
    ? normalizeDomain(settings.pausedDomain)
    : null;
  const hasGlobalPause = hasActivePause && !pausedDomain;
  if (!settings.enabled || hasGlobalPause) {
    return [];
  }

  return normalizeDomainList(settings.blockedDomains)
    .filter((domain) => domain !== pausedDomain);
}

export function getBlockedDomainForUrl(url, settings, now = Date.now()) {
  const currentDomain = normalizeDomain(url);
  if (!currentDomain) {
    return null;
  }

  const matchingDomains = getActiveBlockedDomains(settings, now)
    .filter((domain) => {
      return currentDomain === domain || currentDomain.endsWith(`.${domain}`);
    })
    .sort((first, second) => second.length - first.length);

  return matchingDomains[0] || null;
}
