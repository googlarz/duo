import { expect, mock, test } from 'claude-code/testing'
import type { Engine, On } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { capRows, isStalled, isSuperseded, needsOf, planSvg, tally, taskRowsOf, verdictOf } from './register'

const PROGRESS = 'mcp__duo-progress__progress'
const STEP = 'mcp__duo-progress__step'
const RECEIPT = 'mcp__duo-progress__receipt'
const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }

const mk = (o: Partial<AgentRun>): AgentRun =>
  ({ id: 'x', type: 'general-purpose', description: 'Job', model: 'claude-sonnet-5-5', status: 'running', startedAt: 0, lastAt: 0, contextTokens: 0, contextMax: 1, tokens: 0, costUsd: 0, steps: 0, round: 1, ...o }) as AgentRun

const spawn = ($: Engine, id: string, description: string, type = 'duo:duo-low', background = false) =>
  $.agent.spawn({ tool_use_id: id, prompt: 'p', description, subagentType: type, provider: 'engine', parentModel: 'claude-sonnet-5-5', background, fork: false } as never)

const setup = (on: On, withId = true) => {
  const st = { t: 1000, deny: false }
  on('clock.now', () => ({ value: st.t }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => (st.deny ? { deny: 'blocked by a hook' } : { model: 'claude-sonnet-5-5', ...(withId ? { agentId: e.tool_use_id } : {}) }) as never)
  on('turn.complete', () => ({ text: 'ok' }) as never)
  on('session.usage', () => ({ value: { rateLimits: [{ kind: 'five_hour', percentUsed: 10 }] } }) as never)
  return st
}

const receipt = async ($: Engine): Promise<string> => String(((await $.tool.call({ tool: RECEIPT } as never)) as { result: string }).result)
const bandSrc = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: 'duo-progress', surface: 'desktop', component: 'AbovePrompt', props: band })
  const src = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  await ui.unmount()
  return src
}
const drawn = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: 'duo-progress', surface: 'desktop', component: 'Pane', requestId: 'duo-agents', props: pane })
  const src = (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')
  await ui.unmount()
  return src
}
const settle = () => new Promise(r => setTimeout(r, 30))

// ---- 1. verdict words ----

test('verdictOf: for a checker, accept and approve are a pass; return, escalate, rework, partial and fail are a fail', () => {
  for (const type of ['duo-reviewer', 'duo:duo-advisor', 'duo-verifier']) {
    for (const w of ['PASS', 'Accept', 'accepted', 'APPROVE', 'approved', '**Approve** with changes', 'Approve - with changes']) expect(verdictOf(`${w}\n\nbecause`, type)).toBe('pass')
    for (const w of ['FAIL', 'Return', 'returned', 'Escalate', 'Rework', 'PARTIAL: the tests were not run', 'partial']) expect(verdictOf(`${w}\n\nbecause`, type)).toBe('fail')
  }
  expect(verdictOf('PASS\nlater I looked again\nFAIL: the diff is wrong', 'duo-reviewer')).toBe('fail') // the last PASS or FAIL line wins
  expect(verdictOf('Return: nope\nAccept', 'duo-reviewer')).toBe('fail') // a checker word counts on the first line only
  expect(verdictOf('The reviewer would accept it', 'duo-reviewer')).toBeUndefined() // not at the start of a line
  expect(verdictOf('Returns the value', 'duo-reviewer')).toBeUndefined() // a longer word is not the verdict word
})

test('verdictOf: a PASS or FAIL line decides; later prose and plan lines never override it', () => {
  for (const type of ['duo-reviewer', 'duo:duo-advisor', 'duo-verifier']) {
    expect(verdictOf('FAIL: the test is missing.\n\nAccept once the test is added.', type)).toBe('fail')
    expect(verdictOf('PASS\n- Return type is loose, but fine', type)).toBe('pass')
    expect(verdictOf('**PASS**\nReturn the value earlier next time', type)).toBe('pass')
  }
})

