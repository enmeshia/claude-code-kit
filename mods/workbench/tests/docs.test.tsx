import { expect, mock, test } from 'claude-code/testing'

import { nameInfo, orderPlans, phasesOf, planOf, questionOf, shortTitle, stateShort, statusOf } from '../hooks/docs'
import { parseFacts, parseReport, syncOf } from '../hooks/status'

const HOME = '/Users/x'
const ROOT = '/Users/x/code/game'
const CL = ROOT + '/.claude'
const TRACKS = ['characters', 'crafting', 'look', 'world']

const PLAN = `# Stepped levels test: generated cliffs, plateaus and ramps

Date: 08-10-2026.

## Phase map

| # | Phase | Check | Roughly |
|---|---|---|---|
| 0 | Foundations and a probe | \`probe\` | medium |
| 1 | The level generator | \`gen\` | medium |
| 2 | Cliff pieces in Blender | \`cliff\` | large |
| 3 | The compositor, seams and Gate A | \`compose\` | medium |
| 4 | The patch in Unity | \`world\` | medium |
| 5 | The build, the bench, the walk GIF and Gate B | \`build\` | medium |
| 6 | Optional: show the villager behind cliffs | \`fade\` | small |
| 7 | Docs and a check of them | docs check | small |

## Orchestration protocol

The handoff log lives at \`.claude/handoff/08-10-2026-world-stepped-levels-test-log.md\`.
`
const logWith = (phases: number[], answered: string[] = []) =>
  ['# Stepped levels test, log', ...phases.map(n => `## Phase ${n} done  (09-10-2026)`), ...answered.map(g => `## Gate ${g}, owner's answer (09-10-2026)`)].join('\n\n')

const REPORT = {
  text: '{}',
  at: '10-10-2026 09:48',
  facts: { branch: 'main', sync: 'synced', fetched: 'Oct 10 09:23', changed: 0, prs: 2, worktrees: 1 },
  data: {
    headline: 'On main, clean.',
    chips: [],
    next: 'Run the stepped levels plan in a fresh session.',
    question: 'Update the plan for the jumps first?',
    repo: [],
    tracks: [
      { name: 'world', state: 'ready', stands: ['Terrain height is researched.', 'The test plan is written.'], next: 'You run the plan' },
      { name: 'characters', state: 'waiting', stands: ['The move test plays every clip.'], next: 'Your call on Cascadeur' },
    ],
    calls: [
      { title: 'Buy the Cascadeur license?', detail: '', where: 'characters tech.md, Open questions' },
      { title: 'Are Uthana terms OK?', detail: '', where: 'characters tech.md, Open questions' },
      { title: 'How should the ground show height?', detail: '', where: 'world design.md, Open questions' },
      { title: 'Snap to 16 facings?', detail: '', where: 'characters design.md, Open questions' },
      { title: 'How many worlds at release?', detail: '', where: 'game concept.md, Open questions' },
    ],
  },
}

function project(log: string) {
  const files: Record<string, string> = {
    [`${CL}/plans/08-10-2026-world-stepped-levels-test-plan.md`]: PLAN,
    [`${CL}/handoff/08-10-2026-world-stepped-levels-test-log.md`]: log,
    [`${CL}/plans/done/07-10-2026-characters-animation-test-plan-done.md`]: '# Animation test: by code\n\n> **Status: DONE (07-10-2026), failed: the owner stopped it at Gate A.** Result: x.\n',
    [`${CL}/plans/done/06-10-2026-look-unity-look-test-plan-done.md`]: '# Unity look test: a world\n\n> **Status: DONE (06-10-2026).** Result: x.\n',
    [`${CL}/handoff/done/05-10-2026-2d-toon-atlas-handoff-done.md`]: '# Handoff: make the full toon biome atlas\n\n> **Status: DONE (05-10-2026).** Result: x.\n',
    [`${CL}/handoff/done/07-10-2026-characters-animation-test-log-done.md`]: '# Animation test, log\n',
    [`${CL}/research/08-10-2026-world-terrain-height.md`]: '# Terrain height in a 2D isometric world\n\nDate: 08-10-2026.\nQuestion: How can Enmeshia show hills,\ncliffs and plateaus from a seed?\nFeeds: the world track.\n',
    [`${CL}/research/06-10-2026-characters-animation-by-code.md`]: '# Animating characters by code\n\nQuestion: how can Claude animate characters with code only?\n',
    [`${CL}/research/05-10-2026-2d-looks-gallery.html`]: '<html><head><title>2D looks gallery</title></head></html>',
  }
  for (const t of TRACKS) files[`${CL}/docs/tracks/${t}/README.md`] = `# ${t}\n`
  return files
}

