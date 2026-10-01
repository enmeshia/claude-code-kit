// Tests for project/.claude/hooks/check-guide.sh. Run from the kit root:
// node --test tests/check-guide.test.mjs tests/install.test.mjs tests/lost-facts.test.mjs
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

const tmpRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "guide-"));
  made.push(root);
  return root;
};

// A repo with the kit's project files installed and the placeholders left in.
function freshRepo() {
  const root = tmpRoot();
  fs.cpSync(path.join(KIT, "project"), root, { recursive: true });
  fs.renameSync(path.join(root, "CLAUDE.template.md"), path.join(root, "CLAUDE.md"));
  return root;
}

const check = (root) => execFileSync("sh", [HOOK, root], { encoding: "utf8" });
// The problems the hook reports, without the leading "- ".
const problems = (root) =>
  check(root)
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const build = (root, files, newline = "\n") => {
  for (const [rel, text] of Object.entries(files)) write(root, rel, text.replaceAll("\n", newline));
  return root;
};

// A small healthy repo, independent of the kit's own docs.
const PLAN = ".claude/plans/28-09-2026-billing-invoice-plan.md";
const HISTORY = ".claude/docs/tracks/billing/history.md";
const TECH = ".claude/docs/tracks/billing/tech.md";
const CONCEPT = ".claude/docs/product/concept.md";
const SKILL = ".claude/skills/deploy/SKILL.md";
const MOVE = "Move a part that only some tasks need into a rule file, a skill reference file or a topic doc. Never delete it";
const HEALTHY = {
  "CLAUDE.md":
    "<!-- a note for editors, not counted -->\n# Guide\n\n" +
    "- Concept: `.claude/docs/product/concept.md`\n" +
    `- The invoice plan: \`${PLAN}\`\n` +
    "- The bundle: `app/dist/bundle.js` (generated, skipped)\n" +
    "- A placeholder: `.claude/docs/tracks/<track>/README.md`\n",
  ".claude/rules/testing.md": '---\npaths:\n  - "app/src/**/tests/**"\n---\n# Tests\n',
  ".claude/docs/product/README.md": "# Product docs\n\n## Docs\n\n- `concept.md`: the premise\n- `history.md`: past work\n",
  [CONCEPT]: "# Concept\n",
  ".claude/docs/product/history.md":
    "# Product history\n\n## Docs refactor (01-10-2026), live\n" +
    "- Files: plan `.claude/plans/01-10-2026-refactor-plan.md`, log `.claude/handoff/01-10-2026-refactor-log.md`\n",
  ".claude/docs/tracks/README.md": "# Tracks\n\n## Docs\n\n- `billing/`: payments\n",
  ".claude/docs/tracks/billing/README.md": "# Billing\n\n## Docs\n\n- `tech.md`: technical facts\n- `history.md`: past work\n",
  [TECH]: "# Billing tech\n",
  [HISTORY]: `# Billing history\n\n## Invoice test (28-09-2026), live\n- Files: plan \`${PLAN}\`\n`,
  [PLAN]: "# Invoice plan\n",
  // A record names a file its later phases will make. Records are not read.
  ".claude/plans/01-10-2026-refactor-plan.md": "Phase 4 makes `.claude/docs/tracks/billing/refunds.md`.\n",
  ".claude/handoff/01-10-2026-refactor-log.md": "Later: `.claude/docs/tech/build.md`.\n",
  "app/src/billing/tests/.gitkeep": "",
  "app/src/billing/invoice.py": `"""Plan: ${PLAN}, "The fit"."""\n# Owner rules: ~/.claude/CLAUDE.md (global, outside the repo)\n`,
  "app/src/billing/Invoice.cs": `// Plan: ${PLAN}, "Binding".\npublic class Invoice {}\n`,
  // Folders the code check skips: not our code.
  "app/.venv/Lib/site.py": "# .claude/plans/gone.md\n",
  "app/node_modules/x/index.js": "// .claude/plans/gone.md\n",
};
const healthy = (newline = "\n") => build(tmpRoot(), HEALTHY, newline);

// `size` LF bytes (a multiple of 100) of 99-character lines of `char`. Use a different char in each
// doc, so no sentence repeats across docs.
const filler = (char, size) => (char.repeat(99) + "\n").repeat(size / 100);

// The kit's own files

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

// Paths and globs

