import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// Prompts the person wrote: typed in the app or the terminal, sent from a phone, or an SDK host's.
const TYPED = new Set(['composer', 'bridge', 'sdk'])

const copiedAtom = atom({ plugin: 'prompt-copy', key: 'copied' } as const, null)

// The app's own copy icon under a reply: Lucide-style "copy" (a square behind a square), a check
// mark for 1.2 s after a copy, in the app's muted gray (#898781, its --cds-gray-400).
const INK = '#898781'
const SHAPES = {
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
} as const
const icon = (name: keyof typeof SHAPES) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SHAPES[name]}</svg>`
const CHECK_MS = 1200
/** The label of a blank button laid over the icon: two em spaces, so the whole icon is clickable. */
const COVER = '  '

// Your prompt with a copy icon under it, shown while the pointer is over the prompt. It wraps
// whatever draws the prompt beneath (skins' box, or the app's own row), so it must load above
// skins: a mod in CLAUDE_CODE_PLUGIN_DIRS does.
export const register: Register = on => {
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || !TYPED.has(e.props.origin.kind) || e.props.text.trim() === '') return next(e)
    const theirs = await next(e)
    const { Box, Button, Svg } = $.ui.resolve(e)
    const text = e.props.text
    const id = e.requestId
    const isCopied = (await read($, copiedAtom)) === id
    const copy = async () => {
      const r = await $.ui.copy({ text, surface: e.surface })
      if (!r.isCopied) return $.ui.toast('Could not copy here')
      await update($, copiedAtom, () => id)
      $.clock.after(CHECK_MS, () => update($, copiedAtom, now => (now === id ? null : now)))
    }
    // The icon's row is always there, so showing the icon moves nothing. The check stays
    // shown for its 1.2 s even when the pointer leaves.
    return (
      <Box key="pc-row" flexDirection="column" alignItems="flex-start">
        {theirs}
        <Box height={1} flexDirection="row">
          <Box
            width={2}
            height={1}
            justifyContent="center"
            alignItems="center"
            {...(isCopied ? {} : { display: 'none' as const, hover: { display: 'flex' as const } })}
          >
            <Svg width={16} height={16} alt={isCopied ? 'Copied' : 'Copy message'} source={icon(isCopied ? 'check' : 'copy')} />
            <Box position="absolute" top={0} left={0} right={0} bottom={0}>
              <Button key="pc-copy" plain label={COVER} onPress={copy} />
            </Box>
          </Box>
        </Box>
      </Box>
    )
  })
}
