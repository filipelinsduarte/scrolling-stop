# Contributing to Scroll Stop

Thanks for helping make Scroll Stop calmer, clearer, and more reliable.

## Before opening a pull request

1. Create a focused branch from `main`.
2. Keep changes small and preserve the Manifest V3 architecture.
3. Add or update Vitest coverage when changing parsing, timers, analytics, or other logic.
4. Run the checks:

```bash
npm install
npm test
npm run verify
```

5. Load the extension unpacked and confirm the popup, Focus Plan, Attention Report, LinkedIn interruption, and X interruption manually.
6. Confirm there are no console errors, horizontal overflow, or unbalanced text wraps.

## Design principles

- Keep the Toy Grade visual language and existing design tokens.
- Use real platform marks for named services.
- Keep controls accessible with real buttons, labels, focus states, and keyboard navigation.
- Keep data local unless a future feature clearly explains and obtains permission for anything else.
- Do not make attention estimates look like measured facts. Label assumptions directly.

## Pull requests

Explain the user-facing outcome, list the checks you ran, and attach screenshots for visual changes. Do not include credentials, `.env` files, generated browser profiles, or local analytics data.
