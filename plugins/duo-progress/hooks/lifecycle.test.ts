import { expect, mock, test } from 'claude-code/testing'
import type { Engine, On } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { describeAction, detailLines, isStalled, receiptMarkdown, verdictOf } from './register'

const RECEIPT = 'mcp__duo-progress__receipt'

const spawn = ($: Engine, id: string, description = `Job ${id}`, type = 'general-purpose') =>
  $.agent.spawn({ tool_use_id: id, prompt: 'p', description, subagentType: type, provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)

const setup = (on: On) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
}

const receipt = async ($: Engine): Promise<string> => String(((await $.tool.call({ tool: RECEIPT } as never)) as { result: string }).result)

test('lifecycle: spawn, a final answer and a verdict reach the receipt', async ($, on) => {
  setup(on)
  await spawn($, 'a1', 'Verify the tax fix', 'duo:duo-verifier')
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'PASS: all checks matched' } as never)
  const md = await receipt($)
  expect(md).toContain('# duo run receipt')
  expect(md).toContain('Verify the tax fix')
  expect(md).toContain('done (PASS)')
  expect(md).toContain('- Result: PASS: all checks matched')
})

test('lifecycle: edited files reach the receipt once, and only for a subagent', async ($, on) => {
  setup(on)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await spawn($, 'a2', 'Edit things')
  await $.tool.call({ tool: 'Write', agentId: 'a2', file_path: '/x/a.py' } as never)
  await $.tool.call({ tool: 'Edit', agentId: 'a2', file_path: '/x/a.py' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/x/main.py' } as never)
  const md = await receipt($)
  expect(md).toContain('- Files: /x/a.py')
  expect(md).not.toContain('main.py')
})

test('lifecycle: an agent that ends in an error is failed', async ($, on) => {
  setup(on)
  await spawn($, 'f1', 'Flaky job')
  await $.turn.complete({ agentId: 'f1', reason: 'error', answer: '' } as never)
  expect(await receipt($)).toContain('| failed |')
})

test('lifecycle: with nothing run the receipt says so', async ($, on) => {
  setup(on)
  expect(await receipt($)).toBe('No run to report yet.')
})

test('receiptMarkdown: a table, the why, the files, and the honest footer', () => {
  const a = { id: 'x', type: 'duo:duo-low', description: 'Fix | the bug', model: 'claude-sonnet-5-5', effort: 'low', status: 'done', startedAt: 0, endedAt: 12_000, contextTokens: 0, contextMax: 1, tokens: 76_000, costUsd: 0.2, steps: 3, round: 1, stepTotal: 2, stepDone: 2, why: 'a one-line known cause', verdict: 'pass', result: 'done', files: ['/p/a.py'] } as AgentRun
  const md = receiptMarkdown({ at: 0, title: 'Fix the bug', used: ' This run used 1% of the 5-hour window', agents: [a] })
  expect(md).toContain('| Fix \\| the bug |')
  expect(md).toContain('2/2')
  expect(md).toContain("- Why this tier (the orchestrator's words): a one-line known cause")
  expect(md).toContain('- Files: /p/a.py')
  expect(md).toContain('This run used 1% of the 5-hour window')
  expect(md).toContain('Cost is an API-price estimate, not your bill.')
})

test('detailLines: the stalled time, why, action, verdict, result and file names show', () => {
  const a = { id: 'x', type: 'general-purpose', description: 'Job', model: 'claude-sonnet-5-5', status: 'running', startedAt: 1000, lastAt: 1000, contextTokens: 0, contextMax: 1, tokens: 0, costUsd: 0, steps: 0, round: 1, why: 'cheap tier', action: 'editing cart.py', verdict: 'fail', result: 'broke', files: ['/p/cart.py'] } as AgentRun
  const lines = detailLines(a, 1000 + 4 * 60_000).join('\n')
  expect(lines).toContain('stalled')
  expect(lines).toContain('Why this tier: cheap tier')
  expect(lines).toContain('Now: editing cart.py')
  expect(lines).toContain('Verdict: FAIL')
  expect(lines).toContain('Result: broke')
  expect(lines).toContain('Files: cart.py')
})

test('describeAction: a few words per tool', () => {
  expect(describeAction('Edit', { file_path: '/a/b/cart.py' })).toBe('editing cart.py')
  expect(describeAction('Read', { file_path: 'C:\\a\\b.txt' })).toBe('reading b.txt')
  // Only the program: arguments can hold secrets.
  expect(describeAction('Bash', { command: 'curl -H "Authorization: Bearer abc123" https://x' })).toBe('running: curl')
  expect(describeAction('Bash', { command: '/usr/local/bin/python3 -m unittest' })).toBe('running: python3')
  expect(describeAction('Grep', {})).toBe('searching')
  expect(describeAction('mcp__duo-progress__step', {})).toBe('step')
  expect(describeAction('mcp__plugin_x_y__do_it', {})).toBe('do_it')
})

test('verdictOf: PASS or FAIL at the start of an answer, markdown allowed', () => {
  expect(verdictOf('PASS\n\nall good')).toBe('pass')
  expect(verdictOf('**FAIL**: the test broke')).toBe('fail')
  expect(verdictOf('The check passed')).toBeUndefined()
  expect(verdictOf(undefined)).toBeUndefined()
})

test('isStalled: only a running agent with no sign of life past the threshold', () => {
  const run = (o: Partial<AgentRun>) => ({ status: 'running', startedAt: 1000, lastAt: 1000, ...o }) as AgentRun
  expect(isStalled(run({}), 1000 + 3 * 60_000 + 1)).toBe(true)
  expect(isStalled(run({}), 1000 + 60_000)).toBe(false)
  expect(isStalled(run({ lastAt: 1000 + 170_000 }), 1000 + 3 * 60_000 + 1)).toBe(false)
  expect(isStalled(run({ status: 'done' }), 1e9)).toBe(false)
})

// ---- needs attention ----
import { layersOf, needsOf, planSvg, rowSvg, statusSvg, taskRowsOf } from './register'

const mk = (o: Partial<AgentRun>): AgentRun =>
  ({ id: 'x', type: 'general-purpose', description: 'Job', model: 'claude-sonnet-5-5', status: 'running', startedAt: 0, lastAt: 0, contextTokens: 0, contextMax: 1, tokens: 0, costUsd: 0, steps: 0, round: 1, ...o }) as AgentRun

test('needsOf: failed first, then the longest-quiet stalled; healthy, finished and FAIL-answer agents are left out', () => {
  const at = 10 * 60_000
  const list = [
    mk({ id: 'ok', lastAt: at - 1000 }),
    mk({ id: 'quiet5', lastAt: at - 5 * 60_000 }),
    mk({ id: 'quiet9', lastAt: at - 9 * 60_000 }),
    mk({ id: 'bad', status: 'failed' }),
    mk({ id: 'done', status: 'done' }),
    mk({ id: 'fail', status: 'done', verdict: 'fail' }),
  ]
  expect(needsOf(list, at).map(n => [n.a.id, n.kind])).toEqual([['bad', 'failed'], ['quiet9', 'stalled'], ['quiet5', 'stalled']])
})

test('statusSvg: the job, how far it is, what is running, the time and the limit', () => {
  const list = [mk({ id: 'a', status: 'done', endedAt: 30_000 }), mk({ id: 'b', lastAt: 29_000 }), mk({ id: 'c', status: 'failed', endedAt: 20_000 })]
  const { source } = statusSvg(480, list, 30_000, 'Big job', 5, [{ kind: 'five_hour', percentUsed: 27 }])
  expect(source).toContain('Big job')
  expect(source).toContain('2/5 done')
  expect(source).toContain('1 running')
  expect(source).toContain('1 failed')
  expect(source).toContain('5h 27%')
})

const PLAN = { title: 'Plan', total: 3, done: 0, running: 0, phase: 'delegate', isFinished: false, tasks: [{ title: 'Map', tier: 'duo-low', after: [] }, { title: 'Build', tier: 'duo-high', after: [1] }, { title: 'Check', tier: 'duo-verifier', after: [1, 2] }] } as Parameters<typeof taskRowsOf>[0]

test('taskRowsOf: plan order, a started task takes its agent, the rest wait; agents of no task follow', () => {
  const list = [mk({ id: 'm', description: 'Map', status: 'done' }), mk({ id: 'x', description: 'Odd job' })]
  const rows = taskRowsOf(PLAN, list)
  expect(rows.map(r => [r.n, r.title, r.a?.id])).toEqual([[1, 'Map', 'm'], [2, 'Build', undefined], [3, 'Check', undefined], [undefined, 'Odd job', 'x']])
  expect(taskRowsOf(null, list).map(r => r.title)).toEqual(['Map', 'Odd job'])
  expect(taskRowsOf({ ...PLAN, isFinished: true }, list).map(r => [r.n, r.title])).toEqual([[1, 'Map'], [undefined, 'Odd job']]) // a finished job keeps its plan, minus tasks that never started
})

test('layersOf: a task sits one layer below everything it waits for; agents of no task come last', () => {
  const rows = taskRowsOf(PLAN, [mk({ id: 'x', description: 'Odd job' })])
  expect(layersOf(rows)).toEqual([0, 1, 2, 3])
  expect(layersOf(taskRowsOf(null, [mk({ id: 'a' }), mk({ id: 'b', description: 'Other' })]))).toEqual([0, 0])
})

test('planSvg: a card per task with its tier colour, arrows from what it waits for, a bar per card', () => {
  const rows = taskRowsOf(PLAN, [mk({ id: 'm', description: 'Map', status: 'done', endedAt: 5000 })])
  const { source, height } = planSvg(480, rows, 6000)
  expect(source).toContain('1. Map')
  expect(source).toContain('3. Check')
  expect(source.split('stroke-dasharray').length - 1).toBe(2) // the two tasks that have not started are dashed
  expect(source).toContain('<path d="M') // arrows
  expect(height).toBeGreaterThan(120)
})

test('planSvg: a failed card is red, a stalled one amber; text from an agent cannot break the drawing', () => {
  const rows = taskRowsOf(null, [mk({ id: 'f', description: 'x<y & "z" </text><script>', status: 'failed' }), mk({ id: 's', description: 'Quiet', lastAt: 0 })])
  const { source } = planSvg(480, rows, 10 * 60_000)
  expect(source).toContain('#E5484D')
  expect(source).toContain('#D4A24C')
  expect(source).not.toContain('<script>')
})

test('planSvg: many agents without a plan wrap into a grid, smaller from twenty-five on', () => {
  const few = planSvg(632, taskRowsOf(null, Array.from({ length: 12 }, (_, i) => mk({ id: `a${i}`, description: `Job ${i}` }))), 5)
  const many = planSvg(632, taskRowsOf(null, Array.from({ length: 60 }, (_, i) => mk({ id: `a${i}`, description: `Job ${i}` }))), 5)
  expect(few.height).toBeLessThan(400)
  expect(many.height).toBeLessThan(60 * 20)
})

test('band: a warning count shows beside the usage', () => {
  const f = { title: 'Job', total: 3, done: 1, running: 1, phase: 'delegate', isFinished: false } as Parameters<typeof rowSvg>[0]
  expect(rowSvg(f, 600, true, '5h 18%', '⚠ 2')).toContain('⚠ 2 · Usage 5h 18%')
})

// ---- accessibility ----
import { contrast, inkOn } from './register'

test('contrast: the muted text colours meet 4.5:1 on their backgrounds, light and dark', () => {
  expect(contrast('#666666', '#ffffff')).toBeGreaterThanOrEqual(4.5) // band tail, light
  expect(contrast('#75756f', '#ffffff')).toBeGreaterThanOrEqual(4.5) // panel labels, light
  expect(contrast('#a6a6a6', '#1e1e1e')).toBeGreaterThanOrEqual(4.5) // band tail, dark
  expect(contrast('#9a9a96', '#262625')).toBeGreaterThanOrEqual(4.5) // panel labels, dark
})

test('inkOn: dark ink on the light fills the bar uses, white on a dark one', () => {
  expect(inkOn('#5fbf8f')).toBe('#10151a')
  expect(inkOn('#8f8cf4')).toBe('#10151a')
  expect(inkOn('#1f2a44')).toBe('#ffffff')
  expect(contrast('#5fbf8f', inkOn('#5fbf8f'))).toBeGreaterThanOrEqual(4.5)
  expect(contrast('#8f8cf4', inkOn('#8f8cf4'))).toBeGreaterThanOrEqual(4.5)
})

test('band: the pill text uses the ink that reads on its fill', () => {
  const f = { title: 'Job', total: 1, done: 1, running: 0, phase: 'close', isFinished: true } as Parameters<typeof rowSvg>[0]
  expect(rowSvg(f, 600, false)).toContain('fill="#10151a">Done</text>')
})

// ---- fixes from the review ----
import { mdCell } from './register'

test('receiptMarkdown: free text from an agent cannot become a link, an image, a heading or HTML', () => {
  const hostile = '![x](https://evil.example/p.png?q=1) [click](https://evil.example) <img src=x onerror=alert(1)> # heading `code`'
  const a = mk({ status: 'done', type: 'general-purpose', description: hostile, result: hostile, files: ['/p/a`b.py', '/p/![x](y).md'], endedAt: 5 })
  const md = receiptMarkdown({ at: 0, title: hostile, used: '', agents: [a] })
  // No unescaped markdown constructs survive.
  expect(md).not.toMatch(/(^|[^\\])!\[/)
  expect(md).not.toMatch(/(^|[^\\])\]\(/)
  expect(md).not.toMatch(/(^|[^\\])</)
  expect(md.split('\n').filter(l => /^#{1,6} /.test(l)).length).toBe(2) // only our own two headings
})

test('mdCell: escapes the characters that make markdown, keeps plain words and hyphens', () => {
  expect(mdCell('duo-low runs *fast* [now]')).toBe('duo-low runs \\*fast\\* \\[now\\]')
  expect(mdCell('a   b\n c')).toBe('a b c')
})

test('implicit flow: agents that follow each other closely are one run; a later one starts a new run', async ($, on) => {
  let t = 1000
  on('clock.now', () => ({ value: t }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await spawn($, 'r1', 'First job')
  t += 1000
  await $.turn.complete({ agentId: 'r1', reason: 'answer', answer: 'ok' } as never)
  t += 1000
  await spawn($, 'r2', 'Second job, right after')
  let md = await receipt($)
  expect(md).toContain('First job')
  expect(md).toContain('Second job, right after')
  expect(md).toContain('2 agents')

  t += 1000
  await $.turn.complete({ agentId: 'r2', reason: 'answer', answer: 'ok' } as never)
  t += 10 * 60_000 // a long pause: the next one is a new run
  await spawn($, 'r3', 'Much later job')
  md = await receipt($)
  expect(md).toContain('Much later job')
  expect(md).toContain('1 agent')
  expect(md).not.toContain('First job')
})

test('isStalled: a running tool call gets the longer allowance', () => {
  const at = 5 * 60_000
  const quiet = mk({ lastAt: 0 })
  expect(isStalled(quiet, at)).toBe(true) // 5 minutes of silence
  expect(isStalled({ ...quiet, busy: true }, at)).toBe(false) // a build may take that long
  expect(isStalled({ ...quiet, busy: true }, 11 * 60_000)).toBe(true) // but not forever
})

test('contrast: the colours the band and the panel really use meet 4.5:1', () => {
  // The first `.m{fill:#…}` in the light rules and the first one after the dark media query.
  const muted = (css: string): { light: string; dark: string } => {
    const at = css.indexOf('prefers-color-scheme: dark')
    const pick = (t: string): string => /\.m\{fill:(#[0-9a-f]{6})\}/.exec(t)?.[1] ?? ''
    return { light: pick(css.slice(0, at)), dark: pick(css.slice(at)) }
  }
  const f = { title: 'Job', total: 1, done: 1, running: 0, phase: 'close', isFinished: true } as Parameters<typeof rowSvg>[0]
  const band = muted(rowSvg(f, 600, false))
  expect(band.light).toMatch(/^#/)
  expect(band.dark).toMatch(/^#/)
  expect(contrast(band.light, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  expect(contrast(band.dark, '#1e1e1e')).toBeGreaterThanOrEqual(4.5)
  const panel = muted(statusSvg(480, [mk({ status: 'done' })], 0, 'x', 1).source)
  expect(panel.light).toMatch(/^#/)
  expect(panel.dark).toMatch(/^#/)
  expect(contrast(panel.light, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  expect(contrast(panel.dark, '#262625')).toBeGreaterThanOrEqual(4.5)
})

// ---- the panel shows the current run; no Collapse button ----
import { inRun } from './register'

test('inRun: an implicit flow shows only the agents since its window began; any other flow shows them all', () => {
  const old = mk({ id: 'old', startedAt: 100 })
  const fresh = mk({ id: 'fresh', startedAt: 5000 })
  const implicit = { isImplicit: true, since: 5000 } as Parameters<typeof inRun>[0]
  expect(inRun(implicit, [old, fresh]).map(a => a.id)).toEqual(['fresh'])
  expect(inRun({ isImplicit: false } as Parameters<typeof inRun>[0], [old, fresh]).length).toBe(2)
  expect(inRun(null, [old, fresh]).length).toBe(2)
})

test('panel: there is no Collapse or Expand button, in the desktop or the terminal view', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  await spawn($, 'c1', 'A job')
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'duo-progress', surface, component: 'Pane', requestId: 'duo-agents', props: { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } })
    expect(await ui.find({ key: 'compact' })).toBeUndefined()
  }
})

// ---- one layout, two bodies ----
import { nextView } from './register'

test('nextView: grouped above the threshold, and back to detailed only at five or fewer', () => {
  expect(nextView(undefined, 3)).toBe('detail')
  expect(nextView('detail', 8)).toBe('detail')
  expect(nextView('detail', 9)).toBe('grouped')
  expect(nextView('grouped', 8)).toBe('grouped') // no flip back at the edge
  expect(nextView('grouped', 6)).toBe('grouped')
  expect(nextView('grouped', 5)).toBe('detail')
  expect(nextView('grouped', 0)).toBe('detail')
})

// ---- what happened, at a glance ----
import { verdictCounts } from './register'

test('verdictCounts: PASS and FAIL counted; the run\'s usage rides on the status line', () => {
  const list = [mk({ id: 'a', status: 'done', verdict: 'pass' }), mk({ id: 'b', status: 'done', verdict: 'pass' }), mk({ id: 'c', status: 'done', verdict: 'fail' })]
  expect(verdictCounts(list)).toEqual({ pass: 2, fail: 1 })
  expect(statusSvg(640, list, 9000, 'Job', 3, [], 0, 'this run: 1% 5h').source).toContain('this run: 1% 5h')
})

test('verdictOf: an agent that corrects itself is read by its last PASS or FAIL line', () => {
  expect(verdictOf('FAIL. the header only says what it does.\n\nCorrection: it does say why.\n\nPASS: it gives a reason.')).toBe('pass')
  expect(verdictOf('PASS\nbut later\nFAIL: broke')).toBe('fail')
})
