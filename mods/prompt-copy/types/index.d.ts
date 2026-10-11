/** The prompt row (its message id) whose icon shows the check mark right after a copy; null otherwise. */
export type Copied = string | null

declare module 'claude-code' {
  interface PluginState {
    'prompt-copy': {
      copied: Copied
    }
  }
}
