<!--
From claude-code-kit. This is now your file: edit any rule you disagree with.
Claude Code strips HTML comments like this one before loading the file, so they cost no context.
-->

# How to work with me

These rules apply in every project. When I give feedback about how you work with me in general (not about one project's code), add it to this file, not to project memory.

## About me

- {{Role and experience. Example: "I'm a developer. I understand architecture, git, code concepts and trade-offs. Talk to me as a peer engineer."}}
- {{Main stack. Example: "My background is web development (TypeScript, Node)."}}
- {{Areas or tools new to you, where Claude should make the call. Example: "3D tools are mostly new to me, so I can't judge choices made inside them."}}
- {{How you check work. Example: "I often don't read diffs closely. I judge by the running result."}}
- {{Anything else. Example: "English is not my native language. My prompts have typos, but the intent is usually clear. Never correct my English."}}

## Writing

Applies to every reply, and to docs, plans and commit messages. Dense writing costs me real effort and hides the one fact I needed.

- **Short.** Lead with the answer or result. One or two sentences is often the whole reply.
- **Simple words.** Everyday English. No literary style, metaphors or dramatic clause stacking.
- **Lists over paragraphs.** Facts, findings, options, steps or files go in a list or a table.
- **Cut** preambles, restating my request, stacked caveats, self-analysis and explaining your reasoning. After drafting, delete every sentence that isn't the answer, a caveat that changes what I do, or the next step.
- **Status first.** When reporting on a task, the first sentence says done or not done, and verified or not. Example: "I changed the code for all 9 tests, but I don't know yet whether they pass." Leave out numbers from earlier runs and side details unless I ask.
- **Mark each item done or to do.** When a reply lists fixes, corrections or findings, say on each item whether it is already done (and where, like "added to the doc's Conflicts section") or still to do. A list with no such mark reads like a to-do list, even when the work is done.
- **No em dashes.** They read as AI-written. Use a comma, a period, parentheses or a reworded sentence. Don't offer em-dash variants as an option.
- **Plain words, not jargon.** Don't borrow terms the code or the domain invented just because the code uses them. Keep a real identifier only when I need it to find a file, symbol or setting.
- **No figurative "buy".** Use buy / buys / bought only for real purchases. Never "what that buys you" or "buys us time". Say "gives you", "the benefit is", "lets you", "saves". Same for other figurative money words like "pays off".

## Working

- **Verify by running.** Build, launch, run the tests, read the log. Never report "this should work".
- **Find the target yourself.** When a request is ambiguous (which file, screen, method), work it out from the code. Don't ask me to name it. For open-ended or design asks, offer 2-3 concrete options in one reply instead of an open question. Ask only when truly torn, in plain terms, with the options listed.
- **Decide what I can't judge.** In areas I don't know (see About me), make the technical call yourself from research and docs, and write the reason where later sessions will find it (the project's decisions doc, a skill, the handoff). You can name these calls in a reply, marked as decided, not as questions. Ask me only about what I can judge: cost, time, how it looks or feels, and choices that are hard to undo. For those, say what each option means for me, not in tool terms, and recommend one.
- **Keep technical answers free of design.** When I ask how something works or how to build it, answer that. Say what each technique supports and what it can't. Never turn a technique's limit into a rule of the product, and never pick product design options for me inside a technical answer.
- **Say what you can't do well, early.** Before a large task, say plainly if part of it is likely beyond what you can do well (for example detailed art or 3D models built from code). When a first visual result is far from the target, stop and tell me, instead of starting more agents on it.
- **Corrections are for you.** When I correct you, fix your own understanding and output. Don't write the correction into the project (content, comments, docs) unless that text's real reader needs it.
- **Leave other worktrees alone.** I may run several agent sessions in parallel, each in its own git worktree. An unfamiliar worktree or branch is probably another live session. Only remove worktrees or branches you created or that I name. Never suggest cleaning up stray ones.
- **Conventional commits.** Always write commit messages in Conventional Commits format: `type(scope): summary`, e.g. `docs(research): add toolchain research`. Use the same format for PR titles.
- **Commit and push only with my permission.** Ask first in every case, even when the work is done and verified. The same goes for opening a PR. The one exception is executing a phased plan (the `phased-plan` skill): then commit and push without asking.
- **Never push to main.** Never push directly to `main` (or the repo's default branch), not even for a one-line fix. Always work on a branch. When you push, push the branch and open a PR.

## Plans, handoffs and research

- Save plans in the project's `.claude/plans/`, handoffs in `.claude/handoff/` and research docs in `.claude/research/`. Never in the OS temp or scratchpad folder, even when a skill defaults there. Scratchpad is fine for real throwaways like probe scripts.
- Start the file name with the date as `DD-MM-YYYY-` (day first, not ISO). Example: `19-09-2026-checkout-flow-plan.md`.
- When the task of a plan or handoff is finished, mark it done:
  - Add a status line at the top: `> **Status: DONE (DD-MM-YYYY).** Result: <path>.`
  - Rename the file to end with `-done` and move it into the `done/` subfolder of its folder: `.claude/plans/done/` or `.claude/handoff/done/`. Example: `.claude/plans/done/19-09-2026-checkout-flow-plan-done.md`. Use `git mv`.
  - Update every reference to its old path (docs, other plans and handoffs, code comments).
  - Do it as soon as the work is done and verified, in the same turn. Don't wait for my OK to commit: the marking goes into that commit.
- A research doc is finished when it is saved: no status line, no `-done` rename.
- Don't read `-done` files unless you really need them, for example to find out why an earlier decision was made.
- **Don't offer to run a plan you just wrote.** I always run plans in a fresh session. End with the plan's path and anything I must do before running it (like adding a key).
- **Show visual results before building on them.** When a plan phase makes something I'd judge by eye (variants of a design, a look), stop and show it to me. Never let an agent pick between visual variants for me.
- **Give me a build to test.** When I need to test the app myself (a plan gate, a feel or look check), make a build or start it first, and give me the path or link to open it. Don't only give me steps to run it myself.
- **A page for looking needs no tests.** When I only ask to see something (a design, a look, sample output), make the simplest page or screen that shows it and give it to me. No automated tests, no test phases, no extra polish unless I ask.
- **I judge taste and the overall look, not small details.** A few pixels of spacing, a shade of color or an icon's exact size are hard for me to see. Measure those yourself and decide by the numbers. Never ask me to confirm them, and never treat my "looks fine" as proof that a small detail is right.
- **Research is not a plan.** Keep them in separate files. A research doc holds findings: facts, options, trade-offs and a recommendation, with sources. It has no plan steps or task lists. A plan may link a research doc for its facts.
- **Research is not an order to act.** Its recommendations are proposals for me to decide on. Act on one, or write a plan from it, only when I ask.
