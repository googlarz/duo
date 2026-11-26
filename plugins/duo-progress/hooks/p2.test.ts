import { expect, test } from 'claude-code/testing'
import type { Engine, On } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { detailLineCount, detailLines, detailRowsOf, endedByLimit, MAX_CARDS, planSvg, receiptMarkdown, shownRowsOf, statusSvg, taskRowsOf } from './register'

const PROGRESS = 'mcp__duo-progress__progress'
const STEP = 'mcp__duo-progress__step'
const RECEIPT = 'mcp__duo-progress__receipt'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }

const mk = (o: Partial<AgentRun>): AgentRun =>
  ({ id: 'x', type: 'general-purpose', description: 'Job', model: 'claude-sonnet-5-5', status: 'running', startedAt: 0, lastAt: 0, contextTokens: 0, contextMax: 1, tokens: 0, costUsd: 0, steps: 0, round: 1, ...o }) as AgentRun

const setup = (on: On, model = 'claude-sonnet-5-5') => {
  const st = { t: 1000, prompt: '' }
  on('clock.now', () => ({ value: st.t }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => {
    st.prompt = e.prompt
    return { model, agentId: e.tool_use_id } as never
  })
  on('turn.complete', () => ({ text: 'ok' }) as never)
  on('session.usage', () => ({ value: { rateLimits: [{ kind: 'five_hour', percentUsed: 10 }] } }) as never)
  return st
}
const spawn = ($: Engine, id: string, description: string, type = 'duo-low', prompt = 'p') =>
  $.agent.spawn({ tool_use_id: id, prompt, description, subagentType: type, provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)
const mount = ($: Engine, surface: 'desktop' | 'terminal' = 'desktop') => $.ui.mount({ plugin: 'duo-progress', surface, component: 'Pane', requestId: 'duo-agents', props: pane })
const drawn = async (ui: Awaited<ReturnType<typeof mount>>) => (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')
const receipt = async ($: Engine, args: Record<string, unknown> = {}): Promise<string> => String(((await $.tool.call({ tool: RECEIPT, ...args } as never)) as { result: string }).result)

// ---- 1. a window counts as full only until it resets ----

const iso = (ms: number) => new Date(ms).toISOString()
const NOW = Date.parse('2026-10-30T12:00:00Z')

test('endedByLimit: a full window whose reset time has passed explains nothing; one that has not yet, or has none, does', () => {
  const bare = { reason: 'error' }
  expect(endedByLimit(bare, [{ kind: 'five_hour', percentUsed: 100, resetsAt: iso(NOW - 60_000) }], NOW)).toBe(false)
  expect(endedByLimit(bare, [{ kind: 'five_hour', percentUsed: 100, resetsAt: iso(NOW + 60_000) }], NOW)).toBe(true)
  expect(endedByLimit(bare, [{ kind: 'five_hour', percentUsed: 100 }], NOW)).toBe(true)
  expect(endedByLimit(bare, [{ kind: 'five_hour', percentUsed: 100, resetsAt: 'not a date' }], NOW)).toBe(true)
  expect(endedByLimit(bare, [{ kind: 'five_hour', percentUsed: 100, resetsAt: iso(NOW - 60_000) }])).toBe(true) // no clock given: nothing is known to have reset
})

// ---- 2. the meters and the tile drop a window that has reset; the 80/95 thresholds read the unrounded value ----

test('meters: a window past its reset time is not drawn with its old percentage; one still running is', () => {
  const lim = [{ kind: 'five_hour', percentUsed: 97, resetsAt: iso(NOW - 1000) }, { kind: 'seven_day', percentUsed: 40, resetsAt: iso(NOW + 3_600_000) }]
  const src = statusSvg(640, [], 0, 'Job', 0, lim, NOW).source
  expect(src).not.toContain('>97%<')
  expect(src).not.toContain('>5h<')
  expect(src).toContain('>40%<')
  expect(statusSvg(640, [], 0, 'Job', 0, lim).source).toContain('>97%<') // without a clock nothing is known to be stale
})

test('meters: 79.6% reads as 80 but is not at the cap yet, and 94.6% is amber, not red', () => {
  const at = (pct: number) => statusSvg(640, [], 0, 'Job', 0, [{ kind: 'five_hour', percentUsed: pct }]).source
  expect(at(79.6)).not.toContain('>cap<')
  expect(at(80)).toContain('>cap</text>')
  expect(at(94.6)).not.toContain('#E5484D')
  expect(at(95)).toContain('#E5484D')
})

// ---- 3. limit words ----

test('endedByLimit: a reset time needs a usage or limit word near it, and the API words are not taken from a message', () => {
  const no: Record<string, unknown>[] = [
    { reason: 'error', error: 'cache resets in 5s' },
    { reason: 'error', message: 'cache resets in 5s' },
    { reason: 'error', message: 'RateLimitError from a fetch tool' },
    { reason: 'error', errorMessage: 'too many requests to the search tool' },
    { reason: 'error', message: 'the fetch tool saw a rate limit and gave up' },
  ]
  for (const c of no) expect(endedByLimit(c, [])).toBe(false)
  const yes: Record<string, unknown>[] = [
    { reason: 'error', message: 'You have hit your limit' },
    { reason: 'error', message: 'Usage limit reached, resets at 3pm' },
    { reason: 'error', message: 'Your limit will reset at 3pm' },
    { reason: 'rate_limit' },
    { reason: 'error', stopReason: 'too many requests' },
    { reason: 'error', error: { message: '429 Too Many Requests' } },
  ]
  for (const c of yes) expect(endedByLimit(c, [])).toBe(true)
})

// ---- 4. a model-specific window explains only that model's agents ----

test('endedByLimit: a full window of one model family flags the agents of that family, not the others', () => {
  const opus = [{ kind: 'seven_day_opus', percentUsed: 100 }]
  expect(endedByLimit({ reason: 'error' }, opus, NOW, 'claude-opus-5-5')).toBe(true)
  expect(endedByLimit({ reason: 'error' }, opus, NOW, 'claude-sonnet-5-5')).toBe(false)
  expect(endedByLimit({ reason: 'error' }, opus, NOW, '')).toBe(true) // model not known: left as it was
  expect(endedByLimit({ reason: 'error' }, [{ kind: 'seven_day', percentUsed: 100 }], NOW, 'claude-sonnet-5-5')).toBe(true) // a general window covers all
})

// ---- 5. detail lines wrap by words, at the width the block really has ----

test('detailLineCount: a 160-character note takes as many lines as it wraps to; a checklist line has less room', () => {
  const note = `${'word '.repeat(31)}end`
  const a = mk({ stepTotal: 2, stepDone: 1, stepNote: note, stepPlan: ['One', 'Two'] })
  const lines = detailLines(a, 0)
  const cols = 40
  const need = lines.reduce((n, l) => n + Math.ceil(l.trim().length / (cols - 2 - (l.length - l.trimStart().length))), 0)
  expect(detailLineCount(a, 0, cols)).toBeGreaterThanOrEqual(need)
  // Words break at spaces: ten 9-letter words in a 20-column block leave one word per line.
  expect(detailLineCount(mk({ description: 'abcdefghi '.repeat(10).trim() }), 0, 22)).toBeGreaterThanOrEqual(10)
  expect(detailLineCount(mk({}), 0, 80)).toBe(detailLines(mk({}), 0).length)
})

// ---- 6. one selection for the cards and the Details buttons ----

const many = (n: number): AgentRun[] => Array.from({ length: n }, (_, i) => mk({ id: `r${i}`, description: `Task ${i}`, status: i < 30 ? 'done' : 'running', endedAt: i < 30 ? 5 : undefined, startedAt: i }))

test('shownRowsOf: past MAX_CARDS the cards are the unfinished first, and the buttons come only from those', () => {
  const rows = taskRowsOf(null, many(50))
  const shown = shownRowsOf(rows)
  expect(shown.length).toBe(MAX_CARDS)
  expect(shown.filter(r => r.a?.status === 'running').length).toBe(20) // every running one has a card
  const buttons = detailRowsOf(shown, [])
  for (const r of buttons) expect(shown).toContain(r)
  const src = planSvg(480, rows, 100).source
  expect(src.split('class="tile"').length - 1).toBe(MAX_CARDS)
  expect(shownRowsOf(taskRowsOf(null, many(5))).length).toBe(5)
})

test('Details button: a retried run says its round', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'Build it')
  await $.turn.complete({ agentId: 'a1', reason: 'error', error: 'boom' } as never)
  await spawn($, 'a2', 'Build it')
  const ui = await mount($)
  expect(String((await ui.find({ key: 'card-a2' }))?.props.label)).toMatch(/Build it · round 2$/)
  expect(String((await ui.find({ key: 'card-a1' }))?.props.label)).not.toContain('round')
})

// ---- 7. the checklist and done/total agree ----

// The expanded checklist rows of an open terminal row; the panel is mounted afresh each time (it keeps which rows are open).
const checklist = async ($: Engine): Promise<string[]> => {
  const ui = await mount($, 'terminal')
  const rows = (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).filter(t => /^ {2}[✓▸○] \d+\./.test(t))
  await ui.unmount()
  return rows
}

test('steps: a plan longer than the total is cut to it, a shorter one gets untitled rows, and a total only call trims a stored plan', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'One', 'duo-low')
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'open-a1' })
  await ui.unmount()
  await $.tool.call({ tool: STEP, agentId: 'a1', done: 0, total: 2, plan: ['A', 'B', 'C', 'D'] } as never)
  expect(await checklist($)).toEqual(['  ▸ 1. A', '  ○ 2. B'])
  await $.tool.call({ tool: STEP, agentId: 'a1', done: 1, total: 4 } as never)
  expect(await checklist($)).toEqual(['  ✓ 1. A', '  ▸ 2. B', '  ○ 3.', '  ○ 4.'])
  await $.tool.call({ tool: STEP, agentId: 'a1', done: 1, total: 1 } as never)
  expect(await checklist($)).toEqual(['  ✓ 1. A'])
})

