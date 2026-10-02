---
name: research
description: Research a question and write the findings to one or more research docs in the project's .claude/research folder. When the question spans several distinct fields (for example library options plus how this codebase works today plus legal rules), fire one sub-agent per field in parallel, then combine their findings into one or several docs. Use this whenever the user asks to research, investigate, look into, dig into, compare, evaluate options, survey, do a deep dive, or "find out" something that needs more than one or two lookups, or asks for a research doc or a write-up of findings. Also use it before writing a plan when the plan rests on facts nobody has checked yet. Not for a single quick fact you can answer with one search.
---

# Research, split by field, run in parallel

The product is a **doc the user can act on**, saved in the project. It should also work as input for
a later plan or another session. The chat reply is short: what was found and where the doc is.

The main agent (you) scopes the question, splits it into fields, fires one sub-agent per field, all
at once, then checks the findings against each other and writes the doc. Sub-agents only research and
report back. You are the only writer, so the doc has one voice and no repeated sections.

Two reference files hold the fixed text:

- `references/subagent-prompt.md`: the prompt each sub-agent gets. Fill it in, do not improvise it.
- `references/research-template.md`: the shape of the final doc.

## The flow

1. Read the rules: where docs go, how they are named, how to write.
2. Scope the question.
3. Split it into fields.
4. Fire the sub-agents in parallel (or research it yourself if there is only one field).
5. Check and reconcile what came back.
6. Compose and save the doc or docs.
7. Reply in a few lines.

## 1. Read the rules first

Read every CLAUDE.md that applies before you decide anything about the output: the global one
(`~/.claude/CLAUDE.md`), and in the project `CLAUDE.md`, `.claude/CLAUDE.md` and `CLAUDE.local.md`
if they exist. Look for:

- where research docs (or docs in general) go,
- file naming and date format,
- writing style rules,
- status or "done" conventions,
- an index that must list each new research doc (for example a `history.md` per docs area). If
  there is one, add the entry when you save the doc.

**Project rules beat global rules, and both beat the defaults below.** If the project says research
goes in `docs/research/` with ISO dates, do that, even though the global default differs.

Defaults when nothing says otherwise:

| | |
|---|---|
| Folder | `<project root>/.claude/research/`. Project root is the git root, else the working directory. |
| File name | `DD-MM-YYYY-<short-slug>.md`, day first. Example: `23-09-2026-search-engine-options.md` |
| Never | the OS temp folder or the scratchpad. Those are for throwaway files, and this doc is not one. |

Create the folder if it is missing. Do not overwrite an existing doc with the same name, unless the
user asked you to update that research. Then read it first and keep what is still true.

Use the file name's date format for the date line inside the doc too. A "mark done" rule for plans
or handoffs does not apply to research docs: a research doc is finished when it is saved. Follow a
status rule only if CLAUDE.md names research docs in it.

If CLAUDE.md has writing rules, they apply to the doc too, not only to the chat reply. Pass them on
to the sub-agents in short form so their findings arrive already close to the right style.

## 2. Scope the question

Write down, for yourself and later for the doc's header:

- the question, in one line,
- the decision it feeds (pick a library, go or no-go, write a plan, answer a client),
- the constraints: stack and versions, scale, budget, region, deadline,
- what is out of scope.

