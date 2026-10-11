// In Flight, the Workbench's third card. The pure tests are adapted from claude-flightdeck's own
// (MIT, Stephen Casella); the pane tests check the card inside the Workbench.
import { expect, mock, test } from 'claude-code/testing'

import {
  adviceLine, afterCall, applyStep, consultTimeline, DEFAULT_ARCHITECT, DEFAULT_TURN, describeInput, endConsult,
  handbackOf, lanes, limitLabel, momentOf, normalizeCard, prettyModel, receiptOf, redact, startConsult, titleLines,
} from '../hooks/deck'

/* ── pure behavior ── */

test('redaction masks credentials before anything is stored', () => {
  expect(redact('curl -H "Authorization: Bearer abc.def.ghi123" x')).not.toContain('abc.def')
  expect(redact('gh auth --token ghp_abcdefghijklmnop')).not.toContain('abcdefghijklmnop')
  expect(redact('password=hunter2 ls')).not.toContain('hunter2')
  expect(redact('ls -la src/')).toBe('ls -la src/')
  expect(describeInput('Read', { file_path: '/Users/me/proj/src/main.ts' })).toBe('Read → src/main.ts')
})

test('edits count from every loop; errors only from the main loop', () => {
  const t = { ...DEFAULT_TURN, errorStreak: 1 }
  expect(afterCall(t, { inSubagent: true, hasFailed: false, isEdit: true }).edits).toBe(1)
  expect(afterCall(t, { inSubagent: false, hasFailed: true, isEdit: false })).toEqual({ ...t, errorStreak: 2, errors: 1 })
  expect(momentOf({ edits: 0, errorStreak: 2 })).toBe('error repeats')
})

test("a card's context is its latest step's whole input; output adds up", () => {
  let c = normalizeCard({ id: 'x' })
  c = applyStep(c, { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 2_000, output_tokens: 500 }, stopReason: 'tool_use' })
  c = applyStep(c, { model: 'claude-sonnet-5-5', usage: { input_tokens: 5, cache_read_input_tokens: 40_000, output_tokens: 700 }, stopReason: 'max_tokens' })
  expect([c.ctx, c.out, c.steps, c.lastStop]).toEqual([40_005, 1200, 2, 'max_tokens'])
})

test('consults open, close by id, and draw on a shared timeline', () => {
  let a = startConsult(DEFAULT_ARCHITECT, { id: 's1', at: 0, moment: 'before a plan', via: 'advisor tool' })
  a = endConsult(a, 10, null, 's1')
  a = startConsult(a, { id: 's2', at: 90, moment: 'before done', via: 'advisor tool' })
  const tl = consultTimeline(a, 100, 11)
  expect(tl.startsWith('◆━')).toBe(true)
  expect(tl.split('◆').length - 1).toBe(2)
})

test('older shapes still read; lanes share one axis; names and lines read as people say them', () => {
  const [a, b] = lanes([{ ...normalizeCard({}), id: 'a', spawnedAt: 1000, endedAt: 1050 }, { ...normalizeCard({}), id: 'b', spawnedAt: 1050, endedAt: null }], 1100, 20)
  expect(a).toEqual({ id: 'a', before: 0, bar: 10, after: 10 })
  expect((b?.before ?? 0) + (b?.bar ?? 0) + (b?.after ?? 0)).toBe(20)
  expect(limitLabel('five_hour')).toBe('5h')
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(prettyModel('')).toBe('-')
  expect(handbackOf('<agent-message from="x">\nPlain report line\n</agent-message>')).toEqual({ from: 'x', body: 'Plain report line' })
  expect(adviceLine('## Ship it after one more gate test.\n- details')).toBe('Ship it after one more gate test.')
  expect(titleLines('Write tinyqueue test suite', 13, 16)).toEqual(['Write', 'tinyqueue test…'])
  expect(receiptOf({ ...DEFAULT_TURN, edits: 2 }, { durationMs: 1000, agentsSince: 3, reason: 'answer' })).toEqual({ durationMs: 1000, agents: 3, edits: 2, errors: 0, reason: 'answer' })
})