type On = Parameters<import('claude-code/testing').TestBody>[1]

/** An in-memory project beneath the plugin; records the commands and tools it registers. */
function world(on: On, files: Record<string, string>, opts: { report?: unknown; model?: string; mtimes?: Record<string, number> } = {}) {
  const disk = new Map(Object.entries(files))
  const clock = mock.clock(on)
  mock.env(on, { HOME })
  mock.store(on, opts.report ? { report: opts.report } : {})
  const registered: string[] = []
  const prompts: string[] = []
  on('session.start', async () => ({ cwd: ROOT }) as never)
  on('session.cwd', async () => ({ value: ROOT }))
  on('session.surfaces', async () => ({ value: [] }) as never)
  on('fs.exists', async ($, e) => ({ value: disk.has(e.path) || [...disk.keys()].some(k => k.startsWith(e.path + '/')) }))
  on('fs.read', async ($, e) => {
    const t = disk.get(e.path)
    if (t === undefined) throw new Error('ENOENT ' + e.path)
    return { value: t }
  })
  on('fs.stat', async ($, e) => {
    if (!disk.has(e.path)) throw new Error('ENOENT ' + e.path)
    return { value: { kind: 'file', size: 1, mtimeMs: opts.mtimes?.[e.path] ?? 0, isLink: false } } as never
  })
  on('fs.list', async ($, e) => {
    const names = new Map<string, 'file' | 'dir'>()
    for (const k of disk.keys())
      if (k.startsWith(e.path + '/')) {
        const rest = k.slice(e.path.length + 1)
        names.set(rest.split('/')[0]!, rest.includes('/') ? 'dir' : 'file')
      }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('process.run', async () => ({ value: { exitCode: 1, stdout: '', stderr: 'no' } }) as never)
  on('model.complete', async ($, e) => {
    prompts.push(String((e as { prompt?: string }).prompt ?? ''))
    return { value: opts.model ? { isAnswered: true, text: opts.model } : { isAnswered: false, reason: 'api-error', status: 500, error: 'down' } } as never
  })
  on('command.register', async ($, e) => {
    registered.push('command:' + (e as { name: string }).name)
    return { value: undefined } as never
  })
  on('tool.register', async ($, e) => {
    registered.push('tool:' + (e as { name: string }).name)
    return { value: undefined } as never
  })
  // The open panes, so the band can tell whether the pane is up.
  const opened: string[] = []
  const up = new Set<string>()
  on('ui.open', async ($, e) => {
    opened.push((e as { id: string }).id)
    up.add((e as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', async ($, e) => {
    up.delete((e as { id: string }).id)
    return { value: undefined } as never
  })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [...up].map(id => ({ id, title: 'Workbench', isShown: true, isFocused: false, isPlaced: true })) }) as never)
  // What is beneath in the band (the engine's own, or the skins mod's usage band): one empty Box.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="beneath" />
  })
  return { disk, clock, registered, prompts, opened, up }
}

const pane = (surface: 'terminal' | 'desktop') => ({ plugin: 'workbench', surface, component: 'Pane', requestId: 'workbench', props: { bodyColumns: 64 } }) as never
const band = (surface: 'terminal' | 'desktop') => ({ plugin: 'workbench', surface, component: 'AbovePrompt', props: { bodyColumns: 100 } }) as never
const texts = async (ui: { findAll: (q: never) => Promise<{ text?: string }[]> }) => (await ui.findAll({} as never)).map(f => f.text ?? '').filter(Boolean)
const has = async (ui: { findAll: (q: never) => Promise<{ text?: string }[]> }, re: RegExp) => (await texts(ui)).some(t => re.test(t))
const alts = async (ui: { findAll: (q: never) => Promise<{ props: Record<string, unknown> }[]> }) => (await ui.findAll({ type: 'Svg' } as never)).map(f => String(f.props.alt ?? ''))
type Drawn = { props?: Record<string, unknown>; children?: unknown }
/** True when the element keyed `key` ends its row and a growing Box comes before it: it sits at the right end. */
const atRightEnd = async (ui: { drawn: () => Promise<unknown> }, key: string) => {
  const kids = (el: Drawn): Drawn[] => {
    const c = el.children ?? el.props?.children
    return (Array.isArray(c) ? c : c ? [c] : []).filter((x): x is Drawn => !!x && typeof x === 'object')
  }
  const walk = (el: Drawn): boolean | undefined => {
    const list = kids(el)
    const i = list.findIndex(x => x.props?.key === key)
    if (i >= 0) return i === list.length - 1 && list.slice(0, i).some(x => Number(x.props?.flexGrow ?? 0) > 0)
    for (const c of list) {
      const r = walk(c)
      if (r !== undefined) return r
    }
    return undefined
  }
  return walk((await ui.drawn()) as Drawn) ?? false
}

