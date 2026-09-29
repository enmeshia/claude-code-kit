---
name: phased-plan
description: Write an implementation plan that an orchestrator runs phase by phase, firing one sub-agent per phase, so no single session runs out of context. Use this whenever you are asked to plan, design or spec a build worth more than a few hours: a new feature, a rewrite, a migration, an integration, a tool. Use it in plan mode before writing any plan document. Use it when the user mentions phases, orchestration, sub-agents, "agents will do the work", or worries a session will blow up on context. Also use it when the plan you are about to write has more than about five steps, even if the user never mentions agents at all.
---

# Phased plan, built to be run by sub-agents

A plan written this way is not a description of the work. It is the **input to a machine**: an
orchestrator reads it, fires one sub-agent per phase, and never opens a source file itself. That is
what keeps the main session small enough to survive a build with a dozen phases in it.

This changes how you write. A normal plan can say "add snapping" and trust the reader to work it
out. Here the reader is a fresh agent with no memory of your conversation, no access to what you
were looking at, and a hard limit on how much it can read before it gets lost. Everything it needs
has to be **in the plan or named in the plan**.

Read `references/plan-template.md` for the skeleton to fill in. It holds the exact wording for the
orchestration protocol and the sub-agent prompt, which ship inside the plan itself.

## The shape

```
Title, date, target versions, one line: "run phase by phase by an orchestrator"
Context            what exists now, what is missing, why this is worth doing
Decisions          locked, from the user, in a table
Cross-cutting rules  the constraints every phase must respect, in full
What ships         concrete: a sketch, a mockup, a command, a sample output
Architecture       new files, where each piece of data comes from, key mechanisms
Phase map          a table: number, name, test name, rough size
Orchestration      the loop, the sub-agent prompt template, the rules the orchestrator enforces
Phases             one section each: Goal, Reads, Build, Key APIs, Done when, Watch out for
Verification       how to check the whole thing at the end, by hand and by test
Risks              a table: risk, what we do about it
```

Long is fine. A plan for a large feature can run 900 lines and still be right, because most of it is
detail a sub-agent would otherwise have to go and find. Length is not the cost. Vagueness is.

## Before you write a single phase

**Settle the decisions with the user and write them down.** Anything you had to ask about goes in a
locked-decisions table at the top. A sub-agent that reopens a settled question wastes a session, and
it has no way to know the question was settled unless the plan says so.

**State the cross-cutting rules in full.** These are the constraints that apply to every phase, not
one of them: what must never be written to disk, what must stay client-side, what must not gain a
dependency, which file must stay importable on its own. Write them once at the top **and repeat them
in every sub-agent prompt**, because each sub-agent only ever sees its own prompt. Repetition that
would be annoying in a document is load-bearing here.

Give each rule a failure signature too: "if a phase seems to need X, that is a sign the design went
wrong, stop and report instead". A sub-agent under pressure will otherwise find a clever way around
the rule and tell you it was necessary.

## Phase 0 measures, it does not build

**Make the first phase replace every guess in the plan with a measured fact.** You will have written
things like "layers 3, 6, 7 and 30 look free", "there are about 400 of these", "this should render".
Each of those is a way for phase 5 to fail for a reason nobody understands.

Phase 0 writes a plain-text report the later phases read instead of re-deriving. Good things to
measure: real counts, real timings of anything you assumed was fast, whether the one risky mechanism
works at all, how many items are missing the field every later phase assumes they have.

The payoff is concrete. If the risky mechanism does not work, you find out in the cheapest phase
instead of the biggest one. If the 400-item walk takes 36 ms, later phases stop designing around a
slowness that was never there.

## Sizing a phase

One phase is one sub-agent session: one coherent deliverable, one test, a report at the end. If a
phase needs more than about two test scenarios, or you cannot name its Done-when in one sentence,
split it.

Order phases so **every phase leaves the repo building and green**. A phase that only makes sense
once the next one lands cannot be verified, so it cannot be signed off, so the whole scheme stops
working. It is fine for early phases to have nothing visible yet, as long as each one is testable.

