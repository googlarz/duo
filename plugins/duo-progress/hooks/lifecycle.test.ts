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
import { attentionOf, groupedSvg, rowSvg } from './register'

const mk = (o: Partial<AgentRun>): AgentRun =>
  ({ id: 'x', type: 'general-purpose', description: 'Job', model: 'claude-sonnet-5-5', status: 'running', startedAt: 0, lastAt: 0, contextTokens: 0, contextMax: 1, tokens: 0, costUsd: 0, steps: 0, round: 1, ...o }) as AgentRun

test('attentionOf: failed first, then the longest-quiet stalled; healthy and finished agents are left out', () => {
  const at = 10 * 60_000
  const list = [
    mk({ id: 'ok', lastAt: at - 1000 }),
    mk({ id: 'quiet5', lastAt: at - 5 * 60_000 }),
    mk({ id: 'quiet9', lastAt: at - 9 * 60_000 }),
    mk({ id: 'bad', status: 'failed' }),
    mk({ id: 'done', status: 'done' }),
  ]
  expect(attentionOf(list, at).map(a => a.id)).toEqual(['bad', 'quiet9', 'quiet5'])
})

test('groupedSvg: a Needs attention block names the stalled and failed agents with their last action', () => {
  const at = 20 * 60_000
  const list = Array.from({ length: 12 }, (_, i) => mk({ id: `h${i}`, description: `truth:H${i}`, lastAt: at - 1000 }))
  list.push(mk({ id: 's1', description: 'truth:Stuck one', lastAt: at - 6 * 60_000, action: 'running: python3 slow.py' }))
  list.push(mk({ id: 'f1', description: 'truth:Broken one', status: 'failed', result: 'the build failed', endedAt: at }))
  const { source } = groupedSvg(480, list, at, 'Big job')
  expect(source).toContain('NEEDS ATTENTION · 2')
  expect(source).toContain('Stuck one')
  expect(source).toContain('stalled 6')
  expect(source).toContain('running: python3 slow.py')
  expect(source).toContain('Broken one')
  expect(source).toContain('the build failed')
})

test('groupedSvg: with every agent healthy there is no attention block', () => {
  const at = 5000
  const list = Array.from({ length: 10 }, (_, i) => mk({ id: `h${i}`, lastAt: at }))
  expect(groupedSvg(480, list, at, 'Big job').source).not.toContain('NEEDS ATTENTION')
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

test('implicit flow: a second run starts its own window; the receipt holds only that run', async ($, on) => {
  let t = 1000
  on('clock.now', () => ({ value: (t += 1000) }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await spawn($, 'r1', 'First run job')
  await $.turn.complete({ agentId: 'r1', reason: 'answer', answer: 'ok' } as never)
  expect(await receipt($)).toContain('First run job')
  // The clock moves on, a new agent starts: a new window.
  await spawn($, 'r2', 'Second run job')
  const md = await receipt($)
  expect(md).toContain('Second run job')
  expect(md).toContain('1 agent')
  expect(md).not.toContain('First run job')
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
  const panel = muted(groupedSvg(480, [mk({ status: 'done' })], 0, 'x').source)
  expect(panel.light).toMatch(/^#/)
  expect(panel.dark).toMatch(/^#/)
  expect(contrast(panel.light, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  expect(contrast(panel.dark, '#262625')).toBeGreaterThanOrEqual(4.5)
})
