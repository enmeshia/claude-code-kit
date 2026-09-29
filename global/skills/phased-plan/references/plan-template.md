# Plan template

Fill this in. Delete the notes in `<>`. Keep the section order: an orchestrator and its sub-agents
look for these headings by name.

The three blocks under **Orchestration protocol** are meant to be copied close to verbatim. They are
the part a fresh session reads to know how to run the plan without you there to explain it.

---

```markdown
# <What is being built>

Date: <DD-MM-YYYY>. <Target and version, e.g. "Node 22, Postgres 16">.
Written to be run phase by phase by an orchestrator.

## Context

<What exists today. What is missing. Why this is worth doing. Three short paragraphs at most.
Name the files that hold the current behaviour, so a sub-agent can find them.>

---

## Decisions (locked, from the user)

| | |
|---|---|
| <Question that came up> | <What the user chose> |
| <Thing explicitly out of scope> | <Why, in a few words> |

<Then: which existing project rules still apply, by name.>

### <The cross-cutting rule>, in full

<State the constraint that applies to every phase, completely, with its edges. Then give it a
failure signature: "If a phase ever looks like it needs X, that is a sign the design went wrong.
Stop and report instead of doing X.">

---

## What ships

<Be concrete. A sketch of the screen, the command and its output, the shape of the file, the
endpoint and a sample response. A reader should be able to picture the finished thing.>

<Then say what is deliberately left out, so nobody adds it.>

---

## Architecture

### New files

<A tree, with one line per file saying what is in it. Name the files you want. Do not describe
them and leave the naming to the sub-agent, or two phases will invent two names for one thing.>

### Where every piece of data comes from

| What we need | Source | Cost |
|---|---|---|
| <thing> | <the exact call or file> | <cheap, or the expensive bit> |

### <Key mechanism>

<The one or two mechanisms the whole design rests on, explained in enough detail that a sub-agent
does not have to invent them. Numbered steps are good here.>

---

## Phase map

| # | Phase | Test scenario | Roughly |
|---|---|---|---|
| 0 | Foundations and a probe | `probe` | small |
| 1 | <...> | `<test name>` | medium |
| N | Optional: <...> | `<test name>` | medium |
| N+1 | Docs and a check of them, plus all tests in one run if the user wants it | docs check, full run if chosen | small |

<One line on which phases are the heart of it, and which can be dropped. The last phase always
runs, even when an optional phase is dropped.>

---

## Orchestration protocol

**The orchestrator never reads source files.** It reads this plan, the last handoff entry, and each
sub-agent's report. That is what keeps its context small.

The handoff log lives at `<path, outside shipped code, e.g. .claude/handoff/<name>.md>`. Phase 0
creates it.

### Loop

1. Read the handoff log. Find the first phase not marked done.
2. Fire **one** sub-agent with the prompt template below, filled in from that phase's section.
3. Read the sub-agent's report, which is at most 15 lines.
4. Run the build yourself. Commit the phase. If the report says blocked, show the block to the user
   and stop.
5. If the user answered a question or passed a gate, write their answer into the handoff log.

The last phase runs differently:
1. Ask the user whether to run all tests in one chain first (it can take long). Write the answer
   into the handoff log.
2. Fire a writer sub-agent, then a checker with the docs check prompt below, then the writer fixes
   what the checker found. One more check after the fixes. After two rounds, show the leftovers to
   the user.

### Sub-agent prompt template

```
You are implementing Phase <N> of <the thing> for <the project>.
Working directory: <absolute path>

FIRST, read these, in this order, and nothing else unless you need it:
  1. <the project's agent guide>     (rules, build, run, verify, traps)
  2. <handoff log path>              (what earlier phases built and decided)
  3. <the phase's "Reads" list>

THEN do only what Phase <N> says. Do not start the next phase.
<paste the phase's Goal, Build, Key APIs, Done-when and Watch-out-for sections verbatim>

CONTEXT FROM EARLIER PHASES (do not re-measure, it is in <probe output path>):
<the measured facts this phase needs, and any open point that belongs to a different phase
so this agent does not take it on>

RULES
- <the cross-cutting rule, in full, every time>
- Follow <the agent guide>'s writing style in any comment, doc or commit message.
- <the project's file and naming conventions>
- <what must be logged through, and what must never be used>
- <any file that must stay free of extra dependencies, and why>
- Do not change anything in <out-of-scope folder>. Read it only where "Reads" says to.
- Never report "should work". Build it and run it.

VERIFY (all must pass)
  <build command>                    -> 0 errors, 0 new warnings
  <test command> <scenario>          -> prints "<the exact success line>"
  <re-run the two or three earlier scenarios most likely to break>
  <any screenshot check: read the image yourself and say what you see>
If the test fails twice for the same reason, stop and report. Do not widen the scope.

FINISH BY
1. Appending to <handoff log path>, at most 40 lines:
     ## Phase <N> done  (<date>)
     Files added/changed: ...
     Public API the next phase will call: ...
     Decisions made: ...
     Gotchas found: ...
2. Replying with at most 15 lines: what works now, the test line, anything left open.
   The reply summarizes your handoff entry. Put nothing in it that is not also in the entry.
```

### Docs check prompt

Fired as a fresh sub-agent after the last phase writes the docs, and again after the fixes.

```
You are checking the docs written at the end of <the thing> for <the project>.
Do not edit any file. Report only.
Working directory: <absolute path>

CHECK THESE
  <every file the last phase changed or created, or: git diff -- <docs paths>, plus new files>

