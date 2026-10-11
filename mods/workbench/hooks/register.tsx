import { atom, read, update } from 'claude-code'
import type { EngineInterface, Hook, Register, RenderChildren } from 'claude-code'

import type { Files, Git, Touch, Activity, WorkbenchUi } from '../types'
import type { BarIn } from './draw'
import { bandBarSvg, bandTitleSvg, DOING, DONE, MUTED, paneBarSvg, textWidth } from './draw'
import { themeFor, clip } from './logic'
import {
  absOf, addTouch, badge, baseOf, extOf, FILE_TOOLS,
  inkOf, paletteOf, parseStatus, relDir, THEME_KEY,
} from './bench'
import type { Palette, SkinCustom, SkinPrefs, Slot } from './bench'
import type { DeckAgent, DeckArchitect, DeckLoop, DeckReceipt, DeckView } from '../types'
import {
  adviceLine, afterCall, applyStep, DEFAULT_ARCHITECT, DEFAULT_MAIN, DEFAULT_ROSTER, DEFAULT_TURN,
  DEFAULT_USAGE, DEFAULT_VIEW, describeInput, EDIT_TOOLS, endConsult, handbackOf, listOf, momentOf, normalize,
  normalizeCard, noteTool, receiptOf, RESET, shorten, startConsult, stepLoop,
} from './deck'
import type { DeckData } from './deck'
import { deckKids, deckTitle } from './deck-view'
import { caps, fileTag, hero, icon, pill, rule } from './icons'
import type { IconName, Ink } from './icons'
import type { DocPlan, Docs, DocsUi, Repo, SectionKey, StatusRun, TrackState } from '../types'
import { byNewest, EMPTY_DOCS, isLog, logPathOf, nameInfo, orderPlans, planOf, questionOf, shortTitle, stateShort, statusOf, titleOf } from './docs'
import { GATHER, MODEL, parseFacts, parseReport, q, SKILL_DIR, SYSTEM, syncOf } from './status'
import type { DocDone, DocHandoff, DocResearch, Facts, StatusData } from '../types'

type $ = EngineInterface

/* ── the Workbench: the side pane ── */

const PANE = 'workbench'
const TITLE = 'Workbench'

const filesAtom = atom({ plugin: 'workbench', key: 'files' } as const, {
  root: '', project: '', expanded: [], dirs: {}, showSizes: false, showHidden: false, query: '', all: [],
} as Files)
const gitAtom = atom({ plugin: 'workbench', key: 'git' } as const, { isRepo: false, branch: '', top: '', dirty: [] } as Git)
const touchedAtom = atom({ plugin: 'workbench', key: 'touched' } as const, [] as Touch[])
const activityAtom = atom({ plugin: 'workbench', key: 'activity' } as const, { busy: false } as Activity)
const benchAtom = atom({ plugin: 'workbench', key: 'bench' } as const, {} as WorkbenchUi)

// The skin /skin has on. Skins is optional (not a dependency): its refs are cast because its
// contract is not laid here, and with it off the pane uses its own colors.
const SKIN_PREFS = { plugin: 'skins', key: 'prefs' } as const
const SKIN_CUSTOM = { plugin: 'skins', key: 'custom' } as const
const SKIN_LIGHT = { plugin: 'skins', key: 'isLight' } as const

const quiet = <T,>(p: Promise<T>) => p.catch(() => undefined)
/** The label of a blank button laid over a drawn icon: two em spaces. Plain spaces collapse to one on the desktop, which left only the icon's left edge clickable. */
const COVER = '\u2003\u2003'

/* ── files ── */

