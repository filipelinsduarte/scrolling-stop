// Anonymous install and uninstall counting.
//
// This is the only place in the extension that talks to the network. It sends
// a random client id, the extension version, and whether the event was a fresh
// install or an update. It never sends a URL, a domain, a blocked attempt, or
// anything else derived from what the user browses.
//
// The request goes to our own endpoint on scrollingstop.com rather than
// straight to Google Analytics, so the Measurement Protocol secret stays on
// the server and never ships inside the extension bundle.

export const TELEMETRY_ENDPOINT = "https://scrollingstop.com/api/event";
export const UNINSTALL_URL = "https://scrollingstop.com/uninstalled";

export const INSTALL_EVENT = "extension_install";
export const UNINSTALL_EVENT = "extension_uninstall";

const ALLOWED_EVENT_NAMES = Object.freeze([INSTALL_EVENT, UNINSTALL_EVENT]);
const ALLOWED_REASONS = Object.freeze(["install", "update"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_TELEMETRY = Object.freeze({
  enabled: true,
  clientId: "",
  reportedVersion: "",
});

function normalizeClientId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : "";
}

function normalizeVersion(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeTelemetry(input) {
  const safeInput = input && typeof input === "object" ? input : {};

  return {
    // Only a real boolean counts. A corrupt value falls back to the default
    // rather than to false, but an explicit false is always preserved.
    enabled: typeof safeInput.enabled === "boolean"
      ? safeInput.enabled
      : DEFAULT_TELEMETRY.enabled,
    clientId: normalizeClientId(safeInput.clientId),
    reportedVersion: normalizeVersion(safeInput.reportedVersion),
  };
}

export function isAllowedEventName(name) {
  return ALLOWED_EVENT_NAMES.includes(name);
}

// The id is created lazily and only for a user who has not opted out, so an
// opted-out install never gets an identifier assigned to it in the first place.
export function ensureClientId(telemetry, generateId) {
  const current = normalizeTelemetry(telemetry);
  if (!current.enabled || current.clientId) {
    return current;
  }

  return { ...current, clientId: normalizeClientId(generateId()) };
}

export function shouldReportInstall(telemetry, version) {
  const current = normalizeTelemetry(telemetry);
  const safeVersion = normalizeVersion(version);
  if (!current.enabled || !safeVersion) {
    return false;
  }

  return current.reportedVersion !== safeVersion;
}

export function buildEventPayload({ clientId, version, reason }) {
  const safeClientId = normalizeClientId(clientId);
  if (!safeClientId) {
    return null;
  }

  return {
    name: INSTALL_EVENT,
    clientId: safeClientId,
    version: normalizeVersion(version),
    reason: ALLOWED_REASONS.includes(reason) ? reason : "install",
  };
}

// Chrome opens this URL in a tab when the extension is removed. The page
// records the uninstall with the site's own analytics tag, so no secret and
// no background request is involved on this path.
export function buildUninstallUrl(telemetry, version, baseUrl = UNINSTALL_URL) {
  const current = normalizeTelemetry(telemetry);
  if (!current.enabled || !current.clientId) {
    return null;
  }

  const url = new URL(baseUrl);
  url.searchParams.set("cid", current.clientId);
  url.searchParams.set("v", normalizeVersion(version));
  return url.toString();
}
