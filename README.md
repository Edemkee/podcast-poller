# Recording night

A weekly poll for picking the podcast recording evening. One page, one small
server function, one JSON file of data.

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
4. Open the `…netlify.app` address Netlify gives you, create this week's poll
   and share the link.

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
It survives redeploys.

## Settings

- Weeks run Monday to Sunday and "today" is judged in Europe/Budapest time.
  To change that, add an environment variable `POLL_TZ` in Netlify
  (for example `Europe/London`).
- Preset start times are the `PRESETS` line at the top of `public/app.js`.

## Try it on your own computer

Needs Node 20 or newer, nothing else:

    node dev-server.mjs      # then open http://localhost:8888
    node test/core.test.mjs  # checks the poll rules

Locally the data is written to `data/polls.json`.

## Good to know

- There are no logins. Anyone with the link can create a poll and edit or
  remove any answer, as requested. Do not post the link publicly.
- The browser remembers your name and which answer is yours. In a private
  window or after clearing site data, you get a blank form; submitting under
  the same name updates your earlier answer instead of adding a second one.
