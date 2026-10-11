import type { Facts, StatusData, Tone, TrackState } from '../types'

/* The For you and Tracks boxes: the current-status skill's report, made by one Sonnet call on Refresh
 * (moved here from the Project status mod). The skill's gather script collects the facts; the model
 * judges track states, open calls and the next step, and answers as JSON the pane draws. */

export const MODEL = 'sonnet'
export const SKILL_DIR = '~/.claude/skills/current-status'

export const GATHER = [
  'echo "=== gather.sh output ==="',
  `sh ${SKILL_DIR}/scripts/gather.sh 2>&1`,
  'echo',
  'echo "=== Uncommitted word changes in tracked files (first 6000 bytes) ==="',
  `git diff --word-diff=plain --word-diff-regex='[^[:space:]]+' | grep -E '\\[-|\\{\\+' | head -c 6000`,
].join('; ')

// The skill decides what goes in the report; this asks for it as data the pane draws.
export const SYSTEM = `You run the owner's current-status skill for their project and write its report.
You cannot run commands or read files. Step 1 (Gather) is already done: its output is in the prompt,
with the uncommitted word changes and the project's CLAUDE.md. Do step 2 only from that text.

For step 3, follow the skill's rules for what goes in the report (what counts as an open call, what to
leave out, "Never"), but answer with one JSON object instead of Markdown, nothing before or after it:

{
  "headline": "the skill's status line: branch, clean or not, synced or not, anything in progress",
  "chips": [{ "text": "2-4 words, like 'main' or 'synced' or '47 untracked'", "tone": "ok|warn|info" }],
  "next": "the suggested next step, one sentence",
  "question": "a question for the owner if something needs them now, else empty",
  "repo": [{ "text": "one Repo item, only what needs attention", "tone": "warn|info" }],
  "tracks": [{
    "name": "track name",
    "state": "active|waiting|ready|idle",
    "stands": ["one to three short points on where it stands"],
    "next": "its next step, or 'not picked'"
  }],
  "calls": [{
    "title": "the open call as a short question",
    "detail": "one short line of context, or empty",
    "where": "doc, section"
  }]
}

Track states: active = work is running (a live plan, a test in progress); waiting = blocked on the
owner's call; ready = the next step is known and nobody is on it; idle = not started or nothing planned.
Order tracks from most active to least. 3 to 4 chips: branch, sync, changes, and one more if it matters.
All strings are plain text: no Markdown, no backticks, no em dashes. Short, plain everyday words.`

const TONES: readonly string[] = ['ok', 'warn', 'info']
const STATES: readonly string[] = ['active', 'waiting', 'ready', 'idle']
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(x => typeof x === 'object' && x !== null) : [])
const tone = (v: unknown) => (TONES.includes(str(v)) ? v : 'info') as Tone

/** The model's JSON as the pane's data; null when it is not there. */
export function parseReport(text: string): StatusData | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || str(raw.headline) === '') return null
  return {
    headline: str(raw.headline),
    chips: list(raw.chips).map(c => ({ text: str(c.text), tone: tone(c.tone) })),
    next: str(raw.next),
    question: str(raw.question),
    repo: list(raw.repo).map(r => ({ text: str(r.text), tone: tone(r.tone) })),
    tracks: list(raw.tracks).map(t => ({
      name: str(t.name),
      state: (STATES.includes(str(t.state)) ? t.state : 'idle') as TrackState,
      stands: Array.isArray(t.stands) ? t.stands.map(str).filter(Boolean) : [str(t.stands)].filter(Boolean),
      next: str(t.next),
    })),
    calls: list(raw.calls).map(c => ({ title: str(c.title), detail: str(c.detail), where: str(c.where) })),
  }
}

/** The repo facts in the gather script's output. */
export function parseFacts(gathered: string): Facts {
  const head = /^## (\S+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/m.exec(gathered)
  const block = (name: string): string[] => {
    const start = gathered.indexOf(`== ${name}`)
    if (start < 0) return []
    const rest = gathered.slice(gathered.indexOf('\n', start) + 1)
    const end = rest.search(/^== /m)
    return (end < 0 ? rest : rest.slice(0, end)).split('\n').map(l => l.trim()).filter(Boolean)
  }
  return {
    branch: head?.[1] ?? '?',
    sync: head?.[3] ?? (head?.[2] ? 'synced' : 'no upstream'),
    fetched: /^last fetch: (.+)$/m.exec(gathered)?.[1]?.trim() ?? '',
    changed: Number(/^changed files: (\d+)$/m.exec(gathered)?.[1] ?? 0),
    prs: block('Open PRs').filter(l => l !== 'none' && l !== 'gh not installed').length,
    worktrees: block('Worktrees').length,
  }
}

/** The first line of `git status -sb`: "## main...origin/main [ahead 1, behind 2]" -> "1 ahead, 2 behind", or "synced". */
export function syncOf(head: string) {
  const m = /^## (\S+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/m.exec(head)
  if (!m) return ''
  if (!m[2]) return 'no upstream'
  if (!m[3]) return 'synced'
  const ahead = m[3].match(/ahead (\d+)/)?.[1]
  const behind = m[3].match(/behind (\d+)/)?.[1]
  return [ahead ? `${ahead} ahead` : '', behind ? `${behind} behind` : '', /gone/.test(m[3]) ? 'upstream gone' : ''].filter(Boolean).join(', ')
}

/** A path quoted for sh. */
export const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