test('verdictOf: an advisor plan has no verdict, however its later lines start', () => {
  const plan = 'Plan for the parser:\n1. Split the lexer\n- Escalate to duo-xhigh if the grammar is ambiguous\n### Rework the CLI wiring\nReturn early on empty input'
  expect(verdictOf(plan, 'duo:duo-advisor')).toBeUndefined()
  expect(verdictOf('- Escalate to duo-xhigh if it is slow', 'duo-advisor')).toBeUndefined() // a bullet is not a verdict
  expect(verdictOf('### Rework the wiring', 'duo-advisor')).toBeUndefined() // nor is a heading
  expect(verdictOf('Accept once the test is added.', 'duo-reviewer')).toBeUndefined() // mid-prose, not a lone word
  expect(verdictOf('Return type is loose', 'duo-reviewer')).toBeUndefined()
  expect(verdictOf('\n\n  Rework: the wiring is wrong\nPlan follows', 'duo-reviewer')).toBe('fail') // first non-empty line, colon after the word
  expect(verdictOf('Approve - looks right', 'duo-reviewer')).toBe('pass') // a dash after the word
})

test('verdictOf: any other agent keeps the plain PASS / FAIL rule, so "Partial results" is no FAIL badge', () => {
  for (const type of ['duo-high', 'duo:duo-low', 'duo-flow-light', 'general-purpose', undefined]) {
    for (const w of ['Partial results: two of three files done', 'Accepted the change', 'Approve', 'Returned the list', 'Rework needed']) expect(verdictOf(w, type)).toBeUndefined()
    expect(verdictOf('PASS\nall good', type)).toBe('pass')
    expect(verdictOf('FAIL: the build broke', type)).toBe('fail')
  }
})

test('verdict: a worker that answers "Partial results" shows no badge, a reviewer that says partial shows FAIL', async ($, on) => {
  setup(on)
  await spawn($, 'w1', 'Worker job', 'duo:duo-high')
  await spawn($, 'r1', 'Review job', 'duo:duo-reviewer')
  await $.turn.complete({ agentId: 'w1', reason: 'answer', answer: 'Partial results: two of three files' } as never)
  await $.turn.complete({ agentId: 'r1', reason: 'answer', answer: 'Partial: the tests were not run' } as never)
  const text = await receipt($)
  expect(text).toMatch(/Worker job[^\n]*\| done \|/)
  expect(text).toMatch(/Review job[^\n]*done \(FAIL\)/)
})

// ---- 2. an interrupted run is stopped, not failed ----

test('stopped: an interrupted run is a stopped card and leaves the failed count and the warning band; max_turns stays failed', async ($, on) => {
  setup(on)
  await spawn($, 's1', 'Long job', 'general-purpose')
  await spawn($, 's2', 'Capped job', 'general-purpose')
  await $.turn.complete({ agentId: 's1', reason: 'interrupted', answer: '' } as never)
  await $.turn.complete({ agentId: 's2', reason: 'max_turns', answer: '' } as never)
  const md = await receipt($)
  expect(md).toContain('| stopped |')
  expect(md).toContain('| failed |')
  expect(await bandSrc($)).toContain('⚠ 1') // only the capped job needs a look
  const src = await drawn($)
  expect(src).toContain('stopped')
  expect(src).toContain('error')
})

test('stopped: tally counts it apart, needsOf and the card word follow', () => {
  const s = { ...mk({ id: 's', status: 'failed', endedAt: 5 }), stopped: true } as AgentRun
  const f = mk({ id: 'f', description: 'Other', status: 'failed', endedAt: 5 })
  expect(tally([s, f])).toMatchObject({ failed: 1, stopped: 1 })
  expect(needsOf([s, f], 10).map(n => n.a.id)).toEqual(['f'])
  const src = planSvg(480, taskRowsOf(null, [s]), 5000).source
  expect(src).toContain('stopped')
  expect(src).not.toContain('>error<')
})

// ---- 3. false stalls ----

