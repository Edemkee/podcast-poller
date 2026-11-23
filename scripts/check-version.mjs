// Checks the version rule from CLAUDE.md: VERSION, package.json, the page footer and
// the newest CHANGELOG.md heading must all name the same MAJOR.MINOR.PATCH version.
//   node scripts/check-version.mjs              check that the four places agree
//   node scripts/check-version.mjs --unreleased also check that the version has no tag yet
//                                               (used on pull requests: each PR bumps once)
// Also imported by scripts/tag-version.mjs before it tags a release.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function checkVersion({ unreleased = false } = {}) {
  const version = readFileSync("VERSION", "utf8").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`VERSION must look like 0.3.0, found "${version}".`);

  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const newest = (changelog.match(/^## v([\d.]+)/m) || [])[1];
  for (const [where, found] of [
    ["package.json", JSON.parse(readFileSync("package.json", "utf8")).version],
    ["public/index.html footer", (readFileSync("public/index.html", "utf8").match(/Version ([\d.]+)<\/footer>/) || [])[1]],
    ["the newest CHANGELOG.md heading", newest],
  ]) {
    if (found !== version) throw new Error(`${where} says ${found}, VERSION says ${version}. They must agree.`);
  }

  if (unreleased) {
    let tagged = true;
    try {
      execFileSync("git", ["rev-parse", "-q", "--verify", `refs/tags/v${version}`], { stdio: "ignore" });
    } catch {
      tagged = false;
    }
    if (tagged) throw new Error(`v${version} is already released. Raise VERSION once in this pull request.`);
  }
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const unreleased = process.argv.includes("--unreleased");
    const v = checkVersion({ unreleased });
    console.log(`version ${v}: VERSION, package.json, footer and CHANGELOG agree${unreleased ? "; not released yet" : ""}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
