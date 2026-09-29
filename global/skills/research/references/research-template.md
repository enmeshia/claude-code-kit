# Research doc template

Fill this in. Delete the notes in `<>` and any section that has nothing in it. Keep **Answer** at the
top: it is the one section every reader reads.

```markdown
# <Topic>

Date: <same date format as the file name: DD-MM-YYYY, or what the project's CLAUDE.md asks for>.
Question: <one line>.
Feeds: <the decision or plan this is for>.
Related docs: <relative links to the other docs from the same research, if any>.

## Answer

<2-5 lines. The recommendation or direct answer, the confidence (high / medium / low), and the main
reason. Someone who reads only this section should know what to do.>

## Key findings

- <the most decision-relevant finding first> [n]
- <...> [n]

## <Comparison, if there are options>

| Criterion | <Option A> | <Option B> | <Option C> |
|---|---|---|---|
| <criterion, unit> | <value> [n] | <value> [n] | <value> [n] |

<One or two lines on what the table means for the decision.>

## <One section per theme the reader needs, not per sub-agent>

<Findings, with sources. Facts from this codebase cite path:line. Mark your own reasoning
(inferred) and weak sources (secondary).>

## Numbers a plan will need

<Only if a plan will follow. Versions, limits, prices, constants, each with its source.>

| What | Value | Source |
|---|---|---|

## Conflicts and uncertainty

- <where sources disagree, which one we believe, and why>
- <claims that rest on a single weak source>

## Open questions

- <what we could not find> -> <how to find out: a measurement, a vendor question, a spike>

## Scope and assumptions

- In scope: <...>
- Out of scope: <...>
- Assumed: <defaults picked because the question left them open>
- Method: <fields researched, one line each>

## Sources

[1] <title>, <URL or path>, <published date or version>
```
