import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createBreakMiniChallenge } from "../src/break-challenge.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "scroll-stop-test-"));
const browserErrors = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectErrors(page, pageName) {
  page.on("pageerror", (error) => {
    browserErrors.push(`${pageName} page error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(`${pageName} console error: ${message.text()}`);
    }
  });
}

async function waitForText(page, selector, expectedText) {
  await page.waitForFunction(
    ({ targetSelector, targetText }) => {
      return document.querySelector(targetSelector)?.textContent?.trim() === targetText;
    },
    { targetSelector: selector, targetText: expectedText },
  );
}

async function holdButton(page, selector, durationMs) {
  const button = page.locator(selector);
  const buttonBox = await button.boundingBox();
  assert(buttonBox, `Could not measure hold button ${selector}.`);

  await page.mouse.move(
    buttonBox.x + (buttonBox.width / 2),
    buttonBox.y + (buttonBox.height / 2),
  );
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
}

async function auditLayout(page, selectors) {
  return page.evaluate((targetSelectors) => {
    function getLineWordCounts(element) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const lineWords = new Map();
      let textNode = walker.nextNode();

      while (textNode) {
        const text = textNode.textContent || "";
        const wordPattern = /\S+/g;
        let match = wordPattern.exec(text);

        while (match) {
          const range = document.createRange();
          range.setStart(textNode, match.index);
          range.setEnd(textNode, match.index + match[0].length);
          const rectangle = range.getBoundingClientRect();
          const lineTop = Math.round(rectangle.top);
          lineWords.set(lineTop, (lineWords.get(lineTop) || 0) + 1);
          match = wordPattern.exec(text);
        }

        textNode = walker.nextNode();
      }

      return [...lineWords.values()];
    }

    const textFindings = [];
    for (const selector of targetSelectors) {
      const elements = [...document.querySelectorAll(selector)];
      for (const element of elements) {
        const lineWordCounts = getLineWordCounts(element);
        const lastLineWords = lineWordCounts.at(-1) || 0;
        const longestEarlierLine = Math.max(0, ...lineWordCounts.slice(0, -1));
        const hasOrphan = lineWordCounts.length > 1
          && lastLineWords <= 2
          && longestEarlierLine >= lastLineWords + 3;

        textFindings.push({
          selector,
          text: element.textContent.trim(),
          lineWordCounts,
          hasOrphan,
        });
      }
    }

    return {
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      textFindings,
    };
  }, selectors);
}

let context;

try {
  context = await chromium.launchPersistentContext(profileDirectory, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${projectDirectory}`,
      `--load-extension=${projectDirectory}`,
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
  }

  const extensionId = new URL(serviceWorker.url()).host;
  assert(extensionId.length > 0, "Chrome did not assign an extension ID.");

  const popupPage = await context.newPage();
  collectErrors(popupPage, "Popup");
  await popupPage.setViewportSize({ width: 388, height: 600 });
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

  await waitForText(popupPage, "#site-count", "3");
  const defaultSiteNames = await popupPage.locator(".site-name").allTextContents();
  assert(
    defaultSiteNames.includes("LinkedIn"),
    "LinkedIn was not present in the default blocked list.",
  );
  assert(
    defaultSiteNames.includes("X (legacy)"),
    "The legacy X domain was not present in the default blocked list.",
  );
  await popupPage.waitForFunction(() => {
    const favicons = [...document.querySelectorAll("#site-list .site-favicon")];
    return favicons.length === 3
      && favicons.every((favicon) => favicon.complete && favicon.naturalWidth > 0);
  });
  const defaultFaviconUrls = await popupPage
    .locator("#site-list .site-favicon")
    .evaluateAll((favicons) => favicons.map((favicon) => favicon.src));
  assert(
    defaultFaviconUrls.every((faviconUrl) => faviconUrl.includes("/_favicon/")),
    "The blocked-site list did not use Chrome's native favicon source.",
  );

  await popupPage.locator("#focus-edit-button").click();
  await popupPage.waitForFunction(() => {
    return document.body.classList.contains("is-focus-view")
      && document.getElementById("focus-view")?.getAttribute("aria-hidden") === "false";
  });
  await popupPage.waitForTimeout(520);
  const initialGoalInputs = popupPage.locator("input[data-goal-input]");
  assert(
    await initialGoalInputs.count() === 3,
    "The focus page did not open with three objective rows.",
  );
  await initialGoalInputs.nth(0).fill("Finish the client proposal");
  await initialGoalInputs.nth(1).fill("Review the outreach pipeline");
  for (let goalIndex = 0; goalIndex < 4; goalIndex += 1) {
    await popupPage.locator("#add-goal-button").click();
  }
  await popupPage.waitForFunction(() => {
    return document.querySelectorAll("input[data-goal-input]").length === 7;
  });
  const unlimitedGoalValues = [
    "Plan tomorrow's priorities",
    "Send the project update",
    "Review this week's metrics",
    "Prepare the client call",
    "Clear the finance inbox",
  ];
  for (let goalIndex = 2; goalIndex < 7; goalIndex += 1) {
    await initialGoalInputs.nth(goalIndex).fill(unlimitedGoalValues[goalIndex - 2]);
  }
  assert(
    await initialGoalInputs.count() === 7,
    "The Focus Plan stopped accepting objectives after five rows.",
  );
  assert(
    !await popupPage.locator("#add-goal-button").isDisabled(),
    "The Add objective button became disabled after more than five rows.",
  );

  const focusPageAudit = await auditLayout(popupPage, [
    ".focus-page-intro h2",
    ".focus-page-intro > p:last-child",
    ".goal-field input",
    ".add-goal-button",
    ".save-focus-button",
  ]);
  assert(focusPageAudit.horizontalOverflow <= 0, "The focus page has horizontal overflow.");
  assert(
    focusPageAudit.textFindings.every((finding) => !finding.hasOrphan),
    "The focus page has an unbalanced text wrap.",
  );
  await popupPage.screenshot({
    path: path.join(projectDirectory, "artifacts", "focus-editor.png"),
    fullPage: true,
  });
  await popupPage.locator("#focus-form button[type='submit']").click();
  await waitForText(
    popupPage,
    "#focus-summary",
    "Finish the client proposal +6 more",
  );
  assert(
    await popupPage.locator("#focus-action-label").textContent() === "Edit",
    "The focus CTA did not preserve its label after saving.",
  );
  assert(
    !await popupPage.locator("body").evaluate((body) => body.classList.contains("is-focus-view")),
    "Saving focus did not return to the main popup screen.",
  );

  await popupPage.locator("#focus-edit-button").click();
  await popupPage.waitForFunction(() => document.body.classList.contains("is-focus-view"));
  await popupPage.locator("#focus-back-button").click();
  await popupPage.waitForFunction(() => !document.body.classList.contains("is-focus-view"));
  await waitForText(
    popupPage,
    "#focus-summary",
    "Finish the client proposal +6 more",
  );

  await popupPage.locator("#site-input").fill("https://www.reddit.com/r/all");
  await popupPage.locator("#add-site-form button[type='submit']").click();
  await waitForText(popupPage, "#site-count", "4");
  assert(
    await popupPage.locator("text=reddit.com").count() >= 1,
    "A manually added domain was not rendered.",
  );
  await popupPage.waitForFunction(() => {
    const redditFavicon = [...document.querySelectorAll("#site-list .site-favicon")]
      .find((favicon) => favicon.src.includes("reddit.com"));
    return Boolean(
      redditFavicon
      && redditFavicon.complete
      && redditFavicon.naturalWidth > 0,
    );
  });

  await popupPage.locator(".switch-track").click();
  await waitForText(popupPage, "#status-title", "Blocking is off");
  await popupPage.locator(".switch-track").click();
  await waitForText(popupPage, "#status-title", "Blocking is active");

  await popupPage.locator("#pause-button").click();
  await waitForText(popupPage, "#status-title", "Taking a short break");
  await waitForText(popupPage, "#status-detail", "2 min left");
  await popupPage.locator("#pause-button").click();
  await waitForText(popupPage, "#status-title", "Blocking is active");
  await popupPage.waitForTimeout(520);

  const popupAudit = await auditLayout(popupPage, [
    ".main-view h1",
    ".main-view h2",
    ".status-title",
    ".focus-summary",
    ".site-name",
  ]);
  assert(popupAudit.horizontalOverflow <= 0, "The popup has horizontal overflow.");
  assert(
    popupAudit.textFindings.every((finding) => !finding.hasOrphan),
    "The popup has an unbalanced text wrap.",
  );
  await popupPage.screenshot({
    path: path.join(projectDirectory, "artifacts", "popup.png"),
    fullPage: true,
  });

  const blockedPage = await context.newPage();
  collectErrors(blockedPage, "Blocked screen");
  await blockedPage.setViewportSize({ width: 1440, height: 900 });
  await blockedPage.goto("https://www.linkedin.com/feed/", {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });

  const blockedUrl = new URL(blockedPage.url());
  assert(
    blockedUrl.protocol === "chrome-extension:"
      && blockedUrl.host === extensionId
      && blockedUrl.pathname === "/blocked.html"
      && blockedUrl.searchParams.get("domain") === "linkedin.com",
    `LinkedIn was not attributed correctly. Chrome ended at ${blockedPage.url()}`,
  );
  await waitForText(blockedPage, "#blocked-title", "You came here on autopilot.");
  await waitForText(blockedPage, "#focus-reminder-title", "You said you would:");
  const blockedGoals = await blockedPage.locator("#focus-goal-list li").allTextContents();
  assert(
    blockedGoals.includes("Finish the client proposal"),
    "The first saved focus goal was not shown on the blocked screen.",
  );
  assert(
    blockedGoals.includes("Review the outreach pipeline"),
    "The second saved focus goal was not shown on the blocked screen.",
  );

  const blockedAudit = await auditLayout(blockedPage, [
    "h1",
    ".blocked-message",
    ".focus-reminder h2",
    ".focus-goal-list li",
    ".primary-button",
    ".secondary-button",
  ]);
  assert(blockedAudit.horizontalOverflow <= 0, "The blocked screen has horizontal overflow.");
  assert(
    blockedAudit.textFindings.every((finding) => !finding.hasOrphan),
    `The blocked screen has an unbalanced text wrap: ${JSON.stringify(blockedAudit.textFindings)}`,
  );
  await blockedPage.screenshot({
    path: path.join(projectDirectory, "artifacts", "blocked.png"),
    fullPage: true,
  });

  await waitForText(blockedPage, "#pause-button", "I need 2 minutes");
  await blockedPage.locator("#pause-button").click();
  await waitForText(
    blockedPage,
    "#break-challenge-title",
    "Do you really need this break?",
  );
  await waitForText(blockedPage, "#challenge-step-label", "Pause check 1 of 2");
  await blockedPage.waitForTimeout(500);
  const firstChallengeState = await blockedPage.evaluate(() => {
    return chrome.runtime.sendMessage({ type: "getState" });
  });
  assert(
    firstChallengeState.ok && !firstChallengeState.data.isPaused,
    "Blocking paused before the first reflection step was completed.",
  );
  await blockedPage.screenshot({
    path: path.join(projectDirectory, "artifacts", "break-challenge-1.png"),
    fullPage: true,
  });

  await blockedPage.locator("#challenge-continue-button").click();
  await blockedPage.waitForTimeout(250);
  assert(
    await blockedPage.locator("#break-challenge-title").textContent()
      === "Do you really need this break?",
    "A single click incorrectly completed the first hold step.",
  );
  await holdButton(blockedPage, "#challenge-continue-button", 650);
  assert(
    await blockedPage.locator("#break-challenge-title").textContent()
      === "Do you really need this break?",
    "An interrupted hold incorrectly completed the first reflection step.",
  );
  await holdButton(blockedPage, "#challenge-continue-button", 5_150);
  await waitForText(
    blockedPage,
    "#break-challenge-title",
    "What will these 2 minutes cost?",
  );
  await waitForText(blockedPage, "#challenge-step-label", "Pause check 2 of 2");
  await waitForText(
    blockedPage,
    "#challenge-hold-label",
    "Hold for 5 seconds to unlock the final check",
  );
  await blockedPage.waitForTimeout(500);
  const secondChallengeState = await blockedPage.evaluate(() => {
    return chrome.runtime.sendMessage({ type: "getState" });
  });
  assert(
    secondChallengeState.ok && !secondChallengeState.data.isPaused,
    "Blocking paused before the second reflection step was completed.",
  );
  await blockedPage.screenshot({
    path: path.join(projectDirectory, "artifacts", "break-challenge-2.png"),
    fullPage: true,
  });
  const challengeAudit = await auditLayout(blockedPage, [
    ".break-challenge h2",
    ".break-challenge-message",
    ".challenge-actions .primary-button",
    ".challenge-actions .secondary-button",
  ]);
  assert(challengeAudit.horizontalOverflow <= 0, "The break challenge has horizontal overflow.");
  assert(
    challengeAudit.textFindings.every((finding) => !finding.hasOrphan),
    `The break challenge has an unbalanced text wrap: ${JSON.stringify(challengeAudit.textFindings)}`,
  );

  await holdButton(blockedPage, "#challenge-continue-button", 5_150);
  await waitForText(blockedPage, "#challenge-step-label", "Final check");
  await waitForText(
    blockedPage,
    "#break-challenge-title",
    "One last intentional choice.",
  );
  const linkedInMiniChallenge = createBreakMiniChallenge("linkedin.com");
  await waitForText(
    blockedPage,
    "#mini-challenge-prompt",
    linkedInMiniChallenge.prompt,
  );
  await blockedPage.locator("#mini-challenge-answer").fill("999");
  await blockedPage.locator("#mini-challenge-submit").click();
  await waitForText(
    blockedPage,
    "#mini-challenge-feedback",
    "Not quite. Take another moment and try again.",
  );
  const stateAfterWrongAnswer = await blockedPage.evaluate(() => {
    return chrome.runtime.sendMessage({ type: "getState" });
  });
  assert(
    stateAfterWrongAnswer.ok
      && !stateAfterWrongAnswer.data.isPaused
      && !stateAfterWrongAnswer.data.hasSitePause
      && stateAfterWrongAnswer.data.pauseRemainingMs === 0,
    "An incorrect mini-challenge answer started the break.",
  );
  await blockedPage.setViewportSize({ width: 390, height: 844 });
  const miniChallengeMobileAudit = await auditLayout(blockedPage, [
    ".break-challenge h2",
    ".break-challenge-message",
    ".mini-challenge-prompt",
    ".mini-challenge-actions .primary-button",
    ".mini-challenge-actions .secondary-button",
  ]);
  assert(
    miniChallengeMobileAudit.horizontalOverflow <= 0,
    "The mini challenge has horizontal overflow on mobile.",
  );
  await blockedPage.screenshot({
    path: path.join(projectDirectory, "artifacts", "break-mini-challenge.png"),
    fullPage: true,
  });
  await blockedPage.setViewportSize({ width: 1440, height: 900 });
  await blockedPage
    .locator("#mini-challenge-answer")
    .fill(String(linkedInMiniChallenge.answer));
  await blockedPage.locator("#mini-challenge-submit").click();
  await blockedPage.waitForTimeout(500);
  const storedPause = await serviceWorker.evaluate(async () => {
    const settings = await chrome.storage.local.get([
      "pausedUntil",
      "pausedDomain",
      "analytics",
    ]);
    return {
      pauseRemainingMs: settings.pausedUntil - Date.now(),
      pausedDomain: settings.pausedDomain,
      analytics: settings.analytics,
    };
  });
  assert(
    storedPause.pauseRemainingMs > 0 && storedPause.pauseRemainingMs <= 120_000,
    `The approved break was not limited to 2 minutes: ${storedPause.pauseRemainingMs}ms remained.`,
  );
  assert(
    storedPause.pausedDomain === "linkedin.com",
    `The LinkedIn break was not site-specific: ${storedPause.pausedDomain}`,
  );
  assert(
    storedPause.analytics.totalBlockedAttempts === 1
      && storedPause.analytics.blockedByDomain["linkedin.com"] === 1,
    "The first LinkedIn block was not recorded in analytics.",
  );

  const xDuringLinkedInBreakPage = await context.newPage();
  collectErrors(xDuringLinkedInBreakPage, "X during LinkedIn break");
  await xDuringLinkedInBreakPage.goto("https://x.com/home", {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  const xDuringLinkedInBreakUrl = new URL(xDuringLinkedInBreakPage.url());
  assert(
    xDuringLinkedInBreakUrl.protocol === "chrome-extension:"
      && xDuringLinkedInBreakUrl.host === extensionId
      && xDuringLinkedInBreakUrl.pathname === "/blocked.html"
      && xDuringLinkedInBreakUrl.searchParams.get("domain") === "x.com",
    `A LinkedIn break incorrectly unblocked X. Chrome ended at ${xDuringLinkedInBreakPage.url()}`,
  );
  await waitForText(
    xDuringLinkedInBreakPage,
    "#blocked-title",
    "You came here on autopilot.",
  );
  await xDuringLinkedInBreakPage.waitForFunction(async () => {
    const response = await chrome.runtime.sendMessage({ type: "getState" });
    return response?.data?.analytics?.blockedByDomain?.["x.com"] === 1;
  });

  const analyticsPage = await context.newPage();
  collectErrors(analyticsPage, "Analytics popup");
  await analyticsPage.setViewportSize({ width: 388, height: 600 });
  await analyticsPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await waitForText(analyticsPage, "#status-title", "Blocking is active");
  const sitePauseState = await analyticsPage.evaluate(() => {
    return chrome.runtime.sendMessage({ type: "getState" });
  });
  assert(
    sitePauseState.ok
      && sitePauseState.data.hasSitePause
      && sitePauseState.data.pausedDomain === "linkedin.com"
      && !sitePauseState.data.isPaused,
    "The popup treated a LinkedIn-only break as a global pause.",
  );
  await analyticsPage.evaluate(() => {
    return chrome.runtime.sendMessage({ type: "resumeBlocking" });
  });
  await analyticsPage.reload();
  await waitForText(analyticsPage, "#status-title", "Blocking is active");

  const returnPage = await context.newPage();
  collectErrors(returnPage, "Return-to-focus screen");
  await returnPage.goto("https://www.linkedin.com/feed/", {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await waitForText(returnPage, "#blocked-title", "You came here on autopilot.");
  await waitForText(returnPage, "#focus-reminder-title", "You said you would:");
  await returnPage.locator("#go-back-button").click();
  await returnPage.waitForTimeout(300);

  await analyticsPage.reload();
  await waitForText(
    analyticsPage,
    "#analytics-launch-summary",
    "3 attempts · 5m saved",
  );
  assert(
    await analyticsPage.locator("#analytics-view").getAttribute("aria-hidden") === "true",
    "The analytics report was visible before its CTA was clicked.",
  );
  await analyticsPage.locator("#analytics-open-button").click();
  await analyticsPage.waitForFunction(() => {
    return document.body.classList.contains("is-analytics-view")
      && document.getElementById("analytics-view")?.getAttribute("aria-hidden") === "false";
  });
  await analyticsPage.waitForTimeout(520);
  await waitForText(analyticsPage, "#analytics-attempts", "3");
  await waitForText(analyticsPage, "#analytics-time-saved", "5m");
  await waitForText(analyticsPage, "#analytics-focus-returns", "1");
  await waitForText(analyticsPage, "#analytics-return-rate", "33%");
  const linkedInAnalytics = analyticsPage
    .locator(".analytics-domain-item")
    .filter({ hasText: "LinkedIn" });
  await linkedInAnalytics.locator(".analytics-domain-count").waitFor({ state: "visible" });
  assert(
    await linkedInAnalytics.locator(".analytics-domain-count").textContent() === "2 blocks",
    "The LinkedIn analytics row did not show two blocked attempts.",
  );
  assert(
    await linkedInAnalytics.locator(".analytics-domain-chart").getAttribute("aria-valuenow") === "67",
    "The LinkedIn attempt-share chart did not represent two of three recorded attempts.",
  );
  const analyticsAudit = await auditLayout(analyticsPage, [
    ".analytics-page-intro h2",
    ".analytics-page-intro > div:last-child > p:last-child",
    ".analytics-heading h2",
    ".analytics-stat > span:last-child",
    ".analytics-domain-item .site-name",
    ".analytics-domain-count",
    ".analytics-method",
  ]);
  assert(analyticsAudit.horizontalOverflow <= 0, "The analytics section has horizontal overflow.");
  assert(
    analyticsAudit.textFindings.every((finding) => !finding.hasOrphan),
    `The analytics section has an unbalanced text wrap: ${JSON.stringify(analyticsAudit.textFindings)}`,
  );
  await analyticsPage.screenshot({
    path: path.join(projectDirectory, "artifacts", "analytics.png"),
    fullPage: true,
  });
  await analyticsPage.locator("#analytics-back-button").click();
  await analyticsPage.waitForFunction(() => {
    return !document.body.classList.contains("is-analytics-view")
      && document.getElementById("analytics-view")?.getAttribute("aria-hidden") === "true";
  });
  await waitForText(
    analyticsPage,
    "#analytics-launch-summary",
    "3 attempts · 5m saved",
  );

  const xBareDomainPage = await context.newPage();
  collectErrors(xBareDomainPage, "X bare-domain block screen");
  await xBareDomainPage.goto("https://x.com", {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  const xBareDomainUrl = new URL(xBareDomainPage.url());
  assert(
    xBareDomainUrl.protocol === "chrome-extension:"
      && xBareDomainUrl.host === extensionId
      && xBareDomainUrl.pathname === "/blocked.html"
      && xBareDomainUrl.searchParams.get("domain") === "x.com",
    `The bare x.com domain was not blocked. Chrome ended at ${xBareDomainPage.url()}`,
  );
  await xBareDomainPage.close();

  const xBlockedPage = await context.newPage();
  collectErrors(xBlockedPage, "X blocked screen");
  await xBlockedPage.goto("https://x.com/home", {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  const xBlockedUrl = new URL(xBlockedPage.url());
  assert(
    xBlockedUrl.protocol === "chrome-extension:"
      && xBlockedUrl.host === extensionId
      && xBlockedUrl.pathname === "/blocked.html"
      && xBlockedUrl.searchParams.get("domain") === "x.com",
    `X was not attributed correctly. Chrome ended at ${xBlockedPage.url()}`,
  );
  await waitForText(xBlockedPage, "#focus-reminder-title", "You said you would:");
  await xBlockedPage.locator("#pause-button").click();
  await waitForText(
    xBlockedPage,
    "#break-challenge-message",
    "X can wait. Will opening it help the focus you chose, or pull you further away from it?",
  );
  const xChallengeMessage = await xBlockedPage
    .locator("#break-challenge-message")
    .textContent();
  assert(
    !xChallengeMessage.includes("LinkedIn"),
    "The X break challenge still displayed LinkedIn copy.",
  );

  const redditBlockedPage = await context.newPage();
  collectErrors(redditBlockedPage, "Reddit blocked screen");
  await redditBlockedPage.goto("https://www.reddit.com/r/all", {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  const redditBlockedUrl = new URL(redditBlockedPage.url());
  assert(
    redditBlockedUrl.protocol === "chrome-extension:"
      && redditBlockedUrl.host === extensionId
      && redditBlockedUrl.pathname === "/blocked.html"
      && redditBlockedUrl.searchParams.get("domain") === "reddit.com",
    `Reddit was not attributed correctly. Chrome ended at ${redditBlockedPage.url()}`,
  );
  await waitForText(redditBlockedPage, "#focus-reminder-title", "You said you would:");
  await redditBlockedPage.locator("#pause-button").click();
  await waitForText(
    redditBlockedPage,
    "#break-challenge-message",
    "Reddit can wait. Will opening it help the focus you chose, or pull you further away from it?",
  );

  await popupPage.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({
      type: "setEnabled",
      enabled: false,
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not disable blocking for the open-tab test.");
    }
  });
  const alreadyOpenXPage = await context.newPage();
  await alreadyOpenXPage.goto("https://x.com/home", {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  assert(
    new URL(alreadyOpenXPage.url()).hostname === "x.com",
    `The open-tab regression setup did not reach X: ${alreadyOpenXPage.url()}`,
  );
  await popupPage.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({
      type: "setEnabled",
      enabled: true,
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not re-enable blocking for the open-tab test.");
    }
  });
  await waitForText(alreadyOpenXPage, "#blocked-title", "You came here on autopilot.");
  const alreadyOpenXUrl = new URL(alreadyOpenXPage.url());
  assert(
    alreadyOpenXUrl.protocol === "chrome-extension:"
      && alreadyOpenXUrl.host === extensionId
      && alreadyOpenXUrl.pathname === "/blocked.html"
      && alreadyOpenXUrl.searchParams.get("domain") === "x.com",
    `Re-enabling blocking did not redirect an already-open X tab: ${alreadyOpenXPage.url()}`,
  );

  assert(browserErrors.length === 0, browserErrors.join("\n"));

  console.log(JSON.stringify({
    extensionId,
    checks: {
      defaultDomains: true,
      nativeWebsiteFavicons: true,
      focusGoalSave: true,
      unlimitedFocusGoals: true,
      focusPageNavigation: true,
      focusBackNavigation: true,
      blockedGoalReminder: true,
      twoStepBreakChallenge: true,
      fiveSecondHoldSteps: true,
      breakMiniChallenge: true,
      breakMiniChallengeMobileLayout: true,
      twoMinuteBreakLimit: true,
      siteScopedBreak: true,
      alreadyOpenTabEnforcement: true,
      analyticsByDomain: true,
      estimatedTimeSaved: true,
      focusReturnTracking: true,
      analyticsPageNavigation: true,
      analyticsBackNavigation: true,
      analyticsHorizontalOverflow: analyticsAudit.horizontalOverflow,
      addDomain: true,
      enableToggle: true,
      timedPause: true,
      linkedinRedirect: true,
      dynamicBlockedSiteCopy: true,
      genericBlockedSiteLabels: true,
      consoleErrors: 0,
      popupHorizontalOverflow: popupAudit.horizontalOverflow,
      focusPageHorizontalOverflow: focusPageAudit.horizontalOverflow,
      blockedHorizontalOverflow: blockedAudit.horizontalOverflow,
      textWrapAudit: "passed",
    },
  }, null, 2));
} finally {
  if (context) {
    await context.close();
  }
  await rm(profileDirectory, { recursive: true, force: true });
}