/* ── the card in the Workbench ── */

type On = Parameters<import('claude-code/testing').TestBody>[1]
const ROOT = '/Users/x/proj'

const SESSIONS = '/Users/x/.claude/sessions'

/** A session with no plans and an empty folder: only the cards' frames matter here. `sessions` are the registry's files, all running. */
function world(on: On, sessions: Record<string, string> = {}) {
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/Users/x' })
  mock.store(on)
  on('session.cwd', async () => ({ value: ROOT }))
  on('fs.exists', async () => ({ value: false }))
  on('fs.list', async (_$, e) => ({
    value: (e as { path?: string }).path === SESSIONS ? Object.keys(sessions).map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) : [],
  }) as never)
  on('fs.read', async (_$, e) => ({ value: sessions[String((e as { path: string }).path).split('/').pop() ?? ''] ?? '' }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('tool.register', async () => ({ value: undefined }) as never)
  on('session.start', async () => ({ cwd: ROOT }) as never)
  on('process.run', async (_$, e) => {
    const isPs = (e as { argv: string[] }).argv[0] === 'ps'
    return { value: isPs ? { exitCode: 0, stdout: Object.keys(sessions).map(n => `${parseInt(n)} claude`).join('\n'), stderr: '' } : { code: 1, stdout: '', stderr: '' } } as never
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  return clock
}

const pane = (surface: 'terminal' | 'desktop', bodyColumns = 48) =>
  ({ plugin: 'workbench', surface, component: 'Pane', requestId: 'workbench', props: { bodyColumns, view: {} } }) as never

let spawnN = 0
const spawn = (subagentType: string, description: string) => ({
  prompt: description, description, subagentType, tool_use_id: `tu${++spawnN}`,
  provider: { plugin: 'engine', tier: 'core' as const }, parentModel: 'claude-opus-5-5', background: true, fork: false,
})

test('In Flight starts collapsed under Files, opens to its main panel with no session log, and the choice is kept', async ($, on) => {
  world(on)
  on('tool.check', (_$, e) => ({ decision: e.tool === 'Read' ? 'allow' : 'ask' }))
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  // Permission checks leave no trace: the card has no gate panel
  await $.tool.check({ tool: 'Read', input: { file_path: '/a/b.ts' }, tool_use_id: 'k1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'k2' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Button', text: /^In Flight$/ })).toBeDefined()
      expect(await ui.find({ text: /idle/ })).toBeUndefined()
      await ui.press({ key: 'bd-toggle' })
    }
    expect(await ui.find({ type: 'Button', text: /^In Flight · main idle$/ })).toBeDefined()
    expect(await ui.find({ text: /Session log|nothing yet/i })).toBeUndefined()
    // Empty panels take no room: no agents, no architect yet
    expect(await ui.find({ text: /Agents ·/i })).toBeUndefined()
    expect(await ui.find({ text: /Gate · permissions|\d checks?$|pending/ })).toBeUndefined()
    expect(await ui.find({ text: /^Reset$/ })).toBeDefined()
    await ui.unmount()
  }
})