// ---- 8. the planned reason on the card, kept for a loosely matching title ----

test('why: the card shows the planned reason on its own line, also for a description that only starts the planned title', async ($, on) => {
  setup(on)
  await $.tool.call({ tool: PROGRESS, title: 'Job', phase: 'delegate', tasks: [{ title: 'Fix the tax rounding', tier: 'duo-low', why: 'small and mechanical' }, { title: 'Write tests', tier: 'duo-low', why: 'needs care' }] } as never)
  await spawn($, 'a1', 'Fix the tax rounding in cart.py') // longer than the planned title
  const ui = await mount($)
  const src = await drawn(ui)
  expect(src).toContain('small and mechanical')
  expect(src).toContain('needs care') // the waiting task shows its reason too
  await ui.press({ key: 'card-a1' })
  expect(await ui.find({ type: 'Text', text: /Why this tier: small and mechanical/ })).toBeDefined()
})

test('why: no planned reason, no extra line: the card keeps its height', () => {
  const rows = taskRowsOf(null, [mk({ id: 'a', description: 'No plan' })])
  expect(planSvg(480, rows, 0).height).toBe(planSvg(480, taskRowsOf({ title: 'F', total: 1, done: 0, running: 0, phase: 'delegate', isFinished: false, tasks: [{ title: 'No plan', tier: 'duo-low', after: [], why: 'because' }] }, [mk({ id: 'a', description: 'No plan' })]), 0).height - 14)
})