/* ── reading the files ── */

test('names, titles, status lines and questions read the way our docs write them', async () => {
  expect(nameInfo('08-10-2026-world-terrain-height.md', TRACKS)).toEqual({ key: '2026-10-08', day: '8 Oct', track: 'world' })
  expect(nameInfo('05-10-2026-2d-art-routes.md', TRACKS).track).toBe('')
  expect(shortTitle('Stepped levels test: generated cliffs')).toBe('Stepped levels test')
  expect(shortTitle('Handoff: make the Unity project and finish its setup')).toBe('Make the Unity project and finish its setup')
  expect(statusOf('> **Status: DONE (07-10-2026), failed: the owner stopped it at Gate A.** Result: x.')).toEqual({ failed: true, note: 'stopped at Gate A' })
  expect(statusOf('> **Status: DONE (06-10-2026).** Result: x.')).toEqual({ failed: false, note: '' })
  expect(questionOf('Question: how can Enmeshia show hills,\ncliffs and plateaus?\nFeeds: x')).toBe('How can Enmeshia show hills, cliffs and plateaus?')
})

test('the phase map gives names, gates and optional phases; the log gives progress and a waiting gate', async () => {
  const rows = phasesOf(PLAN)
  expect(rows.map(r => r.name)).toEqual([
    'Foundations and a probe', 'The level generator', 'Cliff pieces in Blender', 'The compositor and seams',
    'The patch in Unity', 'The build, the bench and the walk GIF', 'Show the villager behind cliffs', 'Docs and a check of them',
  ])
  expect(rows.filter(r => r.gate).map(r => [r.n, r.gate])).toEqual([[3, 'A'], [5, 'B']])
  expect(rows.filter(r => r.optional).map(r => r.n)).toEqual([6])

  const fresh = planOf(`${CL}/plans/08-10-2026-world-stepped-levels-test-plan.md`, PLAN, '', TRACKS)
  expect(fresh).toMatchObject({ short: 'Stepped levels test', track: 'world', day: '8 Oct', done: 0, state: 'not started', next: { n: 0 } })
  expect(fresh.waiting).toBeUndefined()

  const atGate = planOf('p', PLAN, logWith([0, 1, 2, 3]), TRACKS)
  expect(atGate).toMatchObject({ done: 4, state: 'waits on you at Gate A', waiting: { gate: 'A', after: 3 } })
  expect(atGate.phases.map(p => p.state)).toEqual(['done', 'done', 'done', 'done', 'todo', 'todo', 'optional', 'todo'])

  const past = planOf('p', PLAN, logWith([0, 1, 2, 3], ['A']), TRACKS)
  expect(past).toMatchObject({ state: 'phase 4 next' })
  expect(past.phases[4]!.state).toBe('doing')

  // Any log entry means phase 0 is under way
  const going = planOf('p', PLAN, '# Log\n\n## Phase 0 notes\n', TRACKS)
  expect(going).toMatchObject({ started: true, done: 0, state: 'phase 0 next' })
  expect(going.phases[0]!.state).toBe('doing')
  expect(fresh.started).toBe(false)
  expect([stateShort(fresh), stateShort(atGate), stateShort(past)]).toEqual(['not started', 'Gate A', 'phase 4 next'])
})

test('an unnamed "owner gate" is a gate named by its phase; any gate answer after that phase\'s done heading answers it', async () => {
  // The Eski chest plan's phase map, as written
  const plan = `# The Eski chest\n\n## Phase map\n\n| # | Phase | Test scenario | Roughly |\n|---|---|---|---|
| 0 | Probe: prove the risky parts, measure costs | \`eski_probe\` | medium |
| 1 | Categories: vanilla table, rules for mod items, categories.txt | \`eski_categories\` | medium |
| 2 | The chest piece, its category key, storage with any amount; template example removed | \`eski_chest\` | large |
| 3 | The chest window: list, details, take out (mockups B, C); owner gate | \`eski_window\` | large |
| 4 | Category picker, putting items in, refusals (mockup D); owner gate | \`eski_categorize\` | medium |
| 5 | Ground pickup | \`eski_pickup\` | medium |
`
  const rows = phasesOf(plan)
  expect(rows.filter(r => r.gate).map(r => [r.n, r.gate])).toEqual([[3, '3'], [4, '4']])
  expect(rows[3]!.name).toBe('The chest window: list, details, take out (mockups B, C)')
  expect(rows[4]!.name).toBe('Category picker, putting items in, refusals (mockup D)')
  expect(rows[2]!.gate).toBeUndefined()

  // An extra gate the orchestrator raised after phase 0, in its own words, answers no phase's gate
  const log = (...parts: string[]) => ['# Handoff: the Eski chest', ...parts].join('\n\n')
  const early = log('## Phase 0 done  (11-10-2026)', "## Gate probe findings, owner's answer (11-10-2026)", '## Phase 1 done  (11-10-2026)', '## Phase 2 done  (11-10-2026)')
  expect(planOf('p', plan, early, [])).toMatchObject({ state: 'phase 3 next', next: { n: 3 } })

  const atGate = planOf('p', plan, early + '\n\n## Phase 3 done  (12-10-2026)', [])
  expect(atGate).toMatchObject({ state: 'waits on you at Gate 3', waiting: { gate: '3', after: 3 } })
  expect(atGate.phases[4]!.state).toBe('todo')
  expect(stateShort(atGate)).toBe('Gate 3')

  const past = planOf('p', plan, early + "\n\n## Phase 3 done  (12-10-2026)\n\n## Gate chest window, owner's answer (12-10-2026)", [])
  expect(past).toMatchObject({ state: 'phase 4 next' })
  expect(past.waiting).toBeUndefined()
  expect(past.phases[4]!.state).toBe('doing')
})

