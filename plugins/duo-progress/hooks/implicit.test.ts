import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'duo-progress'
const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }

const spawn = ($: Engine, id: string, type = 'general-purpose') =>
  $.agent.spawn({ tool_use_id: id, prompt: 'p', description: `Job ${id}`, subagentType: type, provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)

const row = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  return String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
}

test('implicit flow: agents started outside a duo flow get a bar that counts them', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await spawn($, 'a1')
  await spawn($, 'a2')
  const running = await row($)
  expect(running).toContain('Agents')
  expect(running).toContain('Tasks 0/2')

  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok' } as never)
  expect(await row($)).toContain('Tasks 1/2')
  await $.turn.complete({ agentId: 'a2', reason: 'answer', answer: 'ok' } as never)
  expect(await row($)).toContain('Done')
})

test('implicit flow: a finished flow of an earlier run is replaced when new agents start', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await $.tool.call({ tool: 'mcp__duo-progress__progress', title: 'Old duo run', phase: 'delegate', total: 1 } as never)
  await $.tool.call({ tool: 'mcp__duo-progress__progress', done: 1, finished: true } as never)
  expect(await row($)).toContain('Old duo run')

  await spawn($, 'b1')
  const next = await row($)
  expect(next).toContain('Agents')
  expect(next).not.toContain('Old duo run')
})

test('implicit flow: a duo flow in progress is left alone', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  await $.tool.call({ tool: 'mcp__duo-progress__progress', title: 'Live duo run', phase: 'delegate', total: 3 } as never)
  await spawn($, 'c1')
  const r = await row($)
  expect(r).toContain('Live duo run')
  expect(r).not.toContain('Agents')
})
