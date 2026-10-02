# Tracks

A track is one area of the product that one session can own while other sessions work on other
tracks, each in its own git worktree. A track's folder holds everything about its area: what it
covers, its files, its design, its technical decisions, its tests, and the index of its research,
plans and handoffs (`history.md`).

Tracks are optional. A project worked on by one session at a time can have none.

## Working in a track

1. Read the track's `README.md`: what it covers, its files, where it stands and what is next. Read
   its `history.md` when you need what happened before.
2. Read its `design.md` before you design anything in the area, and its `tech.md` before you change
   how something in it is built.
3. Before you end the session, update the track in the same branch:
   - "Where it stands" in the README: replace it, don't add to it. At most 12 lines: the state
     today, what is live (a plan, a handoff) and "Next:". The date once, at the top.
   - A finished plan, test or handoff, or a new research doc: one entry in the track's `history.md`
     (format below). Name new files `DD-MM-YYYY-<track>-<topic>.md` in the usual folder. When a
     file is marked done and moves to `done/`, update its path in the entry.
   - A technical fact or choice that is true now: `tech.md`, or the topic doc it belongs to, with
     the date and the reason in a line or two. When a fact changes, replace it: the old value stays
     in its log. Never a run record.
   - A design point: propose it in the reply. It goes into `design.md` only after the owner agrees.
   - Moving text out of a current doc: `sh .claude/tools/lost_facts.sh --since <commit>` prints
     each removed fact that no `.md` or data file in the repo holds. A backticked name or quoted
     text also counts as found in code.

## Worktrees

Each session works in its own git worktree, a folder next to the main checkout.

- **Branches.** The default branch is checked out in the main checkout, so no other worktree can
  switch to it. Start new work from the latest default branch: `git fetch`, then
  `git switch -c <branch> origin/<default branch>`. After a PR merges, the worktree stays on the
  old branch: make a fresh one before the next task.
- **A new worktree lacks the gitignored files:** secrets such as `.env` (copy them from another
  worktree), installed dependencies and build output (run the project's install and build
  commands). Git settings are shared by all worktrees and need nothing.
- **An app that only one session can drive at a time** (an open editor, a local server on a fixed
  port, a local database) serves every worktree. Check that no other session is using it before
  you do.
- The git stash is shared by every worktree too. Never `git stash pop` an entry you didn't make.

## How track docs are written

A track folder holds current docs (`README.md`, `design.md`, `tech.md`, topic docs) and one record
index (`history.md`). Current docs say what is true now. The story of each piece of work, its
numbers and the owner's words stay in the logs and plans, and `history.md` points to them.

Every doc keeps three parts apart: Decided, Ideas and Open questions. A test's pick or a limit of
today's tools never goes under Decided (`.claude/docs/product/README.md`).

- `design.md` follows the product docs' rules (`.claude/docs/product/README.md`): the owner
  decides, a decided point gets its date and a short why, and ideas go in only when the owner asks.
- `tech.md` follows the tech docs' rules (`.claude/docs/tech/README.md`): facts are verified and
  dated. Claude decides what the owner can't judge, and says who decided and why. Ideas are
  approaches not tried yet. Open questions include known flaws. It also says where the track's
  tests are and how its work is checked.
- A track's technical reasons live in its `tech.md`. `.claude/docs/tech/decisions.md` keeps what
  applies to the whole project. Its § numbers stay put: a § that moved into a track says where.
- When a topic outgrows its file, give it its own doc in the track folder and add it to the
  README's Docs list. No decision, design, tech or topic doc has a size limit: detail moves to a
  topic doc, never out of the docs. The only size limits are the guide check's three (`CLAUDE.md`,
  each `SKILL.md`, each `history.md` entry). "Where it stands" keeps to 12 lines as a writing rule.

## history.md

Each docs area (`.claude/docs/product/`, `.claude/docs/tech/`, every track) has one `history.md`:
an entry per plan, log, handoff and research doc, plus dropped approaches. An entry:

```markdown
## <Title> (<start date>[ to <end date>]), <live | done | dropped | research>
- Result: <what exists now and where, 1-2 lines>
- Owner: "<their verdict, short, word for word>" (<date>)      only if there was one
- Cost: <money or credits spent>                                only if money was spent
- Files: plan `<path>`, log `<path>`, research `<path>`, handoff `<path>`, PR #<n>
- Plan corrections: "What the plan got wrong" in the plan       only for plans
- Only here: <a fact no other file holds>                       only if any
```

- Newest first. At most 1,500 bytes per entry: it points to its log, which holds the rest. A plan
  and its log share one entry. One entry may name several files (a handoff and the research it
  asked for).
- A dropped approach whose files left the tree gives the command that recovers them:
  `git show <commit>^:<path>`.
- Each `history.md` starts with a 3-line header: what it indexes, and "How to find past work:
  `CLAUDE.md`, 'Finding past work'".
- The guide check flags a record in `.claude/research/`, `.claude/plans/` or `.claude/handoff/`
  (`done/` included) that no `history.md` names, and an entry over 1,500 bytes.

## Files two tracks share

Two sessions that edit the same file make a merge conflict later.

- Edit your track's docs and the files its README lists freely.
- Edit a shared file only when the change belongs to the whole project, keep the edit small, and
  name it in the reply. Shared: `CLAUDE.md`, the docs in `.claude/docs/product/` and
  `.claude/docs/tech/`, rules and skills, and the dependency manifest.
- Don't edit another track's docs unless the owner asks. When you need something from another
  track, add it to your own Open questions as "Needs from <track>: ..." and name it in the reply.
- Work that fits no track: tell the owner, who decides whether it becomes a track.

## Adding a track

Only when the owner asks.

1. Make `.claude/docs/tracks/<track>/` with four docs:
   - `README.md`: a one-paragraph summary, then "## Covers" (what is in the area and what is
     not), "## Files" (a table of the paths it owns), "## Where it stands" (the date, then at most
     12 lines, as above) and "## Docs" (a table listing `design.md`, `tech.md` and `history.md`).
   - `design.md` and `tech.md`: a one-line intro, then "## Decided", "## Ideas" and
     "## Open questions".
   - `history.md`: only its header (format above).
2. Once the track has files, add a rule `.claude/rules/track-<track>.md` whose `paths:` cover its
   folders, so a session that opens one of its files learns which track it is in. The rule says
   which track owns the files and to read the track's README before changing how they work. The
   guide check rejects a glob into a folder that doesn't exist yet.
3. Add the track to the list below and to the Tracks section of `CLAUDE.md`.

## Docs

None yet. Each track gets a row in a table here: its folder name and what it covers.