test('the current plan is the started one whose log changed last; with none started, the earliest', async () => {
  const p = (name: string, log: string, logAt: number) => planOf(`${CL}/plans/${name}-plan.md`, PLAN, log, TRACKS, logAt)
  const names = (l: { file: string }[]) => l.map(x => x.file.slice(x.file.lastIndexOf('/') + 1, -'-plan.md'.length))
  const a = p('07-10-2026-look-a', '', 0)
  const b = p('08-10-2026-world-b', logWith([0]), 100)
  const c = p('09-10-2026-world-c', logWith([0, 1]), 50)
  expect(names(orderPlans([c, a, b]))).toEqual(['08-10-2026-world-b', '07-10-2026-look-a', '09-10-2026-world-c'])
  expect(names(orderPlans([c, a]))).toEqual(['09-10-2026-world-c', '07-10-2026-look-a'])
  expect(names(orderPlans([p('09-10-2026-world-d', '', 0), a]))).toEqual(['07-10-2026-look-a', '09-10-2026-world-d'])
  expect(orderPlans([])).toEqual([])
})

test('the report and the repo facts parse; sync reads git\'s branch line', async () => {
  expect(parseReport('noise {"headline":"On main","tracks":[{"name":"world","state":"odd"}],"calls":[{"title":"Q?"}]} tail')).toMatchObject({
    headline: 'On main', tracks: [{ name: 'world', state: 'idle', stands: [], next: '' }], calls: [{ title: 'Q?', where: '' }],
  })
  expect(parseReport('no json')).toBeNull()
  expect(parseFacts('## main...origin/main\nlast fetch: Oct 10 09:23\nchanged files: 3\n== Worktrees ==\n/a [main]\n/b [x]\n== Open PRs ==\nnone\n')).toEqual({
    branch: 'main', sync: 'synced', fetched: 'Oct 10 09:23', changed: 3, prs: 0, worktrees: 2,
  })
  expect(syncOf('## main...origin/main')).toBe('synced')
  expect(syncOf('## main...origin/main [ahead 2, behind 1]')).toBe('2 ahead, 1 behind')
  expect(syncOf('## topic')).toBe('no upstream')
})

/* ── the pane, the band and the commands in a project with our docs flow ── */

test('our docs flow: For you, Plan, Tracks, Handoffs and Research; no Tasks, no /task and no tool', async ($, on) => {
  const w = world(on, project(logWith([0, 1, 2, 3])), { report: REPORT })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  expect(w.registered).toEqual([])
  w.opened.length = 0
  expect(String(((await $.command.run({ command: 'workbench:task', args: '' } as never)) as { text?: string }).text)).toBe('Opened the Workbench pane.')
  expect(w.opened).toEqual(['workbench'])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    expect(await ui.find({ type: 'Button', text: /^For you · 1 gate waiting · 5 open calls$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /^Plan · world$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /^Tracks · 2$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /^Handoffs · none open$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /^Research · 3$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /^Tasks?$/ })).toBeUndefined()
    expect(await has(ui, /Gate A · Stepped levels test/)).toBe(true)
    expect(await has(ui, /Run the stepped levels plan/)).toBe(true)
    expect(await has(ui, /Update the plan for the jumps first\?/)).toBe(true)
    expect(await has(ui, /As of 09:48|As of 10-10-2026 09:48/)).toBe(true)
    // All five calls on one page
    expect(await has(ui, /Snap to 16 facings\?/)).toBe(true)
    expect(await has(ui, /How many worlds at release\?/)).toBe(true)
    expect(await has(ui, /Animation test · stopped at Gate A|stopped at Gate A/)).toBe(true)
    if (surface === 'desktop') expect(await alts(ui)).toContain('Current plan: Stepped levels test')
    await ui.unmount()
  }
})

