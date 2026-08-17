// Generates docs/social-card.png (1200x630) for Open Graph / Twitter cards.
// Composes the brand colors from docs/site.css with the real popup screenshot.
// Run with: node scripts/generate-social-card.mjs

import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotPath = path.join(rootDir, "docs", "screenshots", "main-popup.png");
const outputPath = path.join(rootDir, "docs", "social-card.png");

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const SHOT_WIDTH = 380;
const SHOT_VISIBLE_HEIGHT = 470;
const SHOT_X = 750;
const SHOT_Y = 80;
const SHOT_RADIUS = 22;

const FONT_STACK = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const backgroundSvg = `
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#fbfaf9"/>
  <circle cx="1090" cy="70" r="150" fill="#e7f3ff"/>
  <circle cx="80" cy="600" r="120" fill="#fff0e9"/>
  <rect x="70" y="74" width="16" height="44" rx="8" fill="#1a88f8"/>
  <rect x="94" y="86" width="16" height="32" rx="8" fill="#ff5310"/>
  <text x="128" y="108" font-family="${FONT_STACK}" font-size="30" font-weight="700" fill="#343433">Scrolling Stop</text>
  <text x="70" y="248" font-family="${FONT_STACK}" font-size="72" font-weight="800" fill="#343433">Stop the scroll.</text>
  <text x="70" y="334" font-family="${FONT_STACK}" font-size="72" font-weight="800" fill="#1a88f8">Return to focus.</text>
  <text x="70" y="404" font-family="${FONT_STACK}" font-size="28" fill="#747484">An open-source Chrome extension that blocks</text>
  <text x="70" y="444" font-family="${FONT_STACK}" font-size="28" fill="#747484">distracting sites and remembers your focus.</text>
  <rect x="70" y="500" width="330" height="58" rx="29" fill="#1a88f8"/>
  <text x="235" y="538" font-family="${FONT_STACK}" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">Free · Open source</text>
  <text x="430" y="538" font-family="${FONT_STACK}" font-size="26" font-weight="600" fill="#343433">scrollingstop.com</text>
</svg>
`;

const roundedMaskSvg = `
<svg width="${SHOT_WIDTH}" height="${SHOT_VISIBLE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SHOT_WIDTH}" height="${SHOT_VISIBLE_HEIGHT}" rx="${SHOT_RADIUS}" fill="#ffffff"/>
</svg>
`;

async function buildScreenshotLayer() {
  const resized = await sharp(screenshotPath)
    .resize({ width: SHOT_WIDTH })
    .png()
    .toBuffer();

  const cropped = await sharp(resized)
    .extract({ left: 0, top: 0, width: SHOT_WIDTH, height: SHOT_VISIBLE_HEIGHT })
    .toBuffer();

  return sharp(cropped)
    .composite([{ input: Buffer.from(roundedMaskSvg), blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function main() {
  const screenshotLayer = await buildScreenshotLayer();

  await sharp(Buffer.from(backgroundSvg))
    .composite([{ input: screenshotLayer, left: SHOT_X, top: SHOT_Y }])
    .png()
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  if (metadata.width !== CARD_WIDTH || metadata.height !== CARD_HEIGHT) {
    throw new Error(
      `Social card is ${metadata.width}x${metadata.height}, expected ${CARD_WIDTH}x${CARD_HEIGHT}.`,
    );
  }

  console.log(`Social card written to ${outputPath} (${CARD_WIDTH}x${CARD_HEIGHT}).`);
}

main().catch((error) => {
  console.error("Social card generation failed:", error);
  process.exitCode = 1;
});
