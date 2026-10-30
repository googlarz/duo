export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
  /** The orchestrator's own reason for this tier, as it wrote it. */
  why?: string
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
  // A flow the panel made itself for agents started outside a duo flow: it counts them.
  isImplicit?: boolean
  // When it began (ms): it counts the agents started since.
  since?: number
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
  /** Last sign of life: spawn, a model request, a step report or a tool call. */
  lastAt?: number
  /** A tool call is running: a long build is not a stall. */
  busy?: boolean
  /** What the last tool call was doing, in a few words ("editing cart.py"). */
  action?: string
  /** Files the agent edited or wrote, as given. */
  files?: string[]
  /** The start of the agent's final answer. */
  result?: string
  /** For a checker or reviewer: whether its answer opens with PASS or FAIL. */
  verdict?: 'pass' | 'fail'
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
