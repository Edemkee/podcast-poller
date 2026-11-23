// Browser walkthrough: the whole page on a phone, a tablet and a desktop, against the
// local dev server. Needs Playwright and a Chromium:
//   npm install --no-save playwright@1.63.0 && npx playwright install chromium
//   npm run test:browser
// CHROME_PATH=/path/to/chrome uses an installed Chrome instead of Playwright's Chromium.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PW = "browser-test-password"; // made up; the real one lives only in Netlify
const NOW = "2026-11-11T10:00:00Z"; // a Wednesday: Mon 9 and Tue 10 Nov have passed
const VERSION = readFileSync("VERSION", "utf8").trim();
const scratch = mkdtempSync(join(tmpdir(), "poll-browser-"));
let n = 0;
const ok = (name) => console.log("ok", ++n, name);

// Starts the dev server with its own empty data file; resolves with its address.
function startServer(port, label) {
  const child = spawn(process.execPath, ["dev-server.mjs"], {
    env: { ...process.env, PORT: String(port), POLL_PASSWORD: PW, FAKE_NOW: NOW,
      POLL_TZ: "Europe/Budapest", DATA_FILE: join(scratch, label, "polls.json") },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => String(d).includes("http://") && resolve({ child, url: `http://localhost:${port}` }));
    child.on("exit", (code) => reject(new Error(`dev server exited with ${code}`)));
  });
}

const sizes = [
  { label: "phone", width: 375, height: 812, scheme: "dark", columns: 1, touch: true },
  { label: "tablet", width: 768, height: 1024, scheme: "light", columns: 2, touch: true },
  { label: "desktop", width: 1280, height: 900, scheme: "dark", columns: 7, touch: false },
];

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
let port = 8890;
try {
  for (const size of sizes) {
    const { child, url } = await startServer(port++, size.label);
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height }, colorScheme: size.scheme, hasTouch: size.touch,
    });
    const page = await context.newPage();
    page.on("dialog", (d) => d.accept()); // "Remove …'s answer?"
    const note = () => page.locator("#barNote").innerText();
    const answers = () => page.locator(".people > ul > li").count();
    const tag = `[${size.label} ${size.width}px ${size.scheme}]`;
    try {
      await page.goto(url);
      await page.getByRole("heading", { name: "No poll for this week yet" }).waitFor();
      assert.equal(await page.locator("footer").innerText(), `Version ${VERSION}`);
      await page.getByRole("button", { name: /Create poll for 9–15 Nov/ }).click();
      await page.locator(".day").nth(6).waitFor();
      assert.equal(await page.locator(".day").count(), 7);
      ok(`${tag} creates this week's poll with seven days; footer shows ${VERSION}`);

      const xs = await page.locator(".day").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
      assert.equal(new Set(xs).size, size.columns, `day columns: ${xs}`);
      assert.ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), "no sideways scrolling");
      ok(`${tag} ${size.columns} day column(s), nothing wider than the screen`);

      const day = (i) => page.locator(".day").nth(i);
      for (const i of [0, 1]) {
        assert.match(await day(i).innerText(), /Passed/);
        assert.ok(await day(i).getByRole("button", { name: "19:00" }).isDisabled());
      }
      assert.match(await day(2).innerText(), /Today/);
      assert.ok(await day(2).getByRole("button", { name: "19:00" }).isEnabled());
      ok(`${tag} past days are shown but cannot be picked; today is marked`);

      const nameBox = await page.locator("#name").boundingBox();
      const passBox = await page.locator("#password").boundingBox();
      assert.ok(passBox.x > nameBox.x + nameBox.width, "password box is to the right of the name box");
      assert.ok(Math.abs(passBox.y - nameBox.y) < 4, "on the same row");
      assert.equal(await page.locator("#password").getAttribute("type"), "password");
      await page.locator("#password").fill(PW);
      await page.getByRole("button", { name: "Show password" }).click();
      assert.equal(await page.locator("#password").getAttribute("type"), "text");
      await page.getByRole("button", { name: "Hide password" }).click();
      assert.equal(await page.locator("#password").getAttribute("type"), "password");
      await page.locator("#password").fill("");
      ok(`${tag} password box right of the name, masked, Show/Hide works`);

      // Wednesday 19:00, Thursday at a free-choice 21:30
      await day(2).getByRole("button", { name: "19:00" }).click();
      await day(3).getByRole("button", { name: "Other time" }).click();
      await day(3).getByLabel("Hour").selectOption("21");
      await day(3).getByLabel("Minutes").selectOption("30");
      if (size.scheme === "dark") {
        const rgb = await day(3).getByLabel("Hour").evaluate((el) => getComputedStyle(el).color.match(/\d+/g).map(Number));
        assert.ok(rgb.every((c) => c > 200), `time list text is near-white in dark mode: ${rgb}`);
      }
      await page.locator("#name").fill("Ana");
      await page.locator("#submit").click();
      assert.match(await note(), /Enter the password/);
      assert.equal(await page.evaluate(() => document.activeElement.id), "password");
      await page.locator("#password").fill("not-it");
      await page.locator("#submit").click();
      await page.getByText("Wrong password. Nothing was changed.").waitFor();
      assert.equal(await answers(), 0);
      ok(`${tag} submitting without or with a wrong password saves nothing`);

      await page.locator("#password").fill(PW);
      await page.locator("#submit").click();
      await page.getByText("Submitted as Ana. Your answer is saved.").waitFor();
      assert.equal(await answers(), 1);
      assert.deepEqual(await page.locator(".people .what li").allInnerTexts(), ["Wed 11 Nov, 19:00", "Thu 12 Nov, 21:30"]);
      assert.match(await page.locator("#results").innerText(), /Results so far/);
      assert.match(await page.locator("#verdict h1").innerText(), /Wednesday 19:00 or Thursday 21:30/);
      assert.ok(await page.locator("#name").isDisabled(), "name locked after submitting");
      assert.ok(await page.locator("#password").isEnabled(), "password box still usable");
      const formBottom = (await page.locator("#answer").boundingBox()).y;
      assert.ok((await page.locator("#results").boundingBox()).y > formBottom, "results come after the form");
      ok(`${tag} right password saves; results and the answer (one option per line) appear`);

      await page.locator("#password").fill("not-it");
      await page.getByRole("button", { name: "Remove Ana's answer" }).click();
      await page.getByText("Wrong password. Nothing was changed.").waitFor();
      assert.equal(await answers(), 1);
      await page.locator("#password").fill(PW);
      await page.getByRole("button", { name: "Remove Ana's answer" }).click();
      await page.getByRole("heading", { name: "No evening picked yet" }).waitFor();
      assert.equal(await answers(), 0);
      ok(`${tag} removing needs the password; with it the answer is gone`);
    } catch (err) {
      const shot = join(tmpdir(), `poll-browser-${size.label}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      console.error(`${tag} failed; screenshot: ${shot}`);
      throw err;
    } finally {
      await context.close();
      child.kill();
    }
  }
} finally {
  await browser.close();
  rmSync(scratch, { recursive: true, force: true });
}
console.log("\nall", n, "browser checks passed");
