# Features

The poll's features, their settings, and which tests cover them.

Tests:
- **core**: `node test/core.test.mjs` (`npm test`), the poll rules in `src/poll-core.mjs`, without a browser.
- **browser**: `node test/browser.test.mjs` (`npm run test:browser`), the whole page in Chromium on a phone (375 px, dark), a tablet (768 px, light) and a desktop (1280 px, dark), against the local dev server.
- **ci**: `.github/workflows/ci.yml` runs both on every pull request and every push to `main`.

## Feature: Weekly poll (major)
- Description: one poll per week, Monday to Sunday, created for "this week" or "next week" with real dates. Each day offers 19:00, 20:00 and a free-choice time; several can be ticked. Days already past are shown but cannot be picked.
- Related minor features: the "This week / Next week" switch; the "Create poll for …" button (needs the human check since v0.6.0, with its message shown under the button); the "Today" and "Passed" day labels; the page opens on next week if only that poll exists.
- Config: `POLL_TZ` (default `Europe/Budapest`) decides "today" and when a week ends; preset times are `PRESETS` in `public/app.js`.
- Tests: core: week maths, month/year rollover, time zone, creating this and next week's poll, creating refused without the human check. browser: creating this week's poll (through the widget), seven days, past days disabled, today marked, a failed human check creating nothing. Not covered: the "Next week" switch in the browser.
- Changes:
  - v0.1: first release.
  - v0.6.0: creating a poll needs the human check.

## Feature: Answers (major)
- Description: a person types a name, ticks the evenings they can record and submits. Submitting locks the answer; "Change my answer" reopens it. Anyone can edit or remove any answer (with the password, see below). Two answers cannot share a name: submitting under an existing name updates that answer.
- Related minor features: the name box (remembered in the browser, `localStorage` key `recnight.name`); "which answer is mine" (`recnight.mine`); the 24-hour hour and minute lists for the free-choice time; Edit and Remove buttons on every answer; the "(you)" marker; the 50-answers-per-poll limit; the 40-character name limit.
- Config: none.
- Tests: core: saving, trimming, duplicate times, custom time, editing, same name updates, renaming onto someone else's name refused, bad input refused, removing. browser: submitting with a free-choice time, the answer listed one option per line, name locked after submitting, removing. Not covered: editing someone else's answer in the browser; the 50-answer limit.
- Changes:
  - v0.1: first release.
  - v0.2: one option per line; the submit control under the week table.

## Feature: Shared password (major)
- Description: saving an answer (new or changed) and removing one need the shared password. It is checked on the server with a constant-time comparison, after the timeout and human checks; a missing or wrong one changes nothing and the page says so, with the tries left before a timeout. The password box sits right of the name box, masked by default, with a Show/Hide button. It is never stored in the browser or in the repository.
- Related minor features: the Show/Hide button (`#reveal`); the cursor returns to the password box when the password is missing or refused; the box stays usable after submitting so Remove can use it.
- Config: `POLL_PASSWORD`, required and secret, set only in Netlify's environment variables. If unset, every answer and removal is refused. Changing it needs a redeploy.
- Tests: core: no, empty, wrong, wrong-case and non-string passwords refused for saving; no password configured refuses everything; nothing saved on refusal; the password never sent back; removal refused without or with a wrong password. browser: masked by default, Show/Hide, placement on all three sizes, submit and remove with no, wrong and right password. Not covered: brute-force limits (there are none).
- Changes:
  - v0.3.0: needed to submit an answer.
  - v0.4.0: also needed to remove one; the box stays usable after submitting.
  - v0.5.0: checked only after the timeout and the human check; refusals say how many tries are left.

