function normalizePageGuardDomain(input) {
  if (typeof input !== "string") {
    return null;
  }

  const hostname = input.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!hostname) {
    return null;
  }

  if (hostname === "x" || hostname === "twitter.com") {
    return "x.com";
  }

  return hostname;
}

function findPageGuardBlockedDomain(hostname, blockedDomains) {
  const currentDomain = normalizePageGuardDomain(hostname);
  if (!currentDomain || !Array.isArray(blockedDomains)) {
    return null;
  }

  const matchingDomains = blockedDomains
    .map((domain) => normalizePageGuardDomain(domain))
    .filter((domain) => {
      return domain
        && (currentDomain === domain || currentDomain.endsWith(`.${domain}`));
    })
    .sort((first, second) => second.length - first.length);

  return matchingDomains[0] || null;
}

function getPageGuardDecision(hostname, settings, now = Date.now()) {
  if (!settings || settings.enabled !== true) {
    return { blockedDomain: null, reevaluateAt: 0 };
  }

  const blockedDomain = findPageGuardBlockedDomain(
    hostname,
    settings.blockedDomains,
  );
  if (!blockedDomain) {
    return { blockedDomain: null, reevaluateAt: 0 };
  }

  const pausedUntil = Number(settings.pausedUntil);
  const hasActivePause = Number.isFinite(pausedUntil) && pausedUntil > now;
  if (!hasActivePause) {
    return { blockedDomain, reevaluateAt: 0 };
  }

  const pausedDomain = normalizePageGuardDomain(settings.pausedDomain);
  const isGlobalPause = !pausedDomain;
  const isCurrentDomainPaused = pausedDomain === blockedDomain;
  if (isGlobalPause || isCurrentDomainPaused) {
    return { blockedDomain: null, reevaluateAt: pausedUntil };
  }

  return { blockedDomain, reevaluateAt: 0 };
}

globalThis.ScrollStopPageGuard = Object.freeze({
  getPageGuardDecision,
});
