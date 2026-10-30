import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentRun } from '../types'
import { agentsWord, barWidths, COSTUMES, COSTUME_ALIAS, GROUP_THRESHOLD, STAGE_COSTUME_NAMES, costumeOf, groupAgents, groupKey, modelMix, stageCostume, tally } from './register'

const run = (description: string, over: Partial<AgentRun> = {}): AgentRun => ({
  id: description + Math.random(), type: 'workflow-subagent', description, model: 'claude-opus-5-5', status: 'done', startedAt: 1000,
  contextTokens: 0, contextMax: 1e6, tokens: 100, costUsd: 0, steps: 0, round: 1, ...over,
})

test('groupKey: the prefix before the first colon, trimmed and lowercased', () => {
  expect(groupKey('truth:A10')).toBe('truth')
  expect(groupKey('  Value : x')).toBe('value')
  expect(groupKey('a:b:c')).toBe('a')
})

test('groupKey: no usable prefix is other', () => {
  expect(groupKey('Fix the parser')).toBe('other')
  expect(groupKey(':lead')).toBe('other')
  expect(groupKey('   : x')).toBe('other')
  expect(groupKey('x'.repeat(25) + ':y')).toBe('other')
  expect(groupKey('x'.repeat(24) + ':y')).toBe('x'.repeat(24))
  expect(groupKey('')).toBe('other')
})

test('groupAgents: ordered by earliest start, counted by status, model line is the most common', () => {
  const list = [
    run('b:1', { startedAt: 30, status: 'running' }),
    run('a:1', { startedAt: 10, model: 'claude-sonnet-5-5', effort: 'high' }),
    run('b:2', { startedAt: 5, status: 'failed' }),
    run('plain', { startedAt: 40 }),
    run('a:2', { startedAt: 20, model: 'claude-sonnet-5-5', effort: 'high' }),
    run('a:3', { startedAt: 21, model: 'claude-opus-5-5', effort: 'low' }),
  ]
  const g = groupAgents(list)
  expect(g.map(x => x.key)).toEqual(['b', 'a', 'other'])
  expect(g[0]).toMatchObject({ done: 0, running: 1, failed: 1 })
  expect(g[1]).toMatchObject({ done: 3, model: 'Sonnet 5.5 · high' })
  expect(g[2]?.agents).toHaveLength(1)
})

test('modelMix: token shares and the top model; a single model is not mixed', () => {
  const mixed = modelMix([run('a:1', { tokens: 900 }), run('a:2', { tokens: 100, model: 'claude-sonnet-5-5' })])
  expect(mixed.isMixed).toBe(true)
  expect(mixed.rows.map(r => [r.name, r.pct, r.agents])).toEqual([['Opus 5.5', 90, 1], ['Sonnet 5.5', 10, 1]])
  expect(mixed.top?.color).toBe('#8E78FF')
  const one = modelMix([run('a:1'), run('a:2')])
  expect(one.isMixed).toBe(false)
  expect(one.rows[0]?.pct).toBe(100)
  expect(modelMix([run('a:1', { tokens: 0 }), run('b:1', { tokens: 0, model: 'claude-sonnet-5-5' })]).rows.map(r => r.pct)).toEqual([50, 50])
})

test('tally: running, done and failed add up', () => {
  expect(tally([run('a', { status: 'running' }), run('b'), run('c', { status: 'failed' })])).toEqual({ total: 3, running: 1, failed: 1, done: 1, finished: 2 })
})

test('costumes: stage keywords and agent types map to costumes that exist', () => {
  expect(stageCostume('truth')).toBe('detective')
  expect(stageCostume('reviewer')).toBe('monocle')
  expect(stageCostume('risk2')).toBe('hardhat')
  expect(stageCostume('ideate')).toBe('bulb')
  expect(stageCostume('whatever')).toBe('other')
  expect(stageCostume('deploy')).toBe('rocket')
  expect(stageCostume('build-2')).toBe('robot')
  expect(stageCostume('analysis')).toBe('scientist')
  expect(stageCostume('ui')).toBe('artist')
  expect(stageCostume('perf')).toBe('ninja')
  expect(stageCostume('fix')).toBe('doctor')
  expect(stageCostume('docs')).toBe('librarian')
  expect(stageCostume('migrate')).toBe('viking')
  expect(stageCostume('lint')).toBe('cleaner')
  expect(stageCostume('enforce')).toBe('cyborg')
  expect(stageCostume('parallel')).toBe('thunder')
  expect(stageCostume('hotfix')).toBe('fireninja')
  expect(stageCostume('cache')).toBe('iceninja')
  for (const name of STAGE_COSTUME_NAMES) expect(COSTUMES[name]).toBeDefined()
  expect([...STAGE_COSTUME_NAMES].sort()).toEqual(['artist', 'bulb', 'cleaner', 'cyborg', 'detective', 'doctor', 'explorer', 'fireninja', 'hardhat', 'iceninja', 'judge', 'librarian', 'monocle', 'ninja', 'quill', 'robot', 'rocket', 'scientist', 'thunder', 'viking', 'wizard'])
  for (const look of Object.values(COSTUME_ALIAS)) expect(COSTUMES[look]).toBeDefined()
  expect(costumeOf('duo:duo-advisor')).toBe('duo-advisor')
  expect(COSTUME_ALIAS['duo-advisor']).toBe('wizard')
  expect(COSTUME_ALIAS['duo-reviewer']).toBe('monocle')
  expect(COSTUME_ALIAS['duo-verifier']).toBe('detective')
  expect(COSTUME_ALIAS['duo-opus']).toBe('crown')
})

