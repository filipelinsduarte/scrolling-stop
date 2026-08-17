function normalizePageGuardDomain(input) {
  if (typeof input !== "string") {
    return null;
  }

  const hostname = input.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!hostname) {
    return null;
  }

  if (
    hostname === "x"
    || hostname === "twitter.com"
    || hostname.endsWith(".twitter.com")
  ) {
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
  const hasSlotPause = Number.isFinite(pausedUntil) && pausedUntil > now;
  const slotPausedDomain = hasSlotPause
    ? normalizePageGuardDomain(settings.pausedDomain)
    : null;

  const globalPauseUntil = hasSlotPause && !slotPausedDomain ? pausedUntil : 0;

  // Per-domain break windows (map of domain -> expiry), plus the legacy
  // single-slot site pause written by an older worker.
  let sitePauseUntil = 0;
  const pausedDomains = settings.pausedDomains
    && typeof settings.pausedDomains === "object"
    ? settings.pausedDomains
    : {};
  const mappedUntil = Number(pausedDomains[blockedDomain]);
  if (Number.isFinite(mappedUntil) && mappedUntil > now) {
    sitePauseUntil = mappedUntil;
  }
  if (slotPausedDomain === blockedDomain) {
    sitePauseUntil = Math.max(sitePauseUntil, pausedUntil);
  }

  if (globalPauseUntil > 0 || sitePauseUntil > 0) {
    return {
      blockedDomain: null,
      reevaluateAt: Math.max(globalPauseUntil, sitePauseUntil),
    };
  }

  return { blockedDomain, reevaluateAt: 0 };
}

globalThis.ScrollStopPageGuard = Object.freeze({
  getPageGuardDecision,
});
