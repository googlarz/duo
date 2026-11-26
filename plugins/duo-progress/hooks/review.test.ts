import { expect, test } from 'claude-code/testing'
import type { Engine, On } from 'claude-code/testing'

const PROGRESS = 'mcp__duo-progress__progress'
const RECEIPT = 'mcp__duo-progress__receipt'
const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }

const setup = (on: On) => {
  const st = { t: 1000, prompt: '', saved: {} as Record<string, unknown> }
  on('clock.now', () => ({ value: st.t }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => {
    st.prompt = e.prompt
    return { model: 'claude-sonnet-5-5', agentId: e.tool_use_id } as never
  })
  on('turn.complete', () => ({ text: 'ok' }) as never)
  on('session.usage', () => ({ value: { rateLimits: [{ kind: 'five_hour', percentUsed: 10 }] } }) as never)
  on('store.get', (_$, e) => ({ value: st.saved[(e as unknown as { key: string }).key] }) as never)
  on('store.set', (_$, e) => {
    st.saved[(e as unknown as { key: string }).key] = (e as unknown as { value: unknown }).value
    return { value: undefined } as never
  })
  return st
}
const spawn = ($: Engine, id: string, description: string, type = 'general-purpose', prompt = 'p') =>
  $.agent.spawn({ tool_use_id: id, prompt, description, subagentType: type, provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)
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
const receipt = async ($: Engine, args: Record<string, unknown> = {}): Promise<string> => String(((await $.tool.call({ tool: RECEIPT, ...args } as never)) as { result: string }).result)
const settle = () => new Promise(r => setTimeout(r, 30))

const PLAN = { tool: PROGRESS, title: 'Ship it', phase: 'delegate', tasks: [{ title: 'Write the parser', tier: 'duo-low' }, { title: 'Wire the CLI', tier: 'duo-low' }] }

// ---- progress tasks: a patch by title, or a replacement ----

test('progress tasks: titles already in the plan with only accepted or why patch it and keep the others', async ($, on) => {
  setup(on)
  await $.tool.call(PLAN as never)
  await spawn($, 'pa', 'Write the parser', 'duo-low')
  await spawn($, 'pb', 'Wire the CLI', 'duo-low')
  await $.turn.complete({ agentId: 'pa', reason: 'answer', answer: 'done' } as never)
  await $.turn.complete({ agentId: 'pb', reason: 'answer', answer: 'done' } as never)
  expect(await $.tool.call({ tool: PROGRESS, tasks: [{ title: 'Write the parser', accepted: true }] } as never)).toMatchObject({ result: 'ok: Tasks 0/2' })
  expect(await bandSrc($)).toContain('Tasks 1/2') // the other task is still in the plan, so the total is still 2
  // A second patch with a reason keeps the accepted mark.
  await $.tool.call({ tool: PROGRESS, tasks: [{ title: 'Wire the CLI', why: 'plain wiring' }] } as never)
  expect(await bandSrc($)).toContain('Tasks 1/2')
})

test('progress tasks: a title not in the plan, or a tier, replaces the whole list as before', async ($, on) => {
  setup(on)
  await $.tool.call(PLAN as never)
  expect(await $.tool.call({ tool: PROGRESS, tasks: [{ title: 'Write the parser', accepted: true }, { title: 'Something new', accepted: true }] } as never)).toMatchObject({ result: 'ok: Tasks 0/2' })
  expect(await drawn($)).not.toContain('Wire the CLI')
  await $.tool.call(PLAN as never)
  expect(await $.tool.call({ tool: PROGRESS, tasks: [{ title: 'Write the parser', tier: 'duo-low', accepted: true }] } as never)).toMatchObject({ result: 'ok: Tasks 0/1' })
})

// ---- the implicit run is persisted when two agents end together ----

test('implicit run: two agents ending in one tick persist the receipt', async ($, on) => {
  const st = setup(on)
  await spawn($, 'a1', 'Job one')
  await spawn($, 'a2', 'Job two')
  await Promise.all([$.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok' } as never), $.turn.complete({ agentId: 'a2', reason: 'answer', answer: 'ok' } as never)])
  expect(await bandSrc($)).toContain('Done')
  expect((st.saved.receipts as unknown[] | undefined)?.length).toBe(1)
})

// ---- receipt size ----

test('receipt: a brief is cut to 300 characters and an answer to 800', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'Long job', 'general-purpose', 'a'.repeat(2000))
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'b'.repeat(3000) } as never)
  const md = await receipt($)
  const line = (p: string) => md.split('\n').find(l => l.startsWith(p)) ?? ''
  expect(line('- Brief: ').length).toBeGreaterThan(200)
  expect(line('- Brief: ').length).toBeLessThanOrEqual('- Brief: '.length + 300)
  expect(line('- Answer: ').length).toBeGreaterThan(500)
  expect(line('- Answer: ').length).toBeLessThanOrEqual('- Answer: '.length + 800)
})

