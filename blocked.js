import { normalizeDomain } from "./src/blocker.js";
import {
  advanceBreakChallenge,
  BREAK_CHALLENGE_STEPS,
  BREAK_DURATION_MINUTES,
  getBreakChallengeStep,
} from "./src/break-challenge.js";

let breakChallengeStepIndex = -1;
let blockedDomain = null;

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required element #${id} is missing.`);
  }
  return element;
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Scroll Stop could not complete that action.");
  }
  return response.data;
}

function showNotice(element, message) {
  if (!element) {
    console.warn("[Scroll Stop] Notice element is missing.");
    return;
  }
  element.textContent = message;
}

function goBack() {
  window.history.back();
}

async function returnToFocus(notice) {
  try {
    await sendMessage({ type: "recordFocusReturn" });
  } catch (error) {
    showNotice(notice, error.message);
  } finally {
    goBack();
  }
}

function createGoalMarker() {
  const marker = document.createElement("span");
  marker.className = "focus-goal-marker";
  marker.setAttribute("aria-hidden", "true");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m7 12 3 3 7-7");
  svg.append(path);
  marker.append(svg);
  return marker;
}

function renderFocusGoals(elements, goals) {
  const safeGoals = Array.isArray(goals) ? goals : [];
  const fragment = document.createDocumentFragment();

  for (const goal of safeGoals) {
    const item = document.createElement("li");
    item.append(createGoalMarker());

    const text = document.createElement("span");
    text.textContent = goal;
    item.append(text);
    fragment.append(item);
  }

  elements.focusGoalList.replaceChildren(fragment);
  elements.focusGoalList.hidden = safeGoals.length === 0;
  elements.focusEmpty.hidden = safeGoals.length > 0;
}

async function loadFocusGoals(elements) {
  const settings = await sendMessage({ type: "getState" });
  renderFocusGoals(elements, settings.focusGoals);
}

async function recordBlockedPageArrival() {
  const searchParams = new URLSearchParams(window.location.search);
  blockedDomain = normalizeDomain(searchParams.get("domain") || "");
  if (!blockedDomain) {
    return;
  }

  await sendMessage({ type: "recordBlockAttempt", domain: blockedDomain });
}

function renderBreakChallenge(elements, stepIndex) {
  const step = getBreakChallengeStep(stepIndex, blockedDomain);
  if (!step) {
    throw new Error("The break reflection step is unavailable.");
  }

  breakChallengeStepIndex = stepIndex;
  elements.defaultContent.hidden = true;
  elements.breakChallenge.hidden = false;
  elements.challengeStepLabel.textContent = `Pause check ${stepIndex + 1} of ${BREAK_CHALLENGE_STEPS.length}`;
  elements.challengeTitle.textContent = step.title;
  elements.challengeMessage.textContent = step.message;
  elements.challengeContinueButton.textContent = step.continueLabel;

  for (const dot of elements.challengeDots) {
    const dotIndex = Number(dot.dataset.challengeDot);
    dot.classList.toggle("is-current", dotIndex === stepIndex);
    dot.classList.toggle("is-complete", dotIndex < stepIndex);
  }

  elements.breakChallenge.classList.remove("is-entering");
  window.requestAnimationFrame(() => {
    elements.breakChallenge.classList.add("is-entering");
    elements.challengeContinueButton.focus();
  });
}

async function handleBreakChallengeAdvance(elements) {
  const action = advanceBreakChallenge(breakChallengeStepIndex);
  if (!action.shouldStartBreak) {
    renderBreakChallenge(elements, action.stepIndex);
    return;
  }

  await pauseBlocking(elements.challengeContinueButton, elements.notice);
}

async function pauseBlocking(pauseButton, notice) {
  pauseButton.disabled = true;
  try {
    await sendMessage({ type: "pauseBlocking" });
    showNotice(notice, `Blocking is paused for ${BREAK_DURATION_MINUTES} minutes.`);
    window.setTimeout(goBack, 350);
  } catch (error) {
    showNotice(notice, error.message);
    pauseButton.disabled = false;
  }
}

async function bootStep(label, task) {
  try {
    await task();
  } catch (error) {
    console.error(`[Scroll Stop] ${label} failed`, error);
  }
}

async function boot() {
  const elements = {};

  await bootStep("interface setup", async () => {
    elements.goBackButton = requireElement("go-back-button");
    elements.pauseButton = requireElement("pause-button");
    elements.notice = requireElement("blocked-notice");
    elements.focusGoalList = requireElement("focus-goal-list");
    elements.focusEmpty = requireElement("focus-empty");
    elements.defaultContent = requireElement("blocked-default-content");
    elements.breakChallenge = requireElement("break-challenge");
    elements.challengeStepLabel = requireElement("challenge-step-label");
    elements.challengeTitle = requireElement("break-challenge-title");
    elements.challengeMessage = requireElement("break-challenge-message");
    elements.challengeContinueButton = requireElement("challenge-continue-button");
    elements.challengeReturnButton = requireElement("challenge-return-button");
    elements.challengeDots = document.querySelectorAll("[data-challenge-dot]");
  });

  await bootStep("blocked attempt tracking", recordBlockedPageArrival);
  await bootStep("focus reminder load", async () => loadFocusGoals(elements));

  await bootStep("event setup", async () => {
    elements.goBackButton?.addEventListener("click", () => {
      returnToFocus(elements.notice);
    });
    elements.pauseButton?.addEventListener("click", () => {
      handleBreakChallengeAdvance(elements);
    });
    elements.challengeReturnButton?.addEventListener("click", () => {
      returnToFocus(elements.notice);
    });
    elements.challengeContinueButton?.addEventListener("click", () => {
      handleBreakChallengeAdvance(elements);
    });
  });
}

document.addEventListener("DOMContentLoaded", boot);
