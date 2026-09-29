// Tests for install.sh. Run from the kit root: node --test
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const made = [];
const tmp = (name) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  made.push(dir);
  return dir;
};
after(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function run(args, home) {
  return execFileSync("sh", [path.join(KIT, "install.sh"), ...args], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_CONFIG_DIR: home },
  });
}

test("installs global and project files into empty folders", () => {
  const home = tmp("home");
  const project = tmp("project");
  const out = run(["all", project], home);
  assert.ok(fs.existsSync(path.join(home, "CLAUDE.md")));
  assert.ok(fs.existsSync(path.join(home, "skills", "phased-plan", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, "CLAUDE.md")), "template is renamed to CLAUDE.md");
  assert.ok(!fs.existsSync(path.join(project, "CLAUDE.template.md")));
  assert.ok(fs.existsSync(path.join(project, ".claude", "hooks", "check-guide.sh")));
  assert.ok(fs.existsSync(path.join(project, ".claude", "plans", "done")));
  assert.ok(fs.existsSync(path.join(project, ".claude", ".gitattributes")), "dotfiles are copied");
  assert.match(out, /0 to merge by hand/);
  assert.match(out, /Placeholders \{\{\.\.\.\}\} to fill \(project\): .*CLAUDE\.md \(\d+\)/);
});

test("never overwrites, and lists changed files to merge", () => {
  const home = tmp("home");
  const project = tmp("project");
  fs.writeFileSync(path.join(home, "CLAUDE.md"), "# My own rules\n");
  fs.mkdirSync(path.join(project, ".claude"));
  fs.writeFileSync(path.join(project, ".claude", "settings.json"), '{ "permissions": {} }\n');
  const out = run(["all", project], home);
  assert.equal(fs.readFileSync(path.join(home, "CLAUDE.md"), "utf8"), "# My own rules\n");
  assert.equal(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8"), '{ "permissions": {} }\n');
  assert.match(out, /To merge \(global\): CLAUDE\.md/);
  assert.match(out, /To merge \(project\): \.claude\/settings\.json/);
});

test("a second run finds everything the same", () => {
  const home = tmp("home");
  const project = tmp("project");
  run(["all", project], home);
  assert.match(run(["all", project], home), /^0 copied, \d+ already the same, 0 to merge/m);
});

test("dry run changes nothing", () => {
  const home = tmp("home");
  const project = tmp("project");
  const out = run(["all", project, "--dry-run"], home);
  assert.match(out, /Dry run, nothing changed/);
  assert.deepEqual(fs.readdirSync(home), []);
  assert.deepEqual(fs.readdirSync(project), []);
});
