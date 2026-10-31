import { expect, test } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { baseOf, limitTile, statusSvg, rowSvg, runDelta, runSentence, stepsDone, usageReport, usageShort } from './register'

test('limitTile: both windows, label names them, value their rounded percentages', () => {
  expect(limitTile([{ kind: 'five_hour', percentUsed: 9.4 }, { kind: 'seven_day', percentUsed: 31 }])).toEqual({ label: '5h · 7d', value: '9% · 31%' })
})

test('limitTile: one window only', () => {
  expect(limitTile([{ kind: 'seven_day', percentUsed: 62.5 }])).toEqual({ label: '7d', value: '63%' })
})

test('limitTile: no reading, a spend limit or a non-number gives null', () => {
  expect(limitTile([])).toBeNull()
  expect(limitTile([{ kind: 'spend_limit', percentUsed: 40 }])).toBeNull()
  expect(limitTile([{ kind: 'five_hour', percentUsed: Number.NaN }])).toBeNull()
})

const run = (o: Partial<AgentRun>) => ({ status: 'running', stepTotal: 2, stepDone: 0, ...o }) as AgentRun

test('stepsDone: a finished run shows every step done', () => {
  expect(stepsDone(run({ status: 'done' }))).toBe(2)
})

test('stepsDone: a running run shows what it reported; none reported is 0', () => {
  expect(stepsDone(run({ stepDone: 1 }))).toBe(1)
  expect(stepsDone(run({ stepDone: undefined }))).toBe(0)
})

test('stepsDone: a finished run without a plan keeps its count', () => {
  expect(stepsDone(run({ status: 'done', stepTotal: undefined, stepDone: 3 }))).toBe(3)
})

const noAgents: AgentRun[] = []

test('status: with a reading the limit is on top; without, the cost', () => {
  const withLimit = statusSvg(480, noAgents, 0, '', 0, [{ kind: 'five_hour', percentUsed: 9 }, { kind: 'seven_day', percentUsed: 31 }]).source
  for (const part of ['>5h<', '>9%<', '>7d<', '>31%<']) expect(withLimit).toContain(part) // each window named, with its own percentage
  expect(withLimit).not.toContain('≈$')
  expect(statusSvg(480, noAgents, 0, '', 0, []).source).toContain('≈$0.00')
})

test('usageReport: the usage file shape, reset in epoch seconds', () => {
  const r = JSON.parse(usageReport([{ kind: 'five_hour', percentUsed: 11, resetsAt: '2026-10-30T12:00:00Z' }, { kind: 'seven_day', percentUsed: 32 }]))
  expect(r.five_hour).toEqual({ used_percentage: 11, resets_at: Date.parse('2026-10-30T12:00:00Z') / 1000 })
  expect(r.seven_day).toEqual({ used_percentage: 32 })
})

test('usageReport: no reading is a plain sentence, not JSON', () => {
  expect(usageReport([])).toStartWith('no reading')
  expect(usageReport([{ kind: 'spend_limit', percentUsed: 5 }])).toStartWith('no reading')
})

test('usageShort: the 5-hour window first, else the weekly one, else nothing', () => {
  expect(usageShort([{ kind: 'seven_day', percentUsed: 32 }, { kind: 'five_hour', percentUsed: 11.6 }])).toBe('5h 12%')
  expect(usageShort([{ kind: 'seven_day', percentUsed: 32 }])).toBe('7d 32%')
  expect(usageShort([])).toBe('')
})

const flowOf = { title: 'hello.txt test 3', total: 2, done: 2, running: 0, phase: 'close', isFinished: true } as Parameters<typeof rowSvg>[0]

test('band: the dithered, twinkling fill is kept; usage is named and the flow percent left out', () => {
  const svg = rowSvg(flowOf, 600, false, '5h 12%')
  expect(svg).toContain('Usage 5h 12%')
  expect(svg).not.toContain('>100%<')
  expect(svg).toContain('class="t0"')
  expect(svg).toContain('@keyframes tw')
})