const USAGE = { model: 'claude-opus-5-5', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

test('agents are one list: running first, newest first, then finished; five a page; a row opens under itself', async ($, on) => {
  const clock = world(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `w${++n}` }))
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await $.turn.start({ text: 'go', turnId: 'W1' })
  for (const d of ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta']) {
    await $.agent.spawn(spawn('Explore', `task ${d}`))
    await clock.advance(1000)
  }
  const end = async (agentId: string, reason: 'answer' | 'error') => {
    await $.turn.complete({ agentId, answer: `${agentId} found it`, durationMs: 1000, isAborted: false, turnId: `t-${agentId}`, reason, usage: USAGE } as never)
    await clock.advance(1000)
  }
  // alpha ends first, then beta; gamma fails last
  await end('w1', 'answer')
  await end('w2', 'answer')
  await end('w3', 'error')
  const ui = await $.ui.mount(pane('terminal', 90))
  await ui.press({ key: 'bd-toggle' })
  const rows = async () => (await ui.findAll({ type: 'Button' })).map(b => String(b.props.key)).filter(k => k.startsWith('fd-ab-'))
  expect(await ui.find({ text: /4 running · 7 total/i })).toBeDefined()
  // Running, newest first, then the last to finish
  expect(await rows()).toEqual(['fd-ab-w7', 'fd-ab-w6', 'fd-ab-w5', 'fd-ab-w4', 'fd-ab-w3'])
  expect(await ui.find({ text: /^1–5 of 7$/ })).toBeDefined()
  expect(await ui.find({ text: /^Explore · starting…$/ })).toBeDefined()
  await ui.press({ key: 'fd-ag-next' })
  expect(await rows()).toEqual(['fd-ab-w2', 'fd-ab-w1'])
  expect(await ui.find({ text: /^6–7 of 7$/ })).toBeDefined()
  // A row opens under itself, and closes again
  await ui.press({ key: 'fd-ab-w2' })
  expect(await ui.find({ text: /» w2 found it/ })).toBeDefined()
  await ui.press({ key: 'fd-ab-w2' })
  expect(await ui.find({ key: 'fd-exp' })).toBeUndefined()
  await ui.unmount()
})

test("an agent's context is colored by how full its own window is: the main session's for the same model, else 200k", async ($, on) => {
  world(on)
  const A = (id: string, model: string, status: string, ctx: number) =>
    ({ id, type: 'general-purpose', model, description: `task ${id}`, status, spawnedAt: 1, endedAt: status === 'running' ? null : 2, ctx, out: 1, steps: 9, lastStop: null, tools: [], answer: '' })
  const agents = [A('a1', 'claude-opus-5-5', 'done', 255_000), A('a2', 'claude-opus-5-5', 'running', 212_000), A('a3', 'claude-sonnet-5-5', 'running', 176_000), A('a4', 'claude-opus-5-5', 'running', 690_000)]
  // The gruvbox skin: green #b8bb26, orange #fe8019, red #fb4934, gray #928374. The main session: Opus 5.5 with a 1M window.
  on('state.get', async ($, e, next) => {
    const x = e as { plugin: string; key: string }
    if (x.plugin === 'skins' && x.key === 'prefs') return { value: { value: { skin: 'gruvbox' }, version: 1 } } as never
    if (x.plugin === 'skins' && x.key === 'isLight') return { value: { value: false, version: 1 } } as never
    if (x.plugin === 'workbench' && x.key === 'deckMain') return { value: { value: { model: 'claude-opus-5-5', effort: 'high', mode: '', steps: 3, isRunning: true }, version: 1 } } as never
    if (x.plugin === 'workbench' && x.key === 'deckAgents') return { value: { value: agents, version: 1 } } as never
    return next(e)
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await $.session.measure({ context: { tokens: 100_000, window: 1_000_000, percent: 10 }, rateLimits: [], changed: ['context', 'rateLimits'] } as never)
  const ui = await $.ui.mount(pane('terminal', 90))
  await ui.press({ key: 'bd-toggle' })
  const colorOf = async (re: RegExp) => (await ui.find({ type: 'Text', text: re }))?.props.color
  expect(await colorOf(/^212k$/)).toBe('#b8bb26') // 21% of 1M, though past 85% of 200k
  expect(await colorOf(/^690k$/)).toBe('#fe8019') // 69% of 1M
  expect(await colorOf(/^176k$/)).toBe('#fb4934') // Sonnet: 88% of 200k
  expect(await colorOf(/^255k$/)).toBe('#928374') // finished: gray
  expect(await ui.find({ text: /^general-purpose · Opus 5\.5 · 9 steps$/ })).toBeDefined()
  await ui.unmount()
})

test('the server-side advisor is read from assistant rows: advising, then on call', async ($, on) => {
  world(on)
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await $.turn.start({ text: 'plan it', turnId: 'T2' })
  const row = (content: unknown[]) =>
    $.session
      .append({ message: { type: 'assistant', role: 'assistant', content: content as never }, door: 'response', origin: { kind: 'model', model: 'claude-opus-5-5' } as never, uuid: `u${++spawnN}` })
      .catch(() => undefined)
  await row([{ type: 'server_tool_use', id: 'srv1', name: 'advisor', input: {} }])
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'bd-toggle' })
  expect(await ui.find({ text: /ARCHITECT · ADVISING/ })).toBeDefined()
  expect(await ui.find({ text: /◆ before a plan/ })).toBeDefined()
  await row([{ type: 'advisor_tool_result', tool_use_id: 'srv1', content: { type: 'advisor_redacted_result' } }])
  expect(await ui.find({ text: /ARCHITECT · ON CALL/ })).toBeDefined()
  await ui.unmount()
})

