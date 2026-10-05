# Setup, for Claude

You are Claude Code, and the user asked you to install this kit. This file is your procedure.
Follow the steps in order.

Scope: the user's global config, the current project, or both. If they didn't say, do both.
"Global" is `~/.claude/`, or `$CLAUDE_CONFIG_DIR` when that is set.

| Kit | Installs to | What |
|---|---|---|
| `global/CLAUDE.md` | `~/.claude/CLAUDE.md` | how the user wants you to work, in every project |
| `global/skills/` | `~/.claude/skills/` | `research`, `phased-plan`, `handoff` and `docs-flow` |
| `project/CLAUDE.template.md` | `<project>/CLAUDE.md` | the project's agent guide, a template to fill |
| `project/.claude/` | `<project>/.claude/` | docs areas with their `history.md` files, work folders, the guide check hook, the `lost_facts.sh` tool, settings |

## 1. Get the kit

If you only have a link, clone it into your scratchpad, or a temp folder if you have none:
`git clone --depth 1 <link> <folder>`. Run everything below from that folder. Read `README.md`
there once for the ideas behind the kit.

## 2. Look before you install

- Check that `sh` runs: `sh -c 'echo ok'`. The installer, the guide check hook and
  `lost_facts.sh` are plain `sh` scripts. macOS and Linux always have `sh`. On Windows it comes
  with Git for Windows, and Claude Code then runs your shell commands and its hooks in Git Bash.