AGAINST THESE SOURCES
  <handoff log path>        (read it whole: every measurement, decision and user answer)
  <this plan's path>        ("Decisions", "What the plan got wrong")
  <the code and data files the docs describe>
  <the user's own words, verbatim, for any doc written to answer a request of theirs>

CHECK
A. Every number, name, path, command and claim: is it in a source, and does it match?
   Check that every path exists.
B. What the sources hold that a reader of the docs would need and cannot find.
C. Proposals or open questions written as decisions. Decisions the user did not make.
D. <the project's writing rules, and the command that checks them, if any>
<second round only: E. Are these earlier findings fixed? <the numbered list>>

REPLY with a numbered list, most important first: file:line, what it says, what the source
says, the fix. Then "No other issues found", or not. At most 60 lines.
```

### Rules the orchestrator enforces

- One phase at a time, never two sub-agents at once. Phases build on each other.
- Every phase leaves the repo **building and green**. A phase is not done with a red test.
- No phase changes a file another phase owns unless its section says so.
- Commit after each green phase, message `<prefix>: phase <N>, <short title>`.
- The orchestrator writes no docs, not even a handoff the user asks for after the last phase.
  A writer sub-agent writes them from the handoff log, and a checker checks them.

---

## Phases

### Phase 0, foundations and a probe

**Goal.** Make the project able to compile what the later phases need, and replace every guess in
this plan with a measured fact before any real work starts.

**Reads.** <build files, the test harness>

**Build.**
- <references, dependencies, permissions the later phases need>
- New test scenario `probe` writing `<plain text output path>`:

| Probe | Why |
|---|---|
| <the thing you guessed> | <which phase would break if the guess is wrong> |
| <a real count> | <what is sized off it> |
| <a timing of something you assumed was fast> | <what gets redesigned if it is slow> |
| <does the one risky mechanism work at all> | <what is built on top of it> |

**Done when.** `<test command> probe` passes, the output has every line above, and the handoff
records the measured numbers and anything that will need a fallback.

---

### Phase <N>, <name>

**Goal.** <One or two sentences. What is true after this phase that was not before.>

**Reads.** <exact files. If another repo is the spec, name the exact files in it.>

**Build.**
- `<path/to/file.ext>`: <what it holds>
- <behaviour, with the constants written out:>

  | | |
  |---|---|
  | <constant> | <value> |

**Key APIs.** <the functions and fields by name, so the agent does not hunt for them>

**Done when.** <A named test scenario, with assertions that have numbers in them, to a stated
tolerance. Say what the success line looks like. If there is a visual result, say that the agent
must read the image and describe it.>

**Watch out for.** <traps you already know about, one line each>

---

### Phase <N+1>, docs and a check of them, plus all tests in one run if the user wants it

**Goal.** The docs say what was built, measured and learned, checked against the sources by an
agent that did not write them. If the user chose the chained run, every test passes in it.

**Reads.** The handoff log, whole. This plan's "Decisions" and "What the plan got wrong". <the
project's agent guide and the docs this plan touches, by path>.

**Build.**
- Only if the handoff log says the user chose it: run every test in one chain first. <the command>
  If not, the docs say no chained run was made and name the last full run.
- Update <the docs, by path: the project's docs, rule files, skills, the agent guide's map>.
  Facts come only from the handoff log, this plan and the code. Proposals stay marked as proposals.
- Fill in "What the plan got wrong" in this plan.
- <any handoff for the next piece of work, if the plan calls for one>

Then the orchestrator fires the docs check prompt, the writer fixes the findings, and one more
check follows.

**Done when.** The second docs check reports "No other issues found", or its leftovers are shown
to the user. If the chained run was chosen, it prints <the success line>.

**Watch out for.** Facts that only the orchestrator saw (a user answer, a detail in a phase reply)
may be missing from the log. If the log lacks something the docs need, name it in your reply as
missing, do not guess.

---

## Verification, end to end

Per phase, in the sub-agent:

```bash
<build command>
<test command> <scenario>      # must print <the success line>
```

By hand, once the phases are done:

```bash
<how a person launches it>
```

<Then the steps a person takes to satisfy themselves it is real. The tests prove the parts work,
they cannot say whether it feels right.>

<Then: how to check the cross-cutting rule held, as a command.>

---

## Risks

| Risk | What we do |
|---|---|
| <the design rests on X and X might not work> | Phase 0 proves it before anything is built on it. |
| <a guess in this plan is wrong> | Phase 0 measures it and records the real number in the handoff. |
| <the environment disturbs the tests> | <how it is frozen, and in which phase> |
| <a phase quietly breaks the cross-cutting rule> | Stated at the top, repeated in each prompt, checked by a guard in the last phase. |
| <the spec repo is deleted before the phase that reads it> | <the fallback source, and what it costs> |
| The docs at the end drift from what was measured | A sub-agent writes them from the log, a fresh one checks them, two rounds. |
```

---

## When the plan is finished

Mark it done at the top rather than deleting it, rename the file to end with `-done`, and move it
into `.claude/plans/done/` (its handoff log into `.claude/handoff/done/`). Update every reference to
the old paths. Keep:

- the result and where the work landed, as a branch or a commit range,
- the final test line,
- **what the plan got wrong**, in a table: what it said, what was actually true,
- anything left open, so the next person does not have to rediscover it.

That "what the plan got wrong" table is the most useful part of a finished plan. Every row is a
thing someone believed, wrote down, and then learned was false by running it.