async function refreshGit($: $) {
  const { root } = await read($, filesAtom)
  const head = await quiet($.process.run(['git', '-C', root, 'rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 }))
  if (!head || head.exitCode !== 0) return void (await update($, gitAtom, () => ({ isRepo: false, branch: '', top: '', dirty: [] })))
  const [top = root, branch = ''] = head.stdout.trim().split('\n')
  const st = await quiet($.process.run(['git', '-C', top, 'status', '--porcelain=v1', '-z', '-uall'], { timeoutMs: 10000 }))
  const dirty = st && st.exitCode === 0 ? parseStatus(st.stdout, top) : []
  await update($, gitAtom, () => ({ isRepo: true, branch, top, dirty }))
  if (docsRoot) await refreshRepo($, top)
}

/* ── drawing ── */

async function paletteNow($: $) {
  const prefs = (await quiet($.state.get(SKIN_PREFS as never)))?.value as SkinPrefs
  const custom = (await quiet($.state.get(SKIN_CUSTOM as never)))?.value as SkinCustom
  const isLight = (await quiet($.state.get(SKIN_LIGHT as never)))?.value as boolean | undefined
  return paletteOf(prefs, custom, isLight)
}

/** Opens the pane and redraws the band, whose arrow and closed-pane strip follow it. */
async function openPane($: $) {
  await $.ui.open({ id: PANE, title: TITLE })
  $.ui.invalidate('ui.render')
}

/** The band's Workbench button and `/workbench:task`. */
async function togglePane($: $) {
  const isUp = (await $.ui.panes()).some(p => p.id === PANE)
  if (isUp) {
    await $.ui.close({ id: PANE })
    $.ui.invalidate('ui.render')
  } else await openPane($)
}

/** About how wide the Workbench button draws on the desktop, in CSS px: the icon's 2 columns, the gap, the name and its padding. */
const BENCH_PX = 2 * 8 + 8 + Math.ceil(textWidth('Workbench', 14)) + 20

/** The band's Workbench button, in the look of the pane's box headers (an icon and a plain button): it opens the pane, or closes it. */
async function benchButton($: $, e: Parameters<Hook<'ui.render'>>[1]) {
  const els = $.ui.resolve(e)
  const { Box, Button } = els
  const press = () => void togglePane($)
  const name = <Button key="band-open" plain onPress={press}>Workbench</Button>
  if (!('Svg' in els)) return name
  const { Svg } = els
  const pal = await paletteNow($)
  return (
    <Box key="band-bench" flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
      <Box key="band-open-icon" width={2} height={1} flexShrink={0} justifyContent="center" alignItems="center">
        <Svg width={16} height={16} alt="Workbench" source={icon('panel-right', inkOf(pal, 'read'), 16)} />
        <Box position="absolute" top={0} left={0} right={0} bottom={0}>
          <Button key="band-open-iconb" plain label={COVER} onPress={press} />
        </Box>
      </Box>
      {name}
    </Box>
  )
}

/** The band while the pane is closed and there is no plan to draw: the Workbench button alone, at the right end. */
async function openStrip($: $, e: Parameters<Hook<'ui.render'>>[1]) {
  const { Box } = $.ui.resolve(e)
  return (
    <Box flexDirection="row">
      <Box flexGrow={1} />
      {await benchButton($, e)}
    </Box>
  )
}

/** At session start: the tree on the session's folder, and the pane opens unless the setting says no. */
async function startWorkbench($: $) {
  const cwd = await $.session.cwd()
  await update($, filesAtom, f => ({ ...f, project: cwd, root: cwd }))
  void refreshGit($)
  // The sections as last left, from the store.
  const sections = sectionsOf(await quiet($.store.get(SECTIONS)))
  await update($, benchAtom, u => ({ ...u, sections }))
  if (settings.openPane) void openPane($)
}

/** After each turn: commits and checkouts happen in Bash, so the branch line catches up. */
/** Which Workbench sections are open, kept across sessions: Files and In Flight collapsed until changed. */
const SECTIONS = 'sections'
type Sections = Record<SectionKey, boolean>
const sectionsOf = (v: unknown): Sections => ({
  files: false, deck: false, foryou: true, plan: true, tracks: true, handoffs: false, research: false,
  ...(v && typeof v === 'object' ? (v as Partial<Sections>) : {}),
})
async function toggleSection($: $, k: keyof Sections) {
  const ui = await update($, benchAtom, u => {
    const cur = sectionsOf(u.sections)
    return { ...u, sections: { ...cur, [k]: !cur[k] } }
  })
  await quiet($.store.set(SECTIONS, ui.sections))
}

/* ── the In Flight card: its state, read and drawn here; its hooks are further down ── */

const mainAtom = atom({ plugin: 'workbench', key: 'deckMain' } as const, DEFAULT_MAIN)
const usageAtom = atom({ plugin: 'workbench', key: 'deckUsage' } as const, DEFAULT_USAGE)
const archAtom = atom({ plugin: 'workbench', key: 'deckArchitect' } as const, DEFAULT_ARCHITECT)
const agentsAtom = atom({ plugin: 'workbench', key: 'deckAgents' } as const, [] as DeckAgent[])
const loopsAtom = atom({ plugin: 'workbench', key: 'deckLoops' } as const, [] as DeckLoop[])
const turnAtom = atom({ plugin: 'workbench', key: 'deckTurn' } as const, DEFAULT_TURN)
const receiptAtom = atom({ plugin: 'workbench', key: 'deckReceipt' } as const, null as DeckReceipt | null)
const viewAtom = atom({ plugin: 'workbench', key: 'deckView' } as const, DEFAULT_VIEW)
const rosterAtom = atom({ plugin: 'workbench', key: 'deckRoster' } as const, DEFAULT_ROSTER)

async function readDeck($: $): Promise<DeckData> {
  const [main, usage, arch, cards, loops, turn, receipt, view, now] = await Promise.all([
    getMain($), getUsage($), getArch($), getCards($), getLoops($), getTurn($), read($, receiptAtom), getView($), $.clock.now(),
  ])
  return { main, usage, arch, cards, loops, turn, receipt, view, now }
}

/** The card's Reset: agents, consults and the turn clear; rate limits and compactions stay. */
async function resetDeck($: $) {
  await update($, mainAtom, RESET.main)
  await update($, archAtom, () => DEFAULT_ARCHITECT)
  await update($, agentsAtom, () => [])
  await update($, loopsAtom, () => [])
  await update($, turnAtom, () => DEFAULT_TURN)
  await update($, receiptAtom, () => null)
  await update($, viewAtom, () => DEFAULT_VIEW)
  await update($, usageAtom, RESET.usage)
}

const afterTurnWorkbench = ($: $) => {
  void quiet(refreshGit($))
  // The turn is over: Right now goes back to idle.
  void quiet(update($, activityAtom, a => ({ ...a, busy: false })))
}


/** The settings from /config (the manifest's userConfig), read when the module loads. */
const settings = { openPane: true, band: true, followMacos: true }

/* ── reading our docs flow (pure parsing in docs.ts) ── */

/** The `.claude` folder's root: the nearest folder at or above `cwd` holding `.claude/plans` or `.claude/docs`, short of home. */
async function findDocsRoot($: $, cwd: string, home: string) {
  let dir = cwd.replace(/\/+$/, '')
  const stop = home.replace(/\/+$/, '')
  while (dir && dir !== stop && dir !== '/') {
    if ((await $.fs.exists(`${dir}/.claude/plans`)) || (await $.fs.exists(`${dir}/.claude/docs`))) return dir
    dir = dir.slice(0, dir.lastIndexOf('/'))
  }
  return undefined
}

/** The docs root for this session's folder; a throw anywhere reads as none. */
async function docsRootNow($: $) {
  return findDocsRoot($, await $.session.cwd(), (await $.env.get('HOME')) ?? '')
}

async function namesIn($: $, dir: string, ext = /\.md$/) {
  const list = (await quiet($.fs.list(dir))) ?? []
  return list.filter(f => f.kind === 'file' && ext.test(f.name)).map(f => f.name)
}
const readText = async ($: $, path: string) => (await quiet($.fs.read(path))) ?? ''

/** Everything the Plans, Handoffs and Research boxes draw, read fresh from disk. */
async function loadDocs($: $, root: string): Promise<Docs> {
  const cl = `${root}/.claude`
  const tracks = ((await quiet($.fs.list(`${cl}/docs/tracks`))) ?? []).filter(f => f.kind === 'dir').map(f => f.name).sort()
  const done = async (dir: string, names: string[]): Promise<DocDone[]> =>
    (await Promise.all(names.map(async n => {
      const text = await readText($, `${dir}/${n}`)
      const st = statusOf(text)
      return { file: `${dir}/${n}`, title: shortTitle(titleOf(text) || n), ...nameInfo(n, tracks), failed: st.failed, note: st.note }
    }))).sort(byNewest)

  const planNames = await namesIn($, `${cl}/plans`)
  // A plan may name its log with no -log ending; that file is its log, not an open handoff.
  const logs = new Set<string>()
  const plans = orderPlans(await Promise.all(planNames.map(async n => {
    const file = `${cl}/plans/${n}`
    const text = await readText($, file)
    const log = logPathOf(file, text, root)
    logs.add(log)
    return planOf(file, text, await readText($, log), tracks, (await quiet($.fs.stat(log)))?.mtimeMs ?? 0)
  })))

  const handoffs: DocHandoff[] = (await Promise.all((await namesIn($, `${cl}/handoff`)).filter(n => !isLog(n) && !logs.has(`${cl}/handoff/${n}`)).map(async n => {
    const text = await readText($, `${cl}/handoff/${n}`)
    return { file: `${cl}/handoff/${n}`, title: shortTitle(titleOf(text) || n), ...nameInfo(n, tracks) }
  }))).sort(byNewest)

  const research: DocResearch[] = (await Promise.all((await namesIn($, `${cl}/research`, /\.(md|html)$/)).map(async n => {
    const text = await readText($, `${cl}/research/${n}`)
    const title = titleOf(text) || (text.match(/<title>([^<]+)<\/title>/)?.[1] ?? n)
    return { file: `${cl}/research/${n}`, title, question: n.endsWith('.html') ? 'A page to look at' : questionOf(text), ...nameInfo(n, tracks) }
  }))).sort(byNewest)

  return {
    status: 'ready',
    root,
    tracks,
    plans,
    donePlans: await done(`${cl}/plans/done`, await namesIn($, `${cl}/plans/done`)),
    handoffs,
    doneHandoffs: await done(`${cl}/handoff/done`, (await namesIn($, `${cl}/handoff/done`)).filter(n => !isLog(n))),
    research,
  }
}

/* ── the status report (prompt and parsing in status.ts) ── */

async function sh($: $, root: string, script: string, timeoutMs = 60000) {
  const run = await $.process.run(['sh', '-c', `cd ${q(root)} && { ${script}; }`], { timeoutMs })
  return run.stdout + (run.exitCode === 0 ? '' : run.stderr)
}

/** Gathers, asks the model, and returns the report or why it failed. */
async function makeReport($: $, root: string): Promise<{ text: string; at: string; data: StatusData | null; facts: Facts } | { error: string }> {
  const [skill, claudeMd, gathered, now] = await Promise.all([
    sh($, root, `cat ${SKILL_DIR}/SKILL.md`),
    sh($, root, 'cat CLAUDE.md 2>/dev/null | head -c 20000'),
    sh($, root, GATHER, 120000),
    sh($, root, 'date "+%d-%m-%Y %H:%M"'),
  ])
  if (!skill.trim()) return { error: `the current-status skill is missing (${SKILL_DIR})` }
  const answer = await $.model.complete({
    model: MODEL,
    system: `${SYSTEM}\n\n=== The skill (SKILL.md) ===\n${skill}`,
    prompt: [`Today: ${now.trim()}`, `=== Project CLAUDE.md ===\n${claudeMd}`, gathered, 'Write the report now, as the JSON object.'].join('\n\n'),
    maxTokens: 4000,
    timeoutMs: 240000,
  })
  if (!answer.isAnswered) return { error: answer.reason === 'api-error' ? `API error ${answer.status ?? ''} ${answer.error}` : answer.reason }
  const text = answer.text.trim()
  return { text, at: now.trim(), data: parseReport(text), facts: parseFacts(gathered) }
}

/* ── Our docs flow and the status report: in a project with `.claude/plans` or `.claude/docs`, the
 * pane adds For you, Plan, Tracks, Handoffs and Research above Files and In Flight. ── */

const docsAtom = atom({ plugin: 'workbench', key: 'docs' } as const, EMPTY_DOCS)
const docsUiAtom = atom({ plugin: 'workbench', key: 'docsUi' } as const, { phasesOpen: false, callsPage: 0, researchPage: 0, track: null } as DocsUi)
const statusAtom = atom({ plugin: 'workbench', key: 'status' } as const, { phase: 'idle', error: '', report: null } as StatusRun)
const repoAtom = atom({ plugin: 'workbench', key: 'repo' } as const, { sync: '', fetched: '', worktrees: 0 } as Repo)

/** The folder holding `.claude/`, found at session start; undefined outside our docs flow. */
let docsRoot: string | undefined
const REPORT = 'report'

async function refreshDocs($: $) {
  if (!docsRoot) return
  const docs = await quiet(loadDocs($, docsRoot))
  if (docs) await update($, docsAtom, () => docs)
}

/** Sync with the upstream, the last fetch and the worktree count, for the Files box's branch line. */
async function refreshRepo($: $, top: string) {
  const run = (args: string[]) => quiet($.process.run(['git', '-C', top, ...args], { timeoutMs: 5000 }))
  const [st, wt, common] = await Promise.all([run(['status', '-sb', '-uno']), run(['worktree', 'list', '--porcelain']), run(['rev-parse', '--git-common-dir'])])
  const dir = common?.exitCode === 0 ? absOf(common.stdout.trim(), top) : ''
  const fetch = dir ? await quiet($.fs.stat(`${dir}/FETCH_HEAD`)) : undefined
  const at = fetch ? new Date((fetch as { mtimeMs?: number }).mtimeMs ?? 0) : undefined
  const sameDay = at && at.toDateString() === new Date().toDateString()
  const fetched = at && at.getTime() > 0 ? (sameDay ? at.toTimeString().slice(0, 5) : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) : ''
  const repo: Repo = {
    sync: st?.exitCode === 0 ? syncOf(st.stdout.split('\n')[0] ?? '') : '',
    fetched,
    worktrees: wt?.exitCode === 0 ? wt.stdout.split('\n').filter(l => l.startsWith('worktree ')).length : 0,
  }
  if (JSON.stringify(await read($, repoAtom)) !== JSON.stringify(repo)) await update($, repoAtom, () => repo)
}

let isReporting = false
/** One Sonnet call: the current-status skill's report, kept in the store until the next Refresh. */
async function refreshStatus($: $) {
  if (!docsRoot || isReporting) return
  isReporting = true
  await update($, statusAtom, (s): StatusRun => ({ ...s, phase: 'loading', error: '' }))
  try {
    const r = await makeReport($, docsRoot)
    if ('error' in r) return void (await update($, statusAtom, (s): StatusRun => ({ ...s, phase: 'error', error: `The report failed: ${r.error}.` })))
    await update($, statusAtom, (): StatusRun => ({ phase: 'idle', error: '', report: r }))
    await quiet($.store.set(REPORT, r))
  } catch (err) {
    await update($, statusAtom, (s): StatusRun => ({ ...s, phase: 'error', error: `The report failed: ${String((err as Error).message ?? err)}.` }))
  } finally {
    isReporting = false
  }
}

// The first report waits for a surface to draw on, so a `claude -p` run makes no model call.
let hasReported = false
function reportOnce($: $) {
  if (hasReported || !docsRoot) return
  hasReported = true
  $.clock.after(1, () => void refreshStatus($))
}

async function startDocs($: $) {
  const kept = (await quiet($.store.get(REPORT))) as StatusRun['report'] | undefined
  if (kept && !(await read($, statusAtom)).report) await update($, statusAtom, s => ({ ...s, report: kept }))
  await refreshDocs($)
  if (((await quiet($.session.surfaces())) ?? []).length > 0) reportOnce($)
}

/** A plan as the band and the Plan card draw it: the dot, what is happening now, the bar. */
function planLook(p: DocPlan, pal: Palette & { themed: boolean }) {
  const hex = (slot: Slot, plain: string) => (pal.themed ? pal[slot] : plain)
  const total = p.phases.length
  const finished = total > 0 && p.done >= total
  const color = p.waiting ? hex('user', '#60a5fa') : finished ? DONE : hex('write', DOING)
  const now = p.waiting ? `waits on you at Gate ${p.waiting.gate}` : !p.done ? 'not started' : p.next ? `phase ${p.next.n} · ${p.next.name}` : finished ? 'all phases done' : p.state
  const bar: BarIn = {
    done: p.done,
    doing: p.phases.some(x => x.state === 'doing') ? 1 : 0,
    total,
    pill: p.waiting ? `Gate ${p.waiting.gate}` : finished ? 'done' : p.done ? `phase ${p.next?.n ?? ''}`.trim() : 'not started',
    finished,
    color,
  }
  return { bar, now, pct: total ? Math.round((p.done / total) * 100) : 0, dot: p.waiting ? color : p.done ? hex('write', DOING) : hex('muted', MUTED) }
}

/* ── shared view values ── */

/** After each turn: Claude may have edited a docs file, so re-read them. */
const afterTurn: Hook<'turn.complete'> = async ($, e, next) => {
  const r = await next(e)
  await quiet(deckTurnDone($, e))
  afterTurnWorkbench($)
  if (docsRoot) await refreshDocs($)
  return r
}

/** `/workbench:task`: this copy has no tasks, so it opens the pane. */
async function taskCommand($: $) {
  await openPane($)
  return { text: 'Opened the Workbench pane.' }
}

/* ── In Flight's hooks: they watch the session and keep the card's state; each passes its event on unchanged ── */

/** Agent types and server tools that count as the on-call architect. */
const ARCHITECT = /advisor|architect/i

type ServerBlock = { type: string; id?: string; name?: string; tool_use_id?: string }

// Every read goes through these, so a value saved under an older shape still reads after a reload.
const getMain = async ($: $) => normalize(DEFAULT_MAIN, await read($, mainAtom))
const getUsage = async ($: $) => normalize(DEFAULT_USAGE, await read($, usageAtom))
async function getArch($: $): Promise<DeckArchitect> {
  const a = normalize(DEFAULT_ARCHITECT, await read($, archAtom))
  return { ...a, consults: listOf(a.consults), ids: listOf(a.ids), seen: listOf(a.seen) }
}
const getCards = async ($: $) => listOf<unknown>(await read($, agentsAtom)).map(normalizeCard)
const getLoops = async ($: $) => listOf<DeckLoop>(await read($, loopsAtom))
const getTurn = async ($: $) => normalize(DEFAULT_TURN, await read($, turnAtom))
const getView = async ($: $): Promise<DeckView> => normalize(DEFAULT_VIEW, await read($, viewAtom))
const getRoster = async ($: $) => ({ architectTypes: listOf<string>(normalize(DEFAULT_ROSTER, await read($, rosterAtom)).architectTypes) })

async function consultStarted($: $, id: string, via: string) {
  const moment = momentOf(await getTurn($))
  const at = await $.clock.now()
  await update($, archAtom, a => startConsult(normalize(DEFAULT_ARCHITECT, a), { id, at, moment, via }))
  if (moment === 'before done') await update($, turnAtom, x => ({ ...normalize(DEFAULT_TURN, x), isReviewing: true }))
}

async function consultEnded($: $, advice: string | null, id?: string) {
  const at = await $.clock.now()
  const first = advice?.split('\n').find(l => l.trim()) ?? null
  const text = first ? shorten(first.replace(/^[#>*\s-]+/, ''), 160) : null
  await update($, archAtom, a => endConsult(normalize(DEFAULT_ARCHITECT, a), at, text, id))
  await update($, turnAtom, t => ({ ...normalize(DEFAULT_TURN, t), isReviewing: false }))
}

async function noteAdvice($: $, advice: string) {
  await update($, archAtom, x => ({ ...normalize(DEFAULT_ARCHITECT, x), lastAdvice: advice }))
}

const isArchitectType = async ($: $, type: string) => ARCHITECT.test(type) || (await getRoster($)).architectTypes.includes(type)

async function noteMode($: $, mode: string | undefined) {
  if (mode) await update($, mainAtom, m => (normalize(DEFAULT_MAIN, m).mode === mode ? normalize(DEFAULT_MAIN, m) : { ...normalize(DEFAULT_MAIN, m), mode }))
}

/* ── hooks: each passes its event on unchanged ── */

type CallIn = Parameters<Hook<'tool.call'>>[1]
type CallOut = Awaited<ReturnType<Hook<'tool.call'>>>
type TurnIn = Parameters<Hook<'turn.complete'>>[1]

/** After a tool call: note it on its agent's card, count edits and errors. */
async function noteCall($: $, e: CallIn, ran: CallOut) {
  const didRun = ran.deny === undefined
  // A background agent hands its report back through this tool; an architect's report is its advice.
  if (String(e.tool) === 'SubagentHandback') {
    const message = (e as unknown as { message?: unknown }).message
    const a = e.agentId ? await getArch($) : null
    if (a && e.agentId && a.ids.includes(e.agentId) && typeof message === 'string') {
      const advice = adviceLine(message)
      if (advice && advice !== a.lastAdvice) await noteAdvice($, advice)
    }
    return
  }
  if (e.tool === 'Agent') return
  const hasFailed = didRun && ran.isError === true
  const isEdit = !hasFailed && didRun && EDIT_TOOLS.has(e.tool)
  const t0 = await getTurn($)
  if (isEdit || hasFailed || (!e.agentId && t0.errorStreak > 0))
    await update($, turnAtom, t => afterCall(normalize(DEFAULT_TURN, t), { inSubagent: Boolean(e.agentId), hasFailed, isEdit }))
  const text = shorten(describeInput(e.tool, e), 64)
  if (e.agentId) {
    const id = e.agentId
    await update($, agentsAtom, list =>
      listOf<unknown>(list)
        .map(normalizeCard)
        .map(c => (c.id === id ? noteTool(c, { tool: e.tool, text, isError: hasFailed || ran.deny !== undefined }) : c)),
    )
  }
}

/** In Flight at session start: the first usage reading. A host without usage just starts without it. */
async function deckStart($: $) {
  const u = await $.session.usage().catch(() => null)
  if (u)
    await update($, usageAtom, x => ({
      ...normalize(DEFAULT_USAGE, x),
      pct: u.context.percent ?? null,
      tokens: u.context.tokens ?? null,
      window: u.context.window,
      limits: u.rateLimits.map(r => ({ kind: r.kind, pct: r.percentUsed })),
    }))
}

/** In Flight around a tool call: it runs the call, then notes it; nothing after the call may throw into it. */
async function deckToolCall($: $, e: CallIn, next: (e: CallIn) => Promise<CallOut>): Promise<CallOut> {
  const ran = await next(e)
  await noteCall($, e, ran).catch(() => undefined)
  return ran
}

/** In Flight after a turn, the main loop's or an agent's: the receipt, or the agent's card done. */
async function deckTurnDone($: $, e: TurnIn) {
  const id = e.agentId
  const now = await $.clock.now()
  if (!id) {
    const [t, cards] = await Promise.all([getTurn($), getCards($)])
    const r = receiptOf(t, { durationMs: e.durationMs, agentsSince: cards.filter(c => c.spawnedAt >= t.startedAt).length, reason: e.reason })
    await update($, receiptAtom, () => r)
    await update($, mainAtom, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: false }))
    return
  }
  if ((await getArch($)).ids.includes(id)) {
    await consultEnded($, e.answer, id)
    return
  }
  const cards = await getCards($)
  if (cards.some(c => c.id === id)) {
    const status = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'failed'
    await update($, agentsAtom, list =>
      listOf<unknown>(list)
        .map(normalizeCard)
        .map(c => (c.id === id ? { ...c, status, endedAt: now, answer: shorten(e.answer, 400) } : c)),
    )
  } else {
    await update($, loopsAtom, l => listOf<DeckLoop>(l).map(x => (x.id === id ? { ...x, isDone: true, lastAt: now } : x)))
  }
}

// The desktop app follows macOS appearance, but mods only see Claude Code's `theme` setting.
// Keeping it on light or dark to match lets skins and the pane redraw for the right background.
async function syncAppearance($: EngineInterface): Promise<void> {
  const { stdout } = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle'], { timeoutMs: 5000 })
  const current = (await $.config.list()).find(row => row.key === 'theme')?.value
  const want = themeFor(current, stdout)

  if (current !== want) {
    await $.config.set({ key: 'theme', value: want })
    // Skins re-reads the theme inside that set and still sees the old one; setting it again
    // a moment later makes it read the new one.
    await $.clock.sleep(1000)
    await $.config.set({ key: 'theme', value: want })
  }
}

// The first sync fails off macOS (no `defaults`), and then nothing keeps checking.
async function followAppearance($: EngineInterface): Promise<void> {
  await syncAppearance($)
  $.clock.every(5000, () => quiet(syncAppearance($)))
}

export const register: Register = (on, options) => {
  settings.openPane = options.open_pane !== 'off'
  settings.band = options.band !== 'off'
  settings.followMacos = options.follow_macos !== 'off'

  // In Flight: the events only it watches. session.start, tool.call and turn.complete go through the Workbench's own hooks.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await resetDeck($)
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await noteMode($, e.permission_mode)
    return next(e)
  })

  on('agent.offer', async ($, e, next) => {
    const offered = await next(e)
    if (ARCHITECT.test(e.agent))
      await update($, rosterAtom, r => {
        const x = { architectTypes: listOf<string>(normalize(DEFAULT_ROSTER, r).architectTypes) }
        return x.architectTypes.includes(e.agent) ? x : { architectTypes: [...x.architectTypes, e.agent].slice(-20) }
      })
    return offered
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, turnAtom, () => ({ ...DEFAULT_TURN, startedAt: now }))
    await update($, mainAtom, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: true }))
    // A background architect's report reaches the main loop as the text opening this turn. The
    // SubagentHandback tool call (in tool.call) normally carries it first; this is the fallback.
    const back = e.text ? handbackOf(e.text) : null
    const a = back ? await getArch($) : null
    if (back && a && a.ids.includes(back.from)) {
      const advice = adviceLine(back.body)
      if (advice && advice !== a.lastAdvice) await noteAdvice($, advice)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // The main loop's model is known when its request starts; a long first request shouldn't read "-".
    if (!e.agentId) {
      await update($, mainAtom, m => {
        const x = normalize(DEFAULT_MAIN, m)
        return { ...x, model: e.model, effort: String(e.effort ?? x.effort), steps: x.steps + 1 }
      })
      return yield* next(e)
    }
    const result = yield* next(e)
    const id = e.agentId
    const [cards, a] = await Promise.all([getCards($), getArch($)])
    if (cards.some(c => c.id === id)) {
      const step = { model: e.model, usage: result.usage, stopReason: result.stopReason }
      await update($, agentsAtom, list => listOf<unknown>(list).map(normalizeCard).map(c => (c.id === id ? applyStep(c, step) : c)))
    } else if (!a.ids.includes(id)) {
      const now = await $.clock.now()
      await update($, loopsAtom, l => stepLoop(listOf<DeckLoop>(l), id, now))
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, usageAtom, x => ({
      ...normalize(DEFAULT_USAGE, x),
      pct: e.context.percent ?? null,
      tokens: e.context.tokens ?? null,
      window: e.context.window,
      limits: e.rateLimits.map(r => ({ kind: r.kind, pct: r.percentUsed })),
    }))
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId && e.trigger !== 'precompute') {
      const now = await $.clock.now()
      await update($, usageAtom, x => {
        const u = normalize(DEFAULT_USAGE, x)
        return { ...u, compactions: u.compactions + 1, lastCompactAt: now }
      })
    }
    return done
  })

  // A server-side review tool never reaches tool.call: it shows only in the assistant's rows.
  on('session.append', async ($, e, next) => {
    if (!e.agentId && e.message.type === 'assistant') {
      const a = await getArch($)
      // Consults this row opened: their result may be in the same row, after the stale read above.
      const opened = new Set<string>()
      for (const block of e.message.content as unknown as readonly ServerBlock[]) {
        if (block.type === 'server_tool_use' && block.name && block.id && ARCHITECT.test(block.name)) {
          if (a.seen.includes(block.id)) continue
          const id = block.id
          await update($, archAtom, x => {
            const y = normalize(DEFAULT_ARCHITECT, x)
            return { ...y, seen: [...listOf<string>(y.seen), id].slice(-60) }
          })
          opened.add(id)
          await consultStarted($, id, `${block.name} tool`)
        } else if (block.type.endsWith('_tool_result') && block.tool_use_id) {
          const id = block.tool_use_id
          const isOpen = opened.has(id) || (await getArch($)).consults.some(c => c.id === id && c.endAt === null)
          if (isOpen) await consultEnded($, null, id)
        }
      }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (!e.parentAgentId) await noteMode($, e.permissionMode)
    if (started.deny !== undefined || !started.agentId) return started
    const id = started.agentId
    if (await isArchitectType($, e.subagentType)) {
      await update($, archAtom, a => {
        const x = normalize(DEFAULT_ARCHITECT, a)
        return { ...x, ids: [...listOf<string>(x.ids), id].slice(-40) }
      })
      await update($, loopsAtom, l => listOf<DeckLoop>(l).filter(x => x.id !== id))
      await consultStarted($, id, e.subagentType.split(':').pop() ?? 'agent')
      return started
    }
    const card: DeckAgent = { ...normalizeCard({}), id, type: e.name ?? e.subagentType, model: started.model, description: e.description, spawnedAt: await $.clock.now() }
    await update($, agentsAtom, list => [...listOf<unknown>(list).map(normalizeCard), card].slice(-24))
    await update($, loopsAtom, l => listOf<DeckLoop>(l).filter(x => x.id !== id))
    return started
  })


  on('session.start', async ($, e, next) => {
    docsRoot = await quiet(docsRootNow($))
    const r = await next(e)
    void $.ui.status(undefined)
    void quiet(deckStart($))
    void startWorkbench($)
    if (settings.followMacos) void quiet(followAppearance($))
    if (docsRoot) void quiet(startDocs($))
    return r
  })

  // A surface attached after the start (the desktop opening a headless session): the first report can run now.
  // The person's close mark or key: the band's arrow and its closed-pane strip follow the pane.
  // (The module's own opens and closes redraw in openPane and togglePane; its hooks don't hear its own calls.)
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const r = await next(e)
    $.ui.invalidate('ui.render')
    return r
  })

  on('session.attach', async ($, e, next) => {
    reportOnce($)
    return next(e)
  })


  on('turn.complete', afterTurn)

  // `workbench:task` is commands/task.md, which the app lists before a session starts.
  on('command.run', { command: 'workbench:task' }, taskCommand)

  /* ── band above the prompt: line 1 the plan, line 2 its bar; without one, the Workbench button ── */

  // The band is shared: what the mods beneath draw there (the skins mod's usage band) stays,
  // above ours, so a plan or the Workbench button never hides it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const stack = async (own: RenderChildren) => {
      const theirs = await next(e)
      const { Box } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {theirs}
          {own}
        </Box>
      )
    }
    // Our docs flow: the current plan, its phases as the bar, a gate waiting on you in your color.
    const p = docsRoot ? (await read($, docsAtom)).plans[0] : undefined
    if (!settings.band || e.props.hasSurvey) return next(e)
    const isUp = (await $.ui.panes()).some(x => x.id === PANE)
    // No plan to draw (or no docs flow): the Workbench button while the pane is closed, so it can come back.
    if (!p || !p.phases.length) return isUp ? next(e) : stack(await openStrip($, e))
    const pal = await paletteNow($)
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const bench = await benchButton($, e)
    const look = planLook(p, pal)
    const short = p.track || 'plan'
    if (e.surface === 'desktop' && 'Svg' in els) {
      const { Svg } = els
      const W = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 40 - BENCH_PX))
      return stack(
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
              <Svg key="band-title" width={W} height={20} alt={`${short}: ${p.short}, ${look.now}`} source={bandTitleSvg(W, look.dot, short, p.short, look.now)} />
            </Box>
            {bench}
          </Box>
          <Svg key="band-bar" width={W} height={20} alt={`${look.bar.pill}, ${look.pct}% done`} source={bandBarSvg(W, look.bar)} />
        </Box>
      )
    }
    const cols = e.props.bodyColumns ?? e.viewport?.columns ?? 80
    const width = Math.max(8, Math.min(48, cols - look.bar.pill.length - 10))
    const filled = Math.round((width * look.bar.done) / Math.max(1, look.bar.total))
    return stack(
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1} flexWrap="nowrap">
          <Text color={look.dot}>●</Text>
          <Text dimColor>{short}</Text>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text bold wrap="truncate-end">{p.short}<Text dimColor bold={false}>{`  now · ${look.now}`}</Text></Text>
          </Box>
          {bench}
        </Box>
        <Box flexDirection="row" columnGap={1}>
          <Text><Text color={look.bar.color}>{'█'.repeat(filled)}</Text><Text dimColor>{'░'.repeat(Math.max(0, width - filled))}</Text></Text>
          <Text color={look.bar.color} bold>{look.bar.pill}</Text>
          <Text dimColor>{`${look.pct}%`}</Text>
        </Box>
      </Box>
    )
  })

  /* ── side pane: the Workbench ── */

  // A prompt starts a turn: Right now shows Claude working until the turn ends.
  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    await quiet(update($, activityAtom, () => ({ busy: true, since: Date.now() })))
    return r
  }).catch(($, e, next) => next(e))

  // What Claude reads and edits, for "Right now" and "Claude touched"; commands and searches for "Right now".
  // Every call also runs through In Flight, which settles its permission check and logs edits and errors.
  on('tool.call', async ($, e, next) => {
    const kind = FILE_TOOLS[e.tool]
    const args = e as unknown as { file_path?: unknown; notebook_path?: unknown; command?: unknown; description?: unknown; pattern?: unknown }
    const raw = args.file_path ?? args.notebook_path
    if (!kind || typeof raw !== 'string') {
      const text = (v: unknown) => (typeof v === 'string' ? v.split('\n')[0]!.trim() : '')
      const act: Activity =
        e.tool === 'Bash' ? { busy: true, kind: 'run', label: text(args.description) || text(args.command) }
        : (e.tool as string) === 'Grep' || (e.tool as string) === 'Glob' ? { busy: true, kind: 'search', label: text(args.pattern) } // where the build has them
        : { busy: true }
      await quiet(update($, activityAtom, a => (act.kind ? { ...act, since: a.since } : { ...a, busy: true })))
      return deckToolCall($, e, next)
    }
    const path = absOf(raw, (await quiet($.session.cwd())) ?? '')
    await quiet(update($, activityAtom, a => ({ busy: true, kind, path, since: a.since })))
    await quiet(update($, touchedAtom, l => addTouch(l, { path, kind, active: true, at: Date.now() })))
    try {
      return await deckToolCall($, e, next)
    } finally {
      await quiet(update($, touchedAtom, l => addTouch(l, { path, kind, active: false, at: Date.now() })))
      if (kind === 'edited') {
        void quiet(refreshGit($))
        if (docsRoot && path.startsWith(docsRoot + '/.claude/')) void quiet(refreshDocs($))
      }
    }
  }).catch(($, e, next) => next(e)) // never in the way of a tool call

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const cols = Math.max(28, e.props?.bodyColumns || 44)
    const pal = await paletteNow($)
    const ui = await read($, benchAtom)
    const files = await read($, filesAtom)
    const git = await read($, gitAtom)
    const touched = await read($, touchedAtom)
    const activity = await read($, activityAtom)
    const open = sectionsOf(ui.sections)
    const docs = await read($, docsAtom)
    const docsUi = await read($, docsUiAtom)
    const status = await read($, statusAtom)
    const repo = await read($, repoAtom)
    const isDocs = !!docsRoot && docs.status === 'ready'

    // Text in a skin color; with no skin, Claude Code's theme color for the slot (it follows light and dark).
    const c = (slot: Slot) => (pal.themed ? { color: pal[slot] } : THEME_KEY[slot] ? { color: THEME_KEY[slot] } : slot === 'muted' ? { dimColor: true } : {})
    // Desktop draws Lucide icons, caps labels and pills as SVG; the terminal gets text and glyphs.
    const Svg = e.surface === 'desktop' && 'Svg' in els ? els.Svg : undefined
    // A drawing's color: the skin's, or with no skin a light and dark pair.
    const ink = (slot: Slot): Ink => inkOf(pal, slot)
    const mutedInk = ink('muted')
    // Room inside `depth` nested cards, in px (about 8 a column; each card takes its border and padding).
    const room = (depth: number) => Math.max(140, cols * 8 - 24 - depth * 56)
    const capsText = (key: string, text: string, slot: Slot = 'muted', size = 12) => {
      if (!Svg) return <Text key={key} bold {...c(slot)}>{text.toUpperCase()}</Text>
      const l = caps(text, ink(slot), size)
      return <Svg key={key} width={l.w} height={l.h} alt={text} source={l.source} />
    }
    // A tinted card (Current plan, Right now) takes the app's message surface, which follows light and dark.
    const card = (key: string, kids: unknown[], marginTop = 0, tinted = false) => (
      <Box key={key} flexDirection="column" alignItems="stretch" width="100%" marginTop={marginTop} backgroundColor={tinted ? 'userMessageBackground' : undefined} paddingX={2} paddingY={1}>
        {kids as never}
      </Box>
    )
    const dot = (key: string, slot: Slot) => <Text key={key} {...c(slot)}>●</Text>

    const ico = (key: string, name: IconName, color: Ink, size = 16) => (Svg ? <Svg key={key} width={size} height={size} alt={name} source={icon(name, color, size)} /> : null)
    const divider = (key: string) =>
      Svg ? (
        <Box key={key} marginY={1} width="100%"><Svg height={9} alt="divider" source={rule(mutedInk)} /></Box>
      ) : (
        <Text key={key} {...c('muted')} wrap="truncate-end">{'─'.repeat(200)}</Text>
      )

    /* ── the Files box ── */

    const root = files.root
    // While a turn runs, the last thing Claude did stays up; idle once the turn ends.
    const act = activity.busy ? activity : undefined
    // The file Claude is on right now shimmers; files edited this turn stay lit until the next prompt.
    const hotPath = act && (act.kind === 'read' || act.kind === 'edited') ? act.path : undefined
    const hotSlot: Slot = act?.kind === 'read' ? 'read' : 'write'
    const editedNow = new Set(touched.filter(t => t.kind === 'edited' && activity.since !== undefined && t.at >= activity.since).map(t => t.path))
    const tone = (slot: Slot) => (pal.themed ? pal[slot] : THEME_KEY[slot] ?? 'text')
    /** A file's name: shimmering while Claude is on it, lit if edited this turn, else as `plain` draws it. */
    const fileName = (key: string, path: string, text: string, plain: () => unknown) =>
      path === hotPath
        ? 'Client' in els
          ? <els.Client key={key + '-sh-' + path} module="./shimmer.tsx" props={{ text, color: tone(hotSlot), shine: tone('fg') }} />
          : <Text key={key} bold wrap="truncate-end" {...c(hotSlot)}>{text}</Text>
        : editedNow.has(path)
          ? <Text key={key} bold wrap="truncate-end" {...c('write')}>{text}</Text>
          : plain()
    const last = touched[0]
    const dirtyHere = git.dirty.filter(p => p === root || p.startsWith(root + '/'))
    const fileKids: unknown[] = []

    // Right now: what Claude is doing, the branch, the legend
    const state =
      act?.kind === 'read' ? { icon: 'eye' as const, slot: 'read' as const, glyph: '◉' }
      : act?.kind === 'edited' ? { icon: 'pencil' as const, slot: 'write' as const, glyph: '✎' }
      : act?.kind === 'run' ? { icon: 'terminal' as const, slot: 'run' as const, glyph: '❯' }
      : act?.kind === 'search' ? { icon: 'search' as const, slot: 'search' as const, glyph: '⌕' }
      : act ? { icon: 'loader-circle' as const, slot: 'user' as const, glyph: '…' }
      : { icon: 'coffee' as const, slot: 'muted' as const, glyph: '◌' }
    const stateInk = ink(state.slot)
    const headText =
      act?.path ? `Claude is ${act.kind === 'read' ? 'reading' : 'editing'} ${baseOf(act.path)}`
      : act?.kind === 'run' ? 'Claude is running a command'
      : act?.kind === 'search' ? 'Claude is searching'
      : act ? 'Claude is thinking'
      : 'Claude is idle'
    const sub =
      act?.path ? `in ${relDir(act.path, root)}`
      : act?.label ? act.label
      : act ? 'Working on your prompt'
      : last ? `last ${last.kind === 'read' ? 'read' : 'edited'} ${baseOf(last.path)}` : 'Waiting for the next file'
    const nowKids: unknown[] = [
      Svg ? (
        <Svg key="rn-top" width={room(2)} height={78} alt={`${headText}, ${sub}`} source={hero({ icon: state.icon, accent: stateInk, label: 'Right now', title: headText, sub, w: room(2), panel: false })} />
      ) : (
        <Box key="rn-top" flexDirection="row" columnGap={1}>
          <Text {...c(state.slot)}>{state.glyph}</Text>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            {capsText('rn-cap', 'Right now', state.slot)}
            <Text bold wrap="truncate-end" {...c('fg')}>{headText}</Text>
            <Text wrap="truncate-end" {...c('muted')}>{sub}</Text>
          </Box>
        </Box>
      ),
      divider('rn-hr'),
      <Box key="rn-git" flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
        <Box flexDirection="row" columnGap={1} alignItems="center">
          {Svg ? ico('rn-branch', 'git-branch', ink('user'), 18) : <Text {...c('user')}>⎇</Text>}
          <Text bold {...c('fg')}>{git.isRepo ? git.branch : 'not a git repo'}</Text>
        </Box>
        {git.isRepo && isDocs ? (
          <Text {...c(dirtyHere.length || (repo.sync && repo.sync !== 'synced') ? 'warn' : 'ok')}>{[repo.sync, dirtyHere.length ? `${dirtyHere.length} not committed` : 'clean'].filter(Boolean).join(' · ')}</Text>
        ) : git.isRepo ? <Text {...c(dirtyHere.length ? 'warn' : 'muted')}>{dirtyHere.length ? `${dirtyHere.length} not committed` : 'clean, nothing changed'}</Text> : null}
      </Box>,
      git.isRepo && isDocs ? (
        <Box key="rn-facts" marginTop={1}>
          <Text wrap="truncate-end" {...c('muted')}>
            {[repo.fetched ? `fetched ${repo.fetched}` : 'never fetched', repo.worktrees > 1 ? `${repo.worktrees - 1} other worktree${repo.worktrees > 2 ? 's' : ''}` : '', status.report?.facts?.prs ? `${status.report.facts.prs} open PR${status.report.facts.prs > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}
          </Text>
        </Box>
      ) : null,
    ]
    fileKids.push(card('rn-card', nowKids, 1, true))

    // Claude touched: type tag, name, folder, state pill
    const touchKids: unknown[] = [
      <Box key="tc-h" flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
        {capsText('tc-l', 'Claude touched')}
        {capsText('tc-r', `${touched.length} file${touched.length === 1 ? '' : 's'}`)}
      </Box>,
    ]
    if (!touched.length) touchKids.push(<Box key="tc-none" marginTop={1}><Text {...c('muted')}>Nothing yet this session</Text></Box>)
    for (const t of touched.slice(0, 5)) { // the last five; the header counts them all
      const slot = t.kind === 'read' ? 'read' : 'write'
      const tag = fileTag(extOf(t.path), ink('run'))
      const p = pill(badge(t), ink(slot))
      touchKids.push(
        <Box key={'tc-' + t.path} flexDirection="row" columnGap={1} alignItems="center" marginTop={1} paddingLeft={2} width="100%">
          {Svg ? <Svg key={'tct-' + t.path} width={tag.w} height={tag.h} alt={extOf(t.path) || 'file'} source={tag.source} /> : null}
          {/* The name, at most 20 characters, never squeezed; the folder after it takes what is left. */}
          <Box flexShrink={0}>{fileName('tcn-' + t.path, t.path, clip(baseOf(t.path), 20), () => <Text bold {...c('fg')}>{clip(baseOf(t.path), 20)}</Text>) as never}</Box>
          <Box flexGrow={1} flexShrink={2} minWidth={0}><Text wrap="truncate-end" {...c('muted')}>{relDir(t.path, root)}</Text></Box>
          {Svg ? <Svg key={'tcp-' + t.path} width={p.w} height={p.h} alt={badge(t)} source={p.source} /> : <Text bold {...c(slot)}>{badge(t)}</Text>}
        </Box>,
      )
    }
    fileKids.push(card('tc-card', touchKids, 1))

    // Long lists show five at a time, with "1–5 of 13" and a small chevron each way.
    const PAGE = 5
    /** The page to show. A session that ran an older copy keeps its state without a page: that is the first page. */
    const pageOf = (saved: unknown, total: number) => Math.max(0, Math.min(Number.isInteger(saved) ? (saved as number) : 0, Math.ceil(total / PAGE) - 1))
    const pager = (key: string, page: number, total: number, alts: readonly [string, string], go: (to: number) => () => void) => {
      const pages = Math.ceil(total / PAGE)
      const from = page * PAGE + 1
      const to = Math.min((page + 1) * PAGE, total)
      // At either end the chevron stays, dim and inert, so the other one does not move.
      const arrow = (k: string, dir: 'left' | 'right', to: number, alt: string) => {
        const isLive = to >= 0 && to < pages
        const glyph = dir === 'left' ? '‹' : '›'
        if (!Svg) return isLive ? <Button key={k} plain label={glyph} onPress={go(to)} /> : <Text key={k + '-off'} {...c('muted')}>{glyph}</Text>
        return (
          <Box key={k + '-i'} width={2} height={1} flexShrink={0} justifyContent="center" alignItems="center">
            <Svg width={16} height={16} alt={alt} source={icon(`chevron-${dir}`, isLive ? ink('fg') : mutedInk, 16)} />
            {isLive ? (
              <Box position="absolute" top={0} left={0} right={0} bottom={0}>
                <Button key={k} plain label={COVER} onPress={go(to)} />
              </Box>
            ) : null}
          </Box>
        )
      }
      return (
        <Box key={key + '-pages'} flexDirection="row" justifyContent="space-between" alignItems="center" marginTop={1} width="100%">
          <Text {...c('muted')}>{`${from === to ? from : `${from}–${to}`} of ${total}`}</Text>
          <Box flexDirection="row" alignItems="center" columnGap={2}>
            {arrow(key + '-prev', 'left', page - 1, alts[0])}
            {arrow(key + '-next', 'right', page + 1, alts[1])}
          </Box>
        </Box>
      )
    }

    // A section's header: ▼ open, ▶ collapsed to this one row; the arrow, the icon and the title all toggle it.
    // The icon is a drawing, so a blank button lies over it; spilling onto its neighbours is harmless, they toggle too.
    // In Flight is read only while open, so a collapsed card does not redraw the pane on every event.
    const deck = open.deck ? await readDeck($) : undefined
    const deckBody = deck
      ? deckKids(deck, {
          els, cols, pal, card, capsText,
          pager, pageOf,
          onExpand: id => void update($, viewAtom, x => ({ ...normalize(DEFAULT_VIEW, x), expanded: normalize(DEFAULT_VIEW, x).expanded === id ? null : id })),
          onPage: to => () => void update($, viewAtom, x => ({ ...normalize(DEFAULT_VIEW, x), page: to })),
          onReset: () => void resetDeck($),
        })
      : []

    /* ── our docs flow: For you, Plan, Tracks, Handoffs, Research ── */

    const R = status.report?.data ?? null
    const today = new Date()
    const dd = (n: number) => String(n).padStart(2, '0')
    const todayKey = `${dd(today.getDate())}-${dd(today.getMonth() + 1)}-${today.getFullYear()}`
    const asOf = status.report ? `As of ${status.report.at.startsWith(todayKey) ? status.report.at.slice(11) + ' today' : status.report.at}` : ''
    const setDocsUi = (fn: (u: DocsUi) => DocsUi) => () => void update($, docsUiAtom, fn)
    // The tracks in name order take these colors (here: characters blue, crafting yellow, look pink, world green).
    const TRACK_SLOTS: Slot[] = ['read', 'user', 'search', 'run']
    const trackSlot = (name: string): Slot => (docs.tracks.includes(name) ? TRACK_SLOTS[docs.tracks.indexOf(name) % TRACK_SLOTS.length]! : 'muted')
    const STATE_LOOK: Record<TrackState, [string, Slot]> = { active: ['Active', 'ok'], waiting: ['Waiting on you', 'user'], ready: ['Ready', 'write'], idle: ['Not started', 'muted'] }
    const pillEl = (key: string, text: string, slot: Slot) => {
      if (!Svg) return <Text key={key} {...c(slot)}>{text}</Text>
      const l = pill(text, ink(slot))
      return <Box key={key} flexShrink={0}><Svg width={l.w} height={l.h} alt={text} source={l.source} /></Box>
    }
    const PHASE_ICON = { done: 'square-check', doing: 'square-dot', todo: 'square', optional: 'square-dashed' } as const
    const PHASE_GLYPH = { done: '■', doing: '◧', todo: '□', optional: '◌' } as const
    const phaseSlot = (st: keyof typeof PHASE_ICON): Slot => (st === 'done' ? 'ok' : st === 'doing' ? 'write' : 'muted')
    const phaseSquare = (key: string, st: keyof typeof PHASE_ICON) =>
      Svg ? (
        <Box key={key} width={2} height={1} flexShrink={0} justifyContent="center" alignItems="center">
          <Svg width={16} height={16} alt={st} source={icon(PHASE_ICON[st], ink(phaseSlot(st)), 16)} />
        </Box>
      ) : <Text key={key} {...c(phaseSlot(st))}>{PHASE_GLYPH[st]}</Text>
    const row = (key: string, kids: unknown[]) => (
      <Box key={key} flexDirection="row" columnGap={1} alignItems="center" marginTop={1} width="100%">{kids as never}</Box>
    )
    const grow = (key: string, text: string, props: object = c('fg')) => (
      <Box key={key} flexGrow={1} flexShrink={1} minWidth={0}><Text wrap="truncate-end" {...props}>{text}</Text></Box>
    )
    const doneRows = (key: string, list: Docs['donePlans']) =>
      list.slice(0, 3).map(d =>
        row(`${key}-${d.file}`, [
          <Text key="g" {...c(d.failed ? 'err' : 'ok')}>{d.failed ? '✗' : '✓'}</Text>,
          <Box key="t" flexGrow={1} flexShrink={1} minWidth={0}>
            <Text wrap="truncate-end" {...c(d.failed ? 'fg' : 'muted')}>{d.title}{d.failed && d.note ? <Text {...c('err')}>{` · ${d.note}`}</Text> : ''}</Text>
          </Box>,
          <Text key="d" {...c('muted')}>{d.day}</Text>,
        ]),
      )

    // For you: gates waiting on you, then the report's next step, question and open calls
    const gates = docs.plans.filter(p => p.waiting)
    const calls = R?.calls ?? []
    const fyKids: unknown[] = []
    if (gates.length)
      fyKids.push(card('fy-gates', [
        capsText('fy-g-cap', 'Waiting on you', 'user'),
        ...gates.map(p => row('fy-g-' + p.file, [
          ico('i', 'loader-circle', ink('user'), 16),
          grow('t', `Gate ${p.waiting!.gate} · ${p.short}`, { bold: true, ...c('fg') }),
          pillEl('p', 'answer in chat', 'user'),
        ])),
      ], 1, true))
    if (R && (R.next || R.question))
      fyKids.push(card('fy-next', [
        ...(R.next ? [capsText('fy-n-cap', 'Next step', 'write'), <Box key="fy-n" marginTop={1}><Text wrap="wrap" {...c('fg')}>{R.next}</Text></Box>] : []),
        ...(R.next && R.question ? [divider('fy-hr')] : []),
        ...(R.question ? [capsText('fy-q-cap', 'Question for you', 'user'), <Box key="fy-q" marginTop={1}><Text bold wrap="wrap" {...c('fg')}>{R.question}</Text></Box>] : []),
      ], 1, true))
    if (calls.length) {
      const callsPage = pageOf(docsUi.callsPage, calls.length)
      const shown = calls.slice(callsPage * PAGE, (callsPage + 1) * PAGE)
      fyKids.push(card('fy-calls', [
        <Box key="fy-c-h" flexDirection="row" justifyContent="space-between" width="100%">{capsText('fy-c-cap', 'Open calls')}{capsText('fy-c-n', String(calls.length))}</Box>,
        ...shown.map((k, i) => (
          <Box key={'fy-c-' + (callsPage * PAGE + i)} flexDirection="row" columnGap={1} marginTop={1} width="100%">
            {dot('d', 'user')}
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              <Text wrap="truncate-end" {...c('fg')}>{k.title}</Text>
              {k.where ? <Text wrap="truncate-end" {...c('muted')}>{k.where}</Text> : null}
            </Box>
          </Box>
        )),
        ...(calls.length > PAGE ? [pager('fy-c', callsPage, calls.length, ['Previous', 'Next'], to => setDocsUi(u => ({ ...u, callsPage: to })))] : []),
      ], 1))
    }
    const busy = status.phase === 'loading'
    fyKids.push(
      <Box key="fy-foot" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1} marginTop={1} width="100%">
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="wrap" {...c(status.phase === 'error' ? 'err' : 'muted')}>
            {busy ? 'Running the current-status skill…' : status.phase === 'error' ? status.error : status.report ? `${asOf}, from the last Refresh` : 'Press Refresh for the status report.'}
          </Text>
        </Box>
        <Button key="fy-refresh" onPress={() => void refreshStatus($)}>{busy ? 'Refreshing…' : 'Refresh'}</Button>
      </Box>,
    )
    const fyParts = [gates.length ? `${gates.length} gate${gates.length > 1 ? 's' : ''} waiting` : '', calls.length ? `${calls.length} open call${calls.length > 1 ? 's' : ''}` : ''].filter(Boolean)
    const fyTitle = ['For you', ...fyParts].join(' · ')

    // Plan: the current plan (the running one, see orderPlans), its phases from the log
    const plan = docs.plans[0]
    const planKids: unknown[] = []
    if (!plan) planKids.push(<Box key="pl-none" marginTop={1}><Text {...c('muted')}>No open plans.</Text></Box>)
    else {
      const look = planLook(plan, pal)
      const total = plan.phases.length
      const tail = `${look.pct}% · ${plan.done} of ${total} phases`
      const barW = Math.max(60, room(2) - tail.length * 7 - 12)
      const planSlot: Slot = trackSlot(plan.track) === 'muted' ? 'read' : trackSlot(plan.track)
      const accent = ink(planSlot)
      // In the pane the bar's pill names the track, in its color; the waiting gate and the next phase show below it.
      const paneBar: BarIn = { ...look.bar, pill: plan.track || 'plan', color: pal.themed ? pal[planSlot] : look.bar.color }
      const sub = `${plan.track || 'project'} · ${plan.day} · ${plan.state}`
      const curKids: unknown[] = [
        Svg ? (
          <Svg key="pl-top" width={room(2)} height={78} alt={`Current plan: ${plan.short}`} source={hero({ icon: 'list-checks', accent, label: 'Current plan', title: plan.short, sub, w: room(2), panel: false })} />
        ) : (
          <Box key="pl-top" flexDirection="column">
            {capsText('pl-cap', 'Current plan', 'ok')}
            <Text bold wrap="wrap" {...c('fg')}>{plan.short}</Text>
            <Text wrap="truncate-end" {...c('muted')}>{sub}</Text>
          </Box>
        ),
      ]
      if (total)
        curKids.push(
          Svg ? (
            <Box key="pl-bar" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1} marginTop={1} width="100%">
              <Svg width={barW} height={16} alt={`${paneBar.pill}, ${look.pct}% done`} source={paneBarSvg(barW, paneBar)} />
              <Box flexShrink={0}><Text {...c('muted')}>{tail}</Text></Box>
            </Box>
          ) : (
            <Box key="pl-bar" flexDirection="row" justifyContent="space-between" width="100%">
              <Text wrap="truncate-end"><Text {...c('ok')}>{'█'.repeat(Math.round((Math.max(8, cols - 30) * plan.done) / total))}</Text><Text {...c('muted')}>{'░'.repeat(200)}</Text></Text>
              <Box flexShrink={0}><Text {...c('muted')}>{` ${tail}`}</Text></Box>
            </Box>
          ),
          divider('pl-hr'),
        )
      if (plan.waiting)
        curKids.push(
          capsText('pl-w-cap', 'Waiting on you', 'user'),
          row('pl-w', [ico('i', 'loader-circle', ink('user'), 16), grow('t', `Gate ${plan.waiting.gate} · after phase ${plan.waiting.after}`, { bold: true, ...c('fg') }), pillEl('p', 'answer in chat', 'user')]),
        )
      else if (plan.next) {
        const st = plan.phases.find(x => x.n === plan.next!.n)?.state ?? 'todo'
        curKids.push(
          capsText('pl-n-cap', st === 'doing' ? 'In progress' : 'Next', 'write'),
          row('pl-n', [phaseSquare('s', st), <Text key="n" {...c('muted')}>{String(plan.next.n)}</Text>, grow('t', plan.next.name, { bold: true, ...c('fg') }), <Text key="z" {...c('muted')}>{plan.next.size}</Text>]),
        )
      } else if (total) curKids.push(capsText('pl-d-cap', 'All phases done', 'ok'))
      planKids.push(card('pl-card', curKids, 1, true))

      if (total) {
        const phKids: unknown[] = [
          <Box key="ph-h" flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
            <Box flexDirection="row" columnGap={1} alignItems="center">
              {capsText('ph-cap', 'Phases')}
              <Button key="ph-toggle" plain label={docsUi.phasesOpen ? '▾' : '▸'} onPress={setDocsUi(u => ({ ...u, phasesOpen: !u.phasesOpen }))} />
            </Box>
            {capsText('ph-count', `${plan.done}/${total}`)}
          </Box>,
        ]
        if (docsUi.phasesOpen)
          for (const ph of plan.phases)
            phKids.push(row('ph-' + ph.n, [
              phaseSquare('s', ph.state),
              <Box key="n" width={2} flexShrink={0}><Text {...c('muted')}>{String(ph.n)}</Text></Box>,
              grow('t', ph.name, c(ph.state === 'done' || ph.state === 'optional' ? 'muted' : 'fg')),
              ph.gate ? pillEl('g', `Gate ${ph.gate}`, plan.waiting?.gate === ph.gate ? 'user' : 'muted') : ph.optional ? <Text key="o" {...c('muted')}>optional</Text> : null,
            ]))
        planKids.push(card('ph-card', phKids, 1))
      }
      // Every other open plan, with its state
      const upNext = docs.plans.slice(1)
      if (upNext.length)
        planKids.push(divider('pl-nx-hr'), capsText('pl-nx-cap', 'Up next'), ...upNext.map(p => row('pl-nx-' + p.file, [
          dot('d', p.waiting ? 'user' : p.started ? 'write' : 'muted'),
          grow('t', p.short),
          <Text key="s" {...c(p.waiting ? 'user' : 'muted')}>{stateShort(p)}</Text>,
          <Text key="d" {...c('muted')}>{p.day}</Text>,
        ])))
    }
    if (docs.donePlans.length) planKids.push(divider('pl-dn-hr'), capsText('pl-dn-cap', 'Recently done'), ...doneRows('pl-dn', docs.donePlans))
    const planTitle = plan ? `Plan · ${open.plan ? plan.track || 'project' : plan.short}` : 'Plans · none open'

    // Tracks: the report's state and next step per track; a press opens where it stands
    const tracks = R?.tracks ?? []
    const trKids: unknown[] = []
    if (!tracks.length) trKids.push(<Box key="tr-none" marginTop={1}><Text {...c('muted')}>{busy ? 'Running the current-status skill…' : 'Press Refresh in For you for the tracks.'}</Text></Box>)
    for (const t of tracks) {
      const [label, slot] = STATE_LOOK[t.state]
      const isOpen = docsUi.track === t.name
      const toggle = setDocsUi(u => ({ ...u, track: u.track === t.name ? null : t.name }))
      trKids.push(
        <Box key={'tr-' + t.name} flexDirection="column" marginTop={1} width="100%">
          <Box flexDirection="row" columnGap={1} alignItems="center" width="100%">
            <Button key={'tr-t-' + t.name} plain label={isOpen ? '▾' : '▸'} onPress={toggle} />
            {dot('d', trackSlot(t.name))}
            <Box flexGrow={1} flexShrink={1} minWidth={0}><Button key={'tr-n-' + t.name} plain onPress={toggle}>{t.name}</Button></Box>
            {pillEl('p', label, slot)}
          </Box>
          <Box paddingLeft={4}><Text wrap="truncate-end" {...c('muted')}>{`Next: ${t.next}`}</Text></Box>
          {isOpen ? card('tr-s-' + t.name, t.stands.map((x, i) => <Box key={'s' + i} marginTop={i ? 1 : 0}><Text wrap="wrap" {...c('fg')}>{`· ${x}`}</Text></Box>), 1, true) : null}
        </Box>,
      )
    }
    if (tracks.length && asOf) trKids.push(<Box key="tr-asof" marginTop={1}><Text {...c('muted')}>{`${asOf}, from the last Refresh`}</Text></Box>)

    // Handoffs: the open ones, then the last finished
    const hoKids: unknown[] = docs.handoffs.length
      ? docs.handoffs.map(ho => row('ho-' + ho.file, [dot('d', 'write'), grow('t', ho.title), <Text key="d" {...c('muted')}>{ho.day}</Text>]))
      : [<Box key="ho-none" marginTop={1}><Text {...c('muted')}>No open handoffs.</Text></Box>]
    if (docs.doneHandoffs.length) hoKids.push(divider('ho-dn-hr'), capsText('ho-dn-cap', 'Recently done'), ...doneRows('ho-dn', docs.doneHandoffs))

    // Research: the newest first, with the track as a pill and the question.
    const reRow = (r: DocResearch) => (
      <Box key={'re-' + baseOf(r.file)} flexDirection="column" marginTop={1} width="100%">
        <Box flexDirection="row" columnGap={1} alignItems="center" width="100%">
          <Box width={7} flexShrink={0}><Text {...c('muted')}>{r.day}</Text></Box>
          {grow('t', r.title, { bold: true, ...c('fg') })}
          {pillEl('re-p-' + baseOf(r.file), r.track || 'project', r.track ? trackSlot(r.track) : 'muted')}
        </Box>
        {r.question ? <Box paddingLeft={8}><Text wrap="truncate-end" {...c('muted')}>{r.question}</Text></Box> : null}
      </Box>
    )
    // Five at a time, newest first
    const resPage = pageOf(docsUi.researchPage, docs.research.length)
    const reKids: unknown[] = docs.research.slice(resPage * PAGE, (resPage + 1) * PAGE).map(reRow)
    if (!docs.research.length) reKids.push(<Box key="re-none" marginTop={1}><Text {...c('muted')}>No research yet.</Text></Box>)
    if (docs.research.length > PAGE) reKids.push(pager('re', resPage, docs.research.length, ['Newer', 'Older'], to => setDocsUi(u => ({ ...u, researchPage: to }))))

    const SECTION_ICON = {
      files: ['folder', 'user'], deck: ['gauge', 'write'],
      foryou: ['bell', 'user'], plan: ['list-checks', 'ok'], tracks: ['map', 'read'], handoffs: ['file', 'run'], research: ['search', 'search'],
    } as const
    const section = (key: string, k: keyof Sections, title: string) => {
      const toggle = () => void toggleSection($, k)
      return (
        <Box key={key + '-h'} flexDirection="row" alignItems="center" columnGap={1}>
          <Button key={key + '-toggle'} plain label={open[k] ? '▼' : '▶'} onPress={toggle} />
          {Svg ? (
            <Box key={key + '-icon'} width={2} height={1} flexShrink={0} justifyContent="center" alignItems="center">
              <Svg width={16} height={16} alt={k} source={icon(SECTION_ICON[k][0], ink(SECTION_ICON[k][1]), 16)} />
              <Box position="absolute" top={0} left={0} right={0} bottom={0}>
                <Button key={key + '-iconb'} plain label={COVER} onPress={toggle} />
              </Box>
            </Box>
          ) : null}
          <Button key={key + '-name'} plain onPress={toggle}>{title}</Button>
        </Box>
      )
    }

    const tree = () => (
      <Box flexDirection="column" alignItems="stretch" width="100%" gap={1}>
        {isDocs ? card('box-foryou', [section('bfy', 'foryou', fyTitle), ...(open.foryou ? fyKids : [])]) : null}
        {isDocs ? card('box-plan', [section('bpl', 'plan', planTitle), ...(open.plan ? planKids : [])]) : null}
        {isDocs ? card('box-tracks', [section('btr', 'tracks', `Tracks · ${tracks.length || docs.tracks.length}`), ...(open.tracks ? trKids : [])]) : null}
        {isDocs ? card('box-handoffs', [section('bho', 'handoffs', docs.handoffs.length ? `Handoffs · ${docs.handoffs.length} open` : 'Handoffs · none open'), ...(open.handoffs ? hoKids : [])]) : null}
        {isDocs ? card('box-research', [section('bre', 'research', `Research · ${docs.research.length}`), ...(open.research ? reKids : [])]) : null}
        {card('box-files', [section('bf', 'files', 'Files'), ...(open.files ? fileKids : [])])}
        {card('box-deck', deck ? [section('bd', 'deck', deckTitle(deck.main)), ...deckBody] : [section('bd', 'deck', 'In Flight')])}
      </Box>
    )
    return tree()
  })
}