test('isStalled: the slow tiers (xhigh, max, Opus, Fable) get the long allowance, light ones do not', () => {
  const at = 5 * 60_000
  for (const type of ['duo-xhigh', 'duo:duo-max', 'duo-opus', 'duo:duo-fable']) {
    expect(isStalled(mk({ type, lastAt: 0 }), at)).toBe(false)
    expect(isStalled(mk({ type, lastAt: 0 }), 11 * 60_000)).toBe(true)
  }
  for (const type of ['duo-low', 'duo-medium', 'duo-high', 'general-purpose']) expect(isStalled(mk({ type, lastAt: 0 }), at)).toBe(true)
})

test('in-flight calls: the first of two parallel tool calls ending does not make the agent look idle', async ($, on) => {
  const st = setup(on)
  const gates: (() => void)[] = []
  on('tool.call', () => new Promise(res => gates.push(() => res({ result: 'ok' }))) as never)
  await spawn($, 'a1', 'Build it')
  const c1 = $.tool.call({ tool: 'Bash', agentId: 'a1', command: 'make' } as never)
  const c2 = $.tool.call({ tool: 'Bash', agentId: 'a1', command: 'test' } as never)
  await settle()
  gates[0]()
  await c1
  st.t += 4 * 60_000
  await spawn($, 'z1', 'Decoy one') // moves the panel's clock
  expect(await drawn($)).not.toContain('stalled') // one call is still running
  gates[1]()
  await c2
  st.t += 4 * 60_000
  await spawn($, 'z2', 'Decoy two')
  expect(await drawn($)).toContain('stalled') // nothing runs and nothing was heard for four minutes
})

// ---- 4. accepted / returned ----

const REVIEWED = (a: boolean | undefined, b: boolean | undefined) => ({
  tool: PROGRESS,
  title: 'Review job',
  phase: 'delegate',
  tasks: [
    { title: 'Part A', tier: 'duo-low', accepted: a },
    { title: 'Part B', tier: 'duo-low', accepted: b },
  ],
})

test('accepted: the bar counts the accepted tasks, a returned one is marked on its card', async ($, on) => {
  setup(on)
  await $.tool.call(REVIEWED(true, false) as never)
  await spawn($, 'pa', 'Part A')
  await spawn($, 'pb', 'Part B')
  await $.turn.complete({ agentId: 'pa', reason: 'answer', answer: 'done' } as never)
  await $.turn.complete({ agentId: 'pb', reason: 'answer', answer: 'done' } as never)
  expect(await bandSrc($)).toContain('Tasks 1/2') // both agents finished, one task accepted
  const src = await drawn($)
  expect(src.split('returned').length - 1).toBe(1) // only Part B
})

test('accepted: with no task marked, the bar counts the finished agents as before', async ($, on) => {
  setup(on)
  await $.tool.call(REVIEWED(undefined, undefined) as never)
  await spawn($, 'pa', 'Part A')
  await spawn($, 'pb', 'Part B')
  await $.turn.complete({ agentId: 'pa', reason: 'answer', answer: 'done' } as never)
  await $.turn.complete({ agentId: 'pb', reason: 'answer', answer: 'done' } as never)
  expect(await bandSrc($)).toContain('Tasks 2/2')
  expect(await drawn($)).not.toContain('returned')
})

// ---- 5. a finished flow ----

test('finished flow: a bare progress call neither blanks it nor resets the usage baseline', async ($, on) => {
  setup(on)
  await $.tool.call({ tool: PROGRESS, title: 'Old job', phase: 'delegate', tasks: [{ title: 'Old work', tier: 'duo-low' }] } as never)
  await spawn($, 'w1', 'Old work')
  await $.turn.complete({ agentId: 'w1', reason: 'answer', answer: 'done' } as never)
  await $.tool.call({ tool: PROGRESS, finished: true } as never)
  const before = await receipt($)
  expect(await $.tool.call({ tool: PROGRESS, done: 1 } as never)).toMatchObject({ result: 'ok: Done' })
  expect(await $.tool.call({ tool: PROGRESS, finished: true } as never)).toMatchObject({ result: 'ok: Done' })
  expect(await receipt($)).toBe(before)
  const row = await bandSrc($)
  expect(row).toContain('Old job')
  expect(row).toContain('Done')
})

