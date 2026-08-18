// Generates every image the Chrome Web Store listing needs, so the assets can
// be regenerated after a UI change instead of being re-cropped by hand.
//
//   docs/store/screenshot-*.png   1280x800, up to five allowed by the store
//   docs/store/promo-small.png    440x280, the small promo tile
//
// Run with: npm run store:assets

import { mkdir, rm, readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(projectDirectory, "docs", "store");
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "scrolling-stop-store-"));

const SHOWCASE_SETTINGS = {
  enabled: true,
  blockedDomains: ["linkedin.com", "x.com", "twitter.com"],
  focusGoals: [
    "Finish the client proposal",
    "Review the outreach pipeline",
    "Plan tomorrow's priorities",
  ],
  pausedUntil: 0,
  pausedDomain: null,
  pausedDomains: {},
  telemetry: { enabled: true, clientId: "", reportedVersion: "" },
  analytics: {
    totalBlockedAttempts: 19,
    focusReturns: 8,
    estimatedMinutesSaved: 40,
    blockedByDomain: { "linkedin.com": 10, "x.com": 6, "twitter.com": 3 },
  },
};

// Headline plus supporting line for each store screenshot. Every supporting
// line is written to a similar length so the frames stay visually consistent.
const FRAMES = [
  {
    file: "screenshot-1-1280x800.png",
    proofs: ["Any website, added in one step", "Chrome does the blocking itself", "Your list never leaves the browser"],
    headline: "Block the sites that pull you in.",
    support: "Add any website in one step. Chrome enforces the block itself, so nothing you browse is ever observed.",
  },
  {
    file: "screenshot-2-1280x800.png",
    proofs: ["Two timed holds, not one click", "A small calculation to finish", "Breaks expire on their own"],
    headline: "A real pause, not a one-click bypass.",
    support: "Two timed holds and a small calculation stand between you and the feed, long enough for the urge to pass.",
  },
  {
    file: "screenshot-3-1280x800.png",
    proofs: ["Write as many goals as you need", "Shown the moment you drift", "Edited any time, in two clicks"],
    headline: "Your own goals, at the moment you drift.",
    support: "Write what actually matters today. It comes back on screen exactly when attention starts to wander off.",
  },
  {
    file: "screenshot-4-1280x800.png",
    proofs: ["Attempts counted per website", "Focus returns tracked over time", "Stored on your machine only"],
    headline: "See how often you chose focus.",
    support: "Every blocked attempt and every return is counted on your machine, and none of it leaves your browser.",
  },
];

