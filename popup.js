import { normalizeDomain } from "./src/blocker.js";
import { calculatePercentage, formatSavedTime } from "./src/analytics.js";

const state = {
  currentDomain: null,
  currentTabId: null,
  draftGoals: [],
  settings: null,
};

const EMPTY_EDITOR_GOALS = ["", "", ""];

const elements = {};

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required element #${id} is missing.`);
  }
  return element;
}

function cacheElements() {
  elements.enabledToggle = requireElement("enabled-toggle");
  elements.statusTitle = requireElement("status-title");
  elements.statusDetail = requireElement("status-detail");
  elements.pauseButton = requireElement("pause-button");
  elements.blockCurrentButton = requireElement("block-current-button");
  elements.mainView = requireElement("main-view");
  elements.focusView = requireElement("focus-view");
  elements.focusEditButton = requireElement("focus-edit-button");
  elements.focusActionLabel = requireElement("focus-action-label");
  elements.focusSummary = requireElement("focus-summary");
  elements.focusForm = requireElement("focus-form");
  elements.focusBackButton = requireElement("focus-back-button");
  elements.goalFields = requireElement("goal-fields");
  elements.addGoalButton = requireElement("add-goal-button");
  elements.focusNotice = requireElement("focus-notice");
  elements.siteCount = requireElement("site-count");
  elements.siteList = requireElement("site-list");
  elements.addSiteForm = requireElement("add-site-form");
  elements.siteInput = requireElement("site-input");
  elements.notice = requireElement("notice");
  elements.analyticsAttempts = requireElement("analytics-attempts");
  elements.analyticsTimeSaved = requireElement("analytics-time-saved");
  elements.analyticsFocusReturns = requireElement("analytics-focus-returns");
  elements.analyticsDomainList = requireElement("analytics-domain-list");
  elements.analyticsOpenButton = requireElement("analytics-open-button");
  elements.analyticsLaunchSummary = requireElement("analytics-launch-summary");
  elements.analyticsView = requireElement("analytics-view");
  elements.analyticsBackButton = requireElement("analytics-back-button");
  elements.analyticsReturnRing = requireElement("analytics-return-ring");
  elements.analyticsReturnRate = requireElement("analytics-return-rate");
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Scroll Stop could not complete that action.");
  }
  return response.data;
}

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.currentTabId = Number.isInteger(tab?.id) ? tab.id : null;
  state.currentDomain = normalizeDomain(tab?.url || "");
}

async function loadSettings() {
  state.settings = await sendMessage({ type: "getState" });
}

function formatPauseTime(milliseconds) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  return `${minutes} min left`;
}

function getDomainLabel(domain) {
  const labels = {
    "linkedin.com": "LinkedIn",
    "twitter.com": "X (legacy)",
    "x.com": "X",
  };
  return labels[domain] || domain;
}

function createSvg(pathData, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (className) {
    svg.setAttribute("class", className);
  }

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  svg.append(path);
  return svg;
}

function createDomainIcon(domain) {
  const wrapper = document.createElement("span");
  wrapper.className = "site-icon";

  if (domain === "linkedin.com") {
    wrapper.classList.add("site-icon-linkedin");
    wrapper.append(createSvg("M6.94 8.5H3.56V19h3.38V8.5ZM5.25 3A1.96 1.96 0 1 0 5.25 6.92 1.96 1.96 0 0 0 5.25 3ZM19 13.13c0-3.16-1.69-4.63-3.94-4.63a3.4 3.4 0 0 0-3.08 1.7V8.5H8.6V19h3.38v-5.2c0-1.37.26-2.7 1.96-2.7 1.67 0 1.69 1.57 1.69 2.79V19H19v-5.87Z"));
    return wrapper;
  }

  if (domain === "x.com" || domain === "twitter.com") {
    wrapper.classList.add("site-icon-x");
    wrapper.append(createSvg("M18.9 3H22l-6.77 7.74L23.2 21h-6.24l-4.89-6.39L6.48 21H3.36l7.26-8.3L2.98 3h6.4l4.42 5.84L18.9 3Zm-1.1 16.2h1.72L8.44 4.7H6.6l11.2 14.5Z"));
    return wrapper;
  }

  wrapper.classList.add("site-icon-generic");
  wrapper.append(createSvg("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.2-2.47 3.33-5.47 3.4-9C15.33 8.47 14.2 5.47 12 3m0 18c-2.2-2.47-3.33-5.47-3.4-9C8.67 8.47 9.8 5.47 12 3M3.6 9h16.8M3.6 15h16.8"));
  return wrapper;
}

