# Chrome Web Store listing

Everything the Developer Dashboard asks for, ready to paste. Regenerate the
images with `npm run store:assets` and the upload with `npm run package`.

---

## Account tab

**Publisher**: individual account, not an organization.

Two different emails are involved, and only one of them becomes public.

| Field | Value | Public? |
| --- | --- | --- |
| Google account you sign in with | `filipeoliveira.duarte@gmail.com` | No |
| Publisher display name | `Filipe Duarte` | Yes, on the listing |
| Contact email | `filipe@aipeekaboo.com` | **Yes, on the listing** |
| Publisher website | `https://scrollingstop.com` | Yes, on the listing |

The account email is only the login and stays private. The contact email is
shown to everyone who views the listing, which is why it is set to the agency
address rather than the personal one. Change it to the personal address only
if you want that address public.

The contact email has to be verified before the item can be submitted, so
verify it first. Google shows the publisher display name on the public
listing, so it is a real name rather than a handle.

**Trader status** (required, EU Digital Services Act): declare **non-trader**.
Scrolling Stop is free, has no payments, no subscription and no commercial
offering attached to it. Declaring trader would require publishing a full
business address and phone number on the listing. If the extension ever gains
a paid tier, this has to be revisited.

---

## Store listing tab

**Name** (45 characters max)

```
Scrolling Stop
```

**Short description** (132 characters max, currently 118)

```
Block the sites that pull you in, bring your own goals back when attention drifts, and see how often you choose focus.
```

**Category**: Productivity
**Language**: English (United States)

**Detailed description**

```
You open a tab to do one thing, and twenty minutes later you are three feeds deep with no memory of deciding to go there. The problem is not willpower. It is that the distance between the impulse and the feed is a single keystroke.

Scrolling Stop puts something in that gap.

BLOCK THE SITES THAT PULL YOU IN
Add any website in one step. Chrome enforces the block itself using its own rules engine, which means the extension never watches your traffic to do its job.

A PAUSE THAT ACTUALLY PAUSES
Getting through to a blocked site takes two timed five-second holds and a small calculation. Not because you can never go, but because the urge that dragged you there rarely survives fifteen seconds of friction. When you do go through, you get two minutes, per site, and it re-locks on its own.

YOUR OWN GOALS, AT THE MOMENT YOU DRIFT
Write down what you actually meant to do today. Those words come back on screen at the exact moment attention wanders, which is the only moment they are any use.

SEE THE PATTERN
Every blocked attempt and every return to focus is counted, so you can see which site tests you most and whether it is getting easier. The numbers stay on your machine.

NOTHING ABOUT YOU LEAVES YOUR BROWSER
No account. No sign-in. No server holding your data. Your blocked list, your goals and your attention history live in Chrome's local storage and go nowhere else. The extension sends exactly one thing: an anonymous count when it is installed or removed, so we know whether anyone is using this. It contains a random identifier and a version number, nothing more, and you can switch it off in the popup in one click.

OPEN SOURCE, SO YOU CAN CHECK
The full source is public and MIT licensed. Every claim above can be confirmed by reading the code.

Source: https://github.com/filipelinsduarte/scrolling-stop
Privacy: https://scrollingstop.com/privacy
```

---

## Privacy tab

**Single purpose description**

```
Scrolling Stop blocks websites the user has chosen to block, and shows the user their own written focus goals when they try to open one of those sites. Every feature serves that single purpose of helping the user stay on the task they set for themselves.
```

**Permission justifications**

| Permission | Justification to paste |
| --- | --- |
| `host_permissions` (`*://*/*`) | The user decides which websites to block, and can name any website, so the extension cannot declare a fixed list of hosts in advance. The permission is used only to match an address against the user's own blocked list and to show the block page. Page content is never read, stored or transmitted. |
| `declarativeNetRequest` | Blocking is performed by Chrome from a rule set the extension supplies, rather than by the extension observing requests. This is what allows the blocking to work without the extension ever seeing the user's traffic. |
| `storage` | Keeps the user's blocked list, their written focus goals, their local attempt counts and any active break on the user's own machine between browser sessions. |
| `alarms` | Ends a timed two-minute break at the correct moment and restores the block, including when the popup is closed and the service worker has been suspended. |
| `favicon` | Displays each blocked website's icon next to its entry in the user's list, using the copy Chrome has already cached locally. No network request is made for it. |

**Data usage disclosures**

Tick **none** of the data-type checkboxes. The extension collects no
personally identifiable information, no health, financial or authentication
information, no personal communications, no location, no web history and no
website content. The only transmitted value is a randomly generated
identifier with a version number, which identifies an installation rather
than a person, and the user can switch it off.

Certify all three statements as true:

- Data is not being sold to third parties, outside of approved use cases.
- Data is not being used or transferred for purposes unrelated to the item's single purpose.
- Data is not being used or transferred to determine creditworthiness or for lending purposes.

**Privacy policy URL**

```
https://scrollingstop.com/privacy
```

---

## Assets

Generated into `docs/store/` by `npm run store:assets`.

| Asset | File | Size |
| --- | --- | --- |
| Store icon | `images/icon-blue-v2-128.png` | 128x128 |
| Screenshot 1 | `docs/store/screenshot-1-block.png` | 1280x800 |
| Screenshot 2 | `docs/store/screenshot-2-pause.png` | 1280x800 |
| Screenshot 3 | `docs/store/screenshot-3-goals.png` | 1280x800 |
| Screenshot 4 | `docs/store/screenshot-4-report.png` | 1280x800 |
| Small promo tile | `docs/store/promo-small.png` | 440x280 |

Upload package: `artifacts/scrolling-stop-extension-v<version>.zip`, built by
`npm run package` and smoke-tested by `npm run verify:package`.

---

## Release checklist

1. `npm test`
2. `npm run verify`
3. `npm run verify:landing`
4. `npm run store:assets`
5. `npm run package`
6. `npm run verify:package`
7. Deploy the site so `/privacy`, `/uninstalled` and `/api/event` are live before the extension ships.
8. Upload the ZIP, paste the fields above, submit for review.
