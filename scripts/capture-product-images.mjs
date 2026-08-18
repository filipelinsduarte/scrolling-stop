import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(projectDirectory, "docs", "screenshots");
const profileDirectory = await mkdtemp(
  path.join(os.tmpdir(), "scroll-stop-product-images-"),
);

const captureSettings = {
  enabled: true,
  blockedDomains: ["linkedin.com", "x.com", "twitter.com"],
  focusGoals: [
    "Finish the client proposal",
    "Review the outreach pipeline",
    "Plan tomorrow's priorities",
  ],
  pausedUntil: 0,
  pausedDomain: null,
  analytics: {
    totalBlockedAttempts: 19,
    focusReturns: 8,
    estimatedMinutesSaved: 40,
    blockedByDomain: {
      "linkedin.com": 10,
      "x.com": 6,
      "twitter.com": 3,
    },
  },
};

async function waitForPopup(page) {
  await page.locator("#site-count").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    return [...document.images].every((image) => image.complete);
  });
  await page.waitForTimeout(560);
}

async function warmFaviconCache(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await page.waitForTimeout(1_200);
  } catch (error) {
    console.warn(`[Scrolling Stop] Could not warm favicon cache for ${url}`, error.message);
  } finally {
    await page.close();
  }
}

let context;

try {
  context = await chromium.launchPersistentContext(profileDirectory, {
    channel: "chromium",
    headless: true,
    viewport: { width: 388, height: 600 },
    deviceScaleFactor: 2,
    args: [
      `--disable-extensions-except=${projectDirectory}`,
      `--load-extension=${projectDirectory}`,
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", {
      timeout: 10_000,
    });
  }

  const extensionId = new URL(serviceWorker.url()).host;
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const popupPage = await context.newPage();

  await popupPage.goto(popupUrl, { waitUntil: "load" });
  await popupPage.evaluate(async () => {
    await chrome.storage.local.set({
      enabled: false,
      pausedUntil: 0,
      pausedDomain: null,
    });
  });

  await warmFaviconCache(context, "https://www.linkedin.com/");
  await warmFaviconCache(context, "https://x.com/");
  await warmFaviconCache(context, "https://twitter.com/");

  await popupPage.evaluate(async (settings) => {
    await chrome.storage.local.set(settings);
  }, captureSettings);
  await popupPage.reload({ waitUntil: "load" });
  await waitForPopup(popupPage);

  await popupPage.screenshot({
    path: path.join(outputDirectory, "main-popup.png"),
  });

  await popupPage.locator("#focus-edit-button").click();
  await popupPage.waitForFunction(() => {
    return document.body.classList.contains("is-focus-view");
  });
  await popupPage.locator("#focus-view").evaluate((element) => {
    element.scrollTop = 0;
  });
  await popupPage.waitForTimeout(560);
  await popupPage.screenshot({
    path: path.join(outputDirectory, "focus-plan.png"),
  });

  await popupPage.locator("#focus-back-button").click();
  await popupPage.waitForFunction(() => {
    return !document.body.classList.contains("is-focus-view");
  });
  await popupPage.locator("#analytics-open-button").click();
  await popupPage.waitForFunction(() => {
    return document.body.classList.contains("is-analytics-view");
  });
  await popupPage.locator("#analytics-view").evaluate((element) => {
    element.scrollTop = 0;
  });
  await popupPage.waitForTimeout(560);
  await popupPage.screenshot({
    path: path.join(outputDirectory, "attention-report.png"),
  });

  console.log(JSON.stringify({
    outputDirectory,
    dimensions: "776x1200",
    screenshots: [
      "main-popup.png",
      "focus-plan.png",
      "attention-report.png",
    ],
  }, null, 2));
} finally {
  await context?.close();
  await rm(profileDirectory, { recursive: true, force: true });
}