- No `sh` (Windows without Git for Windows): do step 3 by hand. Copy each file, never overwrite
  one, and rename `CLAUDE.template.md` to `CLAUDE.md`. Leave the `SessionStart` hook out of
  `.claude/settings.json`, because Claude Code would run it in PowerShell, where it fails. Tell the
  user the guide check and `lost_facts.sh` need Git for Windows
  (https://git-scm.com/downloads/win), and that the hook entry to add afterwards is in the kit's
  `project/.claude/settings.json`.
- The project root is the git root. If the current folder is not in a git repo, ask the user
  whether to install the project part at all.
- Read what the kit will meet: `~/.claude/CLAUDE.md`, the project's `CLAUDE.md`, `.claude/`
  and `.claude/settings.json`, where they exist.
- `sh install.sh all <project root> --dry-run` (or `global`, or `project <project root>`).

## 3. Install

`sh install.sh all <project root>`. It copies files and never overwrites. Each file is:

- `copied`: new.
- `same`: already identical.
- `MERGE`: exists and differs, left as it was. You merge it in step 4.

At the end it lists the files with `{{...}}` placeholders. You fill those in steps 5 and 6.

Claude Code asks the user to approve edits to files in `.claude/`, even in accept-edits mode. That
is expected. Let the user approve each one, and never route around the prompt with a script or a
shell command.

## 4. Merge what already existed

For each `MERGE` file:

- **A CLAUDE.md** (global or project): keep everything the user has. Add the kit's sections and
  rules they lack, in the kit's order. Where a kit rule contradicts one of theirs, keep theirs and
  list the conflict for the user. Never delete their rules.
- **`.claude/settings.json`**: merge the JSON. Add the kit's `SessionStart` hook entry, keep all
  their keys and hooks.
- **A skill with the same name**: show the user what differs and ask which to keep.
- **Anything else**: show the user the difference and ask.

## 5. Make the global CLAUDE.md the user's own

The "About me" section has `{{...}}` lines. Ask the user, in one message:

1. Your role and experience, and your main stack.
2. Areas or tools that are new to you. Claude makes the technical calls there and says why.
3. How you check work: do you read diffs, or judge by the running result?
4. Anything else Claude should know, like your language or pet peeves.

Write each answer as one short bullet. Delete the placeholder of any question they skip.

In the same message, name the rules that are the kit author's taste, so the user can drop or
change them now: day-first dates (`DD-MM-YYYY-`) in file names, no em dashes, no figurative "buy",
Conventional Commits, and asking before every commit, push and PR. Apply what they answer.

## 6. Fill the project guide from the codebase

Fill every `{{...}}` in the project's `CLAUDE.md` and `.claude/docs/`. Take facts from the code,
not from guesses. The examples inside the placeholders are only examples.

- **What this is:** from the README and the package manifest. Put in
  `.claude/docs/product/concept.md` under Decided only what the user confirms. If it is unclear,
  ask.
- **Versions:** from the manifest, the lockfile and each tool's `--version`, into
  `.claude/docs/tech/environment.md`. Delete rows that don't apply.
- **Verifying here means:** the real build, lint, test and run commands, from the package scripts,
  Makefile or CI config. Run each one once. Write down only commands that work, and tell the user
  about any that fail.
- **Never break:** propose 2-5 rules from what you see: generated code, lockfiles, secrets, a
  migration tool, files another tool owns. Ask the user to confirm them. Back each confirmed rule
  with a `permissions.deny` entry in `.claude/settings.json` where one fits, like
  `"Edit(**/src/generated/**)"`. No rules yet: write "None yet."
- **Stop and ask before:** propose the hard-to-undo choices for this stack.
- **Where things live:** one row per top-level folder a session needs, plus gitignored folders
  worth searching (by explicit path). No file lists: sessions find files by search.
- **Tasks:** 2-5 common tasks and how to do them here. Skip what is obvious from the stack.
- **Done means** and **Conventions:** from the verify commands and the dependency folder.
- **Dates:** today's date, `DD-MM-YYYY`, in `decisions.md` and `environment.md`.
- **Tests:** if the project has tests, write `.claude/rules/testing.md` with `paths:` globs over
  the test files, the commands to run them, and the conventions you find. The kit's
  `examples/rules/testing.md` shows the format. Then add this line to "Done means" in `CLAUDE.md`:
  "**Tests follow `.claude/rules/testing.md`.** Read it before you write the first test in an
  area: it loads by itself only once a test file is read."
- **Tracks:** leave "Tracks so far: none", unless the user wants parallel sessions. Then follow
  "Adding a track" in `.claude/docs/tracks/README.md`. Each track gets its own `history.md`.
- **Past work:** if `.claude/research/`, `.claude/plans/` or `.claude/handoff/` already hold files,
  add one entry for each to the `history.md` of its area (`product/`, `tech/` or a track), in the
  format in `.claude/docs/tracks/README.md`. The guide check flags a record that no `history.md`
  names.
- **Skills:** a project skill whose `SKILL.md` is over 20,000 bytes gets flagged. Move the detail
  only some tasks need into reference files next to it, named in a "Reference files" table near
  its top. Never delete any of it.
- **Generated folders:** in a git repo, both scripts already leave out what git ignores. Add a
  generated folder to the skip lists at the top only when git does not ignore it, or the project
  is not in git: `SKIP_FOLDERS` and `SKIP_PREFIXES` in `.claude/hooks/check-guide.sh`,
  `SKIP_FOLDERS` in `.claude/tools/lost_facts.sh`. The guide check then does not test paths inside
  them, and `lost_facts.sh` does not count a fact found in their files.

Keep `CLAUDE.md` at most 200 lines, not counting HTML comments.

## 7. Verify

All of these must hold. Fix and re-run until they do.

- `sh .claude/hooks/check-guide.sh` from the project root prints nothing. In a project that
  already had docs, it may flag text that was there before: a run record in a current doc, a link
  into `done/`, the same long sentence in two docs. Show the user each one and fix it the way
  they choose. A run record is never deleted: it moves to its plan, log or handoff (or a new
  one), which a `history.md` entry names.
- No `{{` is left in the project's `CLAUDE.md` and `.claude/`, or in `~/.claude/CLAUDE.md`.
- `.claude/settings.json` is valid JSON. Check it with a JSON tool the machine has, like
  `python3 -m json.tool .claude/settings.json`, or in PowerShell
  `Get-Content .claude/settings.json -Raw | ConvertFrom-Json`.
- For each deny rule you added, try one edit it should block, and see it refused.

## 8. Report

Tell the user, in a short list:

- done or not done, and verified or not,
- what was installed, what was merged, and each conflict you kept their way,
- that the global rules and skills load in a new Claude Code session,
- the four skills: `research`, `phased-plan` and `docs-flow` start when the task fits, `/handoff`
  is typed by the user when a session gets long, and `docs-flow` reviews all docs when the user
  asks for a docs review.

Don't commit. The rules you just installed say to ask first. Offer to commit on a new branch.

## Updating later

Clone the kit again and run `sh install.sh all <project root> --dry-run`. New kit files are
`copied`. For each `MERGE` file, diff the kit's version against the installed one, and bring over
the kit's changes the user hasn't overridden. Ask when unsure: after install, the files are theirs.

A project set up before the kit had `history.md` files: give each docs area (`product/`, `tech/`,
each track) a `history.md`, move each track README's "## Work" table into it as one entry per row,
delete that table, and add entries for the other records as step 6 says. Then run the guide check.
