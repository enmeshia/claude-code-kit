# Technical decisions

The reasons behind the rules in `CLAUDE.md`, one § per area. `CLAUDE.md` says what to do; this file
says why, what was tried and what was measured. Add to the section for the area. A new area gets the
next § number. Reasons that belong to one track live in its `tech.md` (`.claude/docs/tracks/`);
this file keeps what applies to the whole project.

---

## §1 The agent guide

How `CLAUDE.md` and `.claude/` are laid out, and why. Set up from claude-code-kit on {{DD-MM-YYYY}}.

- **CLAUDE.md is an index with a 200-line budget**, Anthropic's own target per file, because
  longer files cost context and lower adherence [1]. File lists and overviews
  go stale first, and in 2026 studies they did not help agents find code. What helps is what
  search can't find: commands, traps, ignored folders.
- **Area conventions go to `.claude/rules/` with `paths:` globs.** A rule loads when Claude reads a
  matching file, so it costs nothing in other sessions [1]. The catch: it does not load when Claude
  creates the first file of its kind. CLAUDE.md points at any rule that must apply before that.
- **Procedures are skills** (`.claude/skills/`). Only a skill's name and description load at start.
  The body loads when the skill is used [2]. Each skill is a core `SKILL.md` with what every use
  needs, plus reference files for detail only some tasks need. A "Reference files" table near the
  top of `SKILL.md` names each file and when to read it. A reference file costs nothing until it
  is read [2].
- **Never-break rules get a deny rule or a hook, not only a sentence.** Claude Code enforces those
  itself [3]. Prose "do not" rules of the refuse kind were followed 0-23% of the time in a 2026
  study [4]. `Edit(...)` deny rules cover every built-in file tool and Bash file commands such as
  `sed` and `>` redirects, but not a script that opens files itself [3].
- **Notes for editors of CLAUDE.md go in an HTML comment** at its top. Claude Code strips block
  comments before loading the file, and they show when the file is opened for editing [1].
- **Docs are split by who decides.** `product/` holds what the owner decides, with Decided, Ideas
  and Open questions kept apart, so a session never builds an idea as if it were a spec. `tech/`
  holds verified facts and the reasons behind them. Each area's `README.md` lists its docs.
- **Current docs and records are kept apart.** Current docs (CLAUDE.md, rules, skills, and the docs
  in `.claude/docs/` except each `history.md`) say what is true now. Plans, logs, handoffs and
  research are records: they change only in a status line or a pointer, because they are the
  evidence. Each docs area's `history.md` indexes them, one small entry per piece of work.
  - A run record (one run's numbers, a dated story) copied into a current doc is read by every
    later session and repeats the log.
  - Reference docs describe things as they are [7], and a reversed decision record is kept and
    marked superseded, with a reference to its replacement [8]. This split follows both.
- **The guide check enforces three size limits.** A size cap on a doc of decisions or design would
  force real decisions out of the docs. So no decision, design, tech or topic doc has one, and no
  README, rule or skill reference file either. Detail that only some tasks need moves to a rule
  file, a skill reference file or a topic doc, never out of the docs. The limits:
  - CLAUDE.md: 200 lines (above).
  - A `SKILL.md`: 20,000 bytes, about 5,000 tokens. After a context compaction only about the first
    5,000 tokens of a skill come back [2].
  - A `history.md` entry: 1,500 bytes. It only points to its log, so nothing is lost.
  - Not a size limit: a track README's "Where it stands" is at most 12 lines. It is a writing rule
    for that one section, and the check does not test it.
- **The guide check** (`.claude/hooks/check-guide.sh`, a SessionStart hook) prints only when the
  guide is stale or a current doc starts to turn into a log: a path or glob that points nowhere, a
  doc missing from its README list, a record no `history.md` names, a run record in a current doc,
  a file over its size limit. Stale paths are the main way agent guides fail as a project grows.
  Whatever a SessionStart hook prints goes into Claude's context [5]. The full list of checks is in
  the comment at its top.
  - It is plain POSIX `sh` and `awk`, so it runs on macOS and Linux as they are, and on Windows
    through Git Bash, which comes with Git for Windows. Nothing else to install.
  - On Windows, Claude Code runs hooks in Git Bash when it is installed, and in PowerShell when it
    is not [5]. Without Git Bash the hook can't run, so leave it out of `settings.json` there.
  - `.claude/.gitattributes` keeps `.sh` files at LF line endings. With CRLF, `sh` fails.
- **`.claude/tools/lost_facts.sh` checks text moved out of a current doc.** It lists each fact (a
  number, a date, a backticked name, quoted text) that left a current doc since a given commit and
  is now in no `.md` or data file (JSON, YAML, TOML, INI, CSV) of the repo. It searches the files
  git tracks or does not ignore, except lock files, code and data files in `.claude/`, and the
  folders in its skip list. A backticked name or quoted text also counts as found in a code file.
  A number or date does not: almost any number of 3 or more digits is somewhere in real code, so
  code would hide lost numbers. A deleted fact leaves no dead path behind, so the guide check can't see it.
- **Rules are plain, each with a short reason, said once, without caps.** Current Claude models
  follow instructions closely. Emphasis on many lines makes none of them stand out [6].
- **Add a rule after a mistake happens twice, not once.** One session's stumble turned into a
  permanent rule makes the guide grow without making it better [1].

Sources:

[1] How Claude remembers your project, https://code.claude.com/docs/en/memory
[2] Skills, https://code.claude.com/docs/en/skills
[3] Configure permissions, https://code.claude.com/docs/en/permissions
[4] Yang, He, Zhou, Coding Agents' Compliance with AI Contribution Rules, https://arxiv.org/abs/2607.26819, 07-2026
[5] Hooks reference, https://code.claude.com/docs/en/hooks
[6] Best practices for Claude Code, https://code.claude.com/docs/en/best-practices
[7] Diataxis, Reference, https://diataxis.fr/reference/
[8] Nygard, Documenting architecture decisions, https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html
