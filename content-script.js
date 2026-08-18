let guardTimeoutId = null;
let guardRefreshSequence = 0;

const GUARD_SETTING_KEYS = new Set([
  "enabled",
  "blockedDomains",
  "pausedUntil",
  "pausedDomain",
  "pausedDomains",
]);

function clearGuardTimeout() {
  if (guardTimeoutId === null) {
    return;
  }

  window.clearTimeout(guardTimeoutId);
  guardTimeoutId = null;
}

function redirectToBlockedPage(blockedDomain) {
  const blockedUrl = new URL(chrome.runtime.getURL("blocked.html"));
  blockedUrl.searchParams.set("domain", blockedDomain);
  // Page-guard redirects enforce a boundary on an already-open tab (break
  // expiry, newly blocked domain) - they are not user attempts, so they
  // carry the same auto marker as worker-initiated redirects.
  blockedUrl.searchParams.set("auto", "1");
  window.location.replace(blockedUrl.toString());
}

async function refreshPageGuard() {
  const refreshSequence = guardRefreshSequence + 1;
  guardRefreshSequence = refreshSequence;
  clearGuardTimeout();

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: "getState" });
  } catch (error) {
    console.warn("[Scrolling Stop] Page guard could not read settings", error);
    return;
  }

  if (refreshSequence !== guardRefreshSequence) {
    return;
  }
  if (!response?.ok) {
    console.warn("[Scrolling Stop] Page guard received no settings");
    return;
  }

  const decision = globalThis.ScrollStopPageGuard.getPageGuardDecision(
    window.location.hostname,
    response.data,
  );
  if (decision.blockedDomain) {
    redirectToBlockedPage(decision.blockedDomain);
    return;
  }

  if (decision.reevaluateAt > 0) {
    const delayMs = Math.max(0, decision.reevaluateAt - Date.now());
    guardTimeoutId = window.setTimeout(refreshPageGuard, delayMs);
  }
}

function handleGuardStorageChange(changes, areaName) {
  if (areaName !== "local") {
    return;
  }

  const guardSettingChanged = Object.keys(changes)
    .some((key) => GUARD_SETTING_KEYS.has(key));
  if (guardSettingChanged) {
    refreshPageGuard();
  }
}

async function bootPageGuard() {
  try {
    if (!globalThis.ScrollStopPageGuard) {
      throw new Error("Page guard logic is unavailable.");
    }
  } catch (error) {
    console.warn("[Scrolling Stop] Page guard setup failed", error);
    return;
  }

  try {
    chrome.storage.onChanged.addListener(handleGuardStorageChange);
  } catch (error) {
    console.warn("[Scrolling Stop] Page guard listener setup failed", error);
  }

  try {
    await refreshPageGuard();
  } catch (error) {
    console.warn("[Scrolling Stop] Page guard first check failed", error);
  }
}

bootPageGuard();
