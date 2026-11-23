import { expect, mock, test } from 'claude-code/testing'
import type { Engine, On } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { hasNoReport, isStalled, needsOf, planSvg, taskRowsOf } from './register'

const PROGRESS = 'mcp__duo-progress__progress'
const RECEIPT = 'mcp__duo-progress__receipt'
const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }

const mk = (o: Partial<AgentRun>): AgentRun =>
  ({ id: 'x', type: 'general-purpose', description: 'Job', model: 'claude-sonnet-5-5', status: 'running', startedAt: 0, lastAt: 0, contextTokens: 0, contextMax: 1, tokens: 0, costUsd: 0, steps: 0, round: 1, ...o }) as AgentRun

const spawn = ($: Engine, id: string, description: string, type = 'general-purpose') =>
  $.agent.spawn({ tool_use_id: id, prompt: 'p', description, subagentType: type, provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)

const receipt = async ($: Engine): Promise<string> => String(((await $.tool.call({ tool: RECEIPT } as never)) as { result: string }).result)

// A clock the test moves, and a 5-hour window it sets.
const setup = (on: On) => {
  const st = { t: 1000, pct: 10 }
  on('clock.now', () => ({ value: st.t }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
  on('session.usage', () => ({ value: { rateLimits: [{ kind: 'five_hour', percentUsed: st.pct }] } }) as never)
  return st
}

// ---- 1. a plan that follows agents that ran without one keeps them and their usage ----

test('plan after an Explore: the finished Explore card stays and its usage counts in "This run used"', async ($, on) => {
  const st = setup(on)
  await spawn($, 'e1', 'Explore the repo') // no plan yet: an implicit flow, baseline 10%
  st.t += 5000
  st.pct = 12
  await $.turn.complete({ agentId: 'e1', reason: 'answer', answer: 'mapped' } as never)
  st.t += 2000
  await $.tool.call({ tool: PROGRESS, title: 'Fix the thing', phase: 'delegate', tasks: [{ title: 'Edit code', tier: 'duo-low' }] } as never)
  st.pct = 15
  const md = await receipt($)
  expect(md).toContain('Explore the repo')
  expect(md).toContain('This run used 5%') // 10% -> 15%: the Explore's share is in
})

test('plan after a long pause: the earlier agents are a different job and leave', async ($, on) => {
  const st = setup(on)
  await spawn($, 'e1', 'Explore the repo')
  await $.turn.complete({ agentId: 'e1', reason: 'answer', answer: 'mapped' } as never)
  st.t += 10 * 60_000
  st.pct = 40
  await $.tool.call({ tool: PROGRESS, title: 'A new job', phase: 'delegate', tasks: [{ title: 'Edit code', tier: 'duo-low' }] } as never)
  expect(await receipt($)).toBe('No run to report yet.') // nothing of the old job is left, and the new one has no agent yet
})

test('plan after an advisor: the finished advisor stays; the usage baseline is its start', async ($, on) => {
  const st = setup(on)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await $.tool.call({ tool: 'Agent', subagent_type: 'duo:duo-advisor' } as never) // the placeholder flow, as the hook makes it
  await spawn($, 'adv', 'Advise on the plan', 'duo:duo-advisor')
  st.t += 5000
  st.pct = 13
  await $.turn.complete({ agentId: 'adv', reason: 'answer', answer: 'go on' } as never)
  st.t += 2000
  await $.tool.call({ tool: PROGRESS, title: 'Ship it', phase: 'delegate', tasks: [{ title: 'Build', tier: 'duo-low' }] } as never)
  st.pct = 16
  const md = await receipt($)
  expect(md).toContain('Advise on the plan')
  expect(md).toContain('This run used 6%')
})

test('a running agent always stays through a new plan, as before', async ($, on) => {
  const st = setup(on)
  await spawn($, 'e1', 'Still going')
  st.t += 10 * 60_000
  await $.tool.call({ tool: PROGRESS, title: 'Other job', phase: 'delegate', tasks: [{ title: 'x', tier: 'duo-low' }] } as never)
  expect(await receipt($)).toContain('Still going')
})

// ---- 2. effort on every card ----

test('card: before the first turn step a duo agent shows its tier\'s effort; a reported effort wins', () => {
  const one = (o: Partial<AgentRun>) => planSvg(480, taskRowsOf(null, [mk({ id: 'a', description: 'Build', type: 'duo:duo-high', ...o })]), 5).source
  expect(one({})).toContain('Sonnet 5.5 · high') // the tier's static effort
  expect(one({ effort: 'low' })).toContain('Sonnet 5.5 · low')
  expect(one({ type: 'general-purpose' })).not.toContain('Sonnet 5.5 ·') // an unknown type has none to fall back on
})

test('compact card (more than 24): the status line keeps model and effort in a short form', () => {
  const list = Array.from({ length: 26 }, (_, i) => mk({ id: `c${i}`, description: `Task ${i}`, type: i === 0 ? 'duo:duo-fable' : 'duo:duo-high', model: i === 0 ? 'claude-fable-5-1' : 'claude-sonnet-5-5', effort: i === 1 ? 'low' : undefined }))
  const { source } = planSvg(900, taskRowsOf(null, list), 5)
  expect(source).toContain('Fable·high') // static, no step seen yet
  expect(source).toContain('Sonnet·low') // reported
  expect(source).toContain('Sonnet·high')
  expect(source).not.toContain('Sonnet 5.5 ·') // no long model line in compact mode
})

// ---- 3. gates have no step tool ----

test('isStalled: a gate may think for ten minutes; a worker is stalled after three', () => {
  const at = 5 * 60_000
  for (const type of ['duo:duo-advisor', 'duo-reviewer', 'duo:duo-verifier']) {
    expect(isStalled(mk({ type, lastAt: 0 }), at)).toBe(false)
    expect(isStalled(mk({ type, lastAt: 0 }), 11 * 60_000)).toBe(true)
  }
  expect(isStalled(mk({ type: 'duo:duo-low', lastAt: 0 }), at)).toBe(true)
  expect(needsOf([mk({ type: 'duo:duo-advisor', lastAt: 0 })], at)).toEqual([]) // and the warning band stays quiet
})

test('card: a gate with no tool action says its role and how long it has been thinking', () => {
  const card = (o: Partial<AgentRun>) => planSvg(480, taskRowsOf(null, [mk({ id: 'g', description: 'Review', ...o })]), 65_000).source
  expect(card({ type: 'duo:duo-advisor' })).toContain('advisor · thinking 1:05')
  expect(card({ type: 'duo-reviewer' })).toContain('reviewer · thinking 1:05')
  expect(card({ type: 'duo:duo-verifier' })).toContain('verifier · thinking 1:05')
  expect(card({ type: 'duo:duo-advisor', action: 'reading a.ts' })).toContain('reading a.ts')
  expect(card({ type: 'duo:duo-low' })).not.toContain('thinking') // a worker keeps its elapsed time
})

// ---- 5. an answer with nothing in it ----

test('needsOf: a finished agent with no report is listed after the failed ones', () => {
  const silent = { ...mk({ id: 's', status: 'done', endedAt: 5 }), noReport: true } as AgentRun
  expect(hasNoReport(silent)).toBe(true)
  expect(hasNoReport(mk({ status: 'done', endedAt: 5, result: 'ok' }))).toBe(false)
  expect(hasNoReport({ ...silent, status: 'running' } as AgentRun)).toBe(false)
  const list = [mk({ id: 'q', lastAt: 0 }), silent, mk({ id: 'bad', status: 'failed' })]
  expect(needsOf(list, 4 * 60_000).map(n => [n.a.id, n.kind])).toEqual([['bad', 'failed'], ['s', 'noreport'], ['q', 'stalled']])
})

test('a blank answer ends as a done card marked "no report", counted in the band; a real answer is untouched', async ($, on) => {
  setup(on)
  await spawn($, 'b1', 'Silent job')
  await spawn($, 'b2', 'Talkative job')
  await $.turn.complete({ agentId: 'b1', reason: 'answer', answer: '  \n ' } as never)
  await $.turn.complete({ agentId: 'b2', reason: 'answer', answer: 'all done' } as never)
  const md = await receipt($)
  expect(md).toContain('| done (no report) |')
  expect(md).toContain('| done |') // the other one
  const ui = await $.ui.mount({ plugin: 'duo-progress', surface: 'desktop', component: 'AbovePrompt', props: band })
  expect(String((await ui.find({ type: 'Svg' }))?.props.source ?? '')).toContain('⚠ 1')
  const pane = await $.ui.mount({ plugin: 'duo-progress', surface: 'desktop', component: 'Pane', requestId: 'duo-agents', props: { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } })
  const src = (await pane.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')
  expect(src).toContain('no report')
  expect(src.split('no report').length).toBe(2) // only the silent card says it
})

test('card: a done agent with no report is amber with the words; with a report it is green', () => {
  const silent = { ...mk({ id: 's', description: 'Silent', status: 'done', endedAt: 5000 }), noReport: true } as AgentRun
  const talk = mk({ id: 't', description: 'Talk', status: 'done', endedAt: 5000, result: 'ok' })
  const one = (a: AgentRun) => planSvg(480, taskRowsOf(null, [a]), 5000).source
  expect(one(silent)).toContain('no report · 0:05')
  expect(one(silent)).toContain('#D4A24C')
  expect(one(talk)).not.toContain('no report')
  expect(one(talk)).not.toContain('stroke="#D4A24C"')
})

// ---- 3. a new job never inherits the agents or the usage of an earlier one ----

test('advisor after a finished job: the next plan does not adopt the finished job\'s agents or usage', async ($, on) => {
  const st = setup(on)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await $.tool.call({ tool: PROGRESS, title: 'Job one', phase: 'delegate', tasks: [{ title: 'Old work', tier: 'duo-low' }] } as never)
  await $.tool.call({ tool: 'Agent', subagent_type: 'duo:duo-low' } as never)
  await spawn($, 'w1', 'Old work', 'duo:duo-low')
  st.t += 60_000
  st.pct = 30
  await $.turn.complete({ agentId: 'w1', reason: 'answer', answer: 'done' } as never)
  await $.tool.call({ tool: PROGRESS, finished: true } as never)
  st.t += 2 * 60_000 // well inside the same-job window, but the job is closed
  st.pct = 31
  await $.tool.call({ tool: 'Agent', subagent_type: 'duo:duo-advisor' } as never)
  await spawn($, 'adv', 'Advise job two', 'duo:duo-advisor')
  st.t += 5000
  await $.turn.complete({ agentId: 'adv', reason: 'answer', answer: 'go' } as never)
  await $.tool.call({ tool: PROGRESS, title: 'Job two', phase: 'delegate', tasks: [{ title: 'New work', tier: 'duo-low' }] } as never)
  st.pct = 33
  const md = await receipt($)
  expect(md).not.toContain('Old work')
  expect(md).toContain('Advise job two')
  expect(md).toContain('This run used 2%') // 31% -> 33%, not the old job's 10% -> 33%
})

test('an abandoned advisor, then another advisor hours later: the plan that follows starts at the later one', async ($, on) => {
  const st = setup(on)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await $.tool.call({ tool: 'Agent', subagent_type: 'duo:duo-advisor' } as never)
  await spawn($, 'adv1', 'Old advice', 'duo:duo-advisor')
  st.t += 5000
  await $.turn.complete({ agentId: 'adv1', reason: 'answer', answer: 'go' } as never)
  st.t += 2 * 60 * 60_000
  st.pct = 50
  await $.tool.call({ tool: 'Agent', subagent_type: 'duo:duo-advisor' } as never)
  await spawn($, 'adv2', 'New advice', 'duo:duo-advisor')
  st.t += 5000
  await $.turn.complete({ agentId: 'adv2', reason: 'answer', answer: 'go' } as never)
  await $.tool.call({ tool: PROGRESS, title: 'Job two', phase: 'delegate', tasks: [{ title: 'New work', tier: 'duo-low' }] } as never)
  st.pct = 52
  const md = await receipt($)
  expect(md).not.toContain('Old advice')
  expect(md).toContain('New advice')
  expect(md).toContain('This run used 2%') // 50% -> 52%, not 10% -> 52%
})

test('two advisors close together before a plan are still one job', async ($, on) => {
  const st = setup(on)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await $.tool.call({ tool: 'Agent', subagent_type: 'duo:duo-advisor' } as never)
  await spawn($, 'adv1', 'First advice', 'duo:duo-advisor')
  st.t += 5000
  await $.turn.complete({ agentId: 'adv1', reason: 'answer', answer: 'go' } as never)
  st.t += 60_000
  st.pct = 14
  await $.tool.call({ tool: 'Agent', subagent_type: 'duo:duo-advisor' } as never)
  await spawn($, 'adv2', 'Second advice', 'duo:duo-advisor')
  st.t += 5000
  await $.turn.complete({ agentId: 'adv2', reason: 'answer', answer: 'go' } as never)
  await $.tool.call({ tool: PROGRESS, title: 'Job', phase: 'delegate', tasks: [{ title: 'Work', tier: 'duo-low' }] } as never)
  st.pct = 16
  const md = await receipt($)
  expect(md).toContain('First advice')
  expect(md).toContain('Second advice')
  expect(md).toContain('This run used 6%') // from the first advisor's 10%
})