test('finished flow: the next job, started by an agent alone, shows and receipts only its own agents', async ($, on) => {
  const st = setup(on)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await $.tool.call({ tool: PROGRESS, title: 'Job one', phase: 'delegate', tasks: [{ title: 'Old work', tier: 'duo-low' }] } as never)
  await spawn($, 'w1', 'Old work')
  st.t += 5000
  await $.turn.complete({ agentId: 'w1', reason: 'answer', answer: 'done' } as never)
  await $.tool.call({ tool: PROGRESS, finished: true } as never)
  st.t += 5000
  await $.tool.call({ tool: 'Agent', subagent_type: 'duo:duo-low' } as never)
  await spawn($, 'w2', 'New work')
  const md = await receipt($)
  expect(md).toContain('New work')
  expect(md).not.toContain('Old work')
  expect(await drawn($)).not.toContain('Old work')
})

test('finished flow: a new titled plan starts clean', async ($, on) => {
  setup(on)
  await $.tool.call({ tool: PROGRESS, title: 'Job one', phase: 'delegate', total: 1 } as never)
  await $.tool.call({ tool: PROGRESS, finished: true } as never)
  expect(await $.tool.call({ tool: PROGRESS, title: 'Job two', phase: 'delegate', tasks: [{ title: 'A', tier: 'duo-low' }, { title: 'B', tier: 'duo-low' }] } as never)).toMatchObject({ result: 'ok: Tasks 0/2' })
})

// ---- 6. spawn, rounds, retries, the row cap ----

test('agent.spawn: a host that gives no agentId is matched on the tool_use_id', async ($, on) => {
  setup(on, false)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await spawn($, 'tu1', 'No id job')
  expect(await $.tool.call({ tool: STEP, agentId: 'tu1', done: 1, total: 2, note: 'half way' } as never)).toMatchObject({ result: 'ok' })
  await $.tool.call({ tool: 'Write', agentId: 'tu1', file_path: '/x/a.py' } as never)
  await $.turn.complete({ agentId: 'tu1', reason: 'answer', answer: 'PASS all good' } as never)
  const md = await receipt($)
  expect(md).toContain('done (PASS)')
  expect(md).toContain('| done (PASS) | 2/2 |') // the step report found its row
  expect(md).toContain('- Files: /x/a.py')
})

test('round: counts only earlier failed tries of the same task, not a parallel run', async ($, on) => {
  const st = setup(on)
  await spawn($, 'p1', 'Same task')
  await spawn($, 'p2', 'Same task') // parallel with the first
  expect(await drawn($)).not.toContain('round 2')
  st.t += 5000
  await $.turn.complete({ agentId: 'p1', reason: 'error', answer: '' } as never)
  await $.turn.complete({ agentId: 'p2', reason: 'error', answer: '' } as never)
  st.t += 5000
  await spawn($, 'p3', 'Same task')
  expect(await drawn($)).toContain('round 3') // two failed tries before it
})

test('isSuperseded: only a later run that started after the failure fades it, and titles match loosely', () => {
  const failed = mk({ id: 'f', description: 'Fix the bug!', status: 'failed', startedAt: 100, endedAt: 200 })
  expect(isSuperseded(failed, [failed, mk({ id: 'retry', description: 'fix  the bug', startedAt: 250 })])).toBe(true)
  expect(isSuperseded(failed, [failed, mk({ id: 'par', description: 'Fix the bug', startedAt: 150 })])).toBe(false) // started while it was still going
  expect(isSuperseded(failed, [failed, mk({ id: 'old', description: 'Fix the bug', startedAt: 50 })])).toBe(false) // earlier
  expect(isSuperseded(failed, [failed, mk({ id: 'other', description: 'Something else', startedAt: 250 })])).toBe(false)
  expect(isSuperseded({ ...failed, status: 'done' }, [failed, mk({ id: 'retry', description: 'Fix the bug', startedAt: 250 })])).toBe(false)
})