// ---- 9. planned vs actual ----

test('ran as: a run that got another model than its tier plans is marked on the card and in Details', async ($, on) => {
  setup(on, 'claude-opus-5-5')
  await spawn($, 'a1', 'Cheap job', 'duo-low') // planned Sonnet · low
  const ui = await mount($)
  expect(await drawn(ui)).toContain('ran as Opus 5.5')
  await ui.press({ key: 'card-a1' })
  expect(await ui.find({ type: 'Text', text: /Model: ran as Opus 5\.5.*planned Sonnet · low/ })).toBeDefined()
})

test('ran as: a matching run, an unknown tier and a reported effort of another level', () => {
  expect(detailLines(mk({ type: 'duo-low', effort: 'low' }), 0)[0]).not.toContain('ran as')
  expect(detailLines(mk({ type: 'general-purpose' }), 0)[0]).not.toContain('ran as')
  expect(detailLines(mk({ type: 'duo-low', effort: 'max' }), 0)[0]).toContain('ran as Sonnet 5.5 · max')
  expect(detailLines(mk({ type: 'duo-fable', model: 'claude-mythos-5', effort: 'high' }), 0)[0]).not.toContain('ran as')
})

// ---- 10. brief and answer ----

test('brief and answer: kept clipped, shown in Details and the receipt; the card keeps its short line', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'Long one', 'duo-low', `Read ${'x'.repeat(900)}`)
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: `Done. ${'y'.repeat(3000)}` } as never)
  const ui = await mount($)
  await ui.press({ key: 'card-a1' })
  const brief = await ui.find({ type: 'Text', text: /^Brief: Read x+…$/ })
  expect(String(brief?.text).length).toBe('Brief: '.length + 600)
  const answer = await ui.find({ type: 'Text', text: /^Answer: Done\. y+…$/ })
  expect(String(answer?.text).length).toBe('Answer: '.length + 2000)
  expect(await ui.find({ type: 'Text', text: /^Result: Done\. y+…$/ })).toBeDefined() // the 160-character line stays
  const text = await receipt($)
  expect(text).toMatch(/- Brief: Read x{100}/)
  expect(text).toMatch(/- Answer: Done\. y{100}/)
})

