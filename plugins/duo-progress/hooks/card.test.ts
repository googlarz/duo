import { expect, test } from 'claude-code/testing'
import type { Engine, On } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { detailLines, detailRowsOf, endedByLimit, groupAgents, isLimited, MAX_DETAIL_ROWS, needsOf, planSvg, receiptMarkdown, statusSvg, tally, taskRowsOf } from './register'

const mk = (o: Partial<AgentRun>): AgentRun =>
  ({ id: 'x', type: 'general-purpose', description: 'Job', model: 'claude-sonnet-5-5', status: 'running', startedAt: 0, lastAt: 0, contextTokens: 0, contextMax: 1, tokens: 0, costUsd: 0, steps: 0, round: 1, ...o }) as AgentRun
const limitedRun = (o: Partial<AgentRun> = {}): AgentRun => ({ ...mk({ status: 'failed', endedAt: 5, ...o }), limited: true }) as AgentRun
const card = (list: AgentRun[], W = 480, at = 5000) => planSvg(W, taskRowsOf(null, list), at).source

const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
const spawn = ($: Engine, id: string, description: string, type = 'duo-high') =>
  $.agent.spawn({ tool_use_id: id, prompt: 'p', description, subagentType: type, provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)

const setup = (on: On, pct = 10) => {
  const st = { t: 1000, pct }
  on('clock.now', () => ({ value: st.t }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
  on('session.usage', () => ({ value: { rateLimits: [{ kind: 'five_hour', percentUsed: st.pct }] } }) as never)
  return st
}
const mount = ($: Engine, surface: 'desktop' | 'terminal' = 'desktop') => $.ui.mount({ plugin: 'duo-progress', surface, component: 'Pane', requestId: 'duo-agents', props: pane })
const drawn = async (ui: Awaited<ReturnType<typeof mount>>) => (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')

// ---- 1. readable steps: a Details button and an expanded block on the desktop ----

test('desktop: each card has a Details button; pressing it shows model, status, steps, tokens and time, pressing again hides them', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'Build it')
  await $.tool.call({ tool: 'mcp__duo-progress__step', agentId: 'a1', done: 1, total: 3, plan: ['Read code', 'Write fix', 'Run tests'], note: 'writing' } as never)
  const ui = await mount($)
  const button = await ui.find({ key: 'card-a1' })
  expect(String(button?.props.label)).toMatch(/^▸ Details · Build it/)
  expect(await ui.find({ type: 'Text', text: /Model:/ })).toBeUndefined() // closed: nothing but the card
  await ui.press({ key: 'card-a1' })
  expect(String((await ui.find({ key: 'card-a1' }))?.props.label)).toMatch(/^▾ Details/)
  expect(await ui.find({ type: 'Text', text: /Model: Sonnet 5\.5 · high/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Status: running/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✓ 1\. Read code/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▸ 2\. Write fix/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /tokens/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Time:/ })).toBeDefined()
  await ui.press({ key: 'card-a1' })
  expect(await ui.find({ type: 'Text', text: /Model:/ })).toBeUndefined()
})

test('desktop: the open state is per agent and shared with the terminal row, not a global', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'One')
  await spawn($, 'a2', 'Two')
  const ui = await mount($)
  await ui.press({ key: 'card-a2' })
  expect(String((await ui.find({ key: 'card-a1' }))?.props.label)).toMatch(/^▸/)
  expect(String((await ui.find({ key: 'card-a2' }))?.props.label)).toMatch(/^▾/)
  const term = await mount($, 'terminal') // same panel state
  expect(String((await term.find({ key: 'open-a2' }))?.props.label)).toMatch(/^▾/)
  expect(String((await term.find({ key: 'open-a1' }))?.props.label)).toMatch(/^▸/)
})

test('desktop: the collapsed card is no taller than before (the picture is unchanged by opening)', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'One')
  const ui = await mount($)
  const plan = async () => String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)
  const before = await plan()
  await ui.press({ key: 'card-a1' })
  expect(await plan()).toBe(before)
})