test('presses: the calls, the phase list, a track, research and the folded boxes', async ($, on) => {
  const w = world(on, project(logWith([0, 1, 2, 3])), { report: REPORT })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  const ui = await $.ui.mount(pane('terminal'))
  // Five calls fit one page: no pager
  expect(await has(ui, /How many worlds at release\?/)).toBe(true)
  expect(await has(ui, /^1–5 of 5$/)).toBe(false)
  expect(await has(ui, /The patch in Unity/)).toBe(false)
  await ui.press({ key: 'ph-toggle' })
  expect(await has(ui, /The patch in Unity/)).toBe(true)
  expect(await has(ui, /^optional$/)).toBe(true)
  expect(await has(ui, /Terrain height is researched/)).toBe(false)
  await ui.press({ key: 'tr-n-world' })
  expect(await has(ui, /Terrain height is researched/)).toBe(true)
  expect(await has(ui, /Terrain height in a 2D isometric world/)).toBe(false)
  await ui.press({ key: 'bre-toggle' })
  expect(await has(ui, /Terrain height in a 2D isometric world/)).toBe(true)
  expect(await has(ui, /How can Enmeshia show hills, cliffs and plateaus from a seed\?/)).toBe(true)
  await ui.press({ key: 'bho-toggle' })
  expect(await has(ui, /No open handoffs\./)).toBe(true)
  expect(await has(ui, /Make the full toon biome atlas/)).toBe(true)
  // A log is not a handoff of its own
  expect(await has(ui, /Animation test, log/)).toBe(false)
  await ui.unmount()
})

test('Refresh asks the model once and draws the new report; a failure says so', async ($, on) => {
  const answer = JSON.stringify({ ...REPORT.data, next: 'A brand new next step.', calls: [] })
  const w = world(on, project(''), { model: answer })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  const ui = await $.ui.mount(pane('terminal'))
  expect(await has(ui, /Press Refresh for the status report\./)).toBe(true)
  expect(w.prompts).toEqual([])
  await ui.press({ key: 'fy-refresh' })
  await w.clock.settle()
  expect(w.prompts.length).toBe(1)
  expect(await has(ui, /A brand new next step\./)).toBe(true)
  expect(await ui.find({ type: 'Button', text: /^For you$/ })).toBeDefined()
  await ui.unmount()
})

test('a failed report shows its reason and keeps the button', async ($, on) => {
  const w = world(on, project(''))
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'fy-refresh' })
  await w.clock.settle()
  expect(await has(ui, /The report failed: API error 500 down\./)).toBe(true)
  expect(await ui.find({ type: 'Button', text: /^Refresh$/ })).toBeDefined()
  await ui.unmount()
})

test('the band names the plan and what it waits for, with the Workbench button', async ($, on) => {
  const w = world(on, project(logWith([0, 1, 2, 3])), { report: REPORT })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  const desk = await $.ui.mount(band('desktop'))
  expect((await alts(desk)).some(a => a === 'world: Stepped levels test, waits on you at Gate A')).toBe(true)
  expect((await alts(desk)).some(a => a === 'Gate A, 50% done')).toBe(true)
  // The Workbench button, not an arrow, opens and closes the pane.
  expect(await desk.find({ type: 'Button', text: /^Workbench$/ })).toBeDefined()
  expect(await has(desk, /[❯❮]/)).toBe(false)
  // At the right end of the row, however wide the title.
  expect(await atRightEnd(desk, 'band-bench')).toBe(true)
  // The band beneath (the skins mod's usage band) stays, above the plan.
  expect(await desk.find({ key: 'beneath' })).toBeDefined()
  await desk.unmount()
  const term = await $.ui.mount(band('terminal'))
  expect(await has(term, /now · waits on you at Gate A/)).toBe(true)
  expect(await term.find({ type: 'Button', text: /^Workbench$/ })).toBeDefined()
  expect(await atRightEnd(term, 'band-bench')).toBe(true)
  await term.unmount()
})

