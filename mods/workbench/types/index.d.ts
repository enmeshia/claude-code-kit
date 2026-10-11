/* The Workbench pane */
/** One file Claude read or edited this session; `active` while the tool runs. */
export type Touch = { path: string; kind: 'read' | 'edited'; active: boolean; at: number }
/** What Claude did last in the turn under way: `busy` from the prompt to the end of the turn; `kind` the last file read or edit, command or search; `since` when the turn began. */
export type Activity = { busy: boolean; kind?: 'read' | 'edited' | 'run' | 'search'; label?: string; path?: string; since?: number }
/** One directory entry as the tree shows it. */
export type Entry = { name: string; dir: boolean; size: number }
export type Files = {
  /** The folder the tree shows, absolute. */
  root: string
  /** The session's folder, where "Back to project" returns. */
  project: string
  expanded: string[]
  dirs: Record<string, Entry[]>
  showSizes: boolean
  showHidden: boolean
  query: string
  /** Every file under root, relative, read once a search starts. */
  all: string[]
}
export type Git = { isRepo: boolean; branch: string; top: string; dirty: string[] }
/** `sections`: which of the pane's cards are open (kept across sessions in the store). */
export type WorkbenchUi = { sections?: Partial<Record<SectionKey, boolean>> }
export type SectionKey = 'files' | 'deck' | 'foryou' | 'plan' | 'tracks' | 'handoffs' | 'research'

/* Our docs flow, read only: .claude/plans, .claude/handoff, .claude/research and their done/ folders */
export type DocPhase = { n: number; name: string; size: string; optional: boolean; gate?: string; state: 'done' | 'doing' | 'todo' | 'optional' }
export type DocPlan = {
  file: string
  title: string
  /** The title before its colon: "Stepped levels test". */
  short: string
  track: string
  /** "8 Oct", from the file name. */
  day: string
  /** YYYY-MM-DD, for sorting. */
  key: string
  phases: DocPhase[]
  /** Phases done, from the log's `## Phase N done` headings. */
  done: number
  /** "not started", "phase 4 next", "waits on you at Gate A". */
  state: string
  /** A phase is done, or the log has an entry. */
  started: boolean
  /** When the log last changed (ms), 0 without a log. */
  logAt: number
  /** A gate phase done whose answer is not in the log yet. */
  waiting?: { gate: string; after: number }
  next?: { n: number; name: string; size: string }
}
export type DocDone = { file: string; title: string; key: string; day: string; track: string; failed: boolean; note: string }
export type DocHandoff = { file: string; title: string; key: string; day: string; track: string }
export type DocResearch = { file: string; title: string; key: string; day: string; track: string; question: string }
export type Docs = {
  status: 'idle' | 'ready'
  /** The folder holding `.claude/`. */
  root: string
  tracks: string[]
  plans: DocPlan[]
  donePlans: DocDone[]
  handoffs: DocHandoff[]
  doneHandoffs: DocDone[]
  research: DocResearch[]
}
export type DocsUi = { phasesOpen: boolean; callsPage: number; researchPage: number; track: string | null }

/* The current-status skill's report (moved from the Project status mod) */
export type Tone = 'ok' | 'warn' | 'info'
export type TrackState = 'active' | 'waiting' | 'ready' | 'idle'
export type StatusData = {
  headline: string
  chips: { text: string; tone: Tone }[]
  next: string
  question: string
  repo: { text: string; tone: Tone }[]
  tracks: { name: string; state: TrackState; stands: string[]; next: string }[]
  calls: { title: string; detail: string; where: string }[]
}
export type Facts = { branch: string; sync: string; fetched: string; changed: number; prs: number; worktrees: number }
/** `at`: "DD-MM-YYYY HH:MM", when the model wrote it. */
export type Report = { text: string; at: string; data: StatusData | null; facts: Facts | null }
export type StatusRun = { phase: 'idle' | 'loading' | 'error'; error: string; report: Report | null }
/** Live repo facts for the Files box: "synced" or "1 ahead", the last fetch as "HH:MM" or a date, the worktree count. */
export type Repo = { sync: string; fetched: string; worktrees: number }

/* The Flightdeck card (adapted from claude-flightdeck, MIT, Stephen Casella) */
export type DeckMoment = 'before a plan' | 'error repeats' | 'before done'
export type DeckMain = { model: string; effort: string; mode: string; steps: number; isRunning: boolean }
export type DeckUsage = {
  pct: number | null
  tokens: number | null
  window: number
  limits: { kind: string; pct: number }[]
  compactions: number
  lastCompactAt: number | null
}
export type DeckConsult = { id: string; at: number; endAt: number | null; moment: DeckMoment; via: string }
export type DeckArchitect = { consults: DeckConsult[]; ids: string[]; seen: string[]; lastAdvice: string }
export type DeckToolNote = { tool: string; text: string; isError: boolean }
export type DeckAgent = {
  id: string
  type: string
  model: string
  description: string
  status: string
  spawnedAt: number
  endedAt: number | null
  /** The agent's context now: input + cache read + cache write of its latest step. */
  ctx: number
  /** Output tokens summed over its steps. */
  out: number
  steps: number
  lastStop: string | null
  tools: DeckToolNote[]
  answer: string
}
/** A model loop whose id matches no card: a workflow agent, a compaction or a memory fork. */
export type DeckLoop = { id: string; steps: number; firstAt: number; lastAt: number; isDone: boolean }
export type DeckTurn = { edits: number; errorStreak: number; errors: number; isReviewing: boolean; startedAt: number }
export type DeckReceipt = { durationMs: number; agents: number; edits: number; errors: number; reason: string }
/** `expanded`: the agent whose tool calls and answer show; `page`: the agent list's page, five a page. */
export type DeckView = { expanded: string | null; page: number }
export type DeckRoster = { architectTypes: string[] }

declare module 'claude-code' {
  interface PluginState {
    workbench: {
      files: Files
      git: Git
      touched: Touch[]
      activity: Activity
      bench: WorkbenchUi
      deckMain: DeckMain
      deckUsage: DeckUsage
      deckArchitect: DeckArchitect
      deckAgents: DeckAgent[]
      deckLoops: DeckLoop[]
      deckTurn: DeckTurn
      deckReceipt: DeckReceipt | null
      deckView: DeckView
      deckRoster: DeckRoster
      docs: Docs
      docsUi: DocsUi
      status: StatusRun
      repo: Repo
    }
  }
}