test("a healthy repo has no problems, with LF or CRLF line endings", () => {
  assert.equal(check(healthy()), "");
  assert.equal(check(healthy("\r\n")), "");
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

test("a missing path in CLAUDE.md is reported", () => {
  const root = healthy();
  fs.appendFileSync(path.join(root, "CLAUDE.md"), "- Gone: `.claude/docs/product/gone.md`\n");
  assert.deepEqual(problems(root), ["CLAUDE.md:8 names `.claude/docs/product/gone.md`, which does not exist"]);
});

test("a path into a plan that moved into done/ is reported", () => {
  const root = healthy();
  fs.rmSync(path.join(root, PLAN));
  write(root, ".claude/plans/done/28-09-2026-billing-invoice-plan-done.md", "# Done\n");
  assert.ok(problems(root).includes(`CLAUDE.md:5 names \`${PLAN}\`, which does not exist`));
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
  const root = healthy();
  write(root, ".claude/rules/api.md", '---\npaths:\n  - "server/api/**"\n---\n# API\n');
  assert.deepEqual(problems(root), ['.claude/rules/api.md: glob "server/api/**" points into `server/api`, which does not exist']);
});

// Docs lists

test("a doc missing from its README list is reported", () => {
  const root = healthy();
  write(root, ".claude/docs/product/lore.md", "# Lore\n");
  assert.deepEqual(problems(root), ["`.claude/docs/product/lore.md` is missing from the list in .claude/docs/product/README.md"]);
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

// History: every record is named in a history.md

test("records may name files that do not exist yet", () => {
  const root = healthy();
  build(root, {
    ".claude/plans/30-09-2026-fit-plan.md": "Log: `.claude/handoff/30-09-2026-fit-log.md`\n",
    [HISTORY]: read(root, HISTORY) + "## Fit (30-09-2026), live\n- Files: plan `.claude/plans/30-09-2026-fit-plan.md`\n",
  });
  assert.equal(check(root), "");
});

test("a record named in a history.md passes, one missing from every history.md is reported", () => {
  const done = ".claude/handoff/done/24-09-2026-camera-log-done.md";
  const root = healthy();
  write(root, done, "# Camera log\n");
  assert.deepEqual(problems(root), [`\`${done}\` is missing from every history.md`]);
  write(root, HISTORY, read(root, HISTORY) + `## Camera test (24-09-2026), done\n- Files: log \`${done}\`\n`);
  assert.equal(check(root), "");
});

test("a README work list does not count as history", () => {
  const research = ".claude/research/28-09-2026-billing-providers.md";
  const readme = ".claude/docs/tracks/billing/README.md";
  const root = healthy();
  build(root, { [research]: "# Providers\n", [readme]: read(root, readme) + `\n## Work\n\n- \`${research}\`\n` });
  assert.deepEqual(problems(root), [`\`${research}\` is missing from every history.md`]);
});

test("history needs the whole file name", () => {
  // `fit-plan.md` is the end of `billing-fit-plan.md`, but not that file.
  const root = healthy();
  build(root, {
    ".claude/plans/fit-plan.md": "# Fit\n",
    [HISTORY]: read(root, HISTORY) + "- Files: `git show abc1234^:.claude/plans/billing-fit-plan.md`\n",
  });
  assert.deepEqual(problems(root), ["`.claude/plans/fit-plan.md` is missing from every history.md"]);
});

// Code links

test("a missing doc path in a code comment is reported, in Python and C#", () => {
  const root = healthy();
  build(root, {
    "app/src/fit.py": "import os\n# Plan: .claude/plans/gone-plan.md, Phase 2.\n",
    "app/src/Player/Mover.cs": 'using System;\n\n    // Why: .claude/docs/tracks/billing/gone.md, "Camera".\npublic class Mover {}\n',
  });
  assert.deepEqual(problems(root).sort(), [
    "app/src/Player/Mover.cs:3 names `.claude/docs/tracks/billing/gone.md`, which does not exist",
    "app/src/fit.py:2 names `.claude/plans/gone-plan.md`, which does not exist",
  ]);
});

test("in a git repo, code links skip what .gitignore ignores and read untracked files", () => {
  const root = healthy();
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  build(root, {
    ".gitignore": "generated/\n",
    "generated/out.js": "// .claude/plans/gone.md\n",
    "app/src/new.ts": "// See .claude/docs/gone.md\n",
  });
  assert.deepEqual(problems(root), ["app/src/new.ts:1 names `.claude/docs/gone.md`, which does not exist"]);
});

// Sizes: three limits (CLAUDE.md lines, SKILL.md bytes, history entries), none on other docs

test("docs of decisions and design have no size limit", () => {
  const readme = ".claude/docs/tracks/billing/README.md";
  const root = healthy();
  build(
    root,
    {
      ".claude/docs/tech/README.md": "# Tech docs\n\n## Docs\n\n- `decisions.md`: why\n",
      ".claude/docs/tech/decisions.md": filler("d", 50_000),
      ".claude/docs/tracks/billing/design.md": filler("g", 50_000),
      [TECH]: filler("t", 50_000),
      [readme]:
        "# Billing\n\n## Docs\n\n- `tech.md`: technical facts\n- `history.md`: past work\n" +
        "- `design.md`: the design\n- `refunds.md`: a topic\n\n" +
        filler("c", 50_000),
      ".claude/docs/tracks/billing/refunds.md": filler("p", 50_000),
      [CONCEPT]: filler("k", 50_000),
      ".claude/rules/big.md": filler("r", 50_000),
      ".claude/skills/deploy/details.md": filler("m", 50_000),
    },
    "\r\n",
  );
  assert.equal(check(root), "");
});

test("a SKILL.md at its limit passes, counted as LF bytes", () => {
  // 200 lines of 100 bytes: 20,000 bytes in git, 20,200 on disk with CRLF.
  const root = healthy();
  build(root, { [SKILL]: filler("s", 20_000) }, "\r\n");
  assert.equal(fs.statSync(path.join(root, SKILL)).size, 20_200);
  assert.equal(check(root), "");
});

test("a SKILL.md over its limit is reported", () => {
  const root = healthy();
  build(root, { [SKILL]: filler("s", 20_000) + "s\n" });
  assert.deepEqual(problems(root), [`${SKILL} is 20,002 bytes, over the 20,000-byte limit for a SKILL.md. ${MOVE}`]);
});

// HEALTHY's CLAUDE.md (6 lines without its comment) grown to `n` lines without comments.
const claudeMdLines = (n) =>
  HEALTHY["CLAUDE.md"] + Array.from({ length: n - 6 }, (_, i) => `- Rule ${i}: a line of the guide.\n`).join("");

test("CLAUDE.md at its line budget passes, one line over is reported", () => {
  const root = healthy();
  write(root, "CLAUDE.md", claudeMdLines(200));
  assert.equal(check(root), "");
  write(root, "CLAUDE.md", claudeMdLines(201));
  assert.deepEqual(problems(root), [`CLAUDE.md is 201 lines without comments, over its 200-line limit. ${MOVE}`]);
});

test("CLAUDE.md comment lines do not count", () => {
  const root = healthy();
  write(root, "CLAUDE.md", claudeMdLines(200) + "<!--\n" + ("c".repeat(99) + "\n").repeat(140) + "-->\n");
  assert.equal(check(root), "");
});

test("CLAUDE.md has no byte limit", () => {
  // About 14,000 bytes in 106 lines: only the line budget counts.
  const root = healthy();
  const text = HEALTHY["CLAUDE.md"] + Array.from({ length: 100 }, (_, i) => `${String(i).padStart(3, "0")} ${"z".repeat(135)}\n`).join("");
  assert.ok(Buffer.byteLength(text) >= 14_000);
  write(root, "CLAUDE.md", text);
  assert.equal(check(root), "");
});

// A history entry of `size` bytes: its heading, one line, the newline at the end.
const longEntry = (size) => {
  const heading = "## Long entry (30-09-2026), done\n";
  return heading + "- Result: " + "r".repeat(size - heading.length - "- Result: ".length - 1) + "\n";
};

test("a history entry at 1,500 bytes passes, counted as LF bytes", () => {
  const root = healthy();
  build(root, { [HISTORY]: read(root, HISTORY) + longEntry(1_500) + "\n" }, "\r\n");
  assert.equal(check(root), "");
});

test("a history entry over 1,500 bytes is reported", () => {
  const root = healthy();
  build(root, { [HISTORY]: read(root, HISTORY) + longEntry(1_501) });
  assert.deepEqual(problems(root), [`${HISTORY}: entry "Long entry (30-09-2026), done" is 1,501 bytes, over 1,500`]);
});

// Run records and done links in current docs

test("run-record headings in a current doc are reported", () => {
  const root = healthy();
  write(root, TECH, "# Billing tech\n\n## Test records\n\n### Invoice export, 30-09-2026\n");
  const message = "has a run-record heading. Current docs hold what is true now; the run belongs in the log";
  assert.deepEqual(problems(root), [`${TECH}:3 ${message}`, `${TECH}:5 ${message}`]);
});

test("dated text that is no run record passes", () => {
  const root = healthy();
  build(root, {
    [TECH]:
      "# Billing tech\n\n## Where it stands\n\n01-10-2026: the refund plan is next.\n\n" +
      "```markdown\n### Invoice checks, 29-09-2026\n```\n" +
      "<!--\n## Test records\n-->\n",
    [HISTORY]: read(root, HISTORY) + "## Camera test, 24-09-2026\n- Result: a camera\n",
  });
  assert.equal(check(root), "");
});

test("a current doc that points into done/ is reported", () => {
  const done = ".claude/plans/done/24-09-2026-camera-plan-done.md";
  const root = healthy();
  build(root, {
    [done]: "# Camera plan\n",
    [HISTORY]: read(root, HISTORY) + `## Camera test (24-09-2026), done\n- Files: plan \`${done}\`\n`,
    [TECH]: `# Billing tech\n- Camera: \`${done}\`, "Gate C"\n`,
  });
  assert.deepEqual(problems(root), [`${TECH}:2 points into done/ (${done}). Point to the history.md entry instead`]);
});

test("history.md and the bare done/ folder may point into done/", () => {
  const done = ".claude/plans/done/24-09-2026-camera-plan-done.md";
  const root = healthy();
  build(root, {
    [done]: "# Camera plan\n",
    [HISTORY]: read(root, HISTORY) + `## Camera test (24-09-2026), done\n- Files: plan \`${done}\`\n`,
    [TECH]: "# Billing tech\n- A done plan moves to `.claude/plans/done/`, or to `done/` next to it.\n",
  });
  assert.equal(check(root), "");
});

// Repeats

const SENTENCE =
  "Every invoice picture is checked against the base picture of its order, and a picture that fails " +
  "any check goes back to the renderer for a new draw.";

test("a long sentence in two current docs is reported, markup and case ignored", () => {
  const marked = SENTENCE.replace("Every invoice", "**Every** invoice").replace("base picture", "`base` picture");
  const root = healthy();
  build(root, {
    [CONCEPT]: `# Concept\n\nPictures first. ${marked} Then the model.\n`,
    [TECH]: `# Billing tech\n\n- ${SENTENCE.toLowerCase()}\n`,
  });
  assert.deepEqual(problems(root), [`"${SENTENCE.slice(0, 80)}..." is in both ${CONCEPT} and ${TECH}. Keep it in one home`]);
});

test("a sentence wrapped in a list item or in a table cell counts", () => {
  const space = SENTENCE.indexOf(" ", Math.floor(SENTENCE.length / 2));
  const wrapped = SENTENCE.slice(0, space) + "\n   " + SENTENCE.slice(space + 1);
  const root = healthy();
  build(root, {
    [CONCEPT]: `# Concept\n\n| Rule | Why |\n|---|---|\n| ${SENTENCE} | taste |\n`,
    [TECH]: `# Billing tech\n\n1. ${wrapped}\n2. Next.\n`,
  });
  assert.deepEqual(problems(root), [`"${SENTENCE.slice(0, 80)}..." is in both ${CONCEPT} and ${TECH}. Keep it in one home`]);
});

test("repeats that are allowed: in one doc, short, in code, in history.md, in a record", () => {
  const short = "An invoice picture is checked against the base picture of its order, and one that fails a check goes back to redraw it.";
  assert.equal(short.length, 119);
  const root = healthy();
  build(root, {
    [CONCEPT]: `# Concept\n\n${SENTENCE}\n\n${SENTENCE}\n\n${short}\n`,
    [TECH]: `# Billing tech\n\n${short}\n\n\`\`\`\n${SENTENCE}\n\`\`\`\n`,
    [HISTORY]: read(root, HISTORY) + `- Only here: ${SENTENCE}\n`,
    [PLAN]: `# Invoice plan\n\n${SENTENCE}\n`,
  });
  assert.equal(check(root), "");
});

// Output

test("the output caps at 15 problems", () => {
  const root = healthy();
  const gone = Array.from({ length: 20 }, (_, n) => `- \`.claude/docs/product/gone-${n}.md\`\n`).join("");
  fs.appendFileSync(path.join(root, "CLAUDE.md"), gone);
  const lines = check(root).trimEnd().split("\n");
  const problemLines = lines.filter((line) => line.startsWith("- "));
  assert.equal(problemLines.length, 16);
  assert.equal(problemLines.at(-1), "- ... and 5 more");
  assert.match(lines[0], /^Guide check/);
  assert.equal(lines.length, 18); // header, 15 problems, the "more" line, footer
});
