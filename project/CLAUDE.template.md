<!--
Notes for whoever edits this guide. Claude Code strips HTML comments, so these cost no context.
- Budget: 200 lines, not counting comments. The guide check hook warns when the file is over.
- This file is an index: what the project is, the rules every session needs, and where everything
  else lives. Area conventions go to .claude/rules/, procedures to skills, facts and reasons to
  .claude/docs/. Why: .claude/docs/tech/decisions.md §1.
- Add a rule after the same mistake happens twice, not once.
- What the guide check flags: the comment at the top of .claude/hooks/check-guide.sh.
- Set up from claude-code-kit.
-->

# {{Project name}}, agent guide

{{One line: the stack and where it runs. Example: "Next.js 16 web app with Postgres, deployed on Fly.io."}}
This file holds the rules every session needs and says where everything else lives. The reasons
behind the rules are in `.claude/docs/tech/decisions.md` (the § numbers below). Read the section
for an area before you change how it works or undo a rule. Skip it for ordinary work.

## What this is

{{2-4 lines: what the product is and who it is for. Then what the owner has settled so far, and
that everything else is open.}} Details: `.claude/docs/product/concept.md`. Read it before you
design a feature.

## Tracks

Parallel sessions can each work on one track, an area with its own design, technical decisions,
research, plans and tests, each in its own git worktree. Each track lives in
`.claude/docs/tracks/<track>/`. What each covers, and the rules for files tracks share:
`.claude/docs/tracks/README.md`. When a task belongs to a track, read its `README.md` first.

Tracks so far: none.

## Working in this repo

The owner's general rules (writing style, plans, handoffs and research, commits, branches and PRs)
are in their global `~/.claude/CLAUDE.md` and apply here. On top of those:

- **Verifying here means:** {{the real commands, each run once at setup. Example: "`npm run build`,
  `npm test`, `npm run lint`, then start the app with `npm run dev` and open the page you changed"}}.
- **Anything the owner would have an opinion on goes in the reply**, never into a quiet decision.
- **Stop and ask before a choice that is hard to undo:** {{Example: "a new framework or database,
  a data migration, a public API change, any paid service or tool"}}.
- **The product's needs come first, tools serve them.** If a tool can't do what the product needs,
  say so and look for another way. Never shrink the product to fit the tool. Test an approach
  against the product's premise, its design and the tools' known limits before you recommend it.
  If it only works by dropping one of them, report that it fails. Don't present it as an option.

## Never break

{{3-6 rules that must hold in every change, each with a short reason. Back each one with a deny
rule in `.claude/settings.json` or a hook where possible, because prose alone is weak (§1).
Examples: "Never edit generated code in `src/generated/`: the next codegen run overwrites it.",
"Schema changes only through a migration file, never by hand in the database."}}

## Where things live

Find files by search. This map says where each kind of thing lives. Gitignored folders are skipped
by search tools: give such a folder as an explicit path.

| Path | What |
|---|---|
| {{one row per top-level folder a session needs to know about}} | |
| `.claude/settings.json` | deny rules, and the hook that runs the guide check at session start |
| `.claude/hooks/`, `.claude/tools/` | the guide check (`check-guide.sh`, prints only problems) and `lost_facts.sh` (lists facts left without a home when text leaves a current doc) |

| Task | How |
|---|---|
| {{common tasks. Example: "Add a dependency"}} | {{the command, or the file to copy}} |

## Knowledge: where to find, edit and create

Each kind of project knowledge has one home. Before you create a doc, rule or skill, look for an
existing one on the topic and extend it.

| Kind | Home |
|---|---|
| One track's area: its design, technical decisions, tests, and its research, plans and handoffs | `.claude/docs/tracks/<track>/` |
| Product design for the whole product: concept, users, features, look | `.claude/docs/product/` |
| Technical for the whole project: stack, packages, tools, build, tests, how the code is organized | `.claude/docs/tech/`. The reasons: `decisions.md`, one § per area |
| A convention to follow whenever certain files are touched | `.claude/rules/<area>.md` with `paths:` globs. It loads when Claude reads a matching file |
| A step-by-step procedure | a skill in `.claude/skills/<name>/`: a core `SKILL.md` (at most 20,000 bytes) plus reference files for detail only some tasks need |
| Something that must never happen | a deny rule in `.claude/settings.json` or a hook, plus one line in [Never break](#never-break) |
| Research, plans, handoffs | `.claude/research/`, `.claude/plans/`, `.claude/handoff/`, as the owner's global rules say, and an entry in the area's `history.md`. A track's are named `DD-MM-YYYY-<track>-<topic>.md` |
| What was done, tried or decided, and where the details are | the area's `history.md` ([Finding past work](#finding-past-work)) |

- Each docs area has a `README.md` that lists its docs and says how they are written. Read it
  before you create or edit a doc in that area, and add every new doc to its list.
- **Product design belongs to the owner.** Propose design decisions in your reply. Never write one
  into a doc as settled until the owner agrees. The owner's answers to open questions are leanings
  until they call a point decided (`.claude/docs/product/README.md`). A pick made for a test is
  test data, not the product's choice: say so. A limit of today's tools is never a product rule.

## Finding past work

Current docs (this file, rules, skills, and `.claude/docs/` except each `history.md`) say what is
true now. The `phased-plan` skill calls them living docs. What was done, tried, measured or said,
and why, is in records (plans, logs, handoffs, research) that change only in a status line or a
pointer. The way in:

1. The area's `history.md` (in `.claude/docs/product/`, `.claude/docs/tech/` or the track's
   folder): one entry per piece of work, newest first, with the result, the owner's verdict and
   links. Dropped approaches too.
2. The entry's log for the numbers and the owner's exact words (`grep -n "^## "` lists its phases
   and gates). The plan's "What the plan got wrong" for what turned out false.
3. A file gone from the tree: the `git show` command in its entry. When and why a file changed:
   `git log -- <path>` and the PR named in the entry.

Open a `-done` file this way, when the current docs don't answer the question.

## Done means

- {{The checks every change passes. Example: "`npm run build` and `npm run lint` are clean, and all
  tests pass."}} The feature's own check ran.
- **Docs follow the change.** If the change makes a doc, rule, skill or line of this file wrong,
  fix it in the same change. A new fact or reason goes to its home in the Knowledge table above.
  Current docs get what is true now, never a run record (one run's numbers, a dated story): that
  stays in its record, and `history.md` points to it. After you move text out of a current doc,
  run `sh .claude/tools/lost_facts.sh --since <commit>` with the commit before your edit: it lists
  the facts left without a home.
- **Screenshots are read, not counted.** A visual check is done only when you opened the image and
  said what it shows.
- **Feel is not tested.** For UI, animation or anything the owner judges by eye, show the owner a
  screenshot and wait for an OK before building on it.

## Plans and sub-agents

Use the **`phased-plan` skill**. What it needs from this project:

- **Every sub-agent prompt carries** the [Never break](#never-break) list, "search ignored folders
  with an explicit path", the rule files and skills its task touches, and its track's `README.md`.
  General-purpose sub-agents load this file themselves, as it was when the main session started:
  don't list it as a read unless an earlier phase changed it. Explore and Plan agents get no
  CLAUDE.md, and path-scoped rules are not documented to reach them.
- **A rule pasted into the prompt is not also listed as a read.**
- **The owner's answers** go into the log word for word, under
  `## Gate <name>, owner's answer (<date>)`.
- **The last phase** writes what is true now into the current docs (this file's rules and map, the
  area's rule file or skill, the track's `tech.md` or a topic doc, `decisions.md`), adds one entry
  to the area's `history.md` and, in a track, replaces "Where it stands". The run's numbers and
  story stay in the log, and the plan keeps "What the plan got wrong". The docs check also looks
  for a test's pick, a proposal or a tool's limit written as the product's.

## Conventions

- Comments and docs follow the owner's Writing rules: short, plain, no em dashes.
- Claude's training data is older than some packages here. For a package API, read its source in
  {{the dependency folder. Example: "`node_modules/<name>/`"}} instead of guessing.
