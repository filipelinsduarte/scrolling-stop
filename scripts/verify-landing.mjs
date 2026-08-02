import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const landingPagePath = path.join(projectDirectory, "docs", "index.html");
const downloadPath = path.join(
  projectDirectory,
  "docs",
  "downloads",
  "scrolling-stop-extension-v1.5.3.zip",
);
const artifactDirectory = path.join(projectDirectory, "artifacts");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function auditViewport(page, viewport, screenshotName) {
  await page.setViewportSize(viewport);
  await page.reload({ waitUntil: "load" });
  await page.locator("img").evaluateAll((images) => {
    images.forEach((image) => {
      image.loading = "eager";
    });
  });
  await page.evaluate(async () => {
    const stepSize = Math.max(320, Math.floor(window.innerHeight * 0.75));
    for (let scrollPosition = 0; scrollPosition < document.body.scrollHeight; scrollPosition += stepSize) {
      window.scrollTo(0, scrollPosition);
      await new Promise((resolve) => window.setTimeout(resolve, 45));
    }
    document.querySelectorAll(".reveal").forEach((element) => {
      element.classList.add("is-visible");
    });
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => {
    return [...document.images].every((image) => image.complete && image.naturalWidth > 0);
  });
  await page.waitForTimeout(250);

  const audit = await page.evaluate(() => {
    function measureLastLineWords(element) {
      if (!element) {
        return 0;
      }

      const range = document.createRange();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const lineTops = [];
      const lineWordCounts = [];
      let textNode = walker.nextNode();

      while (textNode) {
        const words = [...textNode.textContent.matchAll(/\S+/g)];
        words.forEach((word) => {
          range.setStart(textNode, word.index);
          range.setEnd(textNode, word.index + word[0].length);
          const top = Math.round(range.getBoundingClientRect().top);
          const existingLineIndex = lineTops.findIndex((lineTop) => Math.abs(lineTop - top) <= 3);

          if (existingLineIndex >= 0) {
            lineWordCounts[existingLineIndex] += 1;
            return;
          }

          lineTops.push(top);
          lineWordCounts.push(1);
        });
        textNode = walker.nextNode();
      }

      return lineWordCounts.at(-1) ?? 0;
    }

    const documentElement = document.documentElement;
    const heroHeading = document.querySelector(".hero h1");
    const heroHeadingStyle = heroHeading ? window.getComputedStyle(heroHeading) : null;
    const heroHeadingCanvas = document.createElement("canvas");
    const heroHeadingContext = heroHeadingCanvas.getContext("2d");
    if (heroHeadingContext && heroHeadingStyle) {
      heroHeadingContext.font = heroHeadingStyle.font;
    }
    const navActions = document.querySelector(".nav-actions");
    const downloadButton = document.querySelector(".nav-download");
    const githubButton = document.querySelector(".nav-github");
    const chromeMark = downloadButton?.querySelector(".chrome-mark");
    const productImage = document.querySelector(".product-card img");
    const galleryFrames = [...document.querySelectorAll(".screen-shot")];
    const galleryImages = [...document.querySelectorAll(".screen-shot img")];
    const productScreenshotImages = [productImage, ...galleryImages].filter(Boolean);
    const images = [...document.images].map((image) => ({
      alt: image.alt,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
    }));

    return {
      horizontalOverflow: documentElement.scrollWidth - documentElement.clientWidth,
      navActionsVisible: Boolean(navActions && navActions.getBoundingClientRect().height > 0),
      downloadVisible: Boolean(downloadButton && downloadButton.getBoundingClientRect().width > 0),
      githubVisible: Boolean(githubButton && githubButton.getBoundingClientRect().width > 0),
      chromeMarkVisible: Boolean(chromeMark && chromeMark.getBoundingClientRect().width > 0),
      heroHeadingLastLineWords: measureLastLineWords(heroHeading),
      heroHeadingWidth: heroHeading?.getBoundingClientRect().width ?? 0,
      heroFocusLineWidth: heroHeadingContext?.measureText("Return to focus.").width ?? 0,
      productImageAspectRatio: productImage
        ? productImage.getBoundingClientRect().width / productImage.getBoundingClientRect().height
        : 0,
      galleryFrameAspectRatios: galleryFrames.map((frame) => {
        const rectangle = frame.getBoundingClientRect();
        return rectangle.width / rectangle.height;
      }),
      galleryImageObjectFits: galleryImages.map((image) => {
        return window.getComputedStyle(image).objectFit;
      }),
      productScreenshotDensities: productScreenshotImages.map((image) => {
        const renderedWidth = image.getBoundingClientRect().width;
        return renderedWidth > 0 ? image.naturalWidth / renderedWidth : 0;
      }),
      images,
    };
  });

  assert(
    audit.horizontalOverflow <= 0,
    `${viewport.width}px landing page has ${audit.horizontalOverflow}px of horizontal overflow.`,
  );
  assert(audit.navActionsVisible, `${viewport.width}px navigation actions are hidden.`);
  assert(audit.downloadVisible, `${viewport.width}px download CTA is hidden.`);
  assert(audit.githubVisible, `${viewport.width}px GitHub CTA is hidden.`);
  assert(audit.chromeMarkVisible, `${viewport.width}px Chrome mark is hidden.`);
  assert(
    Math.abs(audit.productImageAspectRatio - (388 / 600)) < 0.02,
    `${viewport.width}px hero product image does not preserve its natural aspect ratio.`,
  );
  assert(
    audit.galleryFrameAspectRatios.length === 3
      && audit.galleryFrameAspectRatios.every((ratio) => Math.abs(ratio - (388 / 600)) < 0.02),
    `${viewport.width}px product gallery frames are not consistently proportioned.`,
  );
  assert(
    audit.galleryImageObjectFits.every((objectFit) => objectFit === "contain"),
    `${viewport.width}px product gallery images are cropped instead of shown in full.`,
  );
  assert(
    audit.productScreenshotDensities.length === 4
      && audit.productScreenshotDensities.every((density) => density >= 1.75),
    `${viewport.width}px product screenshots do not have enough pixel density.`,
  );
  assert(
    audit.heroHeadingLastLineWords >= 2,
    `${viewport.width}px hero heading ends with a ${audit.heroHeadingLastLineWords}-word orphan line. `
      + `Available width: ${Math.round(audit.heroHeadingWidth)}px. Required width: `
      + `${Math.round(audit.heroFocusLineWidth)}px.`,
  );
  assert(
    audit.images.every((image) => image.complete && image.naturalWidth > 0),
    `One or more landing page images failed to load: ${JSON.stringify(audit.images)}`,
  );

  await page.screenshot({
    path: path.join(artifactDirectory, screenshotName),
    fullPage: true,
  });

  return audit;
}

await access(landingPagePath);
await access(downloadPath);
await mkdir(artifactDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const browserErrors = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    browserErrors.push(`console: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  browserErrors.push(`pageerror: ${error.message}`);
});

try {
  await page.goto(pathToFileURL(landingPagePath).href, { waitUntil: "load" });
  await page.locator("h1").waitFor({ state: "visible" });

  assert(
    await page.locator("h1").textContent() === "Stop the scroll.Return to focus.",
    "The landing page hero heading is missing or changed unexpectedly.",
  );
  assert(
    await page.locator("a[download]").first().getAttribute("href")
      === "downloads/scrolling-stop-extension-v1.5.3.zip",
    "The download CTA does not point to the packaged Chrome extension.",
  );
  assert(
    await page.locator(".nav-github").getAttribute("href")
      === "https://github.com/filipelinsduarte/scrolling-stop",
    "The top navigation GitHub CTA does not point to the renamed repository.",
  );
  assert(
    (await page.locator(".nav-github").textContent()).trim() === "Open-source repo",
    "The top navigation does not clearly identify the open-source repository.",
  );
  assert(
    await page.locator(".nav-github").getAttribute("target") === "_blank",
    "The top navigation GitHub CTA should preserve the landing page in its current tab.",
  );
  assert(
    (await page.locator(".nav-github").getAttribute("rel"))?.includes("noopener"),
    "The external GitHub CTA is missing noopener protection.",
  );

  const desktopAudit = await auditViewport(
    page,
    { width: 1440, height: 900 },
    "landing-desktop.png",
  );
  const tabletAudit = await auditViewport(
    page,
    { width: 768, height: 1024 },
    "landing-tablet.png",
  );
  const mobileAudit = await auditViewport(
    page,
    { width: 390, height: 844 },
    "landing-mobile.png",
  );

  assert(browserErrors.length === 0, browserErrors.join("\n"));

  console.log(JSON.stringify({
    checks: {
      heroContent: true,
      topNavigationDownloadCta: true,
      topNavigationGithubCta: true,
      topNavigationOpenSourceLabel: true,
      authenticChromeMark: true,
      proportionalHeroImage: true,
      proportionalGalleryImages: true,
      highDensityProductScreenshots: true,
      downloadPackageExists: true,
      allImagesLoaded: true,
      consoleErrors: 0,
      desktopHorizontalOverflow: desktopAudit.horizontalOverflow,
      tabletHorizontalOverflow: tabletAudit.horizontalOverflow,
      mobileHorizontalOverflow: mobileAudit.horizontalOverflow,
    },
  }, null, 2));
} finally {
  await browser.close();
}
