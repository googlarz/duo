import { expect, test } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { headerSvg, limitTile, rowSvg, stepsDone, usageReport, usageShort } from './register'

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

const totalsOf = { cost: 0.39, tokens: 319000, time: 31 } as Parameters<typeof headerSvg>[2]

test('header: with a reading the first tile is the limit; without, the cost', () => {
  const withLimit = headerSvg(320, '', totalsOf, [{ kind: 'five_hour', percentUsed: 9 }, { kind: 'seven_day', percentUsed: 31 }])
  expect(withLimit).toContain('Usage 5h · 7d')
  expect(withLimit).toContain('9% · 31%')
  expect(withLimit).not.toContain('≈$0.39')
  const without = headerSvg(320, '', totalsOf, [])
  expect(without).toContain('Cost')
  expect(without).toContain('≈$0.39')
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

test('band: solid bar, no dither, usage named and the flow percent left out', () => {
  const svg = rowSvg(flowOf, 600, false, '5h 12%')
  expect(svg).toContain('Usage 5h 12%')
  expect(svg).not.toContain('>100%<')
  expect(svg).not.toContain('class="t0"')
  expect(svg).not.toContain('twinkle')
})

test('band: without a reading the text is just the percent; a working bar breathes', () => {
  expect(rowSvg(flowOf, 600, false)).toContain('>100%</text>')
  expect(rowSvg({ ...flowOf, isFinished: false, done: 1, running: 1 }, 600, true)).toContain('class="run"')
})
