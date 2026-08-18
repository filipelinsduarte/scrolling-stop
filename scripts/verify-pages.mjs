// Browser verification for the privacy and uninstall pages against a live
// deployment. Requests to Google Analytics are blocked, so the run proves our
// own code fires the right events without writing test data into the property.
//
// Run with: npm run verify:pages -- https://scrollingstop.com

import { chromium } from "playwright";

const baseUrl = (process.argv[2] || "https://scrollingstop.com").replace(/\/$/, "");
const CLIENT_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const browser = await chromium.launch();
const results = {};

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Nothing reaches Google. The inline gtag stub still pushes to dataLayer,
  // which is what the assertions below read.
  await context.route("**://*.googletagmanager.com/**", (route) => route.abort());
  await context.route("**://*.google-analytics.com/**", (route) => route.abort());

  // ---------- privacy page ----------
  const privacy = await context.newPage();
  const privacyErrors = [];
  privacy.on("pageerror", (error) => privacyErrors.push(String(error)));
  privacy.on("console", (message) => {
    if (message.type() === "error" && !/googletagmanager|google-analytics|ERR_FAILED/i.test(message.text())) {
      privacyErrors.push(message.text());
    }
  });

  await privacy.goto(`${baseUrl}/privacy`, { waitUntil: "load" });
  const privacyInfo = await privacy.evaluate(() => ({
    title: document.title,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    sections: document.querySelectorAll(".doc-card").length,
    stylesheetApplied: getComputedStyle(document.body).fontFamily.includes("Avenir"),
    hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  assert(privacyInfo.sections >= 5, `Privacy page rendered ${privacyInfo.sections} sections.`);
  assert(privacyInfo.stylesheetApplied, "Privacy page stylesheet did not load.");
  assert(privacyInfo.hOverflow === 0, `Privacy page overflows by ${privacyInfo.hOverflow}px.`);
  assert(privacyErrors.length === 0, `Privacy page errors: ${privacyErrors.join(" | ")}`);
  results.privacy = { ...privacyInfo, consoleErrors: 0 };

  // ---------- uninstall page ----------
  const exit = await context.newPage();
  const exitErrors = [];
  exit.on("pageerror", (error) => exitErrors.push(String(error)));
  exit.on("console", (message) => {
    if (message.type() === "error" && !/googletagmanager|google-analytics|ERR_FAILED/i.test(message.text())) {
      exitErrors.push(message.text());
    }
  });

  await exit.goto(`${baseUrl}/uninstalled?cid=${CLIENT_ID}&v=1.5.6`, { waitUntil: "load" });
  await exit.waitForTimeout(600);

  function readEvents(page) {
    return page.evaluate(() => (window.dataLayer || [])
      .map((entry) => Array.from(entry))
      .filter((entry) => entry[0] === "event")
      .map((entry) => ({ name: entry[1], params: entry[2] })));
  }

  const afterLoad = await readEvents(exit);
  const uninstallEvent = afterLoad.find((event) => event.name === "extension_uninstall");
  assert(uninstallEvent, "The uninstall event did not fire on page load.");
  assert(uninstallEvent.params.anonymous_id === CLIENT_ID,
    "The uninstall event did not carry the anonymous id from the query string.");
  assert(uninstallEvent.params.extension_version === "1.5.6",
    "The uninstall event did not carry the version.");

  // A forged query string must not be echoed into analytics.
  const forged = await context.newPage();
  await forged.goto(`${baseUrl}/uninstalled?cid=<script>alert(1)</script>&v=${"x".repeat(80)}`, {
    waitUntil: "load",
  });
  await forged.waitForTimeout(500);
  const forgedEvent = (await readEvents(forged))
    .find((event) => event.name === "extension_uninstall");
  assert(forgedEvent.params.anonymous_id === "",
    `A malformed client id was accepted: ${forgedEvent.params.anonymous_id}`);
  assert(forgedEvent.params.extension_version.length <= 20,
    "An oversized version string was not truncated.");
  await forged.close();

  // ---------- exit reason interaction ----------
  await exit.locator('.exit-reason[data-reason="too_strict"]').click();
  await exit.waitForTimeout(400);

  const afterClick = await readEvents(exit);
  const reasonEvents = afterClick.filter((event) => event.name === "extension_uninstall_reason");
  assert(reasonEvents.length === 1, `Expected 1 reason event, got ${reasonEvents.length}.`);
  assert(reasonEvents[0].params.exit_reason === "too_strict",
    "The reason event carried the wrong reason.");

  const uiState = await exit.evaluate(() => ({
    thanksVisible: !document.getElementById("exit-thanks").hidden,
    allDisabled: [...document.querySelectorAll(".exit-reason")].every((b) => b.disabled),
    chosen: document.querySelectorAll(".exit-reason.is-chosen").length,
  }));
  assert(uiState.thanksVisible, "The thank-you message did not appear.");
  assert(uiState.allDisabled, "The reason buttons stayed clickable after answering.");
  assert(uiState.chosen === 1, "The chosen reason was not highlighted.");

  // Clicking a second reason must not record a second answer.
  await exit.locator('.exit-reason[data-reason="other"]').click({ force: true });
  await exit.waitForTimeout(300);
  const afterSecond = (await readEvents(exit))
    .filter((event) => event.name === "extension_uninstall_reason");
  assert(afterSecond.length === 1, `A second answer was recorded (${afterSecond.length} total).`);

  assert(exitErrors.length === 0, `Uninstall page errors: ${exitErrors.join(" | ")}`);
  results.uninstalled = {
    uninstallEventFired: true,
    anonymousIdPassedThrough: true,
    forgedClientIdRejected: true,
    oversizedVersionTruncated: true,
    reasonRecordedOnce: true,
    doubleAnswerBlocked: true,
    consoleErrors: 0,
  };

  console.log(JSON.stringify({ baseUrl, ...results }, null, 2));
} finally {
  await browser.close();
}
