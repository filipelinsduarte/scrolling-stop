---
name: install-scroll-stop
description: Install, update, customize, or troubleshoot the open-source Scroll Stop Manifest V3 Chrome extension. Use when a user wants an AI agent to download Scroll Stop, prepare it for Chrome's Load unpacked flow, change default blocked websites or focus behavior, verify the extension, update an existing local copy, or fix a stale toolbar icon.
---

# Install Scroll Stop

Install Scroll Stop from its canonical repository and leave the user with a verified local folder that Chrome can load unpacked.

## Get the source

Use the exact repository URL:

`https://github.com/filipelinsduarte/scrolling-stop`

1. Ask for a destination only if the user has not indicated one and choosing could overwrite an existing folder.
2. If the repository is absent, clone it into a normal user-owned directory.
3. If it already exists, inspect `git status` before updating. Preserve local changes. Use a fast-forward-only pull only when the worktree is clean.
4. Never request an API key, account credential, or secret. Scroll Stop does not need one.

## Verify the extension folder

Confirm that the selected folder contains `manifest.json`, `popup.html`, `blocked.html`, and `service-worker.js`.

The extension runs directly from source and has no production build step. If Node.js and npm are available, run:

```bash
npm install
npm test
```

Run `npm run verify` when an isolated Chromium instance is available. Do not treat a missing development dependency as an installation blocker for the extension itself.

## Guide the Chrome installation

1. Open `chrome://extensions` in Google Chrome.
2. Ask the user to enable **Developer mode**.
3. Ask the user to click **Load unpacked**.
4. Give the exact absolute path to the folder containing `manifest.json`.
5. Ask the user to pin Scroll Stop from the Extensions menu.
6. Confirm that LinkedIn or X redirects to the local Scroll Stop reminder.

Do not modify the user's Chrome profile files directly. Chrome's extension picker and security confirmation remain user-controlled steps.

## Handle an old orange icon

Current versions use `images/icon-blue-v2-*.png`. Check that `manifest.json` references those filenames.

Ask the user to click **Reload** on Scroll Stop in `chrome://extensions`. If Chrome still shows a cached orange icon, ask the user to remove the old unpacked extension entry and load the current folder again.

## Customize only when requested

- Change initial blocked domains through `DEFAULT_SETTINGS.blockedDomains` in `src/blocker.js`.
- Keep user-added domains in Chrome local storage rather than hardcoding them.
- Preserve unlimited Focus Plan objectives unless the user explicitly requests a cap.
- Preserve the two reflection steps and 2-minute break unless the user explicitly requests different behavior.
- Keep blocked-page breaks site-specific. A break for one domain must not unblock any other domain. Keep only the popup pause global.
- Keep website-specific challenge copy derived from the `domain` query parameter. Test both LinkedIn and X after changing redirect or challenge logic.
- Preserve local-only analytics and label estimated time as an estimate.
- Reuse the existing design tokens and Toy Grade components.

When changing logic, add or update Vitest coverage in the same response. Always rerun the relevant tests and inspect the extension in Chromium before reporting completion.

## Update an installed copy

1. Preserve local modifications.
2. Update the source safely.
3. Run available checks.
4. Ask the user to click **Reload** in `chrome://extensions`.
5. Recheck the blocked-site flow and toolbar icon.

Finish with the local folder path, checks completed, extension version, and any manual Chrome step still required.
