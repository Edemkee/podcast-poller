// Creates the git tag for the current version, with the change list as its message.
// Run by .github/workflows/tag-version.yml on every push to main.
// Set DRY_RUN=1 to print what would happen without creating anything.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dry = !!process.env.DRY_RUN;
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const exists = (tag) => {
  try {
    git("rev-parse", "-q", "--verify", `refs/tags/${tag}`);
    return true;
  } catch {
    return false;
  }
};

// package.json says 0.N.0; the project's version is 0.N.
const version = JSON.parse(readFileSync("package.json", "utf8")).version.replace(/\.0$/, "");
const changelog = readFileSync("CHANGELOG.md", "utf8");

function delta(v) {
  const lines = changelog.split("\n");
  const start = lines.indexOf(`## ${v}`);
  if (start < 0) throw new Error(`CHANGELOG.md has no "## ${v}" section. Add one before releasing.`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

function ensure(v, commit) {
  const tag = `v${v}`;
  if (exists(tag)) return console.log(`${tag} already exists`);
  const message = `Version ${v}\n\n${delta(v)}\n`;
  if (dry) return console.log(`would tag ${commit.slice(0, 7)} as ${tag}:\n${message}`);
  const file = join(mkdtempSync(join(tmpdir(), "tag-")), "message.txt");
  writeFileSync(file, message);
  git("tag", "-a", tag, commit, "-F", file);
  git("push", "origin", `refs/tags/${tag}`);
  console.log(`tagged ${commit.slice(0, 7)} as ${tag}`);
}

// 0.1 was released before tagging existed: it is the repository's first commit.
if (changelog.includes("\n## 0.1\n")) ensure("0.1", git("rev-list", "--max-parents=0", "HEAD").split("\n")[0]);
ensure(version, git("rev-parse", "HEAD"));