Mark any phase that could be dropped as optional, and put it last, just before the closing docs
phase. It gives the user a real exit.

## What every phase section needs

| Part | Why it is there |
|---|---|
| **Goal** | One or two sentences. What is true after this phase that was not true before. |
| **Reads** | The exact files to open, and "nothing else unless you need it". This is the single biggest lever on sub-agent context. Without it, an agent reads the whole repo to orient itself. |
| **Build** | The work, file by file, with names. Name the files you want created, do not describe them. |
| **Key APIs** | The functions and fields the agent will need, by name, so it does not go hunting. |
| **Done when** | A machine-checkable condition. This is the heart of the phase. |
| **Watch out for** | Traps you already know about. Each one saves a sub-agent an hour. |

### Done-when has to be machine-checkable

"The palette works" is not a Done-when. This is:

> New test `editor_palette`: with the config off, assert the count equals the unlocked list minus
> repair and remove; flip the config, assert it equals the full list minus the same; type a search
> term and assert the filtered count; screenshot the grid. `fail=0`, and the sub-agent reads the PNG
> and confirms the icons and chips rendered.

The test has a name that the plan reuses in the phase map. There are assertions with numbers in
them. Where the output is visual, the agent has to **look at the picture and say what it sees**, not
assert that a file exists.

Without this, a sub-agent will report success it has not earned. Not from dishonesty, but because
"it compiles and looks plausible" genuinely feels like done when you have no test to disagree with.

### Copy the constants into the plan

If a phase needs 22.5 degrees, a 0.5 m snap distance, a 200-step undo limit or a specific colour,
put the number in the plan, in a table. Do not write "match the behaviour in the other repo".

The sub-agent can read that other repo, but it costs it a large part of its context to find one
number, and it may read a different version than you did. A table of twelve constants costs you
twelve lines and saves every later phase from a hunt.

## The orchestration protocol goes inside the plan

The plan carries its own execution instructions, so a fresh session can run it without you
explaining anything. Copy these four pieces from `references/plan-template.md`:

1. **The loop.** Read the handoff log, find the first phase not done, fire one sub-agent, read the
   report, move on or stop.
2. **The sub-agent prompt template**, verbatim and fill-in-the-blanks, so the orchestrator does not
   improvise a new prompt thirteen times.
3. **The docs check prompt**, for the fresh agent that checks the docs at the end.
4. **The rules the orchestrator enforces**: one phase at a time, never two agents at once, every
   phase green before the next starts, commit after each green phase.

Two lines in that protocol carry most of the weight:

- **"The orchestrator never reads source files."** It reads the plan, the last handoff entry and
  each report. This is the whole reason the scheme works. An orchestrator that starts reading code
  to check on a sub-agent is back to one session holding everything.
- **"If the test fails twice for the same reason, stop and report. Do not widen the scope."**
  Without it, a stuck sub-agent will quietly redesign a neighbouring system at hour three.

### The handoff log is the only memory between phases

One append-only file, outside the shipped code, roughly 40 lines per phase, with a fixed shape:

```
## Phase N done  (date)
Files added/changed: ...
Public API the next phase will call: ...
Decisions made: ...
Gotchas found: ...
```

"Public API the next phase will call" is the one people leave out and the one that matters. It is
how phase 6 knows the exact entry point phase 5 built without reading phase 5's code.

Ask for a separate short reply to the orchestrator, at most 15 lines: what works now, the test line,
anything left open. The report is for the orchestrator's context budget. The handoff is for the next
sub-agent. They are not the same document.

But the reply must only **summarize** the handoff entry, never add to it. A flaw or a number that
appears only in the reply lives only in the orchestrator's context, and the docs written at the end
will miss it. For the same reason, the orchestrator writes the user's answers (a choice at a gate,
a verdict) into the log as soon as they come.

## Make the test environment deterministic, early

If the tests run against something live, a game, a browser, a device, a staging service, then
**something in that environment will fail your runs for reasons that have nothing to do with the
code**, and a sub-agent will burn a session chasing it.

