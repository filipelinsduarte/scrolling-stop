import {
  buildBlockingRules,
  DEFAULT_SETTINGS,
  getEffectiveSettings,
  normalizeDomain,
  normalizeDomainList,
  normalizeFocusGoals,
} from "./src/blocker.js";
import { createTaskQueue } from "./src/task-queue.js";
import { BREAK_DURATION_MINUTES, BREAK_DURATION_MS } from "./src/break-challenge.js";
import {
  recordBlockedAttempt as addBlockedAttempt,
  recordFocusReturn as addFocusReturn,
} from "./src/analytics.js";

const SETTINGS_KEYS = [
  "enabled",
  "blockedDomains",
  "focusGoals",
  "pausedUntil",
  "pausedDomain",
  "analytics",
];
const RESUME_ALARM = "resume-blocking";
const enqueueRuleSync = createTaskQueue();
const enqueueAnalyticsUpdate = createTaskQueue();

function settingsAreEqual(first, second) {
  return first.enabled === second.enabled
    && first.pausedUntil === second.pausedUntil
    && first.pausedDomain === second.pausedDomain
    && JSON.stringify(first.blockedDomains) === JSON.stringify(second.blockedDomains)
    && JSON.stringify(first.focusGoals) === JSON.stringify(second.focusGoals)
    && JSON.stringify(first.analytics) === JSON.stringify(second.analytics);
}

async function readSettings() {
  const storedSettings = await chrome.storage.local.get(SETTINGS_KEYS);
  const settings = getEffectiveSettings(storedSettings, DEFAULT_SETTINGS);

  if (!settingsAreEqual(settings, storedSettings)) {
    await chrome.storage.local.set(settings);
  }

  return settings;
}

async function writeSettings(settings) {
  const normalizedSettings = getEffectiveSettings(settings, DEFAULT_SETTINGS);
  await chrome.storage.local.set(normalizedSettings);
  return normalizedSettings;
}

async function syncBlockingRules() {
  const settings = await readSettings();
  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = currentRules.map((rule) => rule.id);
  const addRules = buildBlockingRules(settings);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules,
  });

  const hasActivePause = settings.pausedUntil > Date.now();
  const isGlobalPause = hasActivePause && !settings.pausedDomain;
  const badgeText = !settings.enabled
    ? "off"
    : isGlobalPause
      ? String(BREAK_DURATION_MINUTES)
      : "";
  await chrome.action.setBadgeBackgroundColor({ color: "#C94F38" });
  await chrome.action.setBadgeText({ text: badgeText });

  return settings;
}

function scheduleRuleSync() {
  return enqueueRuleSync(syncBlockingRules);
}

async function initialize() {
  const settings = await scheduleRuleSync();

  if (settings.pausedUntil > Date.now()) {
    await chrome.alarms.create(RESUME_ALARM, { when: settings.pausedUntil });
  } else {
    await chrome.alarms.clear(RESUME_ALARM);
  }
}

async function getPublicState() {
  const settings = await readSettings();
  const pauseRemainingMs = Math.max(0, settings.pausedUntil - Date.now());

  return {
    ...settings,
    isPaused: pauseRemainingMs > 0 && !settings.pausedDomain,
    hasSitePause: pauseRemainingMs > 0 && Boolean(settings.pausedDomain),
    pauseRemainingMs,
  };
}

async function setEnabled(message) {
  const settings = await readSettings();
  await writeSettings({
    ...settings,
    enabled: Boolean(message.enabled),
    pausedUntil: 0,
    pausedDomain: null,
  });
  await chrome.alarms.clear(RESUME_ALARM);
  await scheduleRuleSync();
  return getPublicState();
}

async function addDomain(message) {
  const domain = normalizeDomain(message.domain);
  if (!domain) {
    throw new Error("Enter a valid public website, such as example.com.");
  }

  const settings = await readSettings();
  const blockedDomains = normalizeDomainList([...settings.blockedDomains, domain]);
  await writeSettings({ ...settings, blockedDomains });
  await scheduleRuleSync();
  return getPublicState();
}

