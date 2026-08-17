import { normalizeDomain } from "./src/blocker.js";
import {
  advanceBreakChallenge,
  BREAK_CHALLENGE_STEPS,
  BREAK_DURATION_MINUTES,
  BREAK_HOLD_DURATION_MS,
  createBreakMiniChallenge,
  getBreakChallengeStep,
  getBlockedSiteLabel,
  isBreakMiniChallengeAnswer,
} from "./src/break-challenge.js";

let breakChallengeStepIndex = -1;
let blockedDomain = null;
let currentMiniChallenge = null;
let holdIntervalId = null;
let holdTimeoutId = null;
let holdStartedAt = 0;
let holdInProgress = false;

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

function openUnlockedSite() {
  // The blocking redirect replaced the original navigation, so the blocked
  // site is not in this tab's history. Navigate to it directly instead of
  // relying on history.back(), which can strand the user on this page.
  if (blockedDomain) {
    window.location.replace(`https://${blockedDomain}/`);
    return;
  }
  goBack();
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

  // auto=1 means the worker redirected an already-open tab (break expiry,
  // newly added domain) - the user made no attempt, so record nothing.
  if (searchParams.get("auto") === "1") {
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
  elements.reflectionActions.hidden = false;
  elements.miniChallengeForm.hidden = true;
  elements.challengeContinueButton.disabled = false;
  elements.challengeContinueButton.dataset.holdLabel = step.continueLabel;
  resetHoldButton(elements);

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

function clearHoldTimers() {
  if (holdIntervalId !== null) {
    window.clearInterval(holdIntervalId);
    holdIntervalId = null;
  }
  if (holdTimeoutId !== null) {
    window.clearTimeout(holdTimeoutId);
    holdTimeoutId = null;
  }
}

function resetHoldButton(elements) {
  clearHoldTimers();
  holdInProgress = false;
  elements.challengeContinueButton.classList.remove("is-holding");
  elements.challengeContinueButton.style.setProperty("--hold-progress", "0");
  elements.challengeHoldLabel.textContent =
    elements.challengeContinueButton.dataset.holdLabel || "Hold for 5 seconds";
}

function updateHoldProgress(elements) {
  const elapsedMs = Math.max(0, performance.now() - holdStartedAt);
  const progress = Math.min(1, elapsedMs / BREAK_HOLD_DURATION_MS);
  const remainingSeconds = Math.max(
    1,
    Math.ceil((BREAK_HOLD_DURATION_MS - elapsedMs) / 1000),
  );

  elements.challengeContinueButton.style.setProperty(
    "--hold-progress",
    String(progress),
  );
  elements.challengeHoldLabel.textContent = `Keep holding · ${remainingSeconds}s`;
}

async function completeHold(elements) {
  if (!holdInProgress) {
    return;
  }

  clearHoldTimers();
  holdInProgress = false;
  elements.challengeContinueButton.style.setProperty("--hold-progress", "1");
  elements.challengeHoldLabel.textContent = "Hold complete";
  elements.challengeContinueButton.disabled = true;
  await handleBreakChallengeAdvance(elements);
}

function startHold(elements, event) {
  if (holdInProgress || elements.challengeContinueButton.disabled) {
    return;
  }
  if (event instanceof PointerEvent && event.button !== 0) {
    return;
  }

  event.preventDefault();
  holdInProgress = true;
  holdStartedAt = performance.now();
  elements.challengeContinueButton.classList.add("is-holding");
  updateHoldProgress(elements);

  holdIntervalId = window.setInterval(() => {
    updateHoldProgress(elements);
  }, 50);
  holdTimeoutId = window.setTimeout(() => {
    completeHold(elements);
  }, BREAK_HOLD_DURATION_MS);
}

function cancelHold(elements, event) {
  if (!holdInProgress) {
    return;
  }

  event?.preventDefault();
  resetHoldButton(elements);
}

function renderMiniChallenge(elements) {
  currentMiniChallenge = createBreakMiniChallenge(blockedDomain);
  const siteLabel = getBlockedSiteLabel(blockedDomain);

  elements.challengeStepLabel.textContent = "Final check";
  elements.challengeTitle.textContent = "One last intentional choice.";
  elements.challengeMessage.textContent =
    `Solve one quick question before opening ${siteLabel}.`;
  elements.reflectionActions.hidden = true;
  elements.miniChallengeForm.hidden = false;
  elements.miniChallengePrompt.textContent = currentMiniChallenge.prompt;
  elements.miniChallengeAnswer.value = "";
  elements.miniChallengeFeedback.textContent = "";

  for (const dot of elements.challengeDots) {
    const dotIndex = Number(dot.dataset.challengeDot);
    dot.classList.toggle("is-current", dotIndex === BREAK_CHALLENGE_STEPS.length);
    dot.classList.toggle("is-complete", dotIndex < BREAK_CHALLENGE_STEPS.length);
  }

  elements.breakChallenge.classList.remove("is-entering");
  window.requestAnimationFrame(() => {
    elements.breakChallenge.classList.add("is-entering");
    elements.miniChallengeAnswer.focus();
  });
}

async function handleBreakChallengeAdvance(elements) {
  const action = advanceBreakChallenge(breakChallengeStepIndex);
  if (!action.shouldShowChallenge) {
    renderBreakChallenge(elements, action.stepIndex);
    return;
  }

  renderMiniChallenge(elements);
}

async function handleMiniChallengeSubmit(elements, event) {
  event.preventDefault();
  const answerIsCorrect = isBreakMiniChallengeAnswer(
    currentMiniChallenge,
    elements.miniChallengeAnswer.value,
  );

  if (!answerIsCorrect) {
    elements.miniChallengeFeedback.textContent =
      "Not quite. Take another moment and try again.";
    elements.miniChallengeAnswer.select();
    return;
  }

  elements.miniChallengeFeedback.textContent =
    "Correct. Starting your intentional 2-minute break.";
  await pauseBlocking(elements.miniChallengeSubmitButton, elements.notice);
}

async function pauseBlocking(pauseButton, notice) {
  pauseButton.disabled = true;
  try {
    await sendMessage({ type: "pauseDomain", domain: blockedDomain });
    showNotice(notice, `Blocking is paused for ${BREAK_DURATION_MINUTES} minutes.`);
    window.setTimeout(openUnlockedSite, 350);
  } catch (error) {
    const errorMessage = error.message === "Unknown extension action."
      ? "Chrome is still running an older Scroll Stop worker. Reload Scroll Stop once in chrome://extensions, then try again."
      : error.message;
    showNotice(notice, errorMessage);
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
    elements.challengeHoldLabel = requireElement("challenge-hold-label");
    elements.challengeReturnButton = requireElement("challenge-return-button");
    elements.challengeFinalReturnButton = requireElement("challenge-final-return-button");
    elements.challengeDots = document.querySelectorAll("[data-challenge-dot]");
    elements.reflectionActions = requireElement("reflection-actions");
    elements.miniChallengeForm = requireElement("mini-challenge-form");
    elements.miniChallengePrompt = requireElement("mini-challenge-prompt");
    elements.miniChallengeAnswer = requireElement("mini-challenge-answer");
    elements.miniChallengeFeedback = requireElement("mini-challenge-feedback");
    elements.miniChallengeSubmitButton = requireElement("mini-challenge-submit");
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
    elements.challengeFinalReturnButton?.addEventListener("click", () => {
      returnToFocus(elements.notice);
    });
    elements.challengeContinueButton?.addEventListener("click", (event) => {
      event.preventDefault();
    });
    elements.challengeContinueButton?.addEventListener("pointerdown", (event) => {
      startHold(elements, event);
    });
    elements.challengeContinueButton?.addEventListener("pointerup", (event) => {
      cancelHold(elements, event);
    });
    elements.challengeContinueButton?.addEventListener("pointercancel", (event) => {
      cancelHold(elements, event);
    });
    elements.challengeContinueButton?.addEventListener("pointerleave", (event) => {
      cancelHold(elements, event);
    });
    elements.challengeContinueButton?.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        startHold(elements, event);
      }
    });
    elements.challengeContinueButton?.addEventListener("keyup", (event) => {
      if (event.key === " " || event.key === "Enter") {
        cancelHold(elements, event);
      }
    });
    window.addEventListener("blur", () => {
      cancelHold(elements);
    });
    window.addEventListener("pointerup", (event) => {
      cancelHold(elements, event);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelHold(elements);
      }
    });
    elements.miniChallengeForm?.addEventListener("submit", (event) => {
      handleMiniChallengeSubmit(elements, event);
    });
  });
}

document.addEventListener("DOMContentLoaded", boot);