function createSiteItem(domain) {
  const item = document.createElement("li");
  item.className = "site-item";

  const identity = document.createElement("div");
  identity.className = "site-identity";
  identity.append(createDomainIcon(domain));

  const copy = document.createElement("div");
  const label = document.createElement("p");
  label.className = "site-name";
  label.textContent = getDomainLabel(domain);
  const host = document.createElement("p");
  host.className = "site-domain";
  host.textContent = domain;
  copy.append(label, host);
  identity.append(copy);

  const removeButton = document.createElement("button");
  removeButton.className = "remove-button";
  removeButton.type = "button";
  removeButton.dataset.action = "remove-domain";
  removeButton.dataset.domain = domain;
  removeButton.setAttribute("aria-label", `Remove ${domain}`);
  removeButton.append(createSvg("M6 6l12 12M18 6 6 18"));

  item.append(identity, removeButton);
  return item;
}

function renderSiteList() {
  const domains = state.settings?.blockedDomains || [];
  const fragment = document.createDocumentFragment();
  for (const domain of domains) {
    fragment.append(createSiteItem(domain));
  }

  elements.siteList.replaceChildren(fragment);
  elements.siteList.classList.toggle("is-empty", domains.length === 0);
  elements.siteCount.textContent = String(domains.length);
}

function renderStatus() {
  const settings = state.settings;
  if (!settings) {
    return;
  }

  elements.enabledToggle.checked = settings.enabled;
  document.body.classList.toggle("is-disabled", !settings.enabled);
  document.body.classList.toggle("is-paused", settings.isPaused);

  if (!settings.enabled) {
    elements.statusTitle.textContent = "Blocking is off";
    elements.statusDetail.textContent = "Your blocked sites are currently reachable.";
    elements.pauseButton.textContent = "Turn on";
    return;
  }

  if (settings.isPaused) {
    elements.statusTitle.textContent = "Taking a short break";
    elements.statusDetail.textContent = formatPauseTime(settings.pauseRemainingMs);
    elements.pauseButton.textContent = "Resume now";
    return;
  }

  elements.statusTitle.textContent = "Blocking is active";
  elements.statusDetail.textContent = "Your detours stop before they start.";
  elements.pauseButton.textContent = "Pause 2 min";
}

function renderCurrentSiteButton() {
  const buttonLabel = elements.blockCurrentButton.querySelector("span");
  if (!buttonLabel) {
    console.warn("[Scroll Stop] Current-site button label is missing.");
    return;
  }

  if (!state.currentDomain) {
    elements.blockCurrentButton.disabled = true;
    buttonLabel.textContent = "This page cannot be blocked";
    return;
  }

  const isBlocked = state.settings?.blockedDomains.includes(state.currentDomain);
  elements.blockCurrentButton.disabled = Boolean(isBlocked);
  buttonLabel.textContent = isBlocked
    ? `${state.currentDomain} is blocked`
    : `Block ${state.currentDomain}`;
}

function renderFocus() {
  const goals = state.settings?.focusGoals || [];
  const remainingGoalCount = Math.max(0, goals.length - 1);

  if (goals.length === 0) {
    elements.focusSummary.textContent = "Choose the work worth returning to.";
  } else if (remainingGoalCount === 0) {
    elements.focusSummary.textContent = goals[0];
  } else {
    elements.focusSummary.textContent = `${goals[0]} +${remainingGoalCount} more`;
  }
  elements.focusEditButton.setAttribute(
    "aria-label",
    goals.length > 0 ? "Edit focus objectives" : "Set focus objectives",
  );
  elements.focusActionLabel.textContent = goals.length > 0 ? "Edit" : "Set focus";
}