async function removeDomain(message) {
  const domain = normalizeDomain(message.domain);
  if (!domain) {
    throw new Error("That website could not be removed.");
  }

  const settings = await readSettings();
  const blockedDomains = settings.blockedDomains.filter((item) => item !== domain);
  await writeSettings({ ...settings, blockedDomains });
  await scheduleRuleSync();
  return getPublicState();
}

async function pauseBlocking() {
  const settings = await readSettings();
  const pausedUntil = Date.now() + BREAK_DURATION_MS;
  await writeSettings({
    ...settings,
    enabled: true,
    pausedUntil,
    pausedDomain: null,
  });
  await chrome.alarms.create(RESUME_ALARM, { when: pausedUntil });
  await scheduleRuleSync();
  return getPublicState();
}

async function pauseDomain(message) {
  const domain = normalizeDomain(message.domain);
  if (!domain) {
    throw new Error("The website break could not be identified.");
  }

  const settings = await readSettings();
  if (!settings.blockedDomains.includes(domain)) {
    throw new Error("That website is not in the blocked list.");
  }

  const pausedUntil = Date.now() + BREAK_DURATION_MS;
  await writeSettings({
    ...settings,
    enabled: true,
    pausedUntil,
    pausedDomain: domain,
  });
  await chrome.alarms.create(RESUME_ALARM, { when: pausedUntil });
  await scheduleRuleSync();
  return getPublicState();
}

async function resumeBlocking() {
  const settings = await readSettings();
  await writeSettings({ ...settings, pausedUntil: 0, pausedDomain: null });
  await chrome.alarms.clear(RESUME_ALARM);
  await scheduleRuleSync();
  return getPublicState();
}

async function setFocusGoals(message) {
  const settings = await readSettings();
  const focusGoals = normalizeFocusGoals(message.goals);
  await writeSettings({ ...settings, focusGoals });
  return getPublicState();
}

async function recordBlockAttempt(message) {
  const domain = normalizeDomain(message.domain);
  if (!domain) {
    throw new Error("The blocked website could not be identified.");
  }

  return enqueueAnalyticsUpdate(async () => {
    const settings = await readSettings();
    if (!settings.blockedDomains.includes(domain)) {
      throw new Error("That website is not in the blocked list.");
    }

    const analytics = addBlockedAttempt(settings.analytics, domain);
    await writeSettings({ ...settings, analytics });
    return getPublicState();
  });
}

async function recordFocusReturn() {
  return enqueueAnalyticsUpdate(async () => {
    const settings = await readSettings();
    const analytics = addFocusReturn(settings.analytics);
    await writeSettings({ ...settings, analytics });
    return getPublicState();
  });
}

const MESSAGE_HANDLERS = {
  addDomain,
  getState: getPublicState,
  pauseBlocking,
  pauseDomain,
  recordBlockAttempt,
  recordFocusReturn,
  removeDomain,
  resumeBlocking,
  setEnabled,
  setFocusGoals,
};

function runSafely(label, task) {
  task().catch((error) => {
    console.error(`[Scroll Stop] ${label} failed`, error);
  });
}

runSafely("service worker boot", initialize);

chrome.runtime.onInstalled.addListener(() => {
  runSafely("installation", initialize);
});

chrome.runtime.onStartup.addListener(() => {
  runSafely("startup", initialize);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  const ruleSettingChanged = ["enabled", "blockedDomains", "pausedUntil", "pausedDomain"]
    .some((key) => Object.hasOwn(changes, key));
  if (!ruleSettingChanged) {
    return;
  }

  runSafely("storage sync", scheduleRuleSync);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== RESUME_ALARM) {
    return;
  }

  runSafely("automatic resume", resumeBlocking);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[message?.type];
  if (!handler) {
    sendResponse({ ok: false, error: "Unknown extension action." });
    return false;
  }

  Promise.resolve(handler(message))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      console.error("[Scroll Stop] Message failed", error);
      sendResponse({ ok: false, error: error.message || "Something went wrong." });
    });

  return true;
});
