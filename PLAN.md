# Plan

States: `open`, `in progress`, `rejected`, `done`.

| # | Item | State | Notes |
|---|------|-------|-------|
| 1 | Weekly poll with the seven dated days, 19:00 / 20:00 / free-choice start times | done | v0.1 |
| 2 | Names remembered in the browser; submit, edit and remove answers | done | v0.1 |
| 3 | One rolling JSON file in Netlify Blobs, past weeks purged | done | v0.1 |
| 4 | Results list with the leading count highlighted; answers one option per line; name above and submit below the week table | done | v0.2 |
| 5 | Retry storage calls so creating a poll works on the first click | done | v0.2; confirmed on the live site, see 7 |
| 6 | Adopt the dev workflow: PLAN.md, VERSION, decision log, pull requests, secret hygiene | done | v0.2.1 |
| 7 | Confirm on the live site that the 401 errors no longer block creating a poll | done | v0.2.2; 2026-11-12, v0.2.1 live: next week's poll created on the first click (one POST, 200) |
| 8 | Keep the browser walkthrough (phone, tablet, desktop) in the repository as an automated test | done | v0.4.1; `test/browser.test.mjs`, run by CI |
| 9 | CI: run the tests on every pull request | done | v0.4.0; also checks the version rule |
| 10 | FEATURES.md and ARCHITECTURE.md | done | v0.4.1; owner asked for them 2026-11-23 |
| 11 | Limit who can edit or remove other people's answers | done | v0.4.0: saving, changing and removing all need the shared password; anyone who has it can still change anyone's answer |
| 12 | Password needed to submit an answer, field right of the name, masked with a Show button | done | v0.3.0; owner request 2026-11-23; password set in Netlify as `POLL_PASSWORD` |
| 13 | Human check with Cloudflare Turnstile (free) on submitting, changing and removing answers | done | v0.5.0; owner request 2026-11-23; keys in Netlify as `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| 14 | Timeout after 3 wrong passwords | done | v0.5.0; owner request 2026-11-23; 15 minutes per connection (hashed IP) |
| 15 | Human check on creating a poll too | open | idea from Claude, 2026-11-23; creating needs no password, so bots could create empty polls |
