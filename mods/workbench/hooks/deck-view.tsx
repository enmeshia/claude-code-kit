// The In Flight card's drawing, stacked for the Workbench's one column: main vitals, the
// architect, the agent list, other loops and the turn receipt.
// Pure: register.tsx reads the state and passes the presses back in.
//
// Adapted from claude-flightdeck (https://github.com/scasella/claude-flightdeck, hooks/register.tsx),
// MIT License, Copyright (c) 2026 Stephen Casella. The full notice is at the top of ./deck.ts.
import type { ThemeKey } from 'claude-code'

import type { DeckAgent } from '../types'
import type { Palette, Slot } from './bench'
import {
  cardTitle, consultTimeline, fmtDuration, fmtTimer, gauge, isAdvising, isLoopActive, kTokens,
  limitLabel, plural, prettyModel, shorten,
} from './deck'
import type { DeckData } from './deck'

/** A subagent's context window when it runs another model than the main session; the same model has the main session's (1M for Opus 5.5 there). */
const AGENT_WINDOW = 200_000
const ARCH_LABEL = 'Architect'

// Colors carry meaning: blue is running now (the main loop and agents), green / orange / red a
// gauge's fill (room left, filling up, nearly full), green and red a finished agent or turn. The
// skin's orange ('write') is not used here: in most skins it is also the warning color.
type Role = 'agent' | 'gate' | 'arch' | 'amber' | 'warn' | 'dim' | 'faint' | 'text'
/** Each role's skin slot, and with no skin the Claude Code theme key the original Flightdeck uses. */
const ROLE: Record<Role, [Slot, ThemeKey]> = {
  agent: ['read', 'suggestion'],
  gate: ['ok', 'success'],
  arch: ['search', 'merged'],
  amber: ['warn', 'warning'],
  warn: ['err', 'error'],
  dim: ['muted', 'inactive'],
  faint: ['muted', 'subtle'],
  text: ['fg', 'text'],
}

/** A gauge's fill: green below 60%, orange from 60%, red from 85%. */
const levelRole = (pct: number): Role => (pct >= 85 ? 'warn' : pct >= 60 ? 'amber' : 'gate')

/** What the pane lends the card: its elements, width, palette and helpers, so the card looks like the other two. */
export type DeckKit = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  els: any
  cols: number
  pal: Palette & { themed: boolean }
  card: (key: string, kids: unknown[], marginTop?: number, tinted?: boolean) => unknown
  capsText: (key: string, text: string, slot?: Slot, size?: number) => unknown
  /** The pane's "1–5 of 13" row with its arrows, and the page to show of a saved one. */
  pager: (key: string, page: number, total: number, alts: readonly [string, string], go: (to: number) => () => void) => unknown
  pageOf: (saved: unknown, total: number) => number
  onExpand: (id: string) => void
  onPage: (to: number) => () => void
  onReset: () => void
}

/** The section's title: the main model and whether it works. */
export function deckTitle(m: DeckData['main']) {
  return `In Flight · ${m.model ? prettyModel(m.model) : 'main'} ${m.isRunning ? 'working' : 'idle'}`
}