Plan for it in Phase 0 or 1, not at the end: freeze the clock and the weather, stop the background
actors, pin the spot or the fixture, and make each test put back anything it changed. That last one
bites hardest: a test that writes to the user's real settings file leaks state into every later
phase in the chain, and the failure appears somewhere innocent.

Give the last phase an optional step that chains every test in one run. Chained runs catch exactly
this class of bug, and a plan that only ever runs one test at a time will not find it. The run can
take a long time, so the orchestrator asks the user before the last phase whether to make it, and
writes the answer into the handoff log. If the answer is no, the docs say so and name the last full
run that was made.

## Docs get a check, like code

Most plans end by writing things down: the project's docs, the "what the plan got wrong" table, a
handoff for the next piece of work. Code has a test that can disagree with it. Docs have nothing,
and they are written at the end, when the orchestrator's context is at its largest. That is where
facts drift: a number credited to the wrong change, a measurement that never happened, a proposal
written up as a rule.

So the last phase writes the docs and has them checked:

1. **A sub-agent writes the docs, never the orchestrator.** Its prompt names its sources: the
   handoff log, the plan, the code and data files. Not the orchestrator's memory of the run.
2. **A fresh sub-agent checks them and edits nothing.** It gets the changed files and the same
   sources, and checks every number, name, path and claim against them. It also looks for gaps a
   reader would trip on, for proposals written as decisions, and for the project's writing rules.
   It replies with a list: file and line, what it says, what the source says, the fix.
3. **The writer fixes the list**, then a second check covers the fixes and anything new. After two
   rounds, stop and show the leftovers to the user instead of looping.

In one real run the first check found 17 errors and the second 11 more. Nearly all were in a handoff
the orchestrator had written itself from its own long context. The docs a sub-agent wrote from the
log alone had three.

This also holds for anything the user asks the orchestrator to write after the plan: a handoff, a
summary, a report. Fire a writer and a checker for it.

## Expect the plan to be wrong

Some of what you write will be wrong. Not vague, wrong: a rounding case that does not round that
way, a flag no item actually sets, a fix that turns out to need a second fix elsewhere.

Say so in the plan, and tell sub-agents what to do about it: correct it, prove the correction with a
test, and record it in the handoff. A sub-agent that follows a wrong plan faithfully produces a
wrong result and a green test that asserts the wrong thing.

When the plan is finished, mark it done and keep the corrections in it. The list of "here is where
this plan was wrong" is the most useful part of the document to the next person.

## Running a plan, as the orchestrator

If you are executing one of these rather than writing it:

- Keep to the protocol in the plan. Fire one sub-agent per phase, in order.
- **Verify, do not trust.** Run the build yourself between phases. It is one cheap command and it
  catches a report that was more optimistic than the tree.
- Commit each green phase yourself, with the message the plan specifies.
- When a sub-agent flags something the user would have an opinion about, surface it in your reply
  rather than deciding quietly. You are the only part of the system talking to a person.
- When a sub-agent reports blocked, stop and show the block. Do not start the next phase around it.
- When the user answers a question or passes a gate, write their answer into the handoff log.
- **Write no docs yourself**, not even a handoff the user asks for at the end. Your context is the
  largest in the system and the most likely to drift. Fire a writer, then a checker (see "Docs get a
  check, like code").

## Before you hand the plan over

- [ ] Could a fresh agent with no memory of this conversation run phase 3 from the plan alone?
- [ ] Does every phase have a named test and a Done-when with numbers in it?
- [ ] Does every phase have a Reads list?
- [ ] Are the cross-cutting rules stated at the top and repeated in the sub-agent prompt?
- [ ] Does Phase 0 measure the things you guessed at?
- [ ] Is every constant a later phase needs written in the plan?
- [ ] Does the plan say where the handoff log lives?
- [ ] Does the last phase offer a chained run of all the tests, with the orchestrator asking the
      user first?
- [ ] Does the last phase write the docs through a sub-agent, and have a fresh agent check them
      against the log and the code?
- [ ] Is the optional work marked optional and put last?
