# Technical docs

How the whole project is built: stack, packages, tools, build, tests, deploy, how the code is
organized, and why. What the product is lives in `.claude/docs/product/`. How one track's area is
built lives in that track's `tech.md` (`.claude/docs/tracks/`).

## How docs here are written

- Facts are verified, with the date or version they apply to. A fact taken from research and not
  seen here yet says so.
- The reason for a technical rule or choice goes to `decisions.md`, in the § for its area, or to
  the track's `tech.md` when only one track needs it. A new area gets the next § number.
  CLAUDE.md, rules and skills cite these § numbers.
- Versions and machine paths live only in `environment.md`. Other docs point there instead of
  copying them.
- One topic per file, named plainly, like `build.md` or `auth.md`. Add every new doc to the list
  below in the same change. The guide check flags one that is missing.
- Finished work, research and dropped approaches: `history.md`. Its format is in
  `.claude/docs/tracks/README.md`.

## Docs

| Doc | What it holds |
|---|---|
| `decisions.md` | why the technical rules and choices are what they are, one § per area |
| `environment.md` | versions, machine paths, machine traps. Update it when a package or tool is added or upgraded |
| `history.md` | every plan, log, handoff and research doc of this area, newest first, and the dropped approaches |
