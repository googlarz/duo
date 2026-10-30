import { expect, test } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { headerSvg, limitTile, stepsDone } from './register'

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
  expect(withLimit).toContain('Limit 5h · 7d')
  expect(withLimit).toContain('9% · 31%')
  expect(withLimit).not.toContain('≈$0.39')
  const without = headerSvg(320, '', totalsOf, [])
  expect(without).toContain('Cost')
  expect(without).toContain('≈$0.39')
})
