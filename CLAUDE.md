# podcast-poller

A weekly poll for picking the podcast recording evening. Hosted on a free Netlify
account, deployed automatically from the `main` branch of this repository.

## Layout of the code

- `public/` is the whole front end: `index.html`, `style.css`, `app.js`. No build step, no framework.
- `src/poll-core.mjs` holds every poll rule (week maths, validation, purge). It has no Netlify imports.
- `netlify/functions/poll.mjs` is the only server code: `GET`/`POST /api/poll`, a thin wrapper that connects the core to Netlify Blobs.
- `dev-server.mjs` runs the same core locally against `data/polls.json`.
- `test/core.test.mjs` tests the core. Run `node test/core.test.mjs` before every release.

## Decisions made by the owner

Keep these unless the owner says otherwise.

### Poll

- One poll per week, Monday to Sunday, created for "this week" or "next week" with real dates.
- Each day offers 19:00, 20:00 and a free-choice "Other time". Several can be ticked per day.
- The free-choice time is picked with 24-hour hour and minute lists, never the browser's own time field (it shows AM/PM on some devices).
- Days of the current week that have already passed are shown but cannot be picked.
- Weeks and "today" are judged in Europe/Budapest time (`POLL_TZ` overrides it).

### People and answers

- No logins. People type a name; the browser remembers it and which answer is theirs (`localStorage`).
- Submitting makes an answer final and locks the form. "Change my answer" reopens it.
- For now anyone can edit or remove anyone's answer.
- Two answers cannot share a name. Submitting under an existing name updates that answer.

### Storage

- All data is one rolling JSON document, `polls.json`, in the Netlify Blobs store `podcast-poll` (Netlify cannot write to a real file on disk).
- A week's poll is deleted once its Sunday has passed. Next week's poll becomes this week's on Monday with its answers.
- Saves are conditional (etag) and retried, so two people saving at once do not overwrite each other.
- Netlify Blobs sometimes rejects a call with a 401. The function retries each storage call three times and the page retries a failed request, so do not remove those retries.

### Page layout

- Works on phone, tablet and desktop: stacked day rows on a phone, two columns on a tablet, seven columns on a wide screen.
- Top to bottom: headline with the leading slot, the name box, the week table, then the submit control under the table on the left.
- Below that, "Results so far" is visible to every visitor as soon as one answer exists, most votes first, with the leading vote count highlighted and labelled.
- Each person's answer lists its options in a column, one option per line, never side by side.
- Form controls must stay readable in dark mode: text in the time lists is near-white on the dark blue surface.
- The current version number is shown in the page footer.

## Versioning

- Versions are `0.N`. Every release raises the minor number by one: 0.1, 0.2 … 0.9, 0.10, 0.11 … 0.99, 0.100.
- Never raise the major number unless the owner says so, however large the minor number gets.
- Every change that reaches `main` is a new version.

### Releasing a version

1. Raise the version in three places: the footer in `public/index.html` (`Version 0.N`), `package.json` (`0.N.0`), and a new section at the top of `CHANGELOG.md`.
2. Add any new owner decision to this file.
3. Run `node test/core.test.mjs`.
4. Commit and push to `main`.
5. Create an annotated tag named `v0.N` on that commit. The tag message is `Version 0.N` followed by the change delta, the same bullet list as the `CHANGELOG.md` section. Push the tag.
