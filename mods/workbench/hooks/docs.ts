import type { DocPhase, DocPlan, Docs } from '../types'

/* The project's own docs flow, read only: plans in `.claude/plans/`, their logs and other handoffs in
 * `.claude/handoff/`, research in `.claude/research/`, finished ones in each folder's `done/`.
 * Names are `DD-MM-YYYY-<track>-<topic>...`. A plan's progress is its log's `## Phase N done` and
 * `## Gate X, owner's answer` headings, so nothing here ever writes a file. */

export const EMPTY_DOCS: Docs = { status: 'idle', root: '', tracks: [], plans: [], donePlans: [], handoffs: [], doneHandoffs: [], research: [] }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `DD-MM-YYYY-<rest>`: a sortable date key, a short day ("8 Oct") and the track when the rest starts with one. */
export function nameInfo(name: string, tracks: readonly string[]) {
  const m = name.match(/^(\d\d)-(\d\d)-(\d{4})-(.*)$/)
  if (!m) return { key: '', day: '', track: '' }
  const track = tracks.find(t => m[4]!.startsWith(t + '-')) ?? ''
  return { key: `${m[3]}-${m[2]}-${m[1]}`, day: `${Number(m[1])} ${MONTHS[Number(m[2]) - 1] ?? ''}`, track }
}

