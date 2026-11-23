# Changelog

## v0.4.1 - 2026-11-23

Patch: tests and documentation, no change to how the poll behaves.

### Added
- Browser walkthrough test (`npm run test:browser`): the whole page on a phone, a tablet and a desktop, in light and dark mode. CI runs it on every pull request.
- FEATURES.md (features, settings and test coverage) and ARCHITECTURE.md (components, endpoint, data, diagram).
- The local server can keep its data elsewhere with `DATA_FILE`.

## v0.4.0 - 2026-11-23

Minor: changing or removing an answer also needs the password; tests run on every pull request.

### Changed
- Removing an answer needs the shared password, like submitting and changing one. The password box stays usable after you submit, so you can remove an answer without reopening yours.

### Added
- CI: every pull request and every push to `main` runs the poll-rule tests, checks that the scripts parse, and checks the version rule (VERSION, package.json, footer and changelog agree; a pull request must raise the version).
- `scripts/check-version.mjs`, also used by the tagging script.

## v0.3.0 - 2026-11-23

Minor: submitting an answer now needs the shared password.

### Added
- A password box to the right of the name box, masked by default, with a Show/Hide button.
- The server checks the password before saving an answer; a missing or wrong one saves nothing and says so.
- New setting `POLL_PASSWORD` (a Netlify environment variable). The password is never stored in the repository or in the browser.

## v0.2.2 - 2026-11-12

Patch: documentation only, no change to how the poll behaves.

### Changed
- Confirmed on the live site that creating a poll works on the first click (plan item 7 done).
- README and CLAUDE.md now give the live address, https://podcast-poller.netlify.app/.

## v0.2.1 - 2026-11-12

Patch: project housekeeping, no change to how the poll behaves.

### Added
- PLAN.md with done and open items.
- VERSION file and .env.example.

### Changed
- Versions are now MAJOR.MINOR.PATCH, raised once per pull request; changes go through pull requests.
- CLAUDE.md is a dated log of decisions.
- .gitignore also covers .env files, keys and certificates, and OS and editor clutter.
- The tagging workflow reads VERSION and the new changelog headings.

## v0.2 - 2026-11-10

- Results so far: a ranked list every visitor sees once one answer is in, with the leading vote count highlighted and labelled.
- Each person's answer now lists its options one per line.
- The name box sits above the week table and the submit control under it on the left, replacing the bar fixed to the bottom of the screen.
- The free-choice time lists are readable in dark mode (near-white text).
- Storage hiccups are retried by the server function and by the page, so creating a poll no longer needs several clicks.
- Per-day vote lists inside the day cards are replaced by the results list.
- The version number is shown in the page footer.
- Added CLAUDE.md with the project's decisions and the versioning rules.
- Every version is tagged on GitHub automatically, with this change list as the tag message.

## v0.1 - 2026-11-10

- First release: create a poll for this week or next week with the seven dated days.
- Start times 19:00, 20:00 and a free-choice time per day.
- Name remembered in the browser; submit, edit and remove answers, for anyone by anyone.
- All answers kept in one rolling JSON file in Netlify Blobs; past weeks are purged.
- Layout for phone, tablet and desktop.
