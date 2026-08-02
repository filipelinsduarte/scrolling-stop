import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const sourceIcon = path.join(projectDirectory, "images", "icon.svg");
const iconSizes = [16, 32, 48, 128];

for (const size of iconSizes) {
  const outputIcon = path.join(projectDirectory, "images", `icon-blue-v2-${size}.png`);
  await sharp(sourceIcon).resize(size, size).png().toFile(outputIcon);
}

console.log(`Generated ${iconSizes.length} extension icons.`);