function createAnalyticsDomainItem(domain, count, totalAttempts) {
  const item = document.createElement("li");
  item.className = "analytics-domain-item";

  const row = document.createElement("div");
  row.className = "analytics-domain-row";

  const identity = document.createElement("div");
  identity.className = "site-identity";
  identity.append(createDomainIcon(domain));

  const copy = document.createElement("div");
  const label = document.createElement("p");
  label.className = "site-name";
  label.textContent = getDomainLabel(domain);
  const host = document.createElement("p");
  host.className = "site-domain";
  host.textContent = domain;
  copy.append(label, host);
  identity.append(copy);

  const countLabel = document.createElement("span");
  countLabel.className = "analytics-domain-count";
  countLabel.textContent = `${count} ${count === 1 ? "block" : "blocks"}`;

  row.append(identity, countLabel);

  const share = calculatePercentage(count, totalAttempts);
  const chart = document.createElement("div");
  chart.className = "analytics-domain-chart";
  chart.setAttribute("role", "progressbar");
  chart.setAttribute("aria-label", `${getDomainLabel(domain)} share of blocked attempts`);
  chart.setAttribute("aria-valuemin", "0");
  chart.setAttribute("aria-valuemax", "100");
  chart.setAttribute("aria-valuenow", String(share));

  const bar = document.createElement("span");
  bar.style.setProperty("--domain-share", `${share}%`);
  chart.append(bar);

  item.append(row, chart);
  return item;
}

function renderAnalytics() {
  const analytics = state.settings?.analytics || {};
  const blockedByDomain = analytics.blockedByDomain || {};
  const domains = new Set([
    ...(state.settings?.blockedDomains || []),
    ...Object.keys(blockedByDomain),
  ]);
  const sortedDomains = [...domains].sort((first, second) => {
    return (blockedByDomain[second] || 0) - (blockedByDomain[first] || 0);
  });
  const fragment = document.createDocumentFragment();

  const totalAttempts = analytics.totalBlockedAttempts || 0;
  const focusReturns = analytics.focusReturns || 0;
  const savedTime = formatSavedTime(analytics.estimatedMinutesSaved || 0);
  const returnRate = calculatePercentage(focusReturns, totalAttempts);

  for (const domain of sortedDomains) {
    fragment.append(createAnalyticsDomainItem(
      domain,
      blockedByDomain[domain] || 0,
      totalAttempts,
    ));
  }

  elements.analyticsAttempts.textContent = String(totalAttempts);
  elements.analyticsTimeSaved.textContent = savedTime;
  elements.analyticsFocusReturns.textContent = String(focusReturns);
  elements.analyticsLaunchSummary.textContent = totalAttempts === 0
    ? "No attempts recorded yet."
    : `${totalAttempts} ${totalAttempts === 1 ? "attempt" : "attempts"} · ${savedTime} saved`;
  elements.analyticsReturnRate.textContent = `${returnRate}%`;
  elements.analyticsReturnRing.style.setProperty("--return-rate", `${returnRate}%`);
  elements.analyticsReturnRing.setAttribute(
    "aria-label",
    `${returnRate} percent of blocked attempts ended with an explicit return to focus`,
  );
  elements.analyticsDomainList.replaceChildren(fragment);
}

function render() {
  renderStatus();
  renderFocus();
  renderSiteList();
  renderAnalytics();
  renderCurrentSiteButton();
}

function showNotice(message, type = "success", target = elements.notice) {
  if (!target) {
    console.warn("[Scroll Stop] Notice target is missing.");
    return;
  }

  target.textContent = message;
  target.dataset.type = type;
  window.setTimeout(() => {
    if (target.textContent === message) {
      target.textContent = "";
    }
  }, 2600);
}

async function handleEnabledChange() {
  elements.enabledToggle.disabled = true;
  try {
    state.settings = await sendMessage({
      type: "setEnabled",
      enabled: elements.enabledToggle.checked,
    });
    render();
  } catch (error) {
    showNotice(error.message, "error");
    elements.enabledToggle.checked = state.settings?.enabled ?? true;
  } finally {
    elements.enabledToggle.disabled = false;
  }
}