/** Five open plans, as the owner may write them: one or two running, the rest waiting. */
function manyPlans(logs: Record<string, string>) {
  const f = project('')
  delete f[`${CL}/handoff/08-10-2026-world-stepped-levels-test-log.md`]
  const add = (name: string, title: string) => {
    f[`${CL}/plans/${name}-plan.md`] = PLAN.replace('Stepped levels test: generated cliffs, plateaus and ramps', `${title}: x`).replace('08-10-2026-world-stepped-levels-test-log.md', `${name}-log.md`)
    if (logs[name]) f[`${CL}/handoff/${name}-log.md`] = logs[name]!
  }
  add('03-10-2026-world-biome-test', 'Biome test')
  add('04-10-2026-crafting-bench-test', 'Bench test')
  add('07-10-2026-look-toon-shader-test', 'Toon shader test')
  add('08-10-2026-world-stepped-levels-test', 'Stepped levels test')
  add('09-10-2026-characters-rig-test', 'Rig test')
  return f
}
/** The Up next rows' text, in order: "●Biome testnot started3 Oct". */
const upNextRows = async (ui: { findAll: (q: never) => Promise<{ key?: string | null; text?: string }[]> }) =>
  (await ui.findAll({} as never)).filter(n => String(n.key ?? '').startsWith('pl-nx-/')).map(n => n.text ?? '')

test('several open plans: the running one is current, in the pane and the band; every other one is listed with its state', async ($, on) => {
  const w = world(on, manyPlans({ '09-10-2026-characters-rig-test': logWith([0, 1, 2]) }), { report: REPORT })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop'))
  expect((await alts(ui)).includes('Current plan: Rig test')).toBe(true)
  expect(await upNextRows(ui)).toEqual(['●Biome testnot started3 Oct', '●Bench testnot started4 Oct', '●Toon shader testnot started7 Oct', '●Stepped levels testnot started8 Oct'])
  const b = await $.ui.mount(band('desktop'))
  expect((await alts(b)).some(a => a.startsWith('characters: Rig test'))).toBe(true)
})

test('two plans running: the one whose log changed last is current; the other shows its gate', async ($, on) => {
  const toon = `${CL}/handoff/07-10-2026-look-toon-shader-test-log.md`
  const rig = `${CL}/handoff/09-10-2026-characters-rig-test-log.md`
  const w = world(on, manyPlans({ '07-10-2026-look-toon-shader-test': logWith([0]), '09-10-2026-characters-rig-test': logWith([0, 1, 2, 3]) }), {
    report: REPORT,
    mtimes: { [toon]: 2000, [rig]: 1000 },
  })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  const ui = await $.ui.mount(pane('terminal'))
  expect(await has(ui, /^Toon shader test$/)).toBe(true)
  expect(await upNextRows(ui)).toEqual(['●Biome testnot started3 Oct', '●Bench testnot started4 Oct', '●Stepped levels testnot started8 Oct', '●Rig testGate A9 Oct'])
  // Its gate still asks for you in For you
  expect(await has(ui, /Gate A · Rig test/)).toBe(true)
})

test('with no plan the band stays empty while the pane is up; closed, a Workbench button brings it back', async ($, on) => {
  const files = project(logWith([]))
  delete files[`${CL}/plans/08-10-2026-world-stepped-levels-test-plan.md`]
  delete files[`${CL}/handoff/08-10-2026-world-stepped-levels-test-log.md`]
  const w = world(on, files, { report: REPORT })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  const open = await $.ui.mount(band('desktop'))
  expect(await alts(open)).toEqual([])
  await open.unmount()
  // The person closes the pane (the test kit cannot raise ui.close, so the pane just goes).
  w.up.delete('workbench')
  const desk = await $.ui.mount(band('desktop'))
  const term = await $.ui.mount(band('terminal'))
  expect(await alts(desk)).toEqual(['Workbench'])
  expect(await desk.find({ type: 'Button', text: /^Workbench$/ })).toBeDefined()
  expect(await term.find({ type: 'Button', text: /^Workbench$/ })).toBeDefined()
  // Alone, it still sits at the right end, where it is with a plan.
  expect(await atRightEnd(desk, 'band-bench')).toBe(true)
  expect(await atRightEnd(term, 'band-bench')).toBe(true)
  // And the band beneath stays.
  expect(await desk.find({ key: 'beneath' })).toBeDefined()
  expect(await term.find({ key: 'beneath' })).toBeDefined()
  w.opened.length = 0
  await desk.press({ key: 'band-open' })
  await w.clock.settle()
  expect(w.opened).toEqual(['workbench'])
  expect(await alts(desk)).toEqual([])
  expect(await texts(term)).toEqual([])
  await desk.unmount()
  await term.unmount()
})