function framePage({ headline, support, proofs, shotDataUri, version }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root {
      --white:#ffffff; --warm:#fbfaf9; --ink:#343433; --gray:#747484;
      --blue:#1a88f8; --blue-dark:#0f6ac9; --stone:#f2ebe0; --tan-soft:rgba(178,167,154,.34);
      --round: ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold","Avenir Next",Avenir,sans-serif;
      --sans:"Avenir Next",Avenir,ui-rounded,"Segoe UI",sans-serif;
    }
    *{box-sizing:border-box;margin:0}
    body{width:1280px;height:800px;display:flex;align-items:center;gap:64px;
      padding:0 76px;background:var(--warm);font-family:var(--sans);color:var(--ink);
      overflow:hidden}
    .copy{flex:1 1 0;min-width:0}
    .brand{display:inline-flex;align-items:center;gap:12px;margin-bottom:26px;
      font-family:var(--round);font-size:22px;font-weight:700;letter-spacing:-.035em}
    .mark{display:inline-flex;width:38px;height:38px;align-items:center;justify-content:center;
      gap:5px;border-radius:12px;background:linear-gradient(160deg,var(--blue),var(--blue-dark))}
    .mark span{display:block;width:5px;height:17px;border-radius:3px;background:var(--white)}
    h1{font-family:var(--round);font-size:52px;line-height:1.08;letter-spacing:-.04em;
      text-wrap:balance}
    p{margin-top:22px;max-width:30ch;color:var(--gray);font-size:21px;line-height:1.5;
      text-wrap:pretty}
    .proof{margin-top:26px;padding:0;list-style:none;display:flex;flex-direction:column;gap:11px}
    .proof li{display:flex;align-items:center;gap:11px;font-family:var(--round);
      font-size:17px;font-weight:700;color:var(--ink);white-space:nowrap}
    .proof li::before{content:"";flex:0 0 auto;width:19px;height:19px;border-radius:50%;
      background:var(--blue) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E") center/12px no-repeat}
    .ver{display:inline-block;margin-top:28px;padding:8px 16px;border-radius:999px;
      background:var(--stone);color:var(--ink);font-family:var(--round);font-size:15px;
      font-weight:700}
    .shot{flex:0 0 auto;display:flex;align-items:center;justify-content:center;
      width:436px;height:674px;border-radius:28px;background:var(--white);
      border:2px solid var(--tan-soft);
      box-shadow:0 10px 0 rgba(178,167,154,.18),0 26px 54px rgba(52,52,51,.12);overflow:hidden}
    .shot img{display:block;width:100%;height:100%;object-fit:contain;object-position:center}
  </style></head><body>
    <div class="copy">
      <div class="brand"><span class="mark"><span></span><span></span></span>Scrolling Stop</div>
      <h1>${headline}</h1>
      <p>${support}</p>
      <ul class="proof">${proofs.map((item) => `<li>${item}</li>`).join("")}</ul>
      <span class="ver">Free and open source, v${version}</span>
    </div>
    <div class="shot"><img src="${shotDataUri}" alt=""></div>
  </body></html>`;
}

function promoPage({ version }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{--white:#fff;--ink:#343433;--blue:#1a88f8;--blue-dark:#0f6ac9;--warm:#fbfaf9;
      --round: ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold","Avenir Next",Avenir,sans-serif}
    *{box-sizing:border-box;margin:0}
    body{width:440px;height:280px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:14px;padding:26px;
      background:linear-gradient(155deg,#ffffff 0%,var(--warm) 55%,#eef6ff 100%);
      font-family:var(--round);color:var(--ink);text-align:center;overflow:hidden}
    .mark{display:inline-flex;width:60px;height:60px;align-items:center;justify-content:center;
      gap:7px;border-radius:19px;background:linear-gradient(160deg,var(--blue),var(--blue-dark));
      box-shadow:0 8px 20px rgba(26,136,248,.35)}
    .mark span{display:block;width:8px;height:27px;border-radius:4px;background:var(--white)}
    h1{font-size:31px;line-height:1.12;letter-spacing:-.04em}
    h1 em{display:block;font-style:normal;color:var(--blue-dark)}
    p{font-size:14px;font-weight:700;color:#747484;letter-spacing:.01em}
  </style></head><body>
    <span class="mark"><span></span><span></span></span>
    <h1>Stop the scroll.<em>Return to focus.</em></h1>
    <p>Free and open source, v${version}</p>
  </body></html>`;
}


// Chrome's favicon cache is empty in a fresh headless profile, so the popup
// falls back to a generic globe next to "LinkedIn" and "X". A real user who
// has visited those sites sees the real marks, so the store assets show the
// real marks too, inlined as SVG rather than fetched.
function svgDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const LINKEDIN_MARK = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0A66C2"/><path fill="#fff" d="M11.6 12.9H8.4V24h3.2V12.9Zm.2-3.2a1.9 1.9 0 1 0-3.7 0 1.9 1.9 0 0 0 3.7 0ZM24 17.6c0-3.1-1.7-4.6-3.9-4.6-1.8 0-2.6 1-3.1 1.7v-1.8h-3.2V24H17v-6.2c0-1.4.8-2.1 1.9-2.1s1.9.7 1.9 2.1V24H24v-6.4Z"/></svg>`,
);

const X_MARK = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#000"/><path fill="#fff" d="M18.9 14.2 25 7.2h-1.5l-5.3 6.1-4.2-6.1H9l6.4 9.3L9 24h1.5l5.6-6.4 4.5 6.4h4.9l-6.6-9.8Zm-2 2.3-.6-.9-5.1-7.3h2.2l4.2 6 .6.9 5.4 7.7h-2.2l-4.5-6.4Z"/></svg>`,
);

const BRAND_MARKS = {
  "linkedin.com": LINKEDIN_MARK,
  "x.com": X_MARK,
  "twitter.com": X_MARK,
};