## Feature: Human check (major)
- Description: Cloudflare Turnstile (free plan) confirms that a human is creating a poll or saving or removing an answer. The widget sits under the active button (under "Create poll" when there is no poll, else under the answer form) and stays invisible unless Cloudflare asks for a click. Each create, vote or removal carries a fresh token; the server confirms it with Cloudflare's siteverify before it looks at the password, and fails closed (no secret key, no token, Cloudflare unreachable, rejected token).
- Related minor features: "Checking that you are human…" while the token arrives; a 15-second wait for the token, then a message; the widget is reset after every request; votes and removals are not retried automatically (a token works once).
- Config: `TURNSTILE_SITE_KEY` (public, served to the page by GET `/api/poll`) and `TURNSTILE_SECRET_KEY` (secret, only in Netlify). Locally and in tests, Cloudflare's dummy keys. `TURNSTILE_VERIFY_URL` (dev server only) points the check at the browser test's stand-in.
- Tests: core: missing, empty and rejected tokens refused for creating, votes and removals; a bot never reaches the password check and does not count towards the timeout; not configured refuses; Cloudflare unreachable gives 503; nothing saved; the verifier's request to Cloudflare (secret, token, IP), its answers, and no call without a usable token. browser: every save and removal goes through the widget (Cloudflare's test keys in CI, a stand-in with `TURNSTILE_STUB=1`); a failing secret key creates no poll and says why under the button. Not covered: a real interactive challenge.
- Changes:
  - v0.5.0: first release.
  - v0.6.0: also on creating a poll; the widget moved under the active button.

## Feature: Timeout after wrong passwords (major)
- Description: 3 wrong passwords in a row from one connection mean a 15-minute wait for votes and removals, even with the right password. A right password clears the count; wrong passwords more than an hour apart do not add up; failed human checks do not count. Each connection is one client IP address, stored only as a hash.
- Related minor features: "N tries left before a 15-minute wait" on a wrong password; "Try again in N minutes" while timed out; old entries are tidied away.
- Config: `MAX_TRIES` (3), `LOCK_MINUTES` (15) and `FORGET_MINUTES` (60) in `src/poll-core.mjs`. Counts live in `attempts.json` in the Blobs store `podcast-poll` (locally `data/attempts.json`).
- Tests: core: tries-left messages, the timeout on the third wrong password, the right password refused while timed out, removals refused too, another connection unaffected, no plain IP stored, the timeout ending, a right password or an hour's quiet resetting the count. browser: three wrong passwords, then the right one refused with the wait message. Not covered: many connections at once (a spread-out attack is left to the human check).
- Changes:
  - v0.5.0: first release.

## Feature: Results (major)
- Description: once one answer exists, everyone sees a ranked list of evenings, most votes first, with the leading count highlighted and labelled ("Leading" or "Tied for the lead"). The headline names up to three leading evenings.
- Related minor features: the headline ("No evening picked yet" before any votes); the list of answers with a count.
- Config: none.
- Tests: browser: results appear after an answer, headline names the picked evenings, results come after the form. Not covered: ranking order with several people; ties beyond three.
- Changes:
  - v0.2: ranked results list for every visitor.

## Feature: Storage (major)
- Description: all poll data is one rolling JSON document, `polls.json`, in the Netlify Blobs store `podcast-poll` (wrong-password counts are a second document, `attempts.json`). A week is deleted once its Sunday has passed; next week's poll becomes this week's on Monday. Saves are conditional (etag) and retried on a clash; each storage call is retried three times, and the page retries a failed request.
- Related minor features: the "storage did not answer" message (503); the "someone else saved at the same moment" message (409).
- Config: store name and key are constants in `netlify/functions/poll.mjs`. Locally, `dev-server.mjs` writes `data/polls.json` (or `DATA_FILE`).
- Tests: core: nothing written on a plain read, clashing saves retried then given up, past weeks purged on Monday in Budapest time. Not covered: the Netlify Blobs wrapper and its retries (needs Netlify).
- Changes:
  - v0.1: first release.
  - v0.2: retries for Netlify Blobs' occasional 401s (confirmed on the live site in v0.2.2).

## Feature: Layout and look (minor)
- Description: stacked day rows on a phone, two columns on a tablet, seven on a wide screen; readable in light and dark mode; the version number in the footer.
- Config: none.
- Tests: browser: column count on each size, no sideways scrolling, near-white time lists in dark mode, footer version matches `VERSION`.
- Changes:
  - v0.2: dark-mode time lists fixed; version in the footer.

## Feature: Versioning and release (auxiliary)
- Description: VERSION, package.json, the footer and the newest CHANGELOG heading must agree; each pull request raises the version once; merging to `main` deploys (Netlify) and tags `vX.Y.Z` ("Tag version" workflow).
- Config: none.
- Tests: ci: `scripts/check-version.mjs` (and `--unreleased` on pull requests); the browser test checks the footer.
- Changes:
  - v0.2.1: MAJOR.MINOR.PATCH and pull requests.
  - v0.4.0: CI with the version check.