test('an open handoff draws in the Handoffs box; a log its plan names, with no -log ending, is not a handoff', async ($, on) => {
  const files = project(logWith([0]))
  files[`${CL}/handoff/09-10-2026-world-cliff-art-handoff.md`] = '# Handoff: make the cliff art\n'
  files[`${CL}/plans/09-10-2026-crafting-chest-plan.md`] =
    '# Chest: storage\n\n## Phase map\n\n| # | Phase | Check | Roughly |\n|---|---|---|---|\n| 0 | Probe | `probe` | small |\n\nThe handoff log lives at `.claude/handoff/09-10-2026-crafting-chest.md`.\n'
  files[`${CL}/handoff/09-10-2026-crafting-chest.md`] = '# Handoff: the chest\n\n## Phase 0 done  (10-10-2026)\n'
  const w = world(on, files, { report: REPORT })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    expect(await ui.find({ type: 'Button', text: /^Handoffs · 1 open$/ })).toBeDefined()
    // The box stays open for the next surface
    if (surface === 'terminal') await ui.press({ key: 'bho-toggle' })
    expect(await has(ui, /^Make the cliff art$/)).toBe(true)
    expect(await has(ui, /^The chest$/)).toBe(false)
    await ui.unmount()
  }
})

test('a project without our docs: no Tasks and no /task, even with a plans folder; Files, In Flight and the Workbench button', async ($, on) => {
  const task = '---\ntask: forecast\nproject: game\nshort: game\ntitle: Seven-day forecast\ndate: 2026-10-08\nend: 2026-10-08\nstatus: open\n---\n\n# Seven-day forecast\n\n## Work items\n\n- [~] Forecast screen `build`\n'
  const w = world(on, { [ROOT + '/README.md']: '# x', [ROOT + '/plans/forecast.md']: task })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  expect(w.registered).toEqual([])
  expect(w.opened).toEqual(['workbench'])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    expect(await ui.find({ type: 'Button', text: /^Tasks?\b/ })).toBeUndefined()
    expect(await ui.find({ type: 'Button', text: /^For you/ })).toBeUndefined()
    expect(await ui.find({ type: 'Button', text: /^Files$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /^In Flight/ })).toBeDefined()
    expect(await has(ui, /Seven-day forecast|Forecast screen/)).toBe(false)
    await ui.unmount()
  }
  // The pane open: the band leaves what is beneath alone. Closed: the Workbench button alone, no task.
  for (const surface of ['terminal', 'desktop'] as const) {
    const open = await $.ui.mount(band(surface))
    expect(await open.find({ type: 'Button', text: /^Workbench$/ })).toBeUndefined()
    await open.unmount()
  }
  w.up.delete('workbench')
  for (const surface of ['terminal', 'desktop'] as const) {
    const closed = await $.ui.mount(band(surface))
    expect(await closed.find({ type: 'Button', text: /^Workbench$/ })).toBeDefined()
    expect(await has(closed, /Seven-day forecast|Forecast screen/)).toBe(false)
    await closed.unmount()
  }
  // /workbench:task only opens the pane; it never writes a plan file.
  w.opened.length = 0
  expect(String(((await $.command.run({ command: 'workbench:task', args: 'new Something' } as never)) as { text?: string }).text)).toBe('Opened the Workbench pane.')
  expect(w.opened).toEqual(['workbench'])
  expect([...w.disk.keys()].filter(k => k.startsWith(ROOT + '/plans/'))).toEqual([ROOT + '/plans/forecast.md'])
})