async function handlePauseClick() {
  try {
    if (!state.settings.enabled) {
      state.settings = await sendMessage({ type: "setEnabled", enabled: true });
    } else if (state.settings.isPaused) {
      state.settings = await sendMessage({ type: "resumeBlocking" });
    } else {
      state.settings = await sendMessage({ type: "pauseBlocking" });
    }
    render();
  } catch (error) {
    showNotice(error.message, "error");
  }
}

async function handleBlockCurrentSite() {
  if (!state.currentDomain) {
    return;
  }

  try {
    state.settings = await sendMessage({
      type: "addDomain",
      domain: state.currentDomain,
    });
    render();
    showNotice(`${state.currentDomain} is now blocked.`);

    if (state.currentTabId !== null) {
      await chrome.tabs.reload(state.currentTabId);
      window.close();
    }
  } catch (error) {
    showNotice(error.message, "error");
  }
}

function getGoalFieldValues() {
  const inputs = elements.goalFields.querySelectorAll("input[data-goal-input]");
  return [...inputs].map((input) => input.value);
}

function createGoalField(value, index, totalGoals) {
  const row = document.createElement("div");
  row.className = "goal-field";
  row.dataset.goalIndex = String(index);

  const marker = document.createElement("span");
  marker.className = "goal-number";
  marker.textContent = String(index + 1);
  marker.setAttribute("aria-hidden", "true");

  const inputId = `focus-goal-${index}`;
  const label = document.createElement("label");
  label.className = "sr-only";
  label.htmlFor = inputId;
  label.textContent = `Objective ${index + 1}`;

  const input = document.createElement("input");
  input.id = inputId;
  input.type = "text";
  input.maxLength = 120;
  input.value = value;
  input.dataset.goalInput = "true";
  input.autocomplete = "off";
  input.placeholder = [
    "Finish the client proposal",
    "Review the outreach pipeline",
    "Plan tomorrow's priorities",
  ][index] || "Add another objective";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove-goal-button";
  removeButton.dataset.action = "remove-goal";
  removeButton.dataset.goalIndex = String(index);
  removeButton.setAttribute("aria-label", `Remove objective ${index + 1}`);
  removeButton.disabled = totalGoals === 1;
  removeButton.append(createSvg("M6 6l12 12M18 6 6 18"));

  row.append(marker, label, input, removeButton);
  return row;
}

function renderGoalFields(goals, focusIndex = null) {
  const safeGoals = Array.isArray(goals) ? [...goals] : [""];
  if (safeGoals.length === 0) {
    safeGoals.push("");
  }

  state.draftGoals = safeGoals;
  const fragment = document.createDocumentFragment();
  safeGoals.forEach((goal, index) => {
    fragment.append(createGoalField(goal, index, safeGoals.length));
  });
  elements.goalFields.replaceChildren(fragment);
  elements.addGoalButton.disabled = false;

  if (focusIndex !== null) {
    const inputs = elements.goalFields.querySelectorAll("input[data-goal-input]");
    inputs[focusIndex]?.focus();
  }
}

function openFocusView() {
  const savedGoals = state.settings?.focusGoals || [];
  const editorGoals = savedGoals.length > 0 ? [...savedGoals] : [...EMPTY_EDITOR_GOALS];
  renderGoalFields(editorGoals);
  document.body.classList.add("is-focus-view");
  elements.mainView.setAttribute("aria-hidden", "true");
  elements.focusView.setAttribute("aria-hidden", "false");
  elements.mainView.inert = true;
  elements.focusView.inert = false;
  elements.focusNotice.textContent = "";

  window.setTimeout(() => {
    const firstInput = elements.goalFields.querySelector("input[data-goal-input]");
    firstInput?.focus();
  }, 240);
}

function closeFocusView() {
  document.body.classList.remove("is-focus-view");
  elements.mainView.setAttribute("aria-hidden", "false");
  elements.focusView.setAttribute("aria-hidden", "true");
  elements.mainView.inert = false;
  elements.focusView.inert = true;
  window.setTimeout(() => elements.focusEditButton.focus(), 240);
}

function openAnalyticsView() {
  renderAnalytics();
  elements.analyticsView.scrollTop = 0;
  document.body.classList.add("is-analytics-view");
  elements.mainView.setAttribute("aria-hidden", "true");
  elements.analyticsView.setAttribute("aria-hidden", "false");
  elements.mainView.inert = true;
  elements.analyticsView.inert = false;
  window.setTimeout(() => elements.analyticsBackButton.focus(), 240);
}