test('detailRowsOf: every run gets a button; past the cap the open and running ones win', () => {
  const list = Array.from({ length: MAX_DETAIL_ROWS + 5 }, (_, i) => mk({ id: `r${i}`, description: `T${i}`, status: i === 14 ? 'running' : 'done' }))
  const rows = taskRowsOf(null, list)
  expect(detailRowsOf(rows.slice(0, 3), [])).toHaveLength(3)
  const shown = detailRowsOf(rows, ['r16']).map(r => r.a?.id)
  expect(shown).toHaveLength(MAX_DETAIL_ROWS)
  expect(shown).toContain('r16')
  expect(shown).toContain('r14')
})

// ---- 2. one "how it ended" mark: limit, not failed ----

test('limit: a turn that names a rate limit ends as an amber "limit" card, not a red failed one', () => {
  const src = card([limitedRun({ result: 'Rate limit reached' })])
  expect(src).toContain('limit · Rate limit reached')
  expect(src).not.toContain('error')
  expect(src).toContain('#D4A24C')
  expect(src).not.toContain('#E5484D')
})

test('limit: an ordinary failure stays red "error"', () => {
  const src = card([mk({ status: 'failed', endedAt: 5, result: 'boom' })])
  expect(src).toContain('error · boom')
  expect(src).toContain('#E5484D')
})

test('limit: counted apart from failed in the top line and the needs list', () => {
  const list = [limitedRun({ id: 'l' }), mk({ id: 'f', status: 'failed', endedAt: 5 }), mk({ id: 'd', status: 'done', endedAt: 5 })]
  expect(tally(list)).toEqual({ total: 3, running: 0, failed: 1, done: 1, finished: 3, limited: 1 })
  expect(isLimited(list[0])).toBe(true)
  expect(needsOf(list, 10).map(n => [n.a.id, n.kind])).toEqual([['l', 'limited'], ['f', 'failed']])
  const top = statusSvg(480, list, 10, 'Job', 3).source
  expect(top).toContain('1 failed')
  expect(top).toContain('1 limit')
  expect(statusSvg(480, [limitedRun()], 10, 'Job', 1).source).not.toContain('1 failed')
  expect(detailLines(list[0], 10)[3]).toContain('Status: limit')
})

test('endedByLimit: reads the reason and error words, or a full window', () => {
  expect(endedByLimit({ reason: 'error', error: 'Claude usage limit reached' }, [])).toBe(true)
  expect(endedByLimit({ reason: 'rate_limit' }, [])).toBe(true)
  expect(endedByLimit({ reason: 'error', error: { message: '429 Too Many Requests' } }, [])).toBe(true)
  expect(endedByLimit({ reason: 'error', error: 'connection reset' }, [{ kind: 'five_hour', percentUsed: 40 }])).toBe(false)
  // A full window only explains a bare error stop (no words at all); an error that says something else is that error.
  expect(endedByLimit({ reason: 'error', error: 'connection reset' }, [{ kind: 'five_hour', percentUsed: 100 }])).toBe(false)
  expect(endedByLimit({ reason: 'error' }, [{ kind: 'five_hour', percentUsed: 100 }])).toBe(true)
  expect(endedByLimit({ reason: 'error' }, [{ kind: 'five_hour', percentUsed: 40 }])).toBe(false)
})

test('endedByLimit: ordinary stops that merely contain the word are not limit stops', () => {
  const full = [{ kind: 'seven_day', percentUsed: 100 }]
  const no: Record<string, unknown>[] = [
    { reason: 'max_turns', error: 'Reached the turn limit' },
    { reason: 'error', error: 'Reached the context limit' },
    { reason: 'error', error: 'hit the output limit' },
    { reason: 'error', error: 'disk quota exceeded' },
    { reason: 'error', error: 'TypeError at register.tsx line 429' },
    { reason: 'error', error: 'prompt is too long: token limit exceeded' },
    { reason: 'error', answer: 'I was adding the rate limit middleware when the build broke' }, // the agent's prose is not scanned
    { reason: 'interrupted' },
    { reason: 'max_turns' },
  ]
  for (const c of no) expect(endedByLimit(c, [])).toBe(false)
  // A window reading 100% does not turn them into limit stops either (the answer-only error has no error text of its own).
  for (const c of no.filter(x => x.answer === undefined)) expect(endedByLimit(c, full)).toBe(false)
})

