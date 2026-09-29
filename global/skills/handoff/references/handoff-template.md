# Handoff template

Fill this in. Delete the notes in `<>` and any section that does not apply.

For a single small task, keep only the header, "Where things stand", the task itself, "Suggested
skills" and "References". Add "Tasks" and "How to run" when there are 2 or more agent tasks. Copy
"How to run" close to verbatim: it is how the next session knows the rules without loading this
skill.

---

```markdown
# Handoff: <what the next session does>

Date: <DD-MM-YYYY>. Branch: <name>. Project: <absolute path>.
Next session: <one line, the goal>.

## Where things stand

- Done: <what landed, with commit, PR or file refs>
- In progress: <what is half done, and where>
- Decided: <choices the user made that the next session must not reopen>
- Open for the user: <questions only the user can answer>

## Tasks

| # | Task | Run as | After | Status |
|---|---|---|---|---|
| 1 | <name> | agent | - | todo |
| 2 | <name> | agent, group A | 1 | todo |
| 3 | <name> | agent (Explore), group A | 1 | todo |
| 4 | <name> | self | 2, 3 | todo |
| 5 | Run the plan at `<path>` | orchestrate the plan | 4 | todo |

<Run as: `self` (the orchestrator does it), `agent`, `agent (Explore)`, `agent, sonnet`. Tasks with
the same group letter run in parallel. After: tasks that must be done first.
Status: todo, done, blocked. The orchestrator adds one line of result after the status.>

### Task 1, <name>

- **Goal.** <what is true after this task>
- **Reads.** <exact files, nothing else>
- **Done when.** <a check that can be run, and its expected result>
- **Watch out for.** <known traps>
- **Output.** <for findings: the file to save them to>

## How to run

You are the orchestrator. You fire sub-agents, read their reports and keep this file current. Keep
your own context small: that is the point of this setup.

Loop:

1. Read this file. Take the first `todo` task whose "After" tasks are done. If it is in a parallel
   group, take every ready task of that group.
2. `self` task: do it yourself. Otherwise fire one sub-agent with the prompt below. For a group,
   send all its Agent calls in one message.
3. Read the report. If the task changed files, run the project's quick check yourself (build, or
   the task's test).
4. Update the task's row: `done` or `blocked`, plus one line of result. Go to 1.
5. When every row is done, mark this handoff done (status line at the top, file renamed to `-done` and moved into `.claude/handoff/done/`, references to the old path updated).

Rules:

- Do not read source files. Read this file and the reports. To follow up on a report, continue that
  sub-agent with SendMessage instead of reading its files or starting a new one.
- One sub-agent at a time, unless the table puts tasks in the same group. Never more than 3 at once.
- Only you edit this file. Sub-agents report back and do not write here.
- A task fails twice for the same reason: stop and show the user. Do not widen the scope.
- A report raises something the user would have an opinion on: ask the user, do not decide.
- Commits and pushes follow the user's CLAUDE.md rules.
- If this session gets long (it has been compacted, or you have run about 6 tasks), stop after the
  current task, make sure the table is current, and tell the user to start a fresh session with
  this file.

Sub-agent prompt (fill in, do not improvise):

    You are doing task <N> of the handoff at <path>. Working directory: <absolute path>.

    FIRST read these, and nothing else unless you need it:
      1. <the project's agent guide, e.g. CLAUDE.md>
      2. <the task's Reads list>
    Load these skills before you start: <only the ones this task needs>

    TASK
    <the task's Goal, Done when, Watch out for and Output, verbatim>

    KNOWN FACTS (from earlier tasks, do not re-check):
    <what earlier reports found that this task needs: names, paths, numbers>

    RULES
    - <everything the project's CLAUDE.md says a sub-agent prompt must carry, in full>
    - Do only this task. Do not start another one. Do not edit the handoff file.
    - <parallel group only: other agents run tasks <N, M> at the same time. Do not touch <their
      files>. Do not build, run tests, install packages or use git.>
    - Never report "should work". Run the check.
    - If the check fails twice for the same reason, stop and report.

    REPLY, at most 15 lines:
    - Status: done | blocked (and why)
    - Changed: <files>
    - Check: <command and its result line>
    - For later tasks: <names, APIs, numbers the next tasks need>
    - For the user: <anything they should decide>

## Suggested skills

- `<skill>`: <when to load it>

## References

- <plans, research docs, PRs, issues, by path or URL>
```
