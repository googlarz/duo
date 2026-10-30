import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'duo-progress'
const STEP = 'mcp__duo-progress__step'
const PROGRESS = 'mcp__duo-progress__progress'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

const spawn = async ($: Engine, on: On, subagentType: string, model = 'claude-sonnet-5-5') => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model, agentId: 'a1' }))
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Do the thing', subagentType, provider: 'engine', parentModel: model, background: false, fork: false } as never)
}

const mount = ($: Engine) => $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'duo-agents', props: pane })

// The row's dim line reads "<tier word or raw type> · <model>".
const TIERS: readonly [type: string, shown: RegExp][] = [
  ['duo:duo-high', /duo-high · /],
  ['duo-opus', /duo-opus · /],
  ['duo:duo-reviewer', /duo-reviewer · /],
  ['savvy-flow:savvy-careful', /careful · /], // legacy names still recognised
  ['duo-flow:duo-flow-careful', /careful · /],
  ['duo-flow-light', /light · /],
  ['savvy-light', /light · /],
  ['duo-high', /duo-high · /], // bare, without the plugin prefix
]
for (const [type, shown] of TIERS) {
  test(`tier: ${type} is recognised`, async ($, on) => {
    await spawn($, on, type)
    expect(await (await mount($)).find({ type: 'Text', text: shown })).toBeDefined()
  })
}

test('tier: an unknown agent type stays other and shows its raw type', async ($, on) => {
  await spawn($, on, 'duo:duo-bogus')
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /duo:duo-bogus · / })).toBeDefined()
})

test('tier: a planned duo task shows its tier and model', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.tool.call({ tool: PROGRESS, title: 'F', phase: 'delegate', tasks: [{ title: 'Gate', tier: 'duo-reviewer' }] } as never)
  expect(await (await mount($)).find({ type: 'Text', text: /duo-reviewer · Opus · high/ })).toBeDefined()
})

test('tier: a plugin-prefixed planned tier is kept; an unknown one stays empty', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.tool.call({ tool: PROGRESS, title: 'F', phase: 'delegate', tasks: [{ title: 'A', tier: 'duo:duo-high' }, { title: 'B', tier: 'duo:duo-bogus' }] } as never)
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /duo-high · Sonnet · high/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /bogus/ })).toBeUndefined()
})

const press = async ($: Engine) => {
  const ui = await mount($)
  await ui.press({ key: 'open-a1' })
  return ui
}

test('steps: the plan is validated and shown as a checklist under the model', async ($, on) => {
  await spawn($, on, 'duo-high')
  const call = (x: object) => $.tool.call({ tool: STEP, agentId: 'a1', ...x } as never)
  expect(await call({ done: 0, plan: ['Read code', '  ', 42, 'Write fix', 'Run tests'] })).toMatchObject({ result: 'ok' })
  await call({ done: 1, note: 'writing' })
  const ui = await press($)
  expect(await ui.find({ type: 'Text', text: /Model: Sonnet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✓ 1\. Read code/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▸ 2\. Write fix/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /○ 3\. Run tests/ })).toBeDefined()
})

test('steps: with no plan the logged notes form the checklist; a non-array plan is ignored', async ($, on) => {
  await spawn($, on, 'duo-high')
  const call = (x: object) => $.tool.call({ tool: STEP, agentId: 'a1', ...x } as never)
  await call({ done: 0, total: 2, plan: 'not an array', note: 'first' })
  await call({ done: 1, note: 'second' })
  const ui = await press($)
  expect(await ui.find({ type: 'Text', text: /✓ 1\. first/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▸ 2\. second/ })).toBeDefined()
})

test('steps: a flood of calls and a huge plan stay bounded and drawable', async ($, on) => {
  await spawn($, on, 'duo-high')
  await $.tool.call({ tool: STEP, agentId: 'a1', done: 0, plan: Array.from({ length: 500 }, (_, i) => 'x'.repeat(500) + i) } as never)
  for (let i = 0; i < 100; i++) await $.tool.call({ tool: STEP, agentId: 'a1', done: i, note: 'n' + i } as never)
  const ui = await press($)
  const rows = await ui.findAll({ type: 'Text', text: /^\s+[✓▸○] \d+\./ })
  expect(rows.length).toBeLessThanOrEqual(30)
})

test('desktop: a row toggles its details and the Svg rows still draw', async ($, on) => {
  await spawn($, on, 'duo:duo-max')
  await $.tool.call({ tool: STEP, agentId: 'a1', done: 0, plan: ['One', 'Two'] } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'duo-agents', props: pane })
  await ui.press({ key: 'open-a1' })
  expect(await ui.find({ type: 'Text', text: /○ 2\. Two|▸ 1\. One/ })).toBeDefined()
  const drawn = (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')
  expect(drawn).toContain('duo-max')
})

test('steps: a non-string note is ignored and a long note is clipped in the shown note too', async ($, on) => {
  await spawn($, on, 'duo-high')
  const call = (x: object) => $.tool.call({ tool: STEP, agentId: 'a1', ...x } as never)
  expect(await call({ done: 0, total: 2, note: 42 })).toMatchObject({ result: 'ok' })
  expect(await call({ done: 1, note: 'y'.repeat(300) })).toMatchObject({ result: 'ok' })
  const ui = await press($)
  expect(await ui.find({ type: 'Text', text: /Steps: 1\/2 · y+… *$|Steps: 1\/2 · y{1,79}…/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /y{200}/ })).toBeUndefined()
})

test('steps: a zero total shows ? not 0', async ($, on) => {
  await spawn($, on, 'duo-high')
  await $.tool.call({ tool: STEP, agentId: 'a1', done: 2, total: 0, note: 'x' } as never)
  const ui = await press($)
  expect(await ui.find({ type: 'Text', text: /Steps: 2\/\?/ })).toBeDefined()
})

const briefed = async ($: Engine, on: On, subagentType: string) => {
  let seen = ''
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => {
    seen = e.prompt
    return { model: 'm', agentId: 'a1' } as never
  })
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'D', subagentType, provider: 'engine', parentModel: 'm', background: false, fork: false } as never)
  return seen
}

test('brief: the step request is appended to workers but not to advisor or reviewer', async ($, on) => {
  expect(await briefed($, on, 'duo:duo-high')).toContain(STEP)
})
test('brief: workers are asked to end with DECISION and NEXT lines only when there is one', async ($, on) => {
  const brief = await briefed($, on, 'duo:duo-high')
  expect(brief).toContain('DECISION:')
  expect(brief).toContain('NEXT:')
})
test('brief: advisor (plugin-prefixed) gets no step request', async ($, on) => {
  expect(await briefed($, on, 'duo:duo-advisor')).not.toContain(STEP)
})
test('brief: bare reviewer gets no step request', async ($, on) => {
  expect(await briefed($, on, 'duo-reviewer')).not.toContain(STEP)
})
test('brief: verifier (no step tool) gets no step request', async ($, on) => {
  expect(await briefed($, on, 'duo-verifier')).not.toContain(STEP)
})