test('capRows: over 200 rows the oldest finished go first and a running one is never dropped', () => {
  const rows = Array.from({ length: 205 }, (_, i) => mk({ id: `r${i}`, status: i < 5 ? 'running' : 'done', startedAt: i }))
  const out = capRows(rows)
  expect(out.length).toBe(200)
  expect(out.slice(0, 5).map(a => a.status)).toEqual(['running', 'running', 'running', 'running', 'running']) // the oldest rows, but running
  expect(out.some(a => a.id === 'r5')).toBe(false) // the oldest finished one went
  expect(out.some(a => a.id === 'r204')).toBe(true)
  const busy = Array.from({ length: 203 }, (_, i) => mk({ id: `b${i}` }))
  expect(capRows(busy).length).toBe(203)
  const same = rows.slice(0, 10)
  expect(capRows(same)).toBe(same)
})

// ---- 7. a step after the end ----

const stepEvent = async ($: Engine, agentId: string) => {
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId })
  for await (const _ of stream) void _
}
const stepUsage = (on: On) =>
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-sonnet-5-5', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })

test('turn.step after turn.complete: a straggler does not revive the finished row, a later request does and wipes the old verdict', async ($, on) => {
  const st = setup(on)
  stepUsage(on)
  await spawn($, 'r1', 'Check it', 'duo:duo-verifier')
  await $.turn.complete({ agentId: 'r1', reason: 'answer', answer: 'PASS fine' } as never)
  await stepEvent($, 'r1') // the same instant: the run's own last request
  let md = await receipt($)
  expect(md).toContain('done (PASS)')
  st.t += 60_000
  await stepEvent($, 'r1') // a minute later: it was resumed
  md = await receipt($)
  expect(md).toContain('| running |')
  expect(md).not.toContain('PASS')
  expect(md).not.toContain('- Result:')
})

test('turn.step after turn.complete: a resumed agent of an implicit flow reopens the flow', async ($, on) => {
  const st = setup(on)
  stepUsage(on)
  await spawn($, 'g1', 'Loose job', 'general-purpose')
  await $.turn.complete({ agentId: 'g1', reason: 'answer', answer: 'ok' } as never)
  expect(await bandSrc($)).toContain('Done')
  st.t += 60_000
  await stepEvent($, 'g1')
  expect(await bandSrc($)).toContain('Tasks 0/1')
})

// ---- 8. the implicit flow ----

test('implicit flow: three agents started in one tick are all counted, from the earliest start', async ($, on) => {
  let t = 1000
  on('clock.now', () => ({ value: t++ }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await Promise.all([spawn($, 'a', 'Job a', 'general-purpose'), spawn($, 'b', 'Job b', 'general-purpose'), spawn($, 'c', 'Job c', 'general-purpose')])
  expect(await bandSrc($)).toContain('Tasks 0/3')
  const md = await receipt($)
  expect(md).toContain('3 agents')
  for (const j of ['Job a', 'Job b', 'Job c']) expect(md).toContain(j)
})

// ---- 9. the step tool ----

test('step tool: more than thirty steps still show the latest note; an unknown agent is ignored', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'Long job')
  for (let i = 0; i <= 35; i++) await $.tool.call({ tool: STEP, agentId: 'a1', done: i, total: 40, note: `step ${i}` } as never)
  const src = await drawn($)
  expect(src).toContain('step 35')
  expect(src).toContain('30/30')
  expect(await $.tool.call({ tool: STEP, agentId: 'nobody', done: 1 } as never)).toMatchObject({ result: expect.stringMatching(/^ignored/) })
  expect(await $.tool.call({ tool: STEP, done: 1 } as never)).toMatchObject({ result: expect.stringMatching(/^ignored/) })
})

// ---- 10. gaps ----

