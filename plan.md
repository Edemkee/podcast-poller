# Plan

States: `open`, `in progress`, `rejected`, `done`.

| # | Item | State | Notes |
|---|------|-------|-------|
| 1 | Weekly poll with the seven dated days, 19:00 / 20:00 / free-choice start times | done | v0.1 |
| 2 | Names remembered in the browser; submit, edit and remove answers | done | v0.1 |
| 3 | One rolling JSON file in Netlify Blobs, past weeks purged | done | v0.1 |
| 4 | Results list with the leading count highlighted; answers one option per line; name above and submit below the week table | done | v0.2 |
| 5 | Retry storage calls so creating a poll works on the first click | done | v0.2; not yet confirmed on the live site, see 7 |
| 6 | Adopt the dev workflow: plan.md, VERSION, decision log, pull requests, secret hygiene | done | v0.2.1 |
| 7 | Confirm on the live site that the 401 errors no longer block creating a poll | open | needs the Netlify function log if it still fails |
| 8 | Keep the browser walkthrough (phone, tablet, desktop) in the repository as an automated test | open | idea from Claude, 2026-11-12; today only the poll rules have tests |
| 9 | CI: run the tests on every pull request | open | optional for a small project; offered 2026-11-12 |
| 10 | features.md and architecture.md | open | optional for a small project; revisit if the project grows |
| 11 | Limit who can edit or remove other people's answers | open | the owner allowed it "for now" on 2026-11-10 |
