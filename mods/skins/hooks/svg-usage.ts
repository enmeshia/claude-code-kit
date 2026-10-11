import type { UsageSnap } from '../types'
import type { Palette } from './skin'
import { escape, FONT } from './svg-kit'

// The band above the prompt: how full the context window is and how much of each plan
// limit is spent, as rings drawn still. The context's ring is labelled with its tokens.

const RING_R = 9
const ITEM_W = 132

// `value` is the figure written beside the ring; without one, the percent.
export type Meter = { label: string; percent: number; value?: string }

export const meterValue = (meter: Meter): string => meter.value ?? `${meter.percent}%`

// A token count as the band writes it: `850`, `8.5k`, `312k`, `1.2M`.
export function tokenCount(tokens: number): string {
  const n = Math.max(0, Math.round(tokens))
  const short = (value: number, unit: string) => `${value.toFixed(1).replace(/\.0$/, '')}${unit}`

  if (n < 1000) {
    return String(n)
  }

  if (n < 10_000) {
    return short(n / 1000, 'k')
  }

  if (Math.round(n / 1000) < 1000) {
    return `${Math.round(n / 1000)}k`
  }

  return short(n / 1_000_000, 'M')
}

// `five_hour` reads as `5h`, `seven_day` as `7d`; any other kind as its own name.
export function limitLabel(kind: string): string {
  const name = kind.toLowerCase()

  if (name.includes('five') || name.includes('5h') || name.includes('5_h')) {
    return '5h'
  }

  if (name.includes('seven') || name.includes('7d') || name.includes('week')) {
    return '7d'
  }

  return name.replace(/_/g, ' ')
}

export function metersOf(usage: UsageSnap): Meter[] {
  return [
    ...(usage.context === null
      ? []
      : [{ label: 'context', percent: usage.context, ...(usage.contextTokens === null ? {} : { value: tokenCount(usage.contextTokens) }) }]),
    ...usage.limits.map(limit => ({ label: limit.label, percent: limit.percent })),
  ].map(meter => ({ ...meter, percent: Math.max(0, Math.min(100, Math.round(meter.percent))) }))
}

// Accent while there is room; the warning colour from 80 %, the error colour from 95 %.
export const meterColor = (percent: number, palette: Palette): string =>
  percent >= 95 ? palette.err : percent >= 80 ? palette.warn : palette.user

export function usageSvg(meters: readonly Meter[], palette: Palette): { source: string; width: number; height: number; alt: string } {
  const width = meters.length * ITEM_W
  const height = 30
  const circumference = 2 * Math.PI * RING_R

  const items = meters
    .map((meter, i) => {
      const x = i * ITEM_W + RING_R + 4
      const filled = (circumference * meter.percent) / 100
      const color = meterColor(meter.percent, palette)

      return [
        `<circle cx="${x}" cy="15" r="${RING_R}" fill="none" stroke="${palette.muted}" stroke-opacity=".25" stroke-width="3"/>`,
        `<circle class="fill" cx="${x}" cy="15" r="${RING_R}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${filled} ${circumference}" transform="rotate(-90 ${x} 15)" style="--len:${filled}"/>`,
        `<text x="${x + RING_R + 8}" y="19.5" font-size="12.5"><tspan style="fill:${palette.fg};font-weight:600">${escape(meterValue(meter))}</tspan><tspan style="fill:${palette.muted}"> ${escape(meter.label)}</tspan></text>`,
      ].join('')
    })
    .join('')

  // No fill-in animation: the band redraws on every usage update while a turn runs.
  const style = `text{font-family:${FONT}}`

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${style}</style>${items}</svg>`,
    width,
    height,
    alt: meters.map(meter => `${meter.label} ${meterValue(meter)}`).join(', '),
  }
}

// The terminal's version: one line of block meters.
export function usageLine(meters: readonly Meter[]): { label: string; bar: string; percent: number; value: string }[] {
  return meters.map(meter => {
    const filled = Math.round(meter.percent / 12.5)

    return { label: meter.label, bar: '▰'.repeat(filled) + '▱'.repeat(8 - filled), percent: meter.percent, value: meterValue(meter) }
  })
}
