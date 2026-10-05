---
name: docs-flow
description: Use this whenever a task touches a project's agent docs, before you answer or edit, even for a one-line change. That covers deciding where something belongs in the docs, writing down the owner's decision, leaning or answer, editing CLAUDE.md, .claude/docs/ (area READMEs, decisions, design, tracks, history.md), .claude/rules/ or .claude/skills/, saving research, finishing a plan or handoff, updating a track's "Where it stands", and adding a track, rule or skill. It holds the two goals of the docs flow and the steps that keep docs current, decisions apart from history, and start context small. Review mode, when the user asks to review, audit or check the docs.
---

# Docs flow

Steps for keeping a project's agent docs right. The project's own docs hold its rules: this skill
gives the steps and says where to look. Where they differ, the project's docs win.

## The two goals

Every docs change serves both. Judge each choice, and each review finding, against them.

1. **Current state, the owner's decisions and history, kept apart.** Current docs say what is true
   now and hold every decision the owner made. What was done, tried, measured or said lives in
   records (research, plans, logs, handoffs), and each area's `history.md` points to them.
2. **Small start context.** A new session loads little at start and reads only what its task
   needs. Every always-loaded line and every long file must earn its place.

## Where the rules are

Read by section: list the headings with `grep -n "^#" <file>`, then read only the part you need.

| What | Where |
|---|---|
| The home for each kind of fact | `CLAUDE.md`, the Knowledge table |
| How one area's docs are written, and its doc list | that area's `README.md` in `.claude/docs/<area>/` |
| Track docs and the `history.md` entry format | `.claude/docs/tracks/README.md` |
| Why the guide is laid out this way, its size limits | the agent guide section (§1) of `.claude/docs/tech/decisions.md` |
| How to find past work | `CLAUDE.md`, "Finding past work" |
| Writing style | the owner's Writing rules in `~/.claude/CLAUDE.md` |

If the project lacks part of this layout, follow the rest. Propose the missing part in the reply
instead of creating it on your own.

## Before you edit

1. **Find the home** in the Knowledge table. Search for a doc on the topic and extend it before
   you create a new one.
2. **Current doc or record?** A record changes only in a status line or a pointer.
3. **Note the commit** (`git rev-parse HEAD`) when text will leave a current doc. The lost facts
   check needs it.

## Writing current docs (goal 1)

- **What is true now.** One run's numbers or a dated story stays in its log, and `history.md`
  points to it.
- **One home per fact.** Anywhere else, write a pointer: the path and the heading. The same fact in
  other words is still a copy.
- **Design belongs to the owner.**
  - A point goes into Decided only when the owner calls it decided, with the date and a short
    reason.
  - Answers to open questions, and reactions to research, mockups or art, are leanings: under
    Ideas, dated, marked as the owner's.
  - Write ideas into a doc only when the owner asks. Otherwise propose them in the reply.
  - A test's pick stays marked as the test's. A tool's limit goes in Open questions, never in
    Decided as a rule of the product.
- **Every decided point says who decided and when.** In design docs only the owner decides, so
  the date is enough. In tech docs, where both decide: "(owner's choice, DD-MM-YYYY)" or "(Claude
  decided, DD-MM-YYYY)". The owner's exact words stay in the log. Quote them in a doc only when
  the wording matters.
- **Links into finished records go through `history.md`**, never straight into a `done/` folder.

## Keeping start context small (goal 2)

Every session loads: both `CLAUDE.md` files, the memory index, each skill's name and description,
rules without `paths:`, and whatever SessionStart hooks print.

- **CLAUDE.md is an index.** Add a line only when nearly every session needs it. Put detail in a
  rule with `paths:` (loads when a matching file is read), a skill reference file or a topic doc,
  and leave a pointer.
- **Every rule gets `paths:`** unless it truly applies to every session.
- **Skill descriptions stay short**, since they load in every session. `SKILL.md` holds what every
  use needs, and reference files hold the rest.
- **Docs are made to be read in parts:** one topic per file, clear headings. Decision and design
  docs get no size cap, because a cap would push decisions out. They get headings instead.
- **`history.md` entries stay small** (the project's limit) and only point to their record. Read a
  history by its titles first: `grep -n "^## " history.md`.
- **A rule said in two files** costs twice and drifts apart. Point to the one home instead.
- **Add a rule after a mistake happens twice**, not after one stumble.

## Common jobs

- **Write down an owner's decision:** put it under Decided in its home doc with the date and
  reason, take it out of Ideas and Open questions everywhere, and fix the pointers.
- **Save a research doc:** add an entry to the area's `history.md` with status `research`. No
  status line, no rename.
- **Finish a plan or handoff:**
  1. Add the status line at the top, rename the file to end in `-done`, and `git mv` it into `done/`.
  2. Fix every reference to the old path.
  3. Add or update its `history.md` entry.
  4. Write what is now true into the current docs. In a track, replace "Where it stands".
- **Move text out of a current doc:** run `sh .claude/tools/lost_facts.sh --since <commit>`. Give
  every fact it lists a home, or tell the owner you dropped it on purpose.
- **Add a doc or folder:** add it to its area README's Docs list in the same change.
- **Add a track:** follow "Adding a track" in `.claude/docs/tracks/README.md`.

## Before you finish

1. `sh .claude/hooks/check-guide.sh` prints nothing.
2. If text left a current doc, `lost_facts.sh` lists no fact without a home.
3. Read your diff for what the scripts can't see:
   - a proposal, leaning, test pick or tool limit written as decided
   - a decided point with no "who and when"
   - a fact now in two docs, in any wording
   - a run record or dated story in a current doc
   - a "Where it stands" that is stale or longer than 12 lines
   - a doc that no longer matches the files or code it describes
   - a new always-loaded line (in CLAUDE.md, a rule without `paths:`, a skill description) that
     could live elsewhere
   - the owner's Writing rules: short, plain, lists, no em dashes

## Review mode

A sweep of all docs against the two goals, run only when the user asks for a review, audit or
check of the docs. Steps and the sub-agent prompt: `references/review.md`.
