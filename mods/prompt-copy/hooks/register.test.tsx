import { expect, mock, test } from 'claude-code/testing'

const prompt = (text: string, kind: 'composer' | 'task-notification' = 'composer') =>
  ({ component: 'UserMessage', requestId: 'msg-1', props: { text, origin: { kind }, isExpanded: false } }) as const

test('a copy icon under your prompt copies it exactly, shows a check for 1.2 s; skins box kept', async ($, on) => {
  const clock = mock.clock(on)
  const copied: string[] = []
  // What skins draws beneath: its own prompt box.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="skins-box" />
  })
  on('ui.copy', (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  const text = 'fix the jump\n  and keep "quotes" & tabs\t'
  const ui = await $.ui.mount({ plugin: 'prompt-copy', surface: 'desktop', ...prompt(text) })
  const alt = async () => (await ui.find({ type: 'Svg' }))?.props.alt
  expect(await ui.find({ key: 'skins-box' })).toBeDefined()
  expect(await alt()).toBe('Copy message')
  await ui.press({ key: 'pc-copy' })
  expect(copied).toEqual([text])
  expect(await alt()).toBe('Copied')
  await clock.advance(1199)
  expect(await alt()).toBe('Copied')
  await clock.advance(1)
  expect(await alt()).toBe('Copy message')
  await ui.unmount()
})

test('the icon is hidden until the pointer is over the prompt, in a row that is always there', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="skins-box" />
  })
  const ui = await $.ui.mount({ plugin: 'prompt-copy', surface: 'desktop', ...prompt('hi') })
  type El = { type?: string; props?: Record<string, unknown>; hover?: unknown; children?: El[] }
  const root = (await ui.drawn()) as El
  // The keyed row is the hover scope: skins' box, then the icon's row.
  expect(root.props?.key).toBe('pc-row')
  const [box, iconRow] = root.children ?? []
  expect(box?.props?.key).toBe('skins-box')
  expect(iconRow?.props).toEqual({ height: 1, flexDirection: 'row' })
  const slot = iconRow?.children?.[0]
  expect(slot?.props?.display).toBe('none')
  expect(slot?.hover).toEqual({ display: 'flex' })
  await ui.unmount()
})

test('no icon on the terminal or on rows that are not your prompts', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="theirs" />
  })
  for (const [surface, row] of [
    ['terminal', prompt('hi')],
    ['desktop', prompt('a task finished', 'task-notification')],
    ['desktop', prompt('   ')],
  ] as const) {
    const ui = await $.ui.mount({ plugin: 'prompt-copy', surface, ...row })
    expect(await ui.find({ key: 'theirs' })).toBeDefined()
    expect(await ui.find({ key: 'pc-copy' })).toBeUndefined()
    await ui.unmount()
  }
})
