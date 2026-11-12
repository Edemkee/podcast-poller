# Changelog

## v0.2.1 - 2026-11-12

Patch: project housekeeping, no change to how the poll behaves.

### Added
- plan.md with done and open items.
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