function closeAnalyticsView() {
  document.body.classList.remove("is-analytics-view");
  elements.mainView.setAttribute("aria-hidden", "false");
  elements.analyticsView.setAttribute("aria-hidden", "true");
  elements.mainView.inert = false;
  elements.analyticsView.inert = true;
  window.setTimeout(() => elements.analyticsOpenButton.focus(), 240);
}

function handleAddGoal() {
  const goals = getGoalFieldValues();
  goals.push("");
  renderGoalFields(goals, goals.length - 1);
}

function handleGoalFieldsClick(event) {
  const removeButton = event.target.closest("[data-action='remove-goal']");
  if (!removeButton) {
    return;
  }

  const goalIndex = Number(removeButton.dataset.goalIndex);
  const goals = getGoalFieldValues();
  if (!Number.isInteger(goalIndex) || goals.length === 1) {
    return;
  }

  goals.splice(goalIndex, 1);
  const nextFocusIndex = Math.min(goalIndex, goals.length - 1);
  renderGoalFields(goals, nextFocusIndex);
}

async function handleFocusSubmit(event) {
  event.preventDefault();

  try {
    state.settings = await sendMessage({
      type: "setFocusGoals",
      goals: getGoalFieldValues(),
    });
    render();
    closeFocusView();
    showNotice(
      state.settings.focusGoals.length > 0
        ? "Your focus is saved."
        : "Your focus was cleared.",
    );
  } catch (error) {
    showNotice(error.message, "error", elements.focusNotice);
  }
}

async function handleAddSite(event) {
  event.preventDefault();
  const candidate = elements.siteInput.value;

  try {
    state.settings = await sendMessage({ type: "addDomain", domain: candidate });
    const domain = normalizeDomain(candidate);
    elements.siteInput.value = "";
    render();
    showNotice(`${domain} is now blocked.`);
  } catch (error) {
    showNotice(error.message, "error");
    elements.siteInput.focus();
  }
}

async function handleSiteListClick(event) {
  const button = event.target.closest("[data-action='remove-domain']");
  if (!button) {
    return;
  }

  try {
    state.settings = await sendMessage({
      type: "removeDomain",
      domain: button.dataset.domain,
    });
    render();
    showNotice(`${button.dataset.domain} was removed.`);
  } catch (error) {
    showNotice(error.message, "error");
  }
}

function bindEvents() {
  elements.enabledToggle.addEventListener("change", handleEnabledChange);
  elements.pauseButton.addEventListener("click", handlePauseClick);
  elements.blockCurrentButton.addEventListener("click", handleBlockCurrentSite);
  elements.focusEditButton.addEventListener("click", openFocusView);
  elements.focusBackButton.addEventListener("click", closeFocusView);
  elements.analyticsOpenButton.addEventListener("click", openAnalyticsView);
  elements.analyticsBackButton.addEventListener("click", closeAnalyticsView);
  elements.addGoalButton.addEventListener("click", handleAddGoal);
  elements.goalFields.addEventListener("click", handleGoalFieldsClick);
  elements.focusForm.addEventListener("submit", handleFocusSubmit);
  elements.addSiteForm.addEventListener("submit", handleAddSite);
  elements.siteList.addEventListener("click", handleSiteListClick);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("is-focus-view")) {
      closeFocusView();
    } else if (
      event.key === "Escape"
      && document.body.classList.contains("is-analytics-view")
    ) {
      closeAnalyticsView();
    }
  });
}

async function bootStep(label, task) {
  try {
    await task();
  } catch (error) {
    console.error(`[Scroll Stop] ${label} failed`, error);
    if (elements.notice) {
      showNotice("Scroll Stop could not load completely. Reload the extension.", "error");
    }
  }
}

async function boot() {
  await bootStep("interface setup", async () => cacheElements());
  await bootStep("current tab lookup", loadCurrentTab);
  await bootStep("settings load", loadSettings);
  await bootStep("event setup", async () => bindEvents());
  await bootStep("first render", async () => render());
}

document.addEventListener("DOMContentLoaded", boot);