test('the file Claude is on shimmers in Claude touched until the turn ends; the Files box has no tree', async ($, on) => {
  world(on, { [ROOT + '/src/app.ts']: 'x' })
  on('prompt.submit', async (_$, e) => ({ text: (e as { text: string }).text }) as never)
  on('tool.call', { tool: 'Edit' }, async () => ({ result: {}, text: '' }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  const app = ROOT + '/src/app.ts'
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'bf-toggle' })
  expect(await ui.find({ type: 'Button', text: /^Files$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ALL FILES$|^All files$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /^src$/ })).toBeUndefined()
  await $.prompt.submit({ text: 'fix it' } as never)
  await $.tool.call({ tool: 'Edit', file_path: app, old_string: 'x', new_string: 'y' } as never)
  expect(await ui.find({ key: `tcn-${app}-sh-${app}` })).toBeDefined()
  await $.turn.complete({ answer: '' } as never)
  expect(await ui.find({ key: `tcn-${app}-sh-${app}` })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text', text: /^app\.ts$/ })).length).toBe(1)
  await ui.unmount()
})

test('everything open, on the desktop, stays well under the 100,000 characters a pane may send', async ($, on) => {
  // Every phase done fills the dithered bar: its largest drawing.
  const files = project(logWith([0, 1, 2, 3, 4, 5, 6, 7], ['A', 'B']))
  for (let i = 10; i < 30; i++) files[`${CL}/research/0${i % 9 + 1}-09-2026-world-topic-${i}.md`] = `# A research doc with a fairly long title number ${i}\n\nQuestion: ${'why '.repeat(40)}?\n`
  const w = world(on, files, { report: REPORT })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop'))
  for (const key of ['bho-toggle', 'bre-toggle', 'ph-toggle', 'tr-n-world']) await ui.press({ key })
  const size = JSON.stringify(await ui.drawn()).length
  expect(size).toBeLessThan(70_000)
  await ui.unmount()
})

test('research shows five at a time; the arrows turn to older and newer pages, dim at either end', async ($, on) => {
  const files = project(logWith([0, 1, 2, 3]))
  for (let i = 0; i < 10; i++) files[`${CL}/research/0${i % 4 + 1}-08-2026-world-topic-${i}.md`] = `# Research doc ${i}\n\nQuestion: why ${i}?\n`
  const w = world(on, files, { report: REPORT })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount(pane(surface))
    if (surface === 'desktop') await ui.press({ key: 'bre-toggle' })
    const rows = async () => [...new Set((await texts(ui)).filter(t => /^(Terrain height|Animating characters|2D looks gallery|Research doc \d)/.test(t)))]
    expect(await has(ui, /^1–5 of 13$/)).toBe(true)
    expect(await rows()).toEqual(['Terrain height in a 2D isometric world', 'Animating characters by code', '2D looks gallery', 'Research doc 3', 'Research doc 7'])
    expect(await ui.find({ type: 'Button', key: 're-prev' } as never)).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 're-next' } as never)).toBeDefined()
    await ui.press({ key: 're-next' })
    expect(await has(ui, /^6–10 of 13$/)).toBe(true)
    expect((await rows()).length).toBe(5)
    await ui.press({ key: 're-next' })
    expect(await has(ui, /^11–13 of 13$/)).toBe(true)
    expect((await rows()).length).toBe(3)
    expect(await ui.find({ type: 'Button', key: 're-next' } as never)).toBeUndefined()
    await ui.press({ key: 're-prev' })
    await ui.press({ key: 're-prev' })
    expect(await has(ui, /^1–5 of 13$/)).toBe(true)
    await ui.unmount()
  }
})

test('open calls show five at a time, with the same arrows as research', async ($, on) => {
  const many = Array.from({ length: 11 }, (_, i) => ({ title: `Call ${i + 1}?`, detail: '', where: 'x design.md, Open questions' }))
  const w = world(on, project(logWith([0, 1, 2, 3])), { report: { ...REPORT, data: { ...REPORT.data, calls: many } } })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount(pane(surface))
    const rows = async () => [...new Set((await texts(ui)).filter(t => /^Call \d+\?$/.test(t)))]
    expect(await has(ui, /^1–5 of 11$/)).toBe(true)
    expect(await rows()).toEqual(['Call 1?', 'Call 2?', 'Call 3?', 'Call 4?', 'Call 5?'])
    expect(await ui.find({ type: 'Button', key: 'fy-c-prev' } as never)).toBeUndefined()
    await ui.press({ key: 'fy-c-next' })
    expect(await has(ui, /^6–10 of 11$/)).toBe(true)
    expect(await rows()).toEqual(['Call 6?', 'Call 7?', 'Call 8?', 'Call 9?', 'Call 10?'])
    await ui.press({ key: 'fy-c-next' })
    // One left: "11 of 11", not "11–11"
    expect(await has(ui, /^11 of 11$/)).toBe(true)
    expect(await rows()).toEqual(['Call 11?'])
    expect(await ui.find({ type: 'Button', key: 'fy-c-next' } as never)).toBeUndefined()
    await ui.press({ key: 'fy-c-prev' })
    await ui.press({ key: 'fy-c-prev' })
    expect(await has(ui, /^1–5 of 11$/)).toBe(true)
    await ui.unmount()
  }
})

test('300 files and every box open, Files too: no file tree, well under the 100,000 characters', async ($, on) => {
  const files = project(logWith([0, 1, 2, 3, 4, 5, 6, 7], ['A', 'B']))
  for (let i = 0; i < 300; i++) files[`${ROOT}/file-${String(i).padStart(3, '0')}-with-a-long-name.ts`] = 'x'
  const w = world(on, files, { report: REPORT })
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop'))
  for (const key of ['bf-toggle', 'bho-toggle', 'bre-toggle', 'ph-toggle', 'tr-n-world']) await ui.press({ key })
  expect(JSON.stringify(await ui.drawn()).length).toBeLessThan(70_000)
  expect(await ui.find({ type: 'Button', text: /^Files$/ })).toBeDefined()
  expect(await has(ui, /file-000-with-a-long-name\.ts/)).toBe(false)
  expect(await has(ui, /^Nothing yet this session$/)).toBe(true)
  await ui.unmount()
})

