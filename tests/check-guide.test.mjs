// Tests for project/.claude/hooks/check-guide.sh. Run from the kit root: node --test
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = path.join(KIT, "project", ".claude", "hooks", "check-guide.sh");
const made = [];
after(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

// A repo with the kit's project files installed and the placeholders left in.
function freshRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "guide-"));
  made.push(root);
  fs.cpSync(path.join(KIT, "project"), root, { recursive: true });
  fs.renameSync(path.join(root, "CLAUDE.template.md"), path.join(root, "CLAUDE.md"));
  return root;
}

const check = (root) => execFileSync("sh", [HOOK, root], { encoding: "utf8" });
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};

test("a fresh install is healthy", () => {
  assert.equal(check(freshRepo()), "");
});

test("without an argument, it finds the repo root from its own path, as the hook runs it", () => {
  const root = freshRepo();
  write(root, "CLAUDE.md", "See `.claude/gone.md`.\n");
  const hook = path.join(root, ".claude", "hooks", "check-guide.sh");
  const out = execFileSync("sh", [hook], { encoding: "utf8", cwd: os.tmpdir() });
  assert.match(out, /CLAUDE\.md:1 names `\.claude\/gone\.md`/);
});

test("Windows line endings in the guide are handled", () => {
  const root = freshRepo();
  write(root, "CLAUDE.md", "See `.claude/gone.md`.\r\nAnd `.claude/docs/`.\r\n");
  write(root, ".claude/rules/api.md", '---\r\npaths:\r\n  - "server/**"\r\n---\r\n# API\r\n');
  const out = check(root);
  assert.match(out, /CLAUDE\.md:1 names `\.claude\/gone\.md`, which/);
  assert.doesNotMatch(out, /CLAUDE\.md:2/);
  assert.match(out, /glob "server\/\*\*" points into `server`,/);
});

test("folder names with regex characters don't break the check", () => {
  const root = freshRepo();
  fs.mkdirSync(path.join(root, "app", "(shop)", "[id]"), { recursive: true });
  write(root, "CLAUDE.md", "Pages: `app/(shop)/[id]/` and `app/(shop)/gone/`.\n");
  const out = check(root);
  assert.match(out, /names `app\/\(shop\)\/gone\/`/);
  assert.doesNotMatch(out, /\[id\]/);
});

test("a stale path in CLAUDE.md is reported, a path through a generated folder is not", () => {
  const root = freshRepo();
  fs.mkdirSync(path.join(root, "src"));
  write(root, "CLAUDE.md", "See `src/missing.ts`, `src/node_modules/x/y.js`, `.claude/nope.md` and `feat/branch`.\n");
  const out = check(root);
  assert.match(out, /CLAUDE\.md:1 names `src\/missing\.ts`/);
  assert.match(out, /CLAUDE\.md:1 names `\.claude\/nope\.md`/);
  assert.doesNotMatch(out, /node_modules|feat\/branch/);
});

test("a rule glob into a missing folder is reported", () => {
  const root = freshRepo();
  write(root, ".claude/rules/api.md", '---\npaths:\n  - "server/api/**"\n---\n# API\n');
  assert.match(check(root), /glob "server\/api\/\*\*" points into `server\/api`/);
});

test("docs list problems are reported", () => {
  const root = freshRepo();
  write(root, ".claude/docs/loose.md", "# Loose\n");
  write(root, ".claude/docs/tech/unlisted.md", "# Unlisted\n");
  write(root, ".claude/docs/empty/notes.md", "# Notes\n");
  fs.appendFileSync(path.join(root, ".claude/docs/product/README.md"), "| `gone.md` | a doc that is gone |\n");
  const out = check(root);
  assert.match(out, /`\.claude\/docs\/loose\.md` is outside the docs areas/);
  assert.match(out, /`\.claude\/docs\/tech\/unlisted\.md` is missing from the list/);
  assert.match(out, /`\.claude\/docs\/empty\/` has no README\.md/);
  assert.match(out, /lists `gone\.md`, which does not exist/);
});

test("a track's work file missing from its README is reported", () => {
  const root = freshRepo();
  write(root, ".claude/docs/tracks/billing/README.md", "# Billing\n\n## Docs\n\nNone yet.\n\n## Work\n\nNone yet.\n");
  fs.appendFileSync(path.join(root, ".claude/docs/tracks/README.md"), "\n| `billing/` | payments |\n");
  write(root, ".claude/research/01-10-2026-billing-providers.md", "# Providers\n");
  assert.match(check(root), /01-10-2026-billing-providers\.md` is missing from the work list/);
});

test("CLAUDE.md over budget is reported, HTML comments do not count", () => {
  const root = freshRepo();
  write(root, "CLAUDE.md", `<!--\n${"note\n".repeat(200)}-->\n${"line\n".repeat(150)}`);
  assert.equal(check(root), "");
  write(root, "CLAUDE.md", "line\n".repeat(151));
  assert.match(check(root), /CLAUDE\.md is 151 lines without comments/);
});
