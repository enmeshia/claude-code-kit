# Review mode

A sweep of all docs against the two goals in `SKILL.md`. Run it only when the user asks.

## Steps

1. **Run the scripts.** `sh .claude/hooks/check-guide.sh`, and note what it prints. If the user
   names a change (a PR, a branch), also run `sh .claude/tools/lost_facts.sh --since <commit
   before it>`.
2. **Look at the start context** (goal 2). Rough sizes only, no token counts:
   - lines and bytes of `CLAUDE.md` and `~/.claude/CLAUDE.md`
   - rules without `paths:`: `grep -L "^paths:" .claude/rules/*.md`
   - the description length of each project and global skill
   - each `history.md` and the largest current docs: `find .claude/docs -name "*.md" -exec wc -c {} + | sort -n`

   Flag what grew a lot, or what loads at start but only some tasks need.
3. **One read-only sub-agent reviews the docs** (general-purpose), with the prompt below. Use one
   per docs area only when the guide is too big for one agent to read, and at most 3.
4. **Check every finding yourself.** Open the file at the line. Drop the false ones and say why.
5. **Fix what needs no owner call** in the same turn, then run the guide check again:
   - a broken pointer, a missing Docs list entry, a stale "Where it stands"
   - a copy to replace with a pointer, a run record to move back into its log
6. **Ask the owner about the rest:**
   - anything that would change what is decided
   - a decided point whose "who decided" isn't known
   - a leaning or proposal written as decided
   - cutting, merging or moving a whole doc
7. **Report.** Status first. One list: each finding marked confirmed or rejected, and done (where)
   or to do. Commit only with the owner's permission.

## Sub-agent prompt

Fill in the brackets and paste:

```
Review this project's agent docs against two goals. Read only: change nothing.

Goals:
1. Current state, the owner's decisions and history, kept apart. Current docs say what is true
   now and hold every decision the owner made. What was done, tried, measured or said lives in
   records (research, plans, logs, handoffs), and each area's history.md points to them.
2. Small start context. A new session loads little at start (both CLAUDE.md files, skill
   descriptions, rules without paths:, SessionStart hook output) and reads only what its task
   needs.

Read first: CLAUDE.md (the Knowledge table, "Finding past work", "Done means"), every README.md
in .claude/docs/, and the agent guide section of .claude/docs/tech/decisions.md.
Then read every current doc: [CLAUDE.md, .claude/rules/, .claude/skills/, .claude/docs/ except
each history.md]. Read each history.md only for its format: entry size, links, statuses. Open a
record only to check a claim a current doc makes. [Known context: the change under review, or
"none".]

Look for:
- a fact in the wrong home, or in two docs in any wording
- a proposal, leaning, test pick or tool limit written as decided
- a decided point that doesn't say who decided and when
- a run record or dated story in a current doc
- a doc that no longer matches the files, folders or code it describes
- a stale "Where it stands", Docs list or pointer
- a record no history.md names, or a history entry that holds detail instead of pointing
- text loaded at every start that only some tasks need, and long docs with no headings to read
  them by
- writing that breaks the owner's rules: long, dense, em dashes

Report a list. Each item: file:line, the problem in one sentence, which goal it breaks, a
suggested fix. No praise, no summary of what is fine. At most 1,000 words.
```