export function deckKids(d: DeckData, kit: DeckKit): unknown[] {
  const { els, cols, pal, card, capsText } = kit
  const { Box, Text, Button } = els
  const hasClient = 'Client' in els
  const { main: m, usage: u, arch: a, cards, loops: lp, turn: t, receipt: r, view: v, now } = d
  const col = (role: Role) => (pal.themed ? pal[ROLE[role][0]] : ROLE[role][1])
  const slot = (role: Role) => ROLE[role][0]
  // The text width inside a card inside the section's card: each takes its border and padding.
  const w = Math.max(20, cols - 13)
  const modelName = prettyModel(m.model)
  const advising = isAdvising(a)
  const running = cards.filter(c => c.status === 'running')
  const head = (key: string, left: string, role: Role, right?: unknown) => (
    <Box key={key} flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
      {capsText(key + '-l', left, slot(role))}
      {right ?? null}
    </Box>
  )
  // A start time of 0 is unknown: no clock rather than decades. The client ticks between redraws.
  const clock = (key: string, since: number, endAt: number | null, color: string) =>
    since <= 0 ? <Text key={key} color={color}>-</Text>
    : hasClient ? <els.Client key={key} module="./elapsed.tsx" props={{ since, now, endAt, color }} />
    : <Text key={key} color={color}>{fmtTimer((endAt ?? now) - since)}</Text>
  const out: unknown[] = []

  // ── main: model, effort, context and rate limits
  const effortN = ({ low: 1, medium: 2, high: 3, xhigh: 4, max: 4 } as Record<string, number>)[m.effort] ?? 0
  const ctx = u.pct !== null ? gauge(u.pct, Math.min(16, Math.max(6, w - 18))) : null
  out.push(
    card('fd-main', [
      head('fd-main-h', `${modelName} · main`, 'text', <Text key="fd-run" color={m.isRunning ? col('agent') : col('dim')}>{m.isRunning ? '● working' : '○ idle'}</Text>),
      <Text key="fd-effort" wrap="truncate-end">
        <Text dimColor>effort </Text>
        <Text color={col('text')}>{'▮'.repeat(effortN) + '▯'.repeat(4 - effortN)} </Text>
        <Text color={col('text')} bold>{m.effort || '-'}</Text>
        {m.mode ? <Text dimColor>{`  mode ${m.mode}`}</Text> : null}
        <Text dimColor>{`  ${m.steps} req`}</Text>
      </Text>,
      ctx ? (
        <Text key="fd-ctx" wrap="truncate-end">
          <Text dimColor>ctx </Text>
          <Text color={col(levelRole(u.pct ?? 0))}>{ctx.on}</Text>
          <Text color={col('faint')}>{ctx.off}</Text>
          <Text bold>{` ${Math.round(u.pct ?? 0)}%`}</Text>
          {u.tokens !== null ? <Text dimColor>{` ${kTokens(u.tokens)}/${kTokens(u.window)}`}</Text> : null}
          {u.compactions > 0 ? <Text color={col('dim')}>{`  ⟲${u.compactions}`}</Text> : null}
        </Text>
      ) : null,
      u.limits.length > 0 ? (
        <Box key="fd-limits" flexDirection="row" flexWrap="wrap" columnGap={2}>
          {u.limits.slice(0, 2).map(l => {
            const lg = gauge(l.pct, 5)
            return (
              <Text key={'fd-lim-' + l.kind}>
                <Text dimColor>{`${limitLabel(l.kind)} `}</Text>
                <Text color={col(levelRole(l.pct))}>{lg.on}</Text>
                <Text color={col('faint')}>{lg.off}</Text>
                <Text dimColor>{` ${Math.round(l.pct)}%`}</Text>
              </Text>
            )
          })}
        </Box>
      ) : null,
    ], 1, true),
  )

  // ── architect: only once one has been consulted or spawned
  if (a.consults.length > 0 || a.ids.length > 0) {
    const last = a.consults[a.consults.length - 1]
    out.push(
      card('fd-arch', [
        head('fd-arch-h', `${ARCH_LABEL} · ${advising ? 'advising' : 'on call'}`, 'arch', <Text key="fd-arch-n"><Text dimColor>consults </Text><Text color={col('arch')} bold>{a.consults.length}</Text></Text>),
        <Text key="fd-arch-tl" color={col('arch')}>{consultTimeline(a, now, w)}</Text>,
        <Text key="fd-arch-last" dimColor wrap="truncate-end">
          {!last ? 'not consulted yet'
            : advising ? `consulting for ${fmtDuration(now - last.at)}`
            : `last ${fmtDuration(now - (last.endAt ?? last.at))} ago · took ${fmtDuration((last.endAt ?? now) - last.at)}`}
        </Text>,
        <Box key="fd-arch-mo" flexDirection="row" flexWrap="wrap" columnGap={2}>
          {(['before a plan', 'error repeats', 'before done'] as const).map(mo => (
            <Text key={'fd-mo-' + mo} color={last?.moment === mo ? col('arch') : col('dim')} bold={last?.moment === mo}>{`${last?.moment === mo ? '◆' : '◇'} ${mo}`}</Text>
          ))}
          <Text key="fd-mo-inf" color={col('faint')}>(inferred)</Text>
        </Box>,
        a.lastAdvice ? <Text key="fd-arch-adv" color={col('arch')} wrap="truncate-end">{`» ${a.lastAdvice}`}</Text> : null,
      ], 1),
    )
  }

  // ── agents: one list, running first (newest first), then finished (last to end first), five a page.
  // Two lines each: the task and its clock; then type, model and steps, and its context with a gauge.
  if (cards.length > 0) {
    const PAGE = 5
    const statusColor = (c: DeckAgent) => (c.status === 'failed' ? col('warn') : c.status === 'done' ? col('gate') : col('agent'))
    const glyph = (c: DeckAgent) => (c.status === 'running' ? '◐' : c.status === 'done' ? '✓' : c.status === 'failed' ? '✗' : '■')
    const isRun = (c: DeckAgent) => c.status === 'running'
    const list = [
      ...running.slice().sort((x, y) => y.spawnedAt - x.spawnedAt),
      ...cards.filter(c => !isRun(c)).sort((x, y) => (y.endedAt ?? 0) - (x.endedAt ?? 0)),
    ]
    const page = kit.pageOf(v.page, list.length)
    const shown = list.slice(page * PAGE, (page + 1) * PAGE)
    const windowOf = (c: DeckAgent) => (prettyModel(c.model) === modelName && u.window > 0 ? u.window : AGENT_WINDOW)
    // A running agent's context is colored by how full it is; a finished one's is gray.
    const ctxColor = (c: DeckAgent) => (isRun(c) ? col(levelRole((c.ctx / windowOf(c)) * 100)) : col('dim'))
    const expand = (id: string) => () => kit.onExpand(id)
    const kids: unknown[] = [head('fd-ag-h', `Agents · ${running.length} running · ${cards.length} total`, 'agent')]
    for (const [i, c] of shown.entries()) {
      const g = gauge(Math.min(100, (c.ctx / windowOf(c)) * 100), 5)
      const detail = c.steps > 0 ? `${c.type} · ${prettyModel(c.model)} · ${plural(c.steps, 'step')}` : `${c.type} · starting…`
      kids.push(
        <Box key={'fd-ag-' + c.id} flexDirection="column" width="100%" marginTop={1}>
          <Box flexDirection="row" columnGap={1} alignItems="center" width="100%">
            <Text color={statusColor(c)}>{glyph(c)}</Text>
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Button key={'fd-ab-' + c.id} plain dimColor={!isRun(c)} hotkey={String(i + 1)} label={shorten(cardTitle(c), Math.max(8, w - 8))} onPress={expand(c.id)} />
            </Box>
            <Box flexShrink={0}>{clock('fd-ac-' + c.id, c.spawnedAt, c.endedAt, col('dim'))}</Box>
          </Box>
          <Box flexDirection="row" columnGap={1} paddingLeft={2} width="100%">
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text wrap="truncate-end">
                <Text color={col('dim')}>{detail}</Text>
                {c.lastStop === 'max_tokens' ? <Text color={col('warn')}>{' · max_tokens'}</Text> : null}
              </Text>
            </Box>
            <Text key={'fd-ag-' + c.id + '-g'}>
              <Text color={ctxColor(c)}>{g.on}</Text>
              <Text color={col('faint')}>{g.off}</Text>
            </Text>
            <Box flexShrink={0} width={5} justifyContent="flex-end">
              <Text key={'fd-ag-' + c.id + '-ctx'} color={ctxColor(c)}>{c.steps > 0 ? kTokens(c.ctx) : '-'}</Text>
            </Box>
          </Box>
        </Box>,
      )
      // The pressed agent opens under its own row: its last tool calls and its answer.
      if (c.id === v.expanded) {
        kids.push(
          <Box key="fd-exp" flexDirection="column" marginTop={1} width="100%" paddingLeft={2}>
            <Text bold wrap="wrap">{c.description || c.type}</Text>
            {c.steps > 0 ? <Text dimColor wrap="truncate-end">{`ctx ${kTokens(c.ctx)} · out ${kTokens(c.out)}`}</Text> : null}
            {c.tools.length === 0 ? <Text color={col('faint')}>no tool calls yet</Text> : null}
            {c.tools.map((n, k) => <Text key={'fd-et-' + k} color={n.isError ? col('warn') : col('text')} wrap="truncate-end">{`${n.isError ? '✗' : '·'} ${n.text}`}</Text>)}
            {c.answer ? <Text dimColor wrap="wrap">{`» ${shorten(c.answer, 240)}`}</Text> : null}
          </Box>,
        )
      }
    }
    if (list.length > PAGE) kids.push(kit.pager('fd-ag', page, list.length, ['Previous agents', 'More agents'], kit.onPage))
    kids.push(<Text key="fd-ag-hint" color={col('faint')}>{`press an agent (or 1-${shown.length}) for its tool calls and answer`}</Text>)
    out.push(card('fd-agents', kids, 1))
  }

  // ── other loops: model loops no card claims (workflow agents, compactions, memory forks)
  if (lp.length > 0) {
    const active = lp.filter(l => isLoopActive(l, now)).length
    out.push(
      <Box key="fd-loops" flexDirection="row" columnGap={1} marginTop={1} width="100%">
        <Text bold>other loops</Text>
        <Text dimColor>{`${lp.length} seen · ${active} active`}</Text>
        <Text wrap="truncate-end">
          {lp.slice(-Math.max(4, w - 28)).map((l, i) => (
            <Text key={'fd-lp-' + i} color={isLoopActive(l, now) ? col('agent') : l.isDone ? col('dim') : col('faint')}>{isLoopActive(l, now) ? '●' : l.isDone ? '✓' : '○'}</Text>
          ))}
        </Text>
      </Box>,
    )
  }

  // ── receipt: the turn now, or the last one
  if (m.isRunning || r) {
    out.push(
      card('fd-receipt', [
        m.isRunning ? (
          <Box key="fd-rc" flexDirection="row" flexWrap="wrap" columnGap={1}>
            <Text color={col('agent')}>{`◐ ${modelName.toLowerCase()} · turn`}</Text>
            <Box flexShrink={0}>{clock('fd-turn', t.startedAt, null, col('agent'))}</Box>
            <Text dimColor>{`· ${plural(t.edits, 'edit')} · ${plural(t.errors, 'error')}`}</Text>
          </Box>
        ) : r ? (
          <Text key="fd-rc" wrap="wrap">
            <Text color={r.reason === 'answer' ? col('gate') : col('warn')}>{r.reason === 'answer' ? '✓ ' : '✗ '}</Text>
            <Text>{`last turn ${fmtDuration(r.durationMs)} · ${plural(r.agents, 'agent')} · ${plural(r.edits, 'edit')} · ${plural(r.errors, 'error')}`}</Text>
          </Text>
        ) : null,
        t.isReviewing ? <Text key="fd-rv" color={col('arch')}>architect reviewing before done (inferred)</Text> : null,
      ], 1),
    )
  }

  out.push(
    <Box key="fd-reset" flexDirection="row" marginTop={1}>
      <Button key="fd-reset-b" onPress={() => kit.onReset()}>Reset</Button>
    </Box>,
  )
  return out
}