test('colors carry meaning: blue while working, gauges green / orange / red by fill, no orange on the main header', async ($, on) => {
  world(on)
  // The gruvbox skin: read #83a598 (blue), ok #b8bb26 (green), warn #fe8019 (orange), err #fb4934 (red).
  on('state.get', async ($, e, next) => {
    const a = e as { plugin: string; key: string }
    if (a.plugin === 'skins' && a.key === 'prefs') return { value: { value: { skin: 'gruvbox' }, version: 1 } } as never
    if (a.plugin === 'skins' && a.key === 'isLight') return { value: { value: false, version: 1 } } as never
    return next(e)
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await $.session.measure({ context: { tokens: 620_000, window: 1_000_000, percent: 62 }, rateLimits: [{ kind: 'five_hour', percentUsed: 34 }, { kind: 'seven_day', percentUsed: 88 }], changed: ['context', 'rateLimits'] } as never)
  await $.turn.start({ text: 'go', turnId: 'C1' })
  const ui = await $.ui.mount(pane('terminal', 90))
  await ui.press({ key: 'bd-toggle' })
  const texts = await ui.findAll({ type: 'Text' })
  const colorOf = (re: RegExp) => texts.find(t => re.test(String(t.text ?? '')) && t.props.color)?.props.color
  expect(colorOf(/^● working$/)).toBe('#83a598')
  expect(colorOf(/^◐ .* · turn$/)).toBe('#83a598')
  // ctx 62% (16 cells), 5h 34% and 7d 88% (5 cells each): the filled part of each gauge.
  expect(colorOf(/^▰{10}$/)).toBe('#fe8019')
  expect(colorOf(/^▰{2}$/)).toBe('#b8bb26')
  expect(colorOf(/^▰{4}$/)).toBe('#fb4934')
  expect(colorOf(/MAIN$/)).toBe('#ebdbb2')
  await ui.unmount()
})

test('no Sessions panel and no cost: other sessions and dollars never show', async ($, on) => {
  const clock = world(on, {
    '11.json': JSON.stringify({ pid: 11, sessionId: 's11', cwd: '/Users/x/p11', kind: 'interactive', entrypoint: 'claude-desktop', status: 'waiting', name: 'Fix the parser', waitingFor: 'input needed' }),
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await $.session.measure({ context: { tokens: 50_000, window: 200_000, percent: 25 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }], cost: { usd: 1.23 }, changed: ['context', 'rateLimits', 'cost'] })
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.turn.complete({ answer: '', reason: 'answer', durationMs: 2000 } as never)
  await clock.settle()
  const ui = await $.ui.mount(pane('terminal'))
  // Collapsed, the header no longer counts other sessions
  expect(await ui.find({ type: 'Button', text: /^In Flight$/ })).toBeDefined()
  await ui.press({ key: 'bd-toggle' })
  expect(await ui.find({ text: /Fix the parser|input needed|◆ waiting|^Sessions/ })).toBeUndefined()
  expect(await ui.find({ text: /\$/ })).toBeUndefined()
  // Rate limits and the turn receipt stay
  expect(await ui.find({ text: /^5h $/ })).toBeDefined()
  expect(await ui.find({ text: /last turn 2s/ })).toBeDefined()
  await ui.unmount()
})
