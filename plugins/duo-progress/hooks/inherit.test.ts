import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'duo-progress'
const MARK = 'main model, none passed'
const MAIN = 'claude-opus-5-5'
const pane = { title: '', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }

type On = Parameters<Parameters<typeof test>[1]>[1]

const setup = (on: On, resolved = MAIN) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: resolved, agentId: e.tool_use_id }))
}
const spawn = ($: Engine, o: { type?: string; model?: string; fork?: boolean; resume?: { agentId: string } } = {}) =>
  $.agent.spawn({ tool_use_id: 'a1', prompt: 'p', description: 'Job', subagentType: o.type ?? 'general-purpose', provider: 'engine', parentModel: `${MAIN}[1m]`, background: false, fork: o.fork ?? false, ...(o.model ? { model: o.model } : {}), ...(o.resume ? { resume: o.resume } : {}) } as never)

const mount = ($: Engine, surface: 'desktop' | 'terminal') => $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'duo-agents', props: pane })

// Everything the pane shows: the desktop picture, or the terminal rows, with the run's Details open.
const shown = async ($: Engine, surface: 'desktop' | 'terminal') => {
  const ui = await mount($, surface)
  await ui.press({ key: surface === 'desktop' ? 'card-a1' : 'open-a1' })
  const pictures = (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')
  const details = await ui.find({ type: 'Text', text: new RegExp(`Model: .*${MARK}`) })
  const anywhere = await ui.find({ type: 'Text', text: new RegExp(MARK) })
  return { ui, pictures, details, anywhere }
}

test('main model: a run given no model is marked on the desktop card and in Details', async ($, on) => {
  setup(on)
  await spawn($)
  const r = await shown($, 'desktop')
  expect(r.pictures).toContain(MARK)
  expect(r.pictures).not.toContain('inherited')
  expect(r.details).toBeDefined()
})

test('main model: the terminal row and Details are marked too', async ($, on) => {
  setup(on)
  await spawn($)
  const r = await shown($, 'terminal')
  expect(r.details).toBeDefined()
  expect(await r.ui.find({ type: 'Text', text: new RegExp(`general-purpose · ${MARK}`) })).toBeDefined()
})

test('main model: a fork is marked even when a model was passed', async ($, on) => {
  setup(on)
  await spawn($, { type: 'fork', model: 'haiku', fork: true })
  expect((await shown($, 'desktop')).pictures).toContain(MARK)
})

for (const [name, resolved, o] of [
  ['a model was passed', MAIN, { model: 'opus' }],
  ['the run resolved to another model', 'claude-haiku-4-5', {}],
  ['a pipeline agent', MAIN, { type: 'duo-low' }],
  ['the run is resumed', MAIN, { resume: { agentId: 'a1' } }],
] as const) {
  test(`main model: no mark when ${name}`, async ($, on) => {
    setup(on, resolved)
    await spawn($, o)
    const r = await shown($, 'desktop')
    expect(r.pictures).toContain('Job')
    expect(r.pictures).not.toContain(MARK)
    expect(r.anywhere).toBeUndefined()
  })
}

test('main model: the mark goes when a later request reports another model', async ($, on) => {
  setup(on)
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-haiku-4-5', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  await spawn($)
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: MAIN, messageCount: 1, agentId: 'a1' })
  for await (const _ of stream) void _
  const r = await shown($, 'desktop')
  expect(r.pictures).toContain('Haiku')
  expect(r.pictures).not.toContain(MARK)
  expect(r.anywhere).toBeUndefined()
})

test('main model: a change away and back stays unmarked', async ($, on) => {
  setup(on)
  let reported = 'claude-haiku-4-5'
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: reported, input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  await spawn($)
  for (const model of ['claude-haiku-4-5', MAIN]) {
    reported = model
    const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model, messageCount: 1, agentId: 'a1' })
    for await (const _ of stream) void _
  }
  const r = await shown($, 'desktop')
  expect(r.pictures).toContain('Opus')
  expect(r.pictures).not.toContain(MARK)
  expect(r.anywhere).toBeUndefined()
})