Collect the few facts every sub-agent will need **once, yourself**, and paste them into each prompt.
If the question is about this project, that usually means a quick look at the manifest (versions,
main dependencies) and the one or two files the question is about. A shared outside fact every field
needs (current prices of the user's server, say) is fine to look up too. Keep it to a handful of
lookups. If it needs more, it is a field of its own. Otherwise each sub-agent rediscovers the same
facts on its own budget.

If the prompt leaves scope open, pick sensible defaults and list them in the doc as assumptions. Ask
the user only when two readings of the question would lead to different research, and then offer 2-3
concrete options.

## 3. Split into fields

A field is a part of the question that needs its **own sources or its own know-how**. Signals:

- different source types: vendor docs, pricing pages, legal texts, this codebase, issue trackers,
- different domains: technology, cost, law, market, user experience,
- separate options that each need a real look.

| Prompt | Fields |
|---|---|
| "Should we move our API to GraphQL? Check how the API is used today and what the switch would cost" | 1. current API use in this codebase. 2. GraphQL server options for our stack. 3. migration effort, from others' reports |
| "Compare Meilisearch, Typesense and Postgres full-text search for our shop" | one field per option, all with the same criteria list |
| "What changed in React 20?" | one field. No sub-agents. |

Rules for the split:

- **One field: do it yourself.** A sub-agent costs a full session start and gives nothing back when
  there is nothing to run next to it. Exception: a single field so large that reading all its sources
  would crowd your context. Then one sub-agent is still worth it.
- **2-5 fields: one sub-agent each.**
- **More than 5: merge the small ones.** Every sub-agent is a separate session and the user pays
  for each one in tokens. Five good fields beat nine thin ones.
- **Fields must not overlap.** Write each field's boundary: what it covers, and what belongs to
  another field. Overlap means two agents read the same pages and the doc says the same thing twice.
- **Splitting by option (A vs B vs C)? Give every sub-agent the same criteria list, with units.**
  Without it one agent reports "p99 latency 40 ms" and another says "fast", and the results do not
  fit in one table.
- **Split by where the sources are, not by the words in the prompt.** "Compare A, B and C, include
  cost and license" is three fields (one per option), not five: each option's price and license sit
  on that vendor's own pages, so cost and license become criteria inside each option's field.
- **Unrelated topics:** each sub-agent's OVERALL QUESTION is its own topic only. Telling it about
  the other topic gives it nothing and invites drift.

## 4. Fire the sub-agents in parallel

Send **all the Agent calls in one message**, so they run at the same time. Research is read-only and
the sub-agents share no files, so there is nothing to race on.

- Use `subagent_type: general-purpose`. It can search the web and read files. For a field that is
  only "find where X happens in this codebase", `Explore` is enough.
- Fill in `references/subagent-prompt.md` for each field. The fixed reply format is what makes the
  findings cheap to combine. An improvised prompt gets an improvised reply.
- Sub-agents do not write files. They return findings in their reply. You own the doc.
- While they run, do not research their fields yourself. That is paying twice for the same answer.
  You can prepare the doc skeleton.
- Wait for every sub-agent before you compose. A doc written from half the fields gets rewritten.

## 5. Check and reconcile

Before writing, read the findings side by side:

- **Contradictions between fields.** Name them in the doc. Say which one you trust and why: newer,
  a primary source, measured rather than claimed.
- **A key claim resting on one weak source** (a blog post, a forum answer, an undated page): check
  it yourself with one quick lookup, or mark it low confidence.
- **Gaps.** If a sub-agent reports "not found" on something the decision depends on, do one
  targeted follow-up, yourself or with one more sub-agent. One round only. After that it goes under
  open questions.
- **Stale facts.** Versions, prices and limits change. Keep the date and the version each fact
  applies to.

## 6. Compose and save

Decide how many docs:

| Situation | Docs |
|---|---|
| All fields serve one question or decision | One doc. The fields become sections, or columns in one table. |
| The fields are separate topics the user will use separately | One doc per topic. |
| A mix | One doc per decision. A topic that feeds two decisions gets its own doc, and the others link to it. |
| The user said how many | Do that. |

Then write each doc from `references/research-template.md`:

- **Answer first.** The top section gives the answer or recommendation in 2-5 lines, with a
  confidence level and the main reason. Someone who reads only that section should know what to do.
- **Combine, do not paste.** Do not stack the sub-agent reports one after another. Organize by what
  the reader needs: the comparison table, the recommendation, the risks. Each field's findings go
  where they matter.
- **Every claim can be traced.** Use numbered source refs `[n]`. Facts from this codebase cite
  `path:line`.
- **Say what is verified and what is inferred.** A number from the vendor's own pricing page and a
  number worked out from a forum post are not the same kind of fact. A claim with `[n]` is sourced.
  Mark your own reasoning `(inferred)` and weak or secondhand sources `(secondary)` or
  `(not checked)`.
- **Open questions say how to close them**: a measurement to run, a question for a vendor, a
  spike to build.
- **Several docs:** each one stands alone with its own answer section, and links the others by
  relative path.
- **If a plan will follow,** put the numbers a plan needs (versions, limits, prices, constants) in a
  table. A plan can then name this doc in its Reads list instead of redoing the research.

## 7. Reply

A few lines: done, the path to each doc, the answer in 2-4 lines, and any open question that changes
what the user does next. Do not repeat the doc in the chat.

## Before you save

- [ ] Did you check global and project CLAUDE.md for folder, naming and style rules, and follow them?
- [ ] Is the file in the project, not in the scratchpad or temp, with the right date format?
- [ ] Does the doc open with the answer?
- [ ] Is every factual claim tied to a source, with a date or version where it can change?
- [ ] Are contradictions between fields stated, not quietly resolved?
- [ ] Are the gaps listed as open questions, each with a way to close it?
- [ ] If there are several docs, does each stand alone and link the others?
