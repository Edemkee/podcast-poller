# Features

The poll's features, their settings, and which tests cover them.

Tests:
- **core**: `node test/core.test.mjs` (`npm test`), the poll rules in `src/poll-core.mjs`, without a browser.
- **browser**: `node test/browser.test.mjs` (`npm run test:browser`), the whole page in Chromium on a phone (375 px, dark), a tablet (768 px, light) and a desktop (1280 px, dark), against the local dev server.
- **ci**: `.github/workflows/ci.yml` runs both on every pull request and every push to `main`.

## Feature: Weekly poll (major)
- Description: one poll per week, Monday to Sunday, created for "this week" or "next week" with real dates. Each day offers 19:00, 20:00 and a free-choice time; several can be ticked. Days already past are shown but cannot be picked.
- Related minor features: the "This week / Next week" switch; the "Create poll for …" button; the "Today" and "Passed" day labels; the page opens on next week if only that poll exists.
- Config: `POLL_TZ` (default `Europe/Budapest`) decides "today" and when a week ends; preset times are `PRESETS` in `public/app.js`.
- Tests: core: week maths, month/year rollover, time zone, creating this and next week's poll. browser: creating this week's poll, seven days, past days disabled, today marked. Not covered: the "Next week" switch in the browser.
- Changes:
  - v0.1: first release.

## Feature: Answers (major)
- Description: a person types a name, ticks the evenings they can record and submits. Submitting locks the answer; "Change my answer" reopens it. Anyone can edit or remove any answer (with the password, see below). Two answers cannot share a name: submitting under an existing name updates that answer.
- Related minor features: the name box (remembered in the browser, `localStorage` key `recnight.name`); "which answer is mine" (`recnight.mine`); the 24-hour hour and minute lists for the free-choice time; Edit and Remove buttons on every answer; the "(you)" marker; the 50-answers-per-poll limit; the 40-character name limit.
- Config: none.
- Tests: core: saving, trimming, duplicate times, custom time, editing, same name updates, renaming onto someone else's name refused, bad input refused, removing. browser: submitting with a free-choice time, the answer listed one option per line, name locked after submitting, removing. Not covered: editing someone else's answer in the browser; the 50-answer limit.
- Changes:
  - v0.1: first release.
  - v0.2: one option per line; the submit control under the week table.

## Feature: Shared password (major)
- Description: saving an answer (new or changed) and removing one need the shared password. It is checked on the server with a constant-time comparison; a missing or wrong one changes nothing and the page says so. The password box sits right of the name box, masked by default, with a Show/Hide button. It is never stored in the browser or in the repository.
- Related minor features: the Show/Hide button (`#reveal`); the cursor returns to the password box when the password is missing or refused; the box stays usable after submitting so Remove can use it.
- Config: `POLL_PASSWORD`, required and secret, set only in Netlify's environment variables. If unset, every answer and removal is refused. Changing it needs a redeploy.
- Tests: core: no, empty, wrong, wrong-case and non-string passwords refused for saving; no password configured refuses everything; nothing saved on refusal; the password never sent back; removal refused without or with a wrong password. browser: masked by default, Show/Hide, placement on all three sizes, submit and remove with no, wrong and right password. Not covered: brute-force limits (there are none).
- Changes:
  - v0.3.0: needed to submit an answer.
  - v0.4.0: also needed to remove one; the box stays usable after submitting.

## Feature: Results (major)
- Description: once one answer exists, everyone sees a ranked list of evenings, most votes first, with the leading count highlighted and labelled ("Leading" or "Tied for the lead"). The headline names up to three leading evenings.
- Related minor features: the headline ("No evening picked yet" before any votes); the list of answers with a count.
- Config: none.
- Tests: browser: results appear after an answer, headline names the picked evenings, results come after the form. Not covered: ranking order with several people; ties beyond three.
- Changes:
  - v0.2: ranked results list for every visitor.

## Feature: Storage (major)
- Description: all data is one rolling JSON document, `polls.json`, in the Netlify Blobs store `podcast-poll`. A week is deleted once its Sunday has passed; next week's poll becomes this week's on Monday. Saves are conditional (etag) and retried on a clash; each storage call is retried three times, and the page retries a failed request.
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