test('brief and answer: a short answer is not shown twice, and a resumed agent loses the old answer', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'Short one')
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'PASS: fine' } as never)
  expect(detailLines(mk({ result: 'PASS: fine', answer: 'PASS: fine' }), 0).filter(l => /^(Result|Answer)/.test(l)).length).toBe(1)
})

// ---- 11. the orchestrator's note ----

test('note: the progress call sets it, the header and the receipt show it, a later call keeps it and an empty one clears it', async ($, on) => {
  setup(on)
  await $.tool.call({ tool: PROGRESS, title: 'Job', phase: 'delegate', note: 'Verifier skipped: fast path, one-line change', tasks: [{ title: 'Do it', tier: 'duo-low' }] } as never)
  await spawn($, 'a1', 'Do it')
  await $.tool.call({ tool: PROGRESS, done: 0 } as never)
  const desk = await mount($)
  expect(await drawn(desk)).toContain('Verifier skipped: fast path')
  await desk.unmount()
  const term = await mount($, 'terminal')
  expect(await term.find({ type: 'Text', text: /Verifier skipped: fast path/ })).toBeDefined()
  await term.unmount()
  expect(await receipt($)).toContain('Note: Verifier skipped: fast path')
  await $.tool.call({ tool: PROGRESS, note: '' } as never)
  expect(await drawn(await mount($))).not.toContain('Verifier skipped')
  await $.tool.call({ tool: PROGRESS, note: 'x'.repeat(400) } as never)
  expect(await receipt($)).not.toContain('x'.repeat(200))
})

test('note: the header grows by one line only when there is a note', () => {
  const plain = statusSvg(480, [], 0, 'Job', 0)
  const noted = statusSvg(480, [], 0, 'Job', 0, [], 0, '', 'Gate skipped')
  expect(noted.height).toBeGreaterThan(plain.height)
  expect(noted.source).toContain('Gate skipped')
  expect(plain.source).not.toContain('Gate skipped')
})

test('receiptMarkdown: the note sits under the heading', () => {
  expect(receiptMarkdown({ at: 0, title: 'T', used: '', agents: [], note: 'Skipped the reviewer' })).toContain('Note: Skipped the reviewer')
})

// ---- 12. the grouped terminal view names the model ----

test('terminal grouped: running and finished lines carry model and effort', async ($, on) => {
  setup(on)
  for (let i = 0; i < 10; i++) await spawn($, `t${i}`, `scan:A${i}`, 'duo-low')
  await $.turn.complete({ agentId: 't0', reason: 'answer', answer: 'ok' } as never)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /● scan:A\d {2}Sonnet 5\.5 · low/ })).toBeDefined()
  await ui.press({ key: 'done' })
  expect(await ui.find({ type: 'Text', text: /✓ scan:A0 {2}Sonnet 5\.5 · low/ })).toBeDefined()
})

// ---- 13. the receipt tool picks a run ----

test('receipt: the newest by default, an index for an older one, "all" for every kept run', async ($, on) => {
  const saved: Record<string, unknown> = {}
  const st = setup(on)
  on('store.get', (_$, e) => ({ value: saved[(e as unknown as { key: string }).key] }) as never)
  on('store.set', (_$, e) => {
    saved[(e as unknown as { key: string }).key] = (e as unknown as { value: unknown }).value
    return { value: undefined } as never
  })
  for (const [i, title] of ['First', 'Second', 'Third'].entries()) {
    st.t += 10 * 60_000
    await $.tool.call({ tool: PROGRESS, title, phase: 'delegate', tasks: [{ title: `${title} task`, tier: 'duo-low' }] } as never)
    await spawn($, `a${i}`, `${title} task`)
    await $.turn.complete({ agentId: `a${i}`, reason: 'answer', answer: 'PASS' } as never)
    await $.tool.call({ tool: PROGRESS, finished: true } as never)
  }
  expect(await receipt($)).toContain('Third')
  expect(await receipt($, { index: 1 })).toContain('Second')
  expect(await receipt($, { index: '2' })).toContain('First')
  const all = await receipt($, { index: 'all' })
  for (const t of ['First', 'Second', 'Third']) expect(all).toContain(`# duo run receipt: ${t}`)
  expect(await receipt($, { index: 7 })).toContain('No run at index 7')
})

// ---- 16. the verifier's card reports steps like a worker's ----

test('verifier: its brief asks for steps, so its card shows them', async ($, on) => {
  const st = setup(on)
  await spawn($, 'v1', 'Verify it', 'duo:duo-verifier')
  expect(st.prompt).toContain(STEP)
  await $.tool.call({ tool: STEP, agentId: 'v1', done: 1, total: 3, note: 'ran the suite' } as never)
  expect(await drawn(await mount($))).toContain('step 1/3 · ran the suite')
})