export const titleOf = (text: string) => (text.match(/^# (.+)$/m)?.[1] ?? '').trim()

/** The title before its first colon, without a "Handoff:" lead: "Stepped levels test". */
export const shortTitle = (t: string) => cap(t.replace(/^Handoff:\s*/i, '').split(/:\s/)[0]!.trim())

const cap = (s: string) => s.replace(/^./, c => c.toUpperCase())

/** The status line a finished plan or handoff carries: `> **Status: DONE (date), failed: why.**`. */
export function statusOf(text: string) {
  const m = text.match(/^> \*\*Status: DONE \(([^)]+)\)(?:, ([^*]+?))?\.?\*\*/m)
  if (!m) return { failed: false, note: '' }
  const rest = m[2] ?? ''
  return { failed: /failed|stopped/.test(rest), note: rest.replace(/^failed:\s*/, '').replace(/^the owner /, '').replace(/^stopped it /, 'stopped ') }
}

/** A research doc's question: the `Question:` paragraph, joined into one line. */
export function questionOf(text: string) {
  const lines = text.split('\n')
  const at = lines.findIndex(l => /^Question:/.test(l))
  if (at < 0) return ''
  const out = [lines[at]!.replace(/^Question:\s*/, '')]
  for (const l of lines.slice(at + 1)) {
    if (!l.trim() || /^[A-Z][\w ]{2,20}:/.test(l)) break
    out.push(l.trim())
  }
  return cap(out.join(' ').replace(/\s+/g, ' ').trim())
}

/** "The build, the bench, the walk GIF and Gate B" -> "The build, the bench and the walk GIF";
 * "The station picker (mockups E, F); owner gate" -> "The station picker (mockups E, F)". The gate shows as a tag. */
function phaseName(raw: string) {
  const t = raw.replace(/,? and Gate \w+/, '')
  const i = t.lastIndexOf(', ')
  const named = i > 0 && t !== raw ? t.slice(0, i) + ' and ' + t.slice(i + 2) : t
  return cap(named.replace(/\s*[;,]?\s*(?:and\s+)?(?:an?\s+)?owner gate\b\.?/i, '').trim())
}

/** A row's gate: its name in "Gate B", or, for an unnamed "owner gate", its phase number. */
function gateOf(raw: string, n: number) {
  const named = raw.match(/Gate (\w+)/)?.[1]
  return named ?? (/\bgate\b/i.test(raw) ? String(n) : undefined)
}

/** The rows of a plan's `## Phase map` table: `| n | Phase | Check | Roughly |`. */
export function phasesOf(text: string): Omit<DocPhase, 'state'>[] {
  const at = text.search(/^## Phase map/m)
  if (at < 0) return []
  const block = text.slice(at).split(/\n## /)[0]!
  const rows: Omit<DocPhase, 'state'>[] = []
  for (const line of block.split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*[^|]*\|\s*([^|]*?)\s*\|/)
    if (!m) continue
    const raw = m[2]!
    const optional = /^Optional:/i.test(raw)
    const gate = gateOf(raw, Number(m[1]))
    rows.push({ n: Number(m[1]), name: phaseName(raw.replace(/^Optional:\s*/i, '')), size: m[3]!, optional, ...(gate ? { gate } : {}) })
  }
  return rows
}

/** Where a plan's log is: named in the plan ("The handoff log lives at `...`"), else its name with -log for -plan. */
export function logPathOf(planFile: string, text: string, root: string) {
  const named = text.match(/handoff log lives at `([^`]+)`/)?.[1]
  if (named) return named.startsWith('/') ? named : `${root}/${named}`
  const base = planFile.slice(planFile.lastIndexOf('/') + 1).replace(/-plan\.md$/, '-log.md')
  return `${root}/.claude/handoff/${base}`
}

/** One open plan with its progress from the log. */
export function planOf(file: string, text: string, log: string, tracks: readonly string[], logAt = 0): DocPlan {
  const name = file.slice(file.lastIndexOf('/') + 1)
  const info = nameInfo(name, tracks)
  const rows = phasesOf(text)
  const doneAt = new Map([...log.matchAll(/^## Phase (\d+) done/gm)].map(m => [Number(m[1]), m.index!]))
  const done = new Set(doneAt.keys())
  const answered = new Set([...log.matchAll(/^## Gate (\w+), owner['’]s answer/gm)].map(m => m[1]))
  // A gate is answered by its name, or by any gate answer written after its phase's done heading,
  // since a log may name the answer in its own words ("## Gate probe findings, owner's answer").
  const answerAt = [...log.matchAll(/^## Gate .+?, owner['’]s answer/gm)].map(m => m.index!)
  const isAnswered = (p: Omit<DocPhase, 'state'>) => answered.has(p.gate!) || answerAt.some(a => a > doneAt.get(p.n)!)
  const waitRow = rows.find(p => p.gate && done.has(p.n) && !isAnswered(p))
  const nextRow = rows.find(p => !done.has(p.n))
  // Phase 0 is under way once the log has any entry, before its own "done" heading
  const started = done.size > 0 || /^## /m.test(log)
  const phases: DocPhase[] = rows.map(p => ({
    ...p,
    state: done.has(p.n) ? 'done' : p === nextRow && started && !waitRow ? 'doing' : p.optional ? 'optional' : 'todo',
  }))
  const state = !rows.length ? 'no phase map' : !started ? 'not started' : waitRow ? `waits on you at Gate ${waitRow.gate}` : nextRow ? `phase ${nextRow.n} next` : 'all phases done'
  const title = titleOf(text) || name
  return {
    file,
    title,
    short: shortTitle(title),
    track: info.track,
    day: info.day,
    key: info.key,
    phases,
    done: done.size,
    state,
    started,
    logAt,
    ...(waitRow ? { waiting: { gate: waitRow.gate!, after: waitRow.n } } : {}),
    ...(nextRow ? { next: { n: nextRow.n, name: nextRow.name, size: nextRow.size } } : {}),
  }
}

/** The current plan first: the started one whose log changed last, else the earliest. The rest by date. */
export function orderPlans(plans: readonly DocPlan[]): DocPlan[] {
  const byDate = [...plans].sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file))
  const started = byDate.filter(p => p.started)
  const cur = started.length ? started.reduce((a, b) => (b.logAt > a.logAt ? b : a)) : byDate[0]
  return cur ? [cur, ...byDate.filter(p => p !== cur)] : []
}

/** A plan's state for one row: "not started", "phase 3 next", "Gate A", "all done". */
export const stateShort = (p: DocPlan) => (p.waiting ? `Gate ${p.waiting.gate}` : p.state === 'all phases done' ? 'all done' : p.state)

export const isLog = (n: string) => /-log(-done)?\.md$/.test(n)
export const byNewest = <T extends { key: string; file: string }>(a: T, b: T) => b.key.localeCompare(a.key) || a.file.localeCompare(b.file)
