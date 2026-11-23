# Recording night

A weekly poll for picking the podcast recording evening. One page, one small
server function, one JSON file of data.

Live at https://podcast-poller.netlify.app/

## Put it online (free Netlify account, about 10 minutes)

The site needs Netlify to install one package and bundle the function, so deploy
it from a Git repository rather than by dragging the folder into the browser.

1. Create a free account at github.com and a free account at netlify.com
   (you can sign up to Netlify with the GitHub account).
2. On GitHub, create a new repository (private is fine) and upload the contents
   of this folder: "Add file" > "Upload files", drag everything in, commit.
   Keep the folder structure (`public/`, `netlify/`, `src/`, `netlify.toml`,
   `package.json`).
3. On Netlify: "Add new project" > "Import an existing project" > GitHub >
   pick the repository. Leave the build settings as they are (they are read
   from `netlify.toml`) and deploy.
4. In Netlify, add the environment variable `POLL_PASSWORD` with the password
   people will type to submit an answer (Project configuration > Environment
   variables), then redeploy. Without it every answer is refused.
5. Set up the human check (free): at dash.cloudflare.com (a free Cloudflare
   account is enough, no domain needed) open Turnstile > "Add widget", give it
   a name, add your `…netlify.app` hostname, leave the mode on "Managed", and
   create it. Copy the two keys into Netlify's environment variables:
   `TURNSTILE_SITE_KEY` (the site key) and `TURNSTILE_SECRET_KEY` (the secret
   key), then redeploy. Without them no poll can be created and every answer
   is refused.
6. Open the `…netlify.app` address Netlify gives you, create this week's poll
   and share the link together with the password.

If you prefer the command line: `npm install`, then `npx netlify-cli deploy --prod`.

## Each week

Open the page, choose "This week" or "Next week" and press "Create poll".
The link stays the same every week. On Monday, the poll you made as "next week"
becomes "this week" with its answers intact, and the week that just ended is
deleted from the data file.

## Where the data lives

Everything is one JSON document, `polls.json`, in the site's Netlify Blobs store
`podcast-poll` (Netlify dashboard > your project > Blobs). Netlify's own disk is
read-only for a running site, so Blobs is the closest thing to a flat file there.
It survives redeploys. Next to it, `attempts.json` counts wrong passwords per
connection (as a hash of the IP address) for the timeout.

## Settings

- `POLL_PASSWORD` (required, secret): the password for submitting, changing or
  removing an answer.
  Set it only in Netlify's environment variables, never in the repository.
  Changing it needs a redeploy (Deploys > Trigger deploy) to take effect.
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (required): the keys of your
  Cloudflare Turnstile widget (step 5 above). The secret key is secret: only in
  Netlify. Changing them needs a redeploy.
- Three wrong passwords in a row from one connection mean a 15-minute wait
  (`MAX_TRIES` and `LOCK_MINUTES` in `src/poll-core.mjs`).
- Weeks run Monday to Sunday and "today" is judged in Europe/Budapest time.
  To change that, add an environment variable `POLL_TZ` in Netlify
  (for example `Europe/London`).
- Preset start times are the `PRESETS` line at the top of `public/app.js`.

## Try it on your own computer

Needs Node 20 or newer, nothing else. Cloudflare's test keys make the human
check always pass on your computer:

    POLL_PASSWORD=try-me \
    TURNSTILE_SITE_KEY=1x00000000000000000000AA \
    TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA \
    node dev-server.mjs      # then open http://localhost:8888
    node test/core.test.mjs  # checks the poll rules

The browser walkthrough (phone, tablet, desktop) also needs Playwright:

    npm install --no-save playwright@1.63.0
    npx playwright install chromium
    npm run test:browser
    TURNSTILE_STUB=1 npm run test:browser   # if Cloudflare cannot be reached

Locally the data is written to `data/polls.json` and `data/attempts.json`.

## Working on it

- `FEATURES.md` lists the features, their settings and their tests; `ARCHITECTURE.md` shows how the parts fit together.
- `PLAN.md` lists what is done and what is open; `CHANGELOG.md` says what changed in each version; `CLAUDE.md` logs the decisions.
- Every pull request runs the tests and the version check on GitHub (the "CI" check); merge only when it is green.
- The version is in `VERSION` and in the page footer. Changes arrive as pull requests; merging one to `main` publishes the site and tags the version.

## Good to know

- There are no logins. Submitting, changing or removing an answer needs the
  shared password and Cloudflare's human check; creating a poll needs the human
  check only; anyone with the link can see the poll.
  Do not post the link publicly.
- The browser remembers your name and which answer is yours. In a private
  window or after clearing site data, you get a blank form; submitting under
  the same name updates your earlier answer instead of adding a second one.
