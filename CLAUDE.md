# podcast-poller: operative decisions

A weekly poll for picking the podcast recording evening. Hosted on a free Netlify
account, which deploys the `main` branch automatically. This project follows the
dev-workflow skill; read `PLAN.md` and `CHANGELOG.md` alongside this file.

Newest decisions first. Each entry: date, decision, reason.

## 2026-11-12

- **Project size: small, not a game.** Required documents are README.md, .gitignore, VERSION, PLAN.md, CLAUDE.md and CHANGELOG.md. FEATURES.md, ARCHITECTURE.md and CI are optional and tracked as open items in PLAN.md. Reason: the owner said so when adopting the dev workflow.
- **Project documents have uppercase names** in the repository root: README.md, CLAUDE.md, PLAN.md, CHANGELOG.md, and FEATURES.md or ARCHITECTURE.md if they are ever added. Reason: dev workflow.
- **Versions are `MAJOR.MINOR.PATCH`, raised once per pull request.** A feature or meaningful change raises MINOR and resets PATCH (0.9.2 to 0.10.0, 0.99.0 to 0.100.0). A fix, tweak or docs-only change raises PATCH. MAJOR changes only when the owner explicitly asks. Reason: dev workflow; it replaces the minor-only `0.N` rule of 2026-11-10, whose tags `v0.1` and `v0.2` stay as they are.
- **The version lives in four places that must agree:** `VERSION`, `package.json`, the footer in `public/index.html`, and the newest `CHANGELOG.md` heading (`## vX.Y.Z - YYYY-MM-DD`). Reason: Netlify serves static files, so the footer cannot read VERSION at run time.
- **Every change goes through a pull request against `main`** from a short-lived branch (`feature/…`, `fix/…`, `chore/…`). The owner merges unless they ask Claude to. Reason: dev workflow.
- **Merging to `main` publishes the site and tags the version.** Netlify deploys `main`; the "Tag version" workflow (`.github/workflows/tag-version.yml`, `scripts/tag-version.mjs`) creates the annotated tag `vX.Y.Z` with the changelog entry as its message. Reason: Claude sessions cannot push tags or create releases on this repository, so do not replace the workflow with a manual step. Check the tag appeared after a merge.
- **No secrets in the repository.** The only setting is `POLL_TZ`, which is not secret and is documented in `.env.example`. Review the staged diff before every commit. Reason: dev workflow.

## 2026-11-10

- **Storage retries stay.** The function retries each Netlify Blobs call three times and the page retries a failed request. Reason: Netlify Blobs sometimes answers 401 and creating a poll took three clicks.
- **Results are visible to every visitor once one answer exists,** most votes first, with the leading vote count highlighted and labelled. Reason: owner request.
- **Each person's answer lists its options in a column,** one per line, never side by side. Reason: owner request.
- **Page order: headline with the leading slot, name box, week table, submit control under the table on the left,** then results and answers. No bar fixed to the bottom. Reason: owner request.
- **Form controls must be readable in dark mode;** the time lists use near-white text on the dark blue surface. Reason: they were unreadable in 0.1.
- **The version number is shown in the page footer.** Reason: lets the owner see which version Netlify is serving.
- **The free-choice time uses 24-hour hour and minute lists,** not the browser's time field. Reason: the browser field shows AM/PM on some devices.
- **One poll per week, Monday to Sunday,** created for "this week" or "next week" with real dates. Each day offers 19:00, 20:00 and a free-choice time; several can be ticked. Days already past are shown but cannot be picked. Reason: owner brief.
- **Weeks and "today" are judged in Europe/Budapest time;** `POLL_TZ` overrides it. Reason: the owner's time zone.
- **No logins.** A typed name and "which answer is mine" are kept in the browser (`localStorage`). Submitting locks the answer; "Change my answer" reopens it. Anyone can edit or remove anyone's answer for now. Reason: owner brief.
- **Two answers cannot share a name;** submitting under an existing name updates that answer. Reason: a cleared browser cache should not create duplicates.
- **All data is one rolling JSON document,** `polls.json`, in the Netlify Blobs store `podcast-poll`. A week is deleted once its Sunday has passed; next week's poll becomes this week's on Monday. Saves are conditional (etag) and retried. Reason: the owner wanted a flat file, and Netlify cannot write to disk.
- **Layout of the code:** `public/` is the whole front end with no build step or framework; `src/poll-core.mjs` holds every poll rule and has no Netlify imports; `netlify/functions/poll.mjs` is a thin wrapper around it; `dev-server.mjs` runs the same core locally. Reason: the rules can be tested without Netlify (`node test/core.test.mjs`).
- **Responsive layout:** stacked day rows on a phone, two columns on a tablet, seven on a wide screen. Reason: owner brief.
