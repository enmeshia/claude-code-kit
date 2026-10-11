import type { Kind } from './skin'

// Vector icons and spinners for the surfaces that draw `Svg` (the desktop app). Each is a
// whole SVG document; animation is CSS, which plays in the image the desktop draws.

// Outline paths on a 24-unit grid.
const PATHS: Readonly<Record<Kind, string>> = {
  run: '<path d="M5 7l5 5-5 5"/><path d="M12 18h7"/>',
  write: '<path d="M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  read: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6M9 17h4"/>',
  search: '<circle cx="10" cy="10" r="6.5"/><path d="M20 20l-5.2-5.2"/>',
  web: '<circle cx="12" cy="12" r="8.5"/><path d="M3.8 9.5h16.4M3.8 14.5h16.4"/><path d="M11.5 3.5a15 15 0 0 0 0 17M12.5 3.5a15 15 0 0 1 0 17"/>',
  mcp: '<path d="M9.8 6.2l8 8-2 2a5.66 5.66 0 0 1-8-8z"/><path d="M4 20l3.6-3.6M15 4l-3.4 3.4M20 9l-3.4 3.4"/>',
  other: '<circle cx="12" cy="12" r="3"/>',
}

const SPIN = [
  '.spin{transform-box:view-box;transform-origin:12px 12px;animation:spin .9s linear infinite}',
  '@keyframes spin{to{transform:rotate(360deg)}}',
].join('')

const svg = (size: number, style: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><style>${style}</style>${body}</svg>`

// The band's Compact button icon: Lucide's minimize-2 (ISC license, lucide.dev), drawn the
// way the Workbench mod draws its button icon, so the two buttons match.
export function compactIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" style="stroke:${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/></svg>`
}

// A tool's icon; while it runs, an arc circles it.
export function toolIcon(kind: Kind, color: string, isRunning: boolean): string {
  const stroke = `<g fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[kind]}</g>`

  if (!isRunning) {
    return svg(16, '', stroke)
  }

  const shrunk = `<g transform="translate(5 5) scale(.58)">${stroke}</g>`
  const arc = `<circle class="spin" cx="12" cy="12" r="10.5" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="18 48"/>`

  return svg(16, SPIN, shrunk + arc)
}

export type SpinnerMode = 'requesting' | 'responding' | 'thinking' | 'tool-input' | 'tool-use'

// One still icon per thing the turn is doing: an orb while it thinks, an arc while a
// tool runs, bars while it writes, dots while it waits. No motion: the desktop redraws
// the row on every step, and an animation there replays and distracts.
export function spinnerIcon(mode: SpinnerMode, color: string): string {
  const fill = `fill="${color}"`

  switch (mode) {
    case 'thinking':
      return svg(
        20,
        '',
        `<circle cx="12" cy="12" r="7" fill="none" stroke="${color}" stroke-opacity=".3" stroke-width="1"/><circle cx="12" cy="12" r="4" ${fill}/>`,
      )
    case 'tool-use':
      return svg(
        20,
        '',
        `<circle cx="12" cy="12" r="8" fill="none" stroke="${color}" stroke-opacity=".18" stroke-width="2"/><circle cx="12" cy="12" r="8" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-dasharray="14 40" transform="rotate(-90 12 12)"/>`,
      )
    case 'responding':
      return svg(
        20,
        '',
        (
          [
            [5, 8],
            [10.5, 14],
            [16, 10],
          ] as const
        )
          .map(([x, height]) => `<rect x="${x}" y="${19 - height}" width="3" height="${height}" rx="1.5" ${fill}/>`)
          .join(''),
      )
    default:
      return svg(
        20,
        '',
        (
          [
            [6, 0.45],
            [12, 0.7],
            [18, 1],
          ] as const
        )
          .map(([x, opacity]) => `<circle cx="${x}" cy="13" r="2.2" ${fill} fill-opacity="${opacity}"/>`)
          .join(''),
      )
  }
}
