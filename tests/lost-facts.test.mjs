// Tests for project/.claude/tools/lost_facts.sh. Each test builds a small git repo. Run from the
// kit root: node --test tests/check-guide.test.mjs tests/install.test.mjs tests/lost-facts.test.mjs
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = path.join(KIT, "project", ".claude", "tools", "lost_facts.sh");
const made = [];
after(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const DOC = ".claude/docs/tech/environment.md";
const LOG = ".claude/handoff/done/30-09-2026-model-checks-log-done.md";
const LINES = {
  found: "- The fit check took 318 ms per pose.",
  unique: "- The probe gave 0.73519 on the last run.",
  separator: "- The picture check reads 12,201 pixels per hand.",
  quote: '- Owner: "keep the clips for the sandbox test only" (01-10-2026).',
  tool: "- Tool: `scripts/pictures.py`, checked 30-09-2026.",
};
const DOC_TEXT = "# Environment\n\n" + Object.values(LINES).join("\n") + "\n";
const LOG_TEXT =
  "# Model checks log\n\n" +
  "## Gate B, owner's answer (01-10-2026)\n" +
  "Fit: 318 ms a pose. Pixels per hand: 12201.\n" +
  "Ran `scripts/pictures.py` on 30-09-2026.\n";

const git = (root, ...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
const write = (root, rel, text, newline = "\n") => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text.replaceAll("\n", newline));
};

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "facts-"));
  made.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "config", "core.autocrlf", "false");
  write(root, DOC, DOC_TEXT);
  write(root, LOG, LOG_TEXT);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "docs: start");
  return root;
}

const remove = (root, key, newline = "\n") => write(root, DOC, DOC_TEXT.replace(LINES[key] + "\n", ""), newline);

const run = (root, ...args) => runIn(root, ...args);
function runIn(cwd, ...args) {
  const result = spawnSync("sh", [TOOL, "--since", "HEAD", ...args], { cwd, encoding: "utf8" });
  const lines = result.stdout.split("\n").filter(Boolean);
  const summary = (lines.at(-1) ?? "").match(/^lost_facts: (\d+) of (\d+) facts not found$/);
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    lines,
    missing: lines.slice(0, -1).map((line) => line.match(/^[^:]+: "(.*?)" in: /)?.[1]),
    total: summary ? Number(summary[2]) : undefined,
  };
}
// [missing facts, total], as the Python tests compare them.
const factsMissing = (root, ...args) => {
  const { missing, total } = run(root, ...args);
  return [missing, total];
};

test("a removed number that is in a log is found", () => {
  const root = repo();
  remove(root, "found");
  assert.deepEqual(factsMissing(root), [[], 1]);
});

test("a unique number is reported, with its doc and line", () => {
  const root = repo();
  remove(root, "unique");
  const result = run(root);
  assert.deepEqual(result.lines, [`${DOC}: "0.73519" in: ${LINES.unique}`, "lost_facts: 1 of 1 facts not found"]);
});

test("a thousands separator matches the plain number", () => {
  const root = repo();
  remove(root, "separator");
  assert.deepEqual(factsMissing(root), [[], 1]);
});

test("a missing owner quote is reported", () => {
  const root = repo();
  remove(root, "quote");
  // The date is in the log, the owner's words are not.
  assert.deepEqual(factsMissing(root), [["keep the clips for the sandbox test only"], 2]);
});

test("an owner quote in a log is found, across a line break", () => {
  const root = repo();
  write(root, LOG, LOG_TEXT + 'Owner: "keep the clips for the sandbox\ntest only"\n');
  remove(root, "quote");
  assert.deepEqual(factsMissing(root), [[], 2]);
});

test("a backticked name and a date are found", () => {
  const root = repo();
  remove(root, "tool");
  assert.deepEqual(factsMissing(root), [[], 2]);
});

test("a fact in any .md file of the repo is found, but not in a skipped folder", () => {
  const root = repo();
  remove(root, "unique");
  write(root, "node_modules/probe/README.md", "Probe: 0.73519\n");
  assert.deepEqual(factsMissing(root), [["0.73519"], 1]);
  write(root, "docs/probe.md", "Probe: 0.73519\n");
  assert.deepEqual(factsMissing(root), [[], 1]);
});

test("a number only in code is lost, a number in a data file is found", () => {
  const root = repo();
  remove(root, "unique");
  write(root, "src/probe.js", "export const PROBE = 0.73519;\n");
  write(root, "package-lock.json", '{ "probe": 0.73519 }\n');
  assert.deepEqual(factsMissing(root), [["0.73519"], 1]);
  write(root, "config/probe.json", '{ "probe": 0.73519 }\n');
  assert.deepEqual(factsMissing(root), [[], 1]);
});

test("backticked text in code is found, a date only in code is not", () => {
  const root = repo();
  write(root, LOG, "# Model checks log\n");
  write(root, "scripts/pictures.py", "# scripts/pictures.py, checked 30-09-2026\n");
  remove(root, "tool");
  assert.deepEqual(factsMissing(root), [["30-09-2026"], 2]);
});