// The switch: up to GROUP_THRESHOLD agents the detailed rows, one more and the grouped view.
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const spawnMany = async ($: Engine, on: On, n: number, isSetUp = false) => {
  if (!isSetUp) {
    mock.clock(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  }
  for (let i = 0; i < n; i++) {
    await $.agent.spawn({ tool_use_id: `t${i}`, prompt: 'p', description: `${i % 2 ? 'truth' : 'scan'}:A${i}`, subagentType: 'workflow-subagent', provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)
  }
}

// The terminal still switches between per-agent rows and per-stage lines (with a margin); the desktop has one body.
for (const [n, grouped] of [[GROUP_THRESHOLD, false], [GROUP_THRESHOLD + 1, true]] as const) {
  test(`terminal: ${n} agents draw the ${grouped ? 'grouped' : 'detailed'} view`, async ($, on) => {
    await spawnMany($, on, n)
    const ui = await $.ui.mount({ plugin: 'duo-progress', surface: 'terminal', component: 'Pane', requestId: 'duo-agents', props: pane })
    expect((await ui.find({ key: 'open-t0' })) !== undefined).toBe(!grouped)
  })
}

const desktop = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: 'duo-progress', surface: 'desktop', component: 'Pane', requestId: 'duo-agents', props: pane })
  return { ui, drawn: (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('') }
}

test('desktop: one picture of all the agents, whatever the count, with no switches', async ($, on) => {
  await spawnMany($, on, 12)
  const { ui, drawn } = await desktop($)
  expect(drawn).not.toContain('STAGES')
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(3) // grid, status line, the plan picture
  expect(drawn).toContain('truth:A11')
  expect(await ui.find({ key: 'open-t0' })).toBeUndefined()
})

test('desktop: the top says how far the job is and shows the limit, not tiles', async ($, on) => {
  await spawnMany($, on, 3)
  const { drawn } = await desktop($)
  expect(drawn).toContain('0/3 done')
  expect(drawn).toContain('3 running')
  expect(drawn).not.toContain('Tokens')
})

test('terminal: grouped lines never exceed the columns', async ($, on) => {
  await spawnMany($, on, 12)
  const ui = await $.ui.mount({ plugin: 'duo-progress', surface: 'terminal', component: 'Pane', requestId: 'duo-agents', props: { ...pane, bodyColumns: 30 } })
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.length).toBeGreaterThan(5)
  for (const t of texts) for (const line of String(t.props.children ?? '').split('\n')) expect([...line].length).toBeLessThanOrEqual(30)
})

test('grouped: the Finished list starts closed, shows the count, and opens with its own switch', async ($, on) => {
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await spawnMany($, on, 10)
  for (let i = 0; i < 3; i++) await $.turn.complete({ agentId: `t${i}`, reason: 'answer', answer: 'ok' } as never)
  const ui = await $.ui.mount({ plugin: 'duo-progress', surface: 'terminal', component: 'Pane', requestId: 'duo-agents', props: pane })
  const toggle = await ui.find({ key: 'done' })
  expect(String(toggle?.props.label)).toMatch(/^▸ Finished · 3/)
  await ui.press({ key: 'done' })
  expect(String((await ui.find({ key: 'done' }))?.props.label)).toMatch(/^▾ Finished · 3/)
})

test('desktop: a small run shows every row, finished ones included, with no switch', async ($, on) => {
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await spawnMany($, on, 10)
  for (let i = 0; i < 3; i++) await $.turn.complete({ agentId: `t${i}`, reason: 'answer', answer: 'PASS: all good' } as never)
  const { ui, drawn } = await desktop($)
  expect(drawn).toContain('scan:A0')
  expect(drawn).toContain('3/10 done')
  expect(await ui.find({ key: 'done' })).toBeUndefined()
})

test('barWidths: the segments fill the bar exactly and the last never goes negative', () => {
  expect(barWidths([90, 10], 200)).toEqual([180, 20])
  const many = barWidths([97, 1, 1, 1], 6)
  expect(many.every(w => w >= 0)).toBe(true)
  expect(many.reduce((n, w) => n + w, 0)).toBe(6)
  expect(barWidths([], 50)).toEqual([])
})

test('agentsWord: singular and plural', () => {
  expect(agentsWord(1)).toBe('agent')
  expect(agentsWord(2)).toBe('agents')
})

test('groupAgents: does not change its input and keeps agents in order', () => {
  const list = [run('a:1'), run('b:1'), run('a:2')]
  const copy = [...list]
  const g = groupAgents(list)
  expect(list).toEqual(copy)
  expect(g[0]?.agents.map(a => a.description)).toEqual(['a:1', 'a:2'])
})

test('grouped: planned tasks show as a Planned line, and a long finished list ends in +N (terminal)', async ($, on) => {
  on('turn.complete', () => ({ text: 'ok' }) as never)
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  await $.tool.call({ tool: 'mcp__duo-progress__progress', title: 'F', phase: 'delegate', tasks: [{ title: 'Later one', tier: 'light' }, { title: 'Later two', tier: 'light' }] } as never)
  await spawnMany($, on, 70, true)
  for (let i = 0; i < 70; i++) await $.turn.complete({ agentId: `t${i}`, reason: 'answer', answer: 'ok' } as never)
  const ui = await $.ui.mount({ plugin: 'duo-progress', surface: 'terminal', component: 'Pane', requestId: 'duo-agents', props: pane })
  expect(await ui.find({ type: 'Text', text: /Planned · 2/ })).toBeDefined()
  await ui.press({ key: 'done' })
  expect(await ui.find({ type: 'Text', text: /\+10/ })).toBeDefined()
})