test('receipt: "all" returns the newest three and says how many were left out', async ($, on) => {
  const st = setup(on)
  for (let i = 0; i < 5; i++) {
    st.t += 10 * 60_000
    await $.tool.call({ tool: PROGRESS, title: `Run ${i}`, phase: 'delegate', tasks: [{ title: `Task ${i}`, tier: 'duo-low' }] } as never)
    await spawn($, `k${i}`, `Task ${i}`, 'duo-low')
    await $.turn.complete({ agentId: `k${i}`, reason: 'answer', answer: 'done' } as never)
    await $.tool.call({ tool: PROGRESS, finished: true } as never)
  }
  const all = await receipt($, { index: 'all' })
  expect(all.split('# duo run receipt').length - 1).toBe(3)
  expect(all).toContain('# duo run receipt: Run 4')
  expect(all).toContain('# duo run receipt: Run 2')
  expect(all).not.toContain('# duo run receipt: Run 1')
  expect(all).toContain('2 older runs left out')
  expect(await receipt($, { index: 3 })).toContain('Run 1') // the rest is one index away
})

// ---- a repeated finish ----

test('progress: a repeated finished call with the finished flow\'s title leaves the plan and the baseline alone', async ($, on) => {
  setup(on)
  await $.tool.call(PLAN as never)
  await spawn($, 'a1', 'Write the parser', 'duo-low')
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'PASS' } as never)
  await $.tool.call({ tool: PROGRESS, finished: true } as never)
  expect(await drawn($)).toContain('Write the parser')
  expect(await $.tool.call({ tool: PROGRESS, title: 'Ship it', finished: true } as never)).toMatchObject({ result: 'ok: Done' })
  expect(await drawn($)).toContain('Write the parser') // not blanked
  expect(await receipt($)).toContain('Write the parser')
  // A different title still starts a new flow.
  expect(await $.tool.call({ tool: PROGRESS, title: 'Another', phase: 'delegate', total: 3 } as never)).toMatchObject({ result: 'ok: Tasks 0/3' })
})

// ---- the step brief ----

test('brief: a prompt that only mentions the step tool still gets the step request, and one that has it is not briefed twice', async ($, on) => {
  const st = setup(on)
  await spawn($, 'a1', 'Build it', 'duo:duo-low', 'Never call mcp__duo-progress__step for the build log.')
  expect(st.prompt).toContain('Progress reporting: before any other work')
  const briefed = st.prompt
  await spawn($, 'a2', 'Build it again', 'duo:duo-low', briefed)
  expect(st.prompt).toBe(briefed)
})

// ---- the implicit run's start mark ----

test('implicit run: an agent whose clock read is earlier than the flow\'s start is still counted', async ($, on) => {
  const st = setup(on)
  st.t = 2000
  await spawn($, 'a1', 'Job one')
  st.t = 1000
  await spawn($, 'a2', 'Job two')
  expect(await bandSrc($)).toContain('Tasks 0/2')
})

// ---- a call that never reported its end ----

test('turn.complete: a tool call still in flight does not keep the resumed row busy', async ($, on) => {
  const st = setup(on)
  const gates: (() => void)[] = []
  on('tool.call', () => new Promise(res => gates.push(() => res({ result: 'ok' }))) as never)
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-sonnet-5-5', input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  await spawn($, 'a1', 'Build it')
  const c1 = $.tool.call({ tool: 'Bash', agentId: 'a1', command: 'make' } as never)
  await settle()
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok' } as never)
  st.t += 5000
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: 'a1' })
  for await (const _ of stream) void _ // the agent resumes
  st.t += 4 * 60_000
  await spawn($, 'z1', 'Decoy') // moves the panel's clock
  expect(await drawn($)).toContain('stalled') // the dead call no longer excuses four quiet minutes
  gates[0]()
  await c1
})
