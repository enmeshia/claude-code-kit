export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/[\uD800-\uDBFF]$/, '').trimEnd() + '…' : s)

// macOS writes AppleInterfaceStyle = Dark in dark mode and removes the key in light mode.
// A themed variant keeps its suffix: dark-daltonized becomes light-daltonized.
export function themeFor(current: unknown, stdout: string): string {
  const want = stdout.includes('Dark') ? 'dark' : 'light'
  const variant = typeof current === 'string' ? /^(?:light|dark)(-.+)$/.exec(current)?.[1] : undefined

  return want + (variant ?? '')
}