async function applyBrandMarks(page) {
  const applied = await page.evaluate((marks) => {
    let count = 0;
    for (const identity of document.querySelectorAll(".site-identity")) {
      const domain = identity.querySelector(".site-domain")?.textContent?.trim() || "";
      const uri = marks[domain];
      const image = identity.querySelector(".site-favicon");
      const wrapper = identity.querySelector(".site-icon-favicon");
      if (!uri || !image || !wrapper) {
        continue;
      }

      // The wrapper only reveals the image once it has loaded, and the
      // fallback globe stays visible otherwise, so both are handled here.
      image.hidden = false;
      image.src = uri;
      wrapper.classList.add("has-favicon");
      count += 1;
    }
    return count;
  }, BRAND_MARKS);

  await page.waitForTimeout(320);
  console.log(`[Scrolling Stop] Applied ${applied} brand mark(s).`);
  return applied;
}

function marqueePage({ version, shotDataUri }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{--white:#fff;--warm:#fbfaf9;--ink:#343433;--gray:#747484;
      --blue:#1a88f8;--blue-dark:#0f6ac9;--stone:#f2ebe0;--tan-soft:rgba(178,167,154,.34);
      --round: ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold","Avenir Next",Avenir,sans-serif;
      --sans:"Avenir Next",Avenir,ui-rounded,"Segoe UI",sans-serif}
    *{box-sizing:border-box;margin:0}
    body{width:1400px;height:560px;display:flex;align-items:center;gap:70px;
      padding:0 82px;background:linear-gradient(155deg,#ffffff 0%,var(--warm) 58%,#eef6ff 100%);
      font-family:var(--sans);color:var(--ink);overflow:hidden}
    .copy{flex:1 1 0;min-width:0}
    .brand{display:inline-flex;align-items:center;gap:13px;margin-bottom:22px;
      font-family:var(--round);font-size:25px;font-weight:700;letter-spacing:-.035em}
    .mark{display:inline-flex;width:44px;height:44px;align-items:center;justify-content:center;
      gap:6px;border-radius:14px;background:linear-gradient(160deg,var(--blue),var(--blue-dark))}
    .mark span{display:block;width:6px;height:20px;border-radius:3px;background:var(--white)}
    h1{font-family:var(--round);font-size:60px;line-height:1.06;letter-spacing:-.04em}
    h1 em{font-style:normal;color:var(--blue-dark)}
    p{margin-top:20px;max-width:34ch;color:var(--gray);font-size:22px;line-height:1.45;
      text-wrap:pretty}
    .ver{display:inline-block;margin-top:26px;padding:9px 18px;border-radius:999px;
      background:var(--stone);font-family:var(--round);font-size:16px;font-weight:700}
    .shot{flex:0 0 auto;display:flex;align-items:flex-start;justify-content:center;
      width:340px;height:526px;border-radius:26px 26px 0 0;background:var(--white);
      border:2px solid var(--tan-soft);border-bottom:0;
      box-shadow:0 -6px 40px rgba(52,52,51,.1);overflow:hidden}
    .shot img{display:block;width:100%;height:auto}
  </style></head><body>
    <div class="copy">
      <div class="brand"><span class="mark"><span></span><span></span></span>Scrolling Stop</div>
      <h1>Stop the scroll.<br><em>Return to focus.</em></h1>
      <p>Block the sites that pull you in, and get your own goals back at the moment attention drifts.</p>
      <span class="ver">Free and open source, v${version}</span>
    </div>
    <div class="shot"><img src="${shotDataUri}" alt=""></div>
  </body></html>`;
}

async function waitForPopup(page) {
  await page.locator("#site-count").waitFor({ state: "visible" });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await page.waitForTimeout(560);
}

async function warmFavicon(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1_200);
  } catch (error) {
    console.warn(`[Scrolling Stop] Favicon warm-up skipped for ${url}: ${error.message}`);
  } finally {
    await page.close();
  }
}

async function toDataUri(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// The context renders at 2x so text stays crisp, but the Chrome Web Store
// rejects anything that is not exactly the required size, so each asset is
// captured large and then resized down to the exact pixel dimensions.
async function writeExact(buffer, file, width, height) {
  await sharp(buffer)
    .resize(width, height, { fit: "fill" })
    .flatten({ background: "#fbfaf9" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDirectory, file));
}

let context;

try {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const manifest = JSON.parse(await readFile(path.join(projectDirectory, "manifest.json"), "utf8"));
  const version = manifest.version;

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
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "load" });

  await popupPage.evaluate(async () => {
    await chrome.storage.local.set({ enabled: false, pausedUntil: 0, pausedDomain: null });
  });
  await popupPage.waitForTimeout(400);

  await warmFavicon(context, "https://www.linkedin.com/");
  await warmFavicon(context, "https://x.com/");
  await warmFavicon(context, "https://twitter.com/");

  await popupPage.evaluate(async (settings) => {
    await chrome.storage.local.set(settings);
  }, SHOWCASE_SETTINGS);
  await popupPage.reload({ waitUntil: "load" });
  await waitForPopup(popupPage);
  await applyBrandMarks(popupPage);

  const shots = [];
  shots.push(await popupPage.screenshot({ fullPage: true }));

  // The blocked page, captured at popup proportions so every frame lines up.
  const blockedPage = await context.newPage();
  // The blocked page is a full browser page rather than a popup, so it is
  // captured at the frame's own aspect ratio instead of the popup's. A
  // mismatch here shows up as white bars down both sides of the frame.
  await blockedPage.setViewportSize({ width: 524, height: 810 });
  await blockedPage.goto(
    `chrome-extension://${extensionId}/blocked.html?domain=linkedin.com`,
    { waitUntil: "load" },
  );
  await blockedPage.waitForTimeout(900);
  shots.push(await blockedPage.screenshot());
  await blockedPage.close();

  await popupPage.locator("#focus-edit-button").click();
  await popupPage.waitForFunction(() => document.body.classList.contains("is-focus-view"));
  await popupPage.locator("#focus-view").evaluate((element) => { element.scrollTop = 0; });
  await popupPage.waitForTimeout(560);
  shots.push(await popupPage.screenshot({ fullPage: true }));

  await popupPage.locator("#focus-back-button").click();
  await popupPage.waitForFunction(() => !document.body.classList.contains("is-focus-view"));
  await popupPage.locator("#analytics-open-button").click();
  await popupPage.waitForFunction(() => document.body.classList.contains("is-analytics-view"));
  await popupPage.locator("#analytics-view").evaluate((element) => { element.scrollTop = 0; });
  await popupPage.waitForTimeout(560);
  await applyBrandMarks(popupPage);
  shots.push(await popupPage.screenshot({ fullPage: true }));

  const canvas = await context.newPage();
  await canvas.setViewportSize({ width: 1280, height: 800 });

  const written = [];
  for (const [index, frame] of FRAMES.entries()) {
    await canvas.setContent(framePage({
      ...frame,
      version,
      shotDataUri: await toDataUri(shots[index]),
    }), { waitUntil: "load" });
    await canvas.waitForTimeout(320);
    await writeExact(await canvas.screenshot(), frame.file, 1280, 800);
    written.push(frame.file);
  }

  await canvas.setViewportSize({ width: 440, height: 280 });
  await canvas.setContent(promoPage({ version }), { waitUntil: "load" });
  await canvas.waitForTimeout(240);
  await writeExact(await canvas.screenshot(), "small-promo-tile-440x280.png", 440, 280);
  written.push("small-promo-tile-440x280.png");

  await canvas.setViewportSize({ width: 1400, height: 560 });
  await canvas.setContent(marqueePage({
    version,
    shotDataUri: await toDataUri(shots[0]),
  }), { waitUntil: "load" });
  await canvas.waitForTimeout(320);
  await writeExact(await canvas.screenshot(), "marquee-promo-tile-1400x560.png", 1400, 560);
  written.push("marquee-promo-tile-1400x560.png");

  // The shipped icon carries transparency, which the store rejects for some
  // slots, so a flattened copy is written alongside it.
  await sharp(path.join(projectDirectory, "images", "icon-blue-v2-128.png"))
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDirectory, "store-icon-128x128.png"));
  written.push("store-icon-128x128.png");

  console.log(JSON.stringify({
    outputDirectory: path.relative(projectDirectory, outputDirectory),
    version,
    screenshots: "1280x800",
    promoTile: "440x280",
    written,
  }, null, 2));
} finally {
  await context?.close();
  await rm(profileDirectory, { recursive: true, force: true });
}
