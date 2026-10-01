---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up. When the remaining work is big or has several tasks, the handoff also says how the next session runs it through sub-agents (mostly one at a time, in parallel only where safe), so that session does not blow up its context or the user's token budget.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work.

`references/handoff-template.md` has the shape of the doc, the "How to run" block and the sub-agent
prompt. Fill it in.

## Where it goes

Save it in the project's `.claude/handoff/` folder (project root is the git root, else the working directory). Create the folder if it is missing. Never save it in the OS temp folder or the scratchpad. Name the file `DD-MM-YYYY-<short-slug>.md`, day first, e.g. `23-09-2026-search-migration-handoff.md`. If there is no project folder (a chat with no files), give the document in the reply instead.

If the project indexes its records (a `history.md` per docs area, or another index its `CLAUDE.md` names), add one entry for the handoff there, marked live.

When the handed-off task is finished, mark the handoff done: add `> **Status: DONE (DD-MM-YYYY).** Result: <path>.` at the top, rename the file to end with `-done`, move it into `.claude/handoff/done/` (`git mv`), and update every reference to its old path, the index entry included.

## What goes in it

- A "suggested skills" section, naming which skills the next agent should call the Skill tool for.
- Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.
- Redact any sensitive information, such as API keys, passwords, or personally identifiable information.
- If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

## Size the remaining work

A fresh session that takes on a big job by itself fills its context and burns the user's tokens.
So you, the writer, decide how the next session runs the work, and write that into the handoff. You
have the context to split it well. The next session does not.

| Remaining work | What the handoff says |
|---|---|
| One small task, fits one session with room to spare | The task only. No sub-agents: each one costs a full session start. |
| One big task: more than about 5 steps or a few hours | Run the phased plan at `<path>`. If there is none, the next session's first step is writing one with the `phased-plan` skill. Never write the plan into the handoff. |
| Several tasks | A task table plus the "How to run" block from the template, copied as is. The next session becomes the orchestrator. |

A big task inside a list gets its own phased plan. Its row in the table says "run the plan at `<path>`".

## Split into tasks

- One task is one deliverable a sub-agent can finish and check in one session.
- Give each agent task 3-8 lines: **Goal**, **Reads** (exact files), **Done when** (a check that can
  be run), **Watch out for**. A task that needs more than that needs a phased plan.
- Write into the task what you already know: names, numbers, paths, decisions. A sub-agent that has
  to rediscover them pays for it in tokens.
- Mark a task `self` when it takes only a few tool calls. The orchestrator does it directly.
- Merge small related tasks into one agent task. Fewer, fuller tasks cost less than many thin ones.

## One at a time, or in parallel

**Default: one sub-agent at a time.** Put tasks in the same parallel group only when all of these
hold:

- no task in the group needs another's result,
- each task is read-only (research, search, review), or edits files no other task in the group touches,
- no task uses something only one agent can drive at once: an open app or editor (a design tool, an IDE),
  a running app or dev server, a local database, a browser,
- no task builds, runs tests, installs packages or runs git.

In practice research and review run in parallel, and anything that changes code runs one at a time,
because it has to build and test. At most 3 agents per group.

Do not plan for worktrees (`isolation: "worktree"`) unless the user asks. Each one needs its own
setup (`node_modules`, a build cache, a local database), which costs more than it saves.

## Keep sub-agents cheap

- Search-only task: `subagent_type: Explore`.
- Mechanical task (rename across files, move text, fill a template): note `sonnet` in its row, so the
  orchestrator passes `model: "sonnet"`. Anything needing judgment stays on the default model.
- A task that produces findings saves them to a file named in the task and reports the path. Long
  findings never go into the report.

## Before you save

- [ ] Could a fresh agent with no memory of this conversation run task 2 from the doc alone?
- [ ] Does every agent task have Goal, Reads, Done when?
- [ ] Is every parallel group read-only or file-disjoint, with no shared live tool, build, test or git?
- [ ] Is a big task pointed at a phased plan instead of written out here?
- [ ] Is the "How to run" block there when there are 2 or more agent tasks?
- [ ] Suggested skills listed, secrets redacted, nothing copied that lives elsewhere?
