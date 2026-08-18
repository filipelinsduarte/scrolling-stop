import { DEFAULT_ANALYTICS, normalizeAnalytics } from "./analytics.js";
import { DEFAULT_TELEMETRY, normalizeTelemetry } from "./telemetry.js";

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  blockedDomains: Object.freeze(["linkedin.com", "x.com"]),
  focusGoals: Object.freeze([]),
  pausedUntil: 0,
  pausedDomain: null,
  pausedDomains: Object.freeze({}),
  analytics: DEFAULT_ANALYTICS,
  telemetry: DEFAULT_TELEMETRY,
});

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_GOAL_CHARACTERS = 120;
const DOMAIN_ALIASES = Object.freeze({
  x: "x.com",
  "x.com": "x.com",
  "twitter.com": "x.com",
});

// Hostnames that must also be covered when a canonical domain is blocked.
// Blocking x.com has to intercept twitter.com before Twitter's own server
// redirect, otherwise the page can flash or fully load first.
const DOMAIN_RULE_ALIASES = Object.freeze({
  "x.com": Object.freeze(["twitter.com"]),
});

export function expandDomainHostnames(domain) {
  const aliases = DOMAIN_RULE_ALIASES[domain] || [];
  return [domain, ...aliases];
}

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

export function normalizePausedDomains(input, now = Date.now()) {
  const safeInput = input && typeof input === "object" && !Array.isArray(input)
    ? input
    : {};
  const pausedDomains = {};

  for (const [rawDomain, rawUntil] of Object.entries(safeInput)) {
    const domain = normalizeDomain(rawDomain);
    const until = Number(rawUntil);
    if (!domain || !Number.isFinite(until) || until <= now) {
      continue;
    }

    pausedDomains[domain] = Math.max(pausedDomains[domain] || 0, until);
  }

  return pausedDomains;
}

// Combines the per-domain pause map with the legacy single pause slot
// (pausedUntil + pausedDomain). A legacy site pause becomes a map entry so
// storage written by an older worker keeps its active break.
function getActivePauses(settings, now) {
  const domainPauses = normalizePausedDomains(settings.pausedDomains, now);

  const storedPause = Number(settings.pausedUntil);
  const activeStoredPause = Number.isFinite(storedPause) && storedPause > now
    ? storedPause
    : 0;
  const legacyPausedDomain = activeStoredPause > 0
    ? normalizeDomain(settings.pausedDomain)
    : null;

  let globalPauseUntil = 0;
  if (legacyPausedDomain) {
    domainPauses[legacyPausedDomain] = Math.max(
      domainPauses[legacyPausedDomain] || 0,
      activeStoredPause,
    );
  } else {
    globalPauseUntil = activeStoredPause;
  }

  return { globalPauseUntil, domainPauses };
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

  const { globalPauseUntil, domainPauses } = getActivePauses(
    safeRawSettings,
    now,
  );
  const analytics = normalizeAnalytics(safeRawSettings.analytics);
  const telemetry = normalizeTelemetry(safeRawSettings.telemetry);

  return {
    enabled,
    blockedDomains,
    focusGoals,
    pausedUntil: globalPauseUntil,
    // The legacy single-domain slot is always cleared after migration into
    // pausedDomains, so a later global pause cannot be misread as a site pause.
    pausedDomain: null,
    pausedDomains: domainPauses,
    analytics,
    telemetry,
  };
}

export function buildBlockingRules(settings, now = Date.now()) {
  const activeDomains = getActiveBlockedDomains(settings, now);
  const rules = [];

  for (const domain of activeDomains) {
    for (const hostname of expandDomainHostnames(domain)) {
      rules.push({
        id: rules.length + 1,
        priority: 1,
        action: {
          type: "redirect",
          redirect: {
            extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}`,
          },
        },
        condition: {
          // "^" matches a separator or the end of the URL, so this covers
          // https://example.com, https://example.com/ and subdomain paths
          // without also matching a longer hostname such as example.company.
          urlFilter: `||${hostname}^`,
          resourceTypes: ["main_frame"],
        },
      });
    }
  }

  return rules;
}

export function getActiveBlockedDomains(settings, now = Date.now()) {
  const { globalPauseUntil, domainPauses } = getActivePauses(settings, now);
  if (!settings.enabled || globalPauseUntil > 0) {
    return [];
  }

  return normalizeDomainList(settings.blockedDomains)
    .filter((domain) => !domainPauses[domain]);
}

export function getNextPauseExpiry(settings, now = Date.now()) {
  const { globalPauseUntil, domainPauses } = getActivePauses(settings, now);
  const expiries = Object.values(domainPauses);
  if (globalPauseUntil > 0) {
    expiries.push(globalPauseUntil);
  }

  if (expiries.length === 0) {
    return 0;
  }

  return Math.min(...expiries);
}

export function getBlockedDomainForUrl(url, settings, now = Date.now()) {
  const currentDomain = normalizeDomain(url);
  if (!currentDomain) {
    return null;
  }

  const matchingDomains = getActiveBlockedDomains(settings, now)
    .filter((domain) => {
      return expandDomainHostnames(domain).some((hostname) => {
        return currentDomain === hostname
          || currentDomain.endsWith(`.${hostname}`);
      });
    })
    .sort((first, second) => second.length - first.length);

  return matchingDomains[0] || null;
}