test('band: without a reading the text is just the percent; a working bar breathes', () => {
  expect(rowSvg(flowOf, 600, false)).toContain('>100%</text>')
  expect(rowSvg({ ...flowOf, isFinished: false, done: 1, running: 1 }, 600, true)).toContain('animation:tw 2.2s')
})

const at = (five: number, seven: number) => [{ kind: 'five_hour', percentUsed: five }, { kind: 'seven_day', percentUsed: seven }]

test('runDelta: what the run added per window; a window that reset or has no base is left out', () => {
  const base = baseOf(at(9, 31))
  expect(runDelta(base, at(13, 32))).toEqual([{ short: '5h', pct: 4 }, { short: '7d', pct: 1 }])
  expect(runDelta(base, at(2, 32))).toEqual([{ short: '7d', pct: 1 }])
  expect(runDelta(null, at(13, 32))).toEqual([])
  expect(runDelta(base, [])).toEqual([])
})

test('runDelta: fractions are kept to one decimal', () => {
  expect(runDelta(baseOf(at(9.1, 31)), at(9.6, 31))).toEqual([{ short: '5h', pct: 0.5 }, { short: '7d', pct: 0 }])
})

test('runSentence: plain words for the orchestrator; empty when nothing is known', () => {
  expect(runSentence([{ short: '5h', pct: 4 }, { short: '7d', pct: 1 }])).toBe(' This run used 4% of the 5-hour window and 1% of the weekly window.')
  expect(runSentence([])).toBe('')
})

test('usageShort: with a base the band adds what the run used', () => {
  expect(usageShort(at(13, 32), baseOf(at(9, 31)))).toBe('5h 13% (+4%)')
  expect(usageShort(at(13, 32), baseOf(at(13, 32)))).toBe('5h 13%')
  expect(usageShort(at(13, 32))).toBe('5h 13%')
})

// ---- reset countdown ----
import { timeLeft } from './register'

test('timeLeft: days, hours and minutes, never a negative or empty string', () => {
  expect(timeLeft(4 * 3_600_000 + 36 * 60_000)).toBe('4h 36m')
  expect(timeLeft(36 * 60_000)).toBe('36m')
  expect(timeLeft(20_000)).toBe('<1m')
  expect(timeLeft(91 * 3_600_000 + 36 * 60_000)).toBe('3d 19h')
})

const iso = (ms: number) => new Date(ms).toISOString()
const NOW = Date.parse('2026-10-30T12:00:00Z')

test('limitTile: the 5-hour reset is shown and both resets are in the tip', () => {
  const t = limitTile(
    [
      { kind: 'five_hour', percentUsed: 3, resetsAt: iso(NOW + 4 * 3_600_000 + 36 * 60_000) },
      { kind: 'seven_day', percentUsed: 35, resetsAt: iso(NOW + 91 * 3_600_000) },
    ],
    NOW,
  )
  expect(t?.reset).toBe('4h 36m')
  expect(t?.tip).toContain('5h resets in 4h 36m')
  expect(t?.tip).toContain('7d resets in 3d 19h')
})

test('limitTile: without a clock or a reset time there is no countdown', () => {
  expect(limitTile([{ kind: 'five_hour', percentUsed: 3, resetsAt: iso(NOW + 3_600_000) }])?.reset).toBeUndefined()
  expect(limitTile([{ kind: 'five_hour', percentUsed: 3 }], NOW)?.reset).toBeUndefined()
  expect(limitTile([{ kind: 'five_hour', percentUsed: 3, resetsAt: iso(NOW - 1000) }], NOW)?.reset).toBeUndefined()
})

test('status: the reset countdown sits beside the limit', () => {
  const lim = [{ kind: 'five_hour', percentUsed: 3, resetsAt: iso(NOW + 4 * 3_600_000 + 36 * 60_000) }]
  expect(statusSvg(640, noAgents, 0, '', 0, lim, NOW).source).toContain('resets in 4h 36m')
  expect(statusSvg(640, noAgents, 0, '', 0, lim).source).not.toContain('↻')
})