test("a deleted doc counts every line", () => {
  const root = repo();
  fs.rmSync(path.join(root, DOC));
  const [missing, total] = factsMissing(root);
  assert.deepEqual(missing.sort(), ["0.73519", "keep the clips for the sandbox test only"]);
  assert.equal(total, 7); // 318 ms, 0.73519, 12,201, the quote, 01-10-2026, the tool path, 30-09-2026
});

test("a CRLF checkout reports only the removed lines", () => {
  const root = repo();
  git(root, "config", "core.autocrlf", "true");
  remove(root, "unique", "\r\n");
  assert.deepEqual(factsMissing(root), [["0.73519"], 1]);
});

test("records are not checked by default, only with --path", () => {
  const root = repo();
  write(root, LOG, "# Model checks log\n");
  assert.deepEqual(factsMissing(root), [[], 0]);
  assert.ok(run(root, "--path", LOG).total > 0);
});

test("facts: units, separators, dates, quotes, and what comes before a number", () => {
  // The expected facts are what the Python original finds in this line.
  const line =
    "- Δ123 and ±0.5 mm, ×2048 px, v5.2.1, 12,34, 1,234.5.6, 4,096 KB at 45° on 02-11-2027 with " +
    '`"key": 1` and “curly quotes are counted too”.';
  const root = repo();
  write(root, DOC, DOC_TEXT + line + "\n");
  git(root, "commit", "-q", "-am", "docs: add a line");
  write(root, DOC, DOC_TEXT);
  assert.deepEqual(factsMissing(root), [
    ["02-11-2027", '"key": 1', "curly quotes are counted too", "0.5 mm", "2048 px", "4,096 KB"],
    6,
  ]);
});

test("--strict exits 1 when one fact is missing", () => {
  const root = repo();
  remove(root, "unique");
  assert.equal(run(root).status, 0);
  const strict = run(root, "--strict");
  assert.equal(strict.status, 1);
  assert.equal(strict.lines[0], `${DOC}: "0.73519" in: ${LINES.unique}`);
  assert.equal(strict.lines.at(-1), "lost_facts: 1 of 1 facts not found");
});

test("--strict exits 0 when nothing is missing", () => {
  const root = repo();
  remove(root, "found");
  const result = run(root, "--strict");
  assert.equal(result.status, 0);
  assert.deepEqual(result.lines, ["lost_facts: 0 of 1 facts not found"]);
});

test("--path takes several files, and absolute paths", () => {
  const root = repo();
  remove(root, "unique");
  const result = run(root, "--path", LOG, path.join(root, DOC));
  assert.deepEqual(result.missing, ["0.73519"]);
  assert.match(result.lines[0], /^\.claude\/docs\/tech\/environment\.md: /);
});

test("--path reads a relative path from the folder it runs in", () => {
  const root = repo();
  remove(root, "unique");
  const tech = path.join(root, ".claude", "docs", "tech");
  const log = "../../handoff/done/" + path.basename(LOG);
  const result = runIn(tech, "--path", "environment.md", log);
  assert.equal(result.status, 0);
  assert.deepEqual(result.lines, [
    `${DOC}: "0.73519" in: ${LINES.unique}`,
    "lost_facts: 1 of 1 facts not found",
  ]);
});

test("a --path in neither the working tree nor <rev> exits 2", () => {
  const root = repo();
  const docs = path.join(root, ".claude", "docs");
  const typo = run(root, "--path", ".claude/docs/tech/enviroment.md");
  assert.equal(typo.status, 2);
  assert.equal(typo.stdout, "");
  assert.match(
    typo.stderr,
    /lost_facts: --path \.claude\/docs\/tech\/enviroment\.md: no such file in the working tree or in HEAD/,
  );
  // A path from the repo root, given in a subfolder, points nowhere.
  assert.equal(runIn(docs, "--path", DOC).status, 2);
  const outside = run(root, "--path", "../outside.md");
  assert.equal(outside.status, 2);
  assert.match(outside.stderr, /lost_facts: --path \.\.\/outside\.md is outside the repo/);
  // A deleted doc is still in <rev>, by a relative path and by an absolute one whose folder is gone.
  fs.rmSync(path.join(root, DOC));
  assert.equal(runIn(docs, "--path", "tech/environment.md").total, 7);
  fs.rmSync(path.join(root, ".claude", "docs"), { recursive: true });
  const gone = run(root, "--path", path.join(root, DOC));
  assert.equal(gone.status, 0);
  assert.equal(gone.total, 7);
});

test("usage errors exit 2, a bad revision exits 1", () => {
  const root = repo();
  const noSince = spawnSync("sh", [TOOL], { cwd: root, encoding: "utf8" });
  assert.equal(noSince.status, 2);
  assert.match(noSince.stderr, /--since is required/);
  assert.equal(run(root, "--bogus").status, 2);
  const bad = spawnSync("sh", [TOOL, "--since", "no-such-rev"], { cwd: root, encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, "");
  assert.match(bad.stderr, /lost_facts: git diff no-such-rev failed: fatal:/);
});