test('background spawn: the flow keeps counting the agent as running after the Agent call returned', async ($, on) => {
  setup(on)
  on('tool.call', () => ({ result: 'launched' }) as never)
  await $.tool.call({ tool: PROGRESS, title: 'Bg job', phase: 'delegate' } as never)
  await $.tool.call({ tool: 'Agent', subagent_type: 'duo:duo-low' } as never) // returns at once for a background agent
  await spawn($, 'bg1', 'Work in the background', 'duo:duo-low', true)
  expect(await bandSrc($)).toContain('Tasks 0/1') // counted from the rows: still working, not 0 running
  await $.turn.complete({ agentId: 'bg1', reason: 'answer', answer: 'done' } as never)
  expect(await bandSrc($)).toContain('Tasks 1/1')
})

test('denied spawn: no row is made and nothing is reported', async ($, on) => {
  const st = setup(on)
  st.deny = true
  await spawn($, 'd1', 'Denied job')
  expect(await receipt($)).toBe('No run to report yet.')
  expect(await drawn($)).not.toContain('Denied job')
})

test('receipts: the store keeps the last ten runs, newest first', async ($, on) => {
  const saved: Record<string, unknown> = {}
  const st = setup(on)
  on('store.get', (_$, e) => ({ value: saved[(e as unknown as { key: string }).key] }) as never)
  on('store.set', (_$, e) => {
    saved[(e as unknown as { key: string }).key] = (e as unknown as { value: unknown }).value
    return { value: undefined } as never
  })
  for (let i = 0; i < 12; i++) {
    st.t += 10 * 60_000
    await $.tool.call({ tool: PROGRESS, title: `Run ${i}`, phase: 'delegate', tasks: [{ title: `Task ${i}`, tier: 'duo-low' }] } as never)
    await spawn($, `k${i}`, `Task ${i}`)
    await $.turn.complete({ agentId: `k${i}`, reason: 'answer', answer: 'done' } as never)
    await $.tool.call({ tool: PROGRESS, finished: true } as never)
  }
  const list = saved.receipts as { title: string }[]
  expect(list.length).toBe(10)
  expect(list[0].title).toBe('Run 11')
  expect(list[9].title).toBe('Run 2')
})

const startSession = async ($: Engine, on: On, language: unknown, lang: string) => {
  mock.store(on)
  mock.env(on, { LANG: lang })
  on('settings.read', async () => ({ value: language === undefined ? {} : { language } }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
}

test('session.start twice (resume, clear): one ticker, not two', async ($, on) => {
  let every = 0
  on('clock.now', () => ({ value: 5000 }))
  on('clock.every', () => {
    every++
    return { value: 1 } as never
  })
  await startSession($, on, undefined, 'en_US.UTF-8')
  await $.session.start({ source: 'resume', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.session.start({ source: 'clear', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  expect(every).toBe(1)
})

// The language is module state that session.start sets: each test ends by setting English again.
test('detectLang: the settings language, then the locale, else English; the new words follow', async ($, on) => {
  on('clock.now', () => ({ value: 5000 }))
  on('clock.every', () => ({ value: 1 }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
  let settings: unknown
  let locale = 'en_US.UTF-8'
  mock.store(on)
  on('env.get', (_$, e) => ({ value: (e as unknown as { name?: string; key?: string }).name === 'LANG' || (e as unknown as { key?: string }).key === 'LANG' ? locale : undefined }) as never)
  on('settings.read', async () => ({ value: settings === undefined ? {} : { language: settings } }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  const start = () => $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await spawn($, 'l1', 'Lang job')
  await $.turn.complete({ agentId: 'l1', reason: 'interrupted', answer: '' } as never)
  try {
    settings = 'Russian'
    await start()
    expect(await drawn($)).toContain('остановлен')
    settings = undefined
    locale = 'he_IL.UTF-8'
    await start()
    expect(await drawn($)).toContain('נעצר')
    settings = 'en'
    await start()
    expect(await drawn($)).toContain('stopped')
  } finally {
    settings = 'en'
    await start()
  }
})