test('endedByLimit: the real usage and rate limit phrasings count', () => {
  for (const error of ['You have hit your limit', "You've hit your limit - resets 5pm", 'Claude usage limit reached', 'Weekly limit reached, resets at 3pm', 'rate_limit_error', 'API rate limit exceeded', 'HTTP 429 Too Many Requests', 'You have reached the usage limit'])
    expect(endedByLimit({ reason: 'error', error }, [])).toBe(true)
  expect(endedByLimit({ reason: 'error', stopReason: 'rate_limit' }, [])).toBe(true)
})

test('limit: turn.complete marks the run, and a plain error does not', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'Hits the cap')
  await spawn($, 'a2', 'Breaks')
  await $.turn.complete({ agentId: 'a1', reason: 'error', error: 'You have hit your limit' } as never)
  await $.turn.complete({ agentId: 'a2', reason: 'error', error: 'bad request' } as never)
  const src = await drawn(await mount($))
  expect(src).toContain('>limit')
  expect(src).toContain('>error')
  expect(src.split('>limit').length).toBe(3) // the card's line and the legend, once each
})

test('limit: a failure while a window is full counts as the limit', async ($, on) => {
  setup(on, 100)
  await spawn($, 'a1', 'Cut off')
  await $.turn.complete({ agentId: 'a1', reason: 'error' } as never)
  expect(await drawn(await mount($))).toContain('>limit')
})

test('meter: a window at 80% or more carries the short "cap" pill, a lower one does not', () => {
  const at = (pct: number) => statusSvg(640, [], 0, 'Job', 0, [{ kind: 'five_hour', percentUsed: pct }]).source
  expect(at(80)).toContain('>cap</text>')
  expect(at(96)).toContain('>cap</text>')
  expect(at(79)).not.toContain('>cap<')
  const two = statusSvg(640, [], 0, 'Job', 0, [{ kind: 'five_hour', percentUsed: 85 }, { kind: 'seven_day', percentUsed: 10 }]).source
  expect(two.split('>cap</text>').length).toBe(2) // only the window past 80%
})

// ---- 3. retries ----

test('retry: round 2 shows on the card line, round 1 shows nothing', () => {
  const second = card([mk({ id: 'b', description: 'Build', round: 2, stepTotal: 5, stepDone: 2, stepNote: 'Reading' })])
  expect(second).toContain('round 2 · step 2/5')
  expect(card([mk({ id: 'b', description: 'Build', stepTotal: 5, stepDone: 2 })])).not.toContain('round')
})

test('retry: the failed card of a task that was run again is faded and leaves the legend; the new one is not', () => {
  const old = mk({ id: 'old', description: 'Build', status: 'failed', startedAt: 1, endedAt: 4 })
  const again = mk({ id: 'new', description: 'Build', round: 2, startedAt: 10 })
  const both = card([old, again])
  expect(both).toContain('opacity="0.4"')
  expect(both.split('opacity="0.4"').length).toBe(2) // only the old card
  expect(both).not.toMatch(/font-size="10\.5"[^>]*>error</) // no legend entry for the retried failure
  // The only failure of a task that was not run again stays at full strength.
  expect(card([old])).not.toContain('opacity="0.4"')
  // A different description is not matched: nothing is hidden by a guess.
  expect(card([old, mk({ id: 'other', description: 'Build v2', startedAt: 10 })])).not.toContain('opacity="0.4"')
})

// ---- limit and failed are counted the same way in every view ----

test('limit: tally, stage groups, the needs list and the receipt agree on failed and limit', () => {
  const list = [
    mk({ id: 'r', description: 'Running one' }),
    mk({ id: 'd', description: 'Done one', status: 'done', endedAt: 5 }),
    mk({ id: 'f', description: 'Broke', status: 'failed', endedAt: 5 }),
    limitedRun({ id: 'l', description: 'Capped' }),
  ]
  expect(tally(list)).toEqual({ total: 4, running: 1, failed: 1, done: 1, finished: 3, limited: 1 })
  const g = groupAgents(list)
  expect(g).toHaveLength(1)
  expect(g[0]).toMatchObject({ running: 1, done: 1, failed: 1, limited: 1 })
  expect(needsOf(list, 10).map(n => n.kind)).toEqual(['failed', 'limited'])
  const md = receiptMarkdown({ at: 0, title: 'T', used: '', agents: list })
  expect(md).toContain('| limit |')
  expect(md).toContain('| failed |')
})

