// Loads the packaged ZIP into Chrome exactly as a user would, so a packaging
// mistake (a missing runtime file, a broken manifest) is caught before upload
// rather than by the store review.
//
// Run with: npm run verify:package

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { chromium } from "playwright";

const run = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");

const manifest = JSON.parse(
  await readFile(path.join(projectDirectory, "manifest.json"), "utf8"),
);
const zipPath = path.join(
  projectDirectory,
  "artifacts",
  `scrolling-stop-extension-v${manifest.version}.zip`,
);

const workingDirectory = await mkdtemp(path.join(os.tmpdir(), "scrolling-stop-pkg-"));
const extensionDirectory = path.join(workingDirectory, "extension");
const profileDirectory = path.join(workingDirectory, "profile");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

let context;
const consoleErrors = [];

try {
  await run("unzip", ["-q", zipPath, "-d", extensionDirectory]);

  context = await chromium.launchPersistentContext(profileDirectory, {
    channel: "chromium",
    headless: true,
    viewport: { width: 388, height: 600 },
    args: [
      `--disable-extensions-except=${extensionDirectory}`,
      `--load-extension=${extensionDirectory}`,
    ],
  });

  const serviceWorker = context.serviceWorkers()[0]
    || await context.waitForEvent("serviceworker", { timeout: 15_000 });
  const extensionId = new URL(serviceWorker.url()).host;

  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "load" });
  await page.locator("#site-count").waitFor({ state: "visible", timeout: 10_000 });

  const state = await page.evaluate(async () => {
    const stored = await chrome.storage.local.get(["blockedDomains", "telemetry"]);
    const loadedManifest = chrome.runtime.getManifest();
    return {
      name: loadedManifest.name,
      version: loadedManifest.version,
      blockedDomains: stored.blockedDomains,
      telemetry: stored.telemetry,
      hasUsageToggle: Boolean(document.getElementById("telemetry-toggle")),
      usageToggleChecked: document.getElementById("telemetry-toggle")?.checked,
    };
  });

  assert(state.name === "Scrolling Stop", `Packaged name is "${state.name}".`);
  assert(state.version === manifest.version, "Packaged version does not match the manifest.");
  assert(Array.isArray(state.blockedDomains) && state.blockedDomains.length > 0,
    "The packaged build did not apply its default blocked list.");
  assert(state.hasUsageToggle, "The usage-stats toggle is missing from the packaged build.");
  assert(state.usageToggleChecked === true, "Usage stats did not default to on.");
  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(" | ")}`);

  console.log(JSON.stringify({
    zip: path.relative(projectDirectory, zipPath),
    loadsInChrome: true,
    ...state,
    consoleErrors: consoleErrors.length,
  }, null, 2));
} finally {
  await context?.close();
  await rm(workingDirectory, { recursive: true, force: true });
}
