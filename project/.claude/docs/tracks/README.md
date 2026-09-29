# Tracks

A track is one area of the product that one session can own while other sessions work on other
tracks, each in its own git worktree. A track's folder holds everything about its area: what it
covers, its files, its design, its technical decisions, its tests, and the list of its research,
plans and handoffs.

Tracks are optional. A project worked on by one session at a time can have none.

## Working in a track

1. Read the track's `README.md`: what it covers, its files, where it stands, and its work list.
2. Read its `design.md` before you design anything in the area, and its `tech.md` before you change
   how something in it is built.
3. Before you end the session, update the track in the same branch:
   - "Where it stands" in the README, with the date.
   - A new research doc, plan or handoff: name it `DD-MM-YYYY-<track>-<topic>.md`, keep it in the
     usual folder (`.claude/research/`, `.claude/plans/`, `.claude/handoff/`), and add it to the
     README's work list. When it is done and moves to `done/`, update its path in the list too.
     The guide check flags a file named after a track that its list is missing.
   - A technical fact or choice: `tech.md`, with the date and the reason.
   - A design point: propose it in the reply. It goes into `design.md` only after the owner agrees.

## How track docs are written

Every doc keeps three parts apart: Decided, Ideas and Open questions.

- `design.md` follows the product docs' rules (`.claude/docs/product/README.md`): the owner
  decides, a decided point gets its date and a short why, and ideas go in only when the owner asks.
- `tech.md` follows the tech docs' rules (`.claude/docs/tech/README.md`): facts are verified and
  dated. Claude decides what the owner can't judge, and says who decided and why. Ideas are
  approaches not tried yet. Open questions include known flaws. It also says where the track's
  tests are and how its work is checked.
- A track's technical reasons live in its `tech.md`. `.claude/docs/tech/decisions.md` keeps what
  applies to the whole project. Its § numbers stay put: a § that moved into a track says where.
- When a topic outgrows its file, give it its own doc in the track folder and add it to the
  README's Docs list.

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

1. Make `.claude/docs/tracks/<track>/` with three docs:
   - `README.md`: a one-paragraph summary, then "## Covers" (what is in the area and what is
     not), "## Files" (a table of the paths it owns), "## Where it stands" (dated), "## Docs" (a
     table listing `design.md` and `tech.md`), and "## Work" (a table of its research, plans and
     handoffs, newest first).
   - `design.md` and `tech.md`: a one-line intro, then "## Decided", "## Ideas" and
     "## Open questions".
2. Once the track has files, add a rule `.claude/rules/track-<track>.md` whose `paths:` cover its
   folders, so a session that opens one of its files learns which track it is in. The rule says
   which track owns the files and to read the track's README before changing how they work. The
   guide check rejects a glob into a folder that doesn't exist yet.
3. Add the track to the list below and to the Tracks section of `CLAUDE.md`.

## Docs

None yet. Each track gets a row in a table here: its folder name and what it covers.