test('terminal: the grouped header adds up (running + done + failed + limit = started) and says limit', async ($, on) => {
  setup(on)
  for (let i = 1; i <= 9; i++) await spawn($, `a${i}`, `s:Task ${i}`)
  await $.turn.complete({ agentId: 'a1', reason: 'error', error: 'You have hit your limit' } as never)
  await $.turn.complete({ agentId: 'a2', reason: 'error', error: 'bad request' } as never)
  for (let i = 3; i <= 8; i++) await $.turn.complete({ agentId: `a${i}`, reason: 'answer', answer: 'ok' } as never)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /1 running · 6 done · 1 failed · 1 limit · 9 started so far/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /● s .*6 done · 1 running · 1 failed · 1 limit/ })).toBeDefined() // the stage line says the same
})

// ---- a retried failed run is faded on its card, so it is not counted as a failure either ----

test('retry: a failed run that was run again is left out of the failed count, the stage count and the warning list', () => {
  const lost = mk({ id: 'f1', description: 'Build', status: 'failed', startedAt: 1, endedAt: 5 })
  const retry = mk({ id: 'f2', description: 'Build', status: 'done', startedAt: 6, endedAt: 9, round: 2, result: 'ok' })
  const other = mk({ id: 'o', description: 'Other', status: 'failed', startedAt: 2, endedAt: 5 })
  const capped = limitedRun({ id: 'c', description: 'Capped', startedAt: 3 })
  const cappedAgain = mk({ id: 'c2', description: 'Capped', status: 'done', startedAt: 7, endedAt: 9, round: 2 })
  const list = [lost, other, capped, retry, cappedAgain]
  expect(tally(list)).toMatchObject({ failed: 1, done: 2, running: 0 })
  expect(tally(list).limited).toBeUndefined()
  expect(groupAgents(list)[0]).toMatchObject({ failed: 1, limited: 0 })
  expect(needsOf(list, 10).map(n => n.a.id)).toEqual(['o'])
  const top = statusSvg(480, list, 10, 'Job', 4).source
  expect(top).toContain('1 failed')
  expect(top).not.toContain('2 failed')
  // A run that failed again is the one that still counts; the first of the two is the faded one.
  const again = mk({ id: 'f3', description: 'Build', status: 'failed', startedAt: 10, endedAt: 12, round: 3 })
  expect(tally([lost, again]).failed).toBe(1)
  expect(needsOf([lost, again], 20).map(n => n.a.id)).toEqual(['f3'])
})

// ---- the grid under the picture grows with the Details buttons and the open blocks ----

test('desktop: the grid height grows with an open Details block and returns when it is closed', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'One')
  const ui = await mount($)
  const gridH = async () =>
    (await ui.findAll({ type: 'Svg' })).filter(el => el.props.alt === 'dotted grid').reduce((h, el) => h + Number(el.props.height), 0)
  const closed = await gridH()
  await ui.press({ key: 'card-a1' })
  const open = await gridH()
  expect(open).toBeGreaterThan(closed)
  expect((open - closed) % 24).toBe(0) // whole text lines
  await ui.press({ key: 'card-a1' })
  expect(await gridH()).toBe(closed)
  // The button row itself is counted: a second card adds its own row on top of its picture.
  const one = closed
  await spawn($, 'a2', 'Two')
  const two = await gridH()
  expect(two - one).toBeGreaterThanOrEqual(24)
})

// ---- the terminal shows the tier's effort before the first step, like the cards ----

test('terminal: a row and its Details button carry the tier\'s effort before the host reports one', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'Build it') // duo-high, no turn step seen yet
  const ui = await mount($, 'terminal')
  expect(String((await ui.find({ key: 'open-a1' }))?.props.label)).toContain('Details · Sonnet 5.5 · high')
  expect(await ui.find({ type: 'Text', text: /· Sonnet 5\.5 · high/ })).toBeDefined()
})
