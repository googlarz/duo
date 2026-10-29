export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
  /** Titles of the planned steps, if the worker gave them. */
  stepPlan?: string[]
  /** One entry per `step` call: `n` steps were done at time `at`, `note` is the step then in progress. */
  stepLog?: { n: number; note: string; at: number }[]
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  /** Grouped view only: the Finished list is open. Absent (closed) in state saved by older versions. */
  isFinishedOpen?: boolean
  autoOpenedFor: string
  /** Agent row ids whose details are expanded. Absent in state saved by older versions. */
  openIds?: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'duo-progress': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
    }
  }
}
