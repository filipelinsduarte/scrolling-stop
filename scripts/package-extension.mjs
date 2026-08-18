// Builds the ZIP uploaded to the Chrome Web Store, and the matching ZIP
// offered on the website. Only the files Chrome actually loads are included,
// so the upload never carries tests, docs, screenshots or node_modules.
//
// Run with: npm run package

import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");

// Everything Chrome loads at runtime, and nothing else. Adding a new runtime
// file means adding it here, otherwise it is missing from the packaged build.
const INCLUDED = [
  "manifest.json",
  "service-worker.js",
  "content-script.js",
  "popup.html",
  "popup.js",
  "blocked.html",
  "blocked.js",
  "src",
  "styles",
  "images",
  "LICENSE",
];

// Files that must never reach a published bundle, checked after staging.
const FORBIDDEN_PATTERNS = [
  /(^|\/)\.env/i,
  /credentials/i,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)\.dev\.vars$/i,
  /(^|\/)node_modules(\/|$)/,
];

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9]{16,}/,
  /\bsk_(test|live)_[A-Za-z0-9]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bxoxb-[A-Za-z0-9-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bapi_secret\s*[:=]\s*["'][A-Za-z0-9_-]{8,}["']/i,
];

async function listFiles(directory, base = directory) {
  const { stdout } = await run("find", [directory, "-type", "f"]);
  return stdout.split("\n").filter(Boolean).map((file) => path.relative(base, file));
}

const stagingRoot = await mkdtemp(path.join(os.tmpdir(), "scrolling-stop-package-"));
const stageDirectory = path.join(stagingRoot, "extension");

try {
  const manifest = JSON.parse(
    await readFile(path.join(projectDirectory, "manifest.json"), "utf8"),
  );
  const version = manifest.version;

  await mkdir(stageDirectory, { recursive: true });
  for (const entry of INCLUDED) {
    const source = path.join(projectDirectory, entry);
    try {
      await stat(source);
    } catch {
      throw new Error(`Packaging list names "${entry}", which does not exist.`);
    }
    await cp(source, path.join(stageDirectory, entry), { recursive: true });
  }

  const staged = await listFiles(stageDirectory);

  // Guard 1: nothing matching a credential-shaped filename ships.
  const forbidden = staged.filter(
    (file) => FORBIDDEN_PATTERNS.some((pattern) => pattern.test(file)),
  );
  if (forbidden.length) {
    throw new Error(`Refusing to package credential-like files: ${forbidden.join(", ")}`);
  }

  // Guard 2: nothing that looks like a live secret ships inside a file.
  for (const file of staged) {
    if (!/\.(js|json|html|css|txt|md)$/i.test(file)) {
      continue;
    }
    const contents = await readFile(path.join(stageDirectory, file), "utf8");
    const hit = SECRET_PATTERNS.find((pattern) => pattern.test(contents));
    if (hit) {
      throw new Error(`Refusing to package ${file}: it matches a secret pattern (${hit}).`);
    }
  }

  const zipName = `scrolling-stop-extension-v${version}.zip`;
  const storeZip = path.join(projectDirectory, "artifacts", zipName);
  await mkdir(path.dirname(storeZip), { recursive: true });
  await rm(storeZip, { force: true });

  // Zipped from inside the staging directory so the archive has no wrapper
  // folder. Chrome rejects an upload whose manifest is not at the top level.
  await run("zip", ["-r", "-q", "-X", storeZip, "."], { cwd: stageDirectory });

  const downloadZip = path.join(projectDirectory, "docs", "downloads", zipName);
  await mkdir(path.dirname(downloadZip), { recursive: true });
  await cp(storeZip, downloadZip);

  const { size } = await stat(storeZip);
  console.log(JSON.stringify({
    version,
    storeUpload: path.relative(projectDirectory, storeZip),
    websiteDownload: path.relative(projectDirectory, downloadZip),
    sizeKb: Number((size / 1024).toFixed(1)),
    fileCount: staged.length,
    files: staged.sort(),
  }, null, 2));
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
