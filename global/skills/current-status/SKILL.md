---
name: current-status
description: Report where the current project stands, read-only. It covers git state, other worktrees and open PRs, open plans and handoffs, each track's or docs area's status, and the open calls waiting on the owner. Use it whenever the user asks "where we at", "status", "catch me up", "what's open", "what's next", "what did we do", or comes back after a break, even if they don't name the skill. With a track name as the argument, report on that one track.
---

# Current status

A short, read-only report of where the project stands now and what waits on the owner. The owner
uses it to pick the next task, so it says what is true now, not the story of how it got there.

## Steps

1. **Gather.** Run `sh ~/.claude/skills/current-status/scripts/gather.sh` from the project. It
   prints, in under a second: git state, recent commits, worktrees, unmerged branches, open PRs,
   open plans and handoffs, each docs area's "Where it stands", the newest `history.md` entries
   and the open questions. It never fetches, so remote state is as of the "last fetch" line.
2. **Check what the script can't judge.** Read more only where the report needs it:
   - Uncommitted changes: `git diff --word-diff=plain --word-diff-regex='[^[:space:]]+' | grep -E '\[-|\{\+'`
     shows the real word changes, so you can say "line rewrapping only" or name what changed.
   - An open plan or handoff: read its status line and its last phase or gate, to say how far it got
     and whether it waits on the owner.
   - A "Where it stands" dated earlier than its area's newest `history.md` entry may be stale. Say
     so; don't fix it.
   - The project's `CLAUDE.md` may list choices that need the owner (hard to undo, paid, design).
     One not made yet that the next work will hit is an open call.
3. **Report** in the format below.

No `.claude/docs` in the project: build the areas from what the script lists instead (README,
TODO, ROADMAP, CHANGELOG, `docs/`) and from recent commits and branches. Say the project has no
status docs; don't create them.

With an argument (a track or area name): report only that area. Give its full "Where it stands",
all its open questions, and its newest three `history.md` entries with their results.

## What counts as an open call

A decision only the owner can make that blocks or shapes the next work:

- items marked as the owner's call, and the owner's calls named in a "Next:" line
- design questions that block the next step (design belongs to the owner)
- paid tools, licenses and terms of use, and hard-to-undo choices from `CLAUDE.md` not made yet
- an open plan waiting at a gate for the owner's answer

Not open calls: Claude's own technical to-dos, known flaws, lists of things not tried yet, and
research findings. Leave them out; the owner can ask for one area to see them.

Group calls that are the same question asked in two docs (for example a whole-game question that
a track points to). Give each call one short line and where it lives.

## Report format

```
<Status line: branch, clean or not, synced or not, anything in progress.>

**Repo** (only what needs attention; skip the section if nothing does)
- uncommitted changes: what kind
- other worktrees or unmerged branches: likely other live sessions, left alone
- open PRs, plans or handoffs: how far each got

**Tracks** (or Areas)
| Track | Where it stands | Next |
|---|---|---|
| <name> | <one or two lines> | <next step, or "not picked"> |

**Open calls for you**
- <the call, in plain words> (<doc, section>)

<One line: the suggested next step, or a question if something needs the owner now.>
```

- Order tracks from most active to least. Fold the ones not started into one row.
- Name a track's decided points only when they matter for what comes next.
- Use plain words, not the project's internal names, unless the owner needs a name to find it.
- Keep it to about 25 lines. The owner can ask for more.

## Never

- Change anything: no commit, fetch, pull, stash, cleanup or doc fix during a status report. Report
  what looks wrong instead, and offer the fix in the last line.
- Suggest removing other worktrees or branches. They are probably other live sessions.
- Report numbers or results from older runs, or the history of how a decision was made.
