import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Flow, Panel, Phase, PlannedTask } from '../types'

const flow = atom({ plugin: 'duo-progress', key: 'flow' } as const, null)
const agents = atom({ plugin: 'duo-progress', key: 'agents' } as const, [])
const panel = atom({ plugin: 'duo-progress', key: 'panel' } as const, {
  isCompact: false,
  isDoneCollapsed: false,
  isFinishedOpen: false,
  autoOpenedFor: '',
  openIds: [] as string[],
})
const now = atom({ plugin: 'duo-progress', key: 'now' } as const, 0)
// The subscription windows the host reports (`$.session.usage()`, `session.measure`).
type Limit = { kind: string; percentUsed: number; resetsAt?: string }
const limits = atom({ plugin: 'duo-progress', key: 'limits' } as const, [] as Limit[])
// The usage when the current flow began: what a run cost is the move since.
type RunBase = Partial<Record<'five_hour' | 'seven_day', number>> | null
const runBase = atom({ plugin: 'duo-progress', key: 'runBase' } as const, null as RunBase)

const TOOL = 'mcp__duo-progress__progress'
const STEP_TOOL = 'mcp__duo-progress__step'
const USAGE_TOOL = 'mcp__duo-progress__usage'
const RECEIPT_TOOL = 'mcp__duo-progress__receipt'
// Added to the end of each duo-flow or duo worker's brief. Their system prompt words step
// reporting as a condition ("if the step tool appears among your tools") and they
// skip it even with the tool listed; the same request in the brief is followed.
const STEP_BRIEF = `

Progress reporting: before any other work, call \`${STEP_TOOL}\` with \`total\` (your plan in 3-8 steps), optionally \`plan\` (an array of their titles, a few words each) and \`done: 0\`; call it again with \`done\` and a few-word \`note\` as each step finishes. It only draws a progress bar.`
const PANE = 'duo-agents'
const PHASES: readonly Phase[] = ['plan', 'design', 'delegate', 'review', 'close']
const DUO_TIERS = ['duo-low', 'duo-medium', 'duo-high', 'duo-xhigh', 'duo-max', 'duo-opus', 'duo-advisor', 'duo-reviewer', 'duo-verifier'] as const
const TIERS: readonly string[] = ['fable', 'heavy', 'careful', 'medium', 'light', ...DUO_TIERS]
// The tools' schemas are advice to the model, not a check: what a call may ask
// the band and the panel to draw is bounded here.
const MAX_TASKS = 200
const MAX_AFTER = 20
const MAX_TITLE = 120
const MAX_STEPLOG = 40
const MAX_PLAN = 30
const MAX_NOTE = 80
const MAX_WHY = 140
const MAX_RESULT = 160
const MAX_FILES = 20
// An agent with no sign of life for this long is called stalled in the panel; a running tool call (a build, a test run) gets longer.
const STALL_MS = 3 * 60 * 1000
const STALL_BUSY_MS = 10 * 60 * 1000
// Agents started this soon after the last one ended belong to the same run.
const SAME_JOB_MS = 5 * 60 * 1000
const MAX_OPEN = 200
const ACCENT = '#8f8cf4'
const DONE = '#5fbf8f'

type ProgressInput = {
  title?: string
  total?: number
  done?: number
  phase?: Phase
  finished?: boolean
  tasks?: { title?: string; tier?: string; after?: number[]; why?: string }[]
}

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else the
// process locale; English when nothing says Hebrew or Russian.

type Lang = 'en' | 'ru' | 'he'

const STRINGS = {
  en: {
    pane: 'Agents',
    cost: 'Cost',
    limit: 'Usage',
    tokens: 'Tokens',
    time: 'Time',
    collapse: 'Collapse',
    expand: 'Expand',
    running: 'Running',
    finished: 'Finished',
    planned: 'Planned',
    empty: 'No subagents yet.',
    round: 'round',
    failed: 'error',
    after: 'after',
    tokensWord: 'tokens',
    agentOne: 'agent',
    agentFew: 'agents',
    agentsCount: 'agents',
    isRunning: 'running',
    isFinished: 'finished',
    isPlanned: 'planned',
    opened: 'Agents panel opened.',
    closed: 'Agents panel closed.',
    done: 'Done',
    plan: 'Plan',
    design: 'Design',
    tasks: 'Tasks',
    review: 'Review',
    busy: 'running',
    ctx: 'ctx',
    details: 'Details',
    model: 'Model',
    agentType: 'Agent',
    task: 'Task',
    status: 'Status',
    timeWord: 'Time',
    stepsWord: 'Steps',
    nowWord: 'Now',
    whyWord: 'Why this tier',
    resultWord: 'Result',
    verdictWord: 'Verdict',
    filesWord: 'Files',
    stalled: 'stalled',
    attention: 'Needs attention',
    groupModels: 'Models',
    groupStages: 'Stages',
    runningNow: 'Running now',
    moreRunning: 'more running',
    startedSoFar: 'started so far',
    nFinished: 'finished',
    totalWord: 'total',
    doneN: 'done',
    failedN: 'failed',
    shareOn: 'of tokens on',
    apiEq: 'API-equivalent',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', 'duo-low': 'duo-low', 'duo-medium': 'duo-medium', 'duo-high': 'duo-high', 'duo-xhigh': 'duo-xhigh', 'duo-max': 'duo-max', 'duo-opus': 'duo-opus', 'duo-advisor': 'duo-advisor', 'duo-reviewer': 'duo-reviewer', 'duo-verifier': 'duo-verifier', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  ru: {
    pane: 'Агенты',
    cost: 'Стоимость',
    limit: 'Расход',
    tokens: 'Токены',
    time: 'Время',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    running: 'Работают',
    finished: 'Завершены',
    planned: 'Запланированы',
    empty: 'Субагентов пока нет.',
    round: 'раунд',
    failed: 'ошибка',
    after: 'после',
    tokensWord: 'токенов',
    agentOne: 'агент',
    agentFew: 'агента',
    agentsCount: 'агентов',
    isRunning: 'работает',
    isFinished: 'завершён',
    isPlanned: 'запланирована',
    opened: 'Панель агентов открыта.',
    closed: 'Панель агентов закрыта.',
    done: 'Готово',
    plan: 'План',
    design: 'Дизайн',
    tasks: 'Задачи',
    review: 'Ревью',
    busy: 'в работе',
    ctx: 'ctx',
    details: 'Детали',
    model: 'Модель',
    agentType: 'Агент',
    task: 'Задача',
    status: 'Статус',
    timeWord: 'Время',
    stepsWord: 'Шаги',
    nowWord: 'Сейчас',
    whyWord: 'Почему этот уровень',
    resultWord: 'Результат',
    verdictWord: 'Вердикт',
    filesWord: 'Файлы',
    stalled: 'завис',
    attention: 'Требуют внимания',
    groupModels: 'Модели',
    groupStages: 'Этапы',
    runningNow: 'Сейчас работают',
    moreRunning: 'ещё работают',
    startedSoFar: 'запущено',
    nFinished: 'завершено',
    totalWord: 'всего',
    doneN: 'готово',
    failedN: 'с ошибкой',
    shareOn: 'токенов на',
    apiEq: 'по ценам API',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', 'duo-low': 'duo-low', 'duo-medium': 'duo-medium', 'duo-high': 'duo-high', 'duo-xhigh': 'duo-xhigh', 'duo-max': 'duo-max', 'duo-opus': 'duo-opus', 'duo-advisor': 'duo-advisor', 'duo-reviewer': 'duo-reviewer', 'duo-verifier': 'duo-verifier', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  he: {
    pane: 'סוכנים',
    cost: 'עלות',
    limit: 'שימוש',
    tokens: 'טוקנים',
    time: 'זמן',
    collapse: 'כיווץ',
    expand: 'הרחבה',
    running: 'פועלים',
    finished: 'הסתיימו',
    planned: 'מתוכננים',
    empty: 'עדיין אין סוכנים.',
    round: 'סבב',
    failed: 'שגיאה',
    after: 'אחרי',
    tokensWord: 'טוקנים',
    agentOne: 'סוכן',
    agentFew: 'סוכנים',
    agentsCount: 'סוכנים',
    isRunning: 'פועל',
    isFinished: 'הסתיים',
    isPlanned: 'מתוכנן',
    opened: 'חלונית הסוכנים נפתחה.',
    closed: 'חלונית הסוכנים נסגרה.',
    done: 'הושלם',
    plan: 'תכנון',
    design: 'עיצוב',
    tasks: 'משימות',
    review: 'בדיקה',
    busy: 'בעבודה',
    ctx: 'הקשר',
    details: 'פרטים',
    model: 'מודל',
    agentType: 'סוכן',
    task: 'משימה',
    status: 'סטטוס',
    timeWord: 'זמן',
    stepsWord: 'שלבים',
    nowWord: 'כעת',
    whyWord: 'למה הרמה הזו',
    resultWord: 'תוצאה',
    verdictWord: 'מסקנה',
    filesWord: 'קבצים',
    stalled: 'תקוע',
    attention: 'דורשים תשומת לב',
    groupModels: 'מודלים',
    groupStages: 'שלבי עבודה',
    runningNow: 'פועלים עכשיו',
    moreRunning: 'פועלים נוספים',
    startedSoFar: 'הופעלו עד כה',
    nFinished: 'הסתיימו',
    totalWord: 'סך הכול',
    doneN: 'הושלמו',
    failedN: 'נכשלו',
    shareOn: 'מהטוקנים ב־',
    apiEq: 'לפי מחירי API',
    tier: { light: 'קל', medium: 'בינוני', careful: 'זהיר', heavy: 'כבד', fable: 'פייבל', 'duo-low': 'duo-low', 'duo-medium': 'duo-medium', 'duo-high': 'duo-high', 'duo-xhigh': 'duo-xhigh', 'duo-max': 'duo-max', 'duo-opus': 'duo-opus', 'duo-advisor': 'duo-advisor', 'duo-reviewer': 'duo-reviewer', 'duo-verifier': 'duo-verifier', other: 'אחר' },
    effort: { low: 'נמוך', medium: 'בינוני', high: 'גבוה', xhigh: 'גבוה מאוד', max: 'מקסימלי' },
  },
} as const

// Module scope is fine here: session.start sets it again on every (re)load.
let lang: Lang = 'en'
const tr = () => STRINGS[lang]

// Hebrew draws every row mirrored: crab and title on the right, numbers on the left.
const isRtl = () => lang === 'he'

// Tier and effort words as shown; anything unknown shows as it came.
const tierWord = (tier: string): string => (tr().tier as Record<string, string>)[tier] ?? tier
const effortWord = (effort: string): string => (tr().effort as Record<string, string>)[effort] ?? effort

// "1 agent", "2 агента", "5 агентов": Russian has a third form for 2-4.
export const agentsWord = (n: number): string => {
  const s = tr()
  if (lang === 'ru') {
    const a = n % 10
    const b = n % 100
    return a === 1 && b !== 11 ? s.agentOne : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? s.agentFew : s.agentsCount
  }
  return n === 1 ? s.agentOne : s.agentsCount
}

const isRussian = (v: unknown): boolean => typeof v === 'string' && /^(ru|russian|рус)/i.test(v.trim())
const isHebrew = (v: unknown): boolean => typeof v === 'string' && /^(he|iw|hebrew|עברית)/i.test(v.trim())
const langOf = (v: unknown): Lang => (isHebrew(v) ? 'he' : isRussian(v) ? 'ru' : 'en')

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'ru' || option === 'he') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language)
  } catch {
    // No settings: fall through to the locale.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return langOf(locale)
}

const blank = (): Flow => ({
  title: 'duo-flow',
  total: 0,
  done: 0,
  running: 0,
  phase: 'plan',
  isFinished: false,
  tasks: [],
})

const isNewFlow = (prev: Flow | null, input: ProgressInput): boolean =>
  !prev || prev.isFinished || (input.title !== undefined && clip(input.title.trim(), MAX_TITLE) !== prev.title)

// Only a known tier is kept: the name is later a key into the tier tables.
const tierName = (v: string): string => {
  const t = v.trim().toLowerCase().replace(/^[^:]*:/, '').replace(/^(?:savvy|duo-flow)-(?!duo-)/, '')
  return TIERS.includes(t) ? t : ''
}

// The schema's `plan` is advice: keep only non-empty strings, clipped and capped.
const cleanPlan = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined
  const out = v
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .slice(0, MAX_PLAN)
    .map(x => clip(x.trim(), MAX_NOTE))
  return out.length ? out : undefined
}

const cleanTasks = (tasks: ProgressInput['tasks']): PlannedTask[] | undefined =>
  tasks
    ?.filter(t => t.title?.trim())
    .slice(0, MAX_TASKS)
    .map(t => ({
      title: (t.title ?? '').trim(),
      tier: tierName(t.tier ?? ''),
      after: (t.after ?? []).filter(n => Number.isInteger(n) && n > 0).slice(0, MAX_AFTER),
      ...(typeof t.why === 'string' && t.why.trim() ? { why: clip(t.why.trim(), MAX_WHY) } : {}),
    }))

const merge = (prev: Flow | null, input: ProgressInput): Flow => {
  // A new title means a new flow: never carry counters over from an earlier one.
  const base = isNewFlow(prev, input) || !prev ? blank() : { ...blank(), ...prev }
  const tasks = cleanTasks(input.tasks) ?? base.tasks
  const total = Math.min(MAX_TASKS, Math.max(0, Math.round(input.total ?? (input.tasks ? tasks.length : base.total))))
  const done = Math.min(total || Infinity, Math.max(0, Math.round(input.done ?? base.done)))
  const phase = input.phase && PHASES.includes(input.phase) ? input.phase : base.phase
  return {
    ...base,
    title: clip(input.title?.trim() || base.title, MAX_TITLE),
    total,
    done,
    phase: input.finished ? 'close' : phase,
    isFinished: input.finished === true,
    tasks,
  }
}

const label = (f: Flow): string => {
  const s = tr()
  if (f.isFinished) return s.done
  if (f.phase === 'plan') return s.plan
  if (f.phase === 'design') return s.design
  const count = f.total ? `${f.done}/${f.total}` : `${f.running} ${s.busy}`
  return `${f.phase === 'review' ? s.review : s.tasks} ${count}`
}

const ratio = (f: Flow): number => (f.isFinished ? 1 : f.total ? f.done / f.total : 0)

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

// The whole row is one SVG: the desktop wraps sibling elements onto new lines,
// so title, bar, percent and the crab live in one drawing; only the count and
// the dismiss are Buttons beside it.
const H = 22
const BAR_H = 16
const CRAB_W = 26
// The crab's drawing grid is 30 units wide, props included.
const CRAB_BOX = 30
const CELL = 3
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// CJK, fullwidth forms and emoji advance about 1em; at 0.56em a Chinese title was sized at half its width and the bar drew over it.
// 中日韩文字、全角标点和 emoji 约占 1em；按 0.56em 算时中文标题宽度被低估近一半，进度条会压到标题上。
const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

// Rough advance of system UI text, in em; good enough to size the title's slot.
const charEm = (ch: string): number =>
  WIDE.test(ch) ? 1 : /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZА-ЯЁmwшщжюМШЩЖЮ@%]/.test(ch) ? 0.72 : 0.56

const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

export const baseOf = (list: readonly Limit[]): RunBase => {
  const out: Partial<Record<'five_hour' | 'seven_day', number>> = {}
  for (const [kind] of WINDOWS) {
    const l = list.find(x => x.kind === kind)
    if (l && Number.isFinite(l.percentUsed)) out[kind as 'five_hour' | 'seven_day'] = l.percentUsed
  }
  return Object.keys(out).length ? out : null
}

// What the run used per window, in points; a window that reset mid-run (now below the base) is left out.
export const runDelta = (base: RunBase, list: readonly Limit[]): { short: string; pct: number }[] =>
  WINDOWS.flatMap(([kind, short]) => {
    const b = base?.[kind as 'five_hour' | 'seven_day']
    const l = list.find(x => x.kind === kind)
    if (b === undefined || !l || !Number.isFinite(l.percentUsed) || l.percentUsed < b) return []
    return [{ short, pct: Math.round((l.percentUsed - b) * 10) / 10 }]
  })

const fmtPct = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(1)}%`

// The sentence the progress tool hands the orchestrator when the flow closes.
export const runSentence = (d: readonly { short: string; pct: number }[]): string =>
  d.length ? ` This run used ${d.map(x => `${fmtPct(x.pct)} of the ${x.short === '5h' ? '5-hour window' : 'weekly window'}`).join(' and ')}.` : ''

// The 5-hour usage for the band, else the weekly one; with a base, what the run added.
export const usageShort = (list: readonly Limit[], base: RunBase = null): string => {
  for (const [kind, short] of WINDOWS) {
    const l = list.find(x => x.kind === kind)
    if (!l || !Number.isFinite(l.percentUsed)) continue
    const used = runDelta(base, list).find(d => d.short === short)
    return `${short} ${Math.round(l.percentUsed)}%${used && used.pct > 0 ? ` (+${fmtPct(used.pct)})` : ''}`
  }
  return ''
}

export const rowSvg = (f: Flow, W: number, isWorking: boolean, usage = '', alert = ''): string => {
  // The title takes what it needs, up to 40% of the row; the bar takes the rest.
  const title = fitText(f.title, 13, Math.max(60, W * 0.4))
  const BAR_X = Math.round(16 + textWidth(title, 13) + 12)
  const percent = `${Math.round(ratio(f) * 100)}%`
  // The pill already says where the flow stands, so with a usage reading the right side is only usage, named: a bare "100%" next to it reads as usage.
  const tail = [alert, usage ? `${tr().limit} ${usage}` : percent].filter(Boolean).join(' · ')
  const BAR_W = Math.max(60, W - BAR_X - Math.max(56, Math.ceil(textWidth(tail, 12.5)) + 26) - CRAB_W)
  const color = f.isFinished ? DONE : ACCENT
  const y0 = (H - BAR_H) / 2
  const fillW = Math.round(BAR_W * ratio(f))
  const runW = f.total ? Math.round((BAR_W * Math.min(f.total, f.done + f.running)) / f.total) : 0
  // Positions are worked out left to right; right to left mirrors each box
  // inside the bar (`bx`) and across the row (`rx`). Text is never mirrored.
  const rtl = isRtl()
  const bx = (x: number, w: number): number => (rtl ? BAR_W - x - w : x)
  const rx = (x: number, w: number): number => (rtl ? W - x - w : x)

  // Dithered fill: sparse at the start, dense toward the head.
  const dots: string[] = []
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) dots.push(`<rect class="t${Math.floor(noise(r, c) * 4)}" x="${bx(c * CELL + 1, 2)}" y="${r * CELL + 1}" width="2" height="2"/>`)
    }
  }
  // Handed to workers, not yet accepted: a faint second layer.
  const faint: string[] = []
  for (let c = cols; c < Math.floor(runW / CELL); c++) {
    for (let r = 0; r < rows; r++) {
      if (noise(c + 7, r + 3) < 0.2) faint.push(`<rect class="t${Math.floor(noise(r + 5, c) * 4)}" x="${bx(c * CELL + 1, 1.7)}" y="${r * CELL + 1}" width="1.7" height="1.7"/>`)
    }
  }

  const ticks: string[] = []
  for (let i = 1; i < f.total; i++) {
    const x = Math.round((BAR_W * i) / f.total)
    if (x > fillW + 4) ticks.push(`<rect x="${bx(x, 1.5)}" y="${BAR_H / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)
  }

  const text = label(f)
  const pillW = Math.round(18 + text.length * 6.6)
  const pillX = bx(Math.max(0, Math.min(BAR_W - pillW, fillW - pillW)), pillW)
  // `direction="rtl"` puts Hebrew words and numbers in reading order; `start` is then the right edge.
  const titleAt = rtl ? `x="${W - 16}" direction="rtl" text-anchor="start"` : 'x="16"'
  const percentAt = rtl ? `x="${CRAB_W + 6}" y="${H / 2 + 4.5}"` : `x="${W - CRAB_W - 6}" y="${H / 2 + 4.5}" text-anchor="end"`
  const crabW = CRAB_BOX * 0.8

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#666666}.k{fill:#e4e4e2}.tk{fill:#7a7a76}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#a6a6a6}.k{fill:#2c2c2c}.tk{fill:#8a8a8a}}
/* Pixels twinkle in four out-of-phase groups; a finished bar settles to a slow glow. */
.t0,.t1,.t2,.t3{animation:tw ${f.isFinished ? 3.2 : 2.2}s ease-in-out infinite}
.t1{animation-duration:${f.isFinished ? 3.8 : 2.8}s;animation-delay:-.7s}.t2{animation-duration:${f.isFinished ? 4.4 : 1.9}s;animation-delay:-1.3s}.t3{animation-duration:${f.isFinished ? 3.5 : 3.3}s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${f.isFinished ? 0.8 : 0.3}}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
<circle cx="${rtl ? W - 5 : 5}" cy="${H / 2}" r="4" fill="${color}"/>
<text class="t" ${titleAt} y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${xml(title)}</text>
<g transform="translate(${rx(BAR_X, BAR_W)},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c)">
<g fill="${color}">${dots.join('')}</g>
<g fill="${color}" opacity="0.45">${faint.join('')}</g>
<g class="tk">${ticks.join('')}</g>
</g>
<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle"${rtl ? ' direction="rtl"' : ''} font-family="${FONT}" font-size="11" font-weight="600" fill="${inkOn(color)}">${xml(text)}</text>
</g>
<text class="m" ${percentAt} font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${xml(tail)}</text>
${CRAB_CSS}${crab(rx(W - CRAB_W + 1, crabW), 0, 'other', false, isWorking, 0.8, rtl)}
</svg>`
}

const barText = (f: Flow, width: number): string => {
  const filled = Math.round(width * ratio(f))
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// ---------------------------------------------------------------------------
// Agents panel: every subagent of the session, plus the tasks the flow planned.

const TIER_COLOR: Record<string, string> = {
  fable: '#7F77DD',
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
  'duo-low': '#5DCAA5',
  'duo-medium': '#6AAAE8',
  'duo-high': '#D4A24C',
  'duo-xhigh': '#E8825A',
  'duo-max': '#9D96E8',
  'duo-opus': '#B54FD6',
  'duo-advisor': '#E05297',
  'duo-reviewer': '#C9444A',
  'duo-verifier': '#3FA6A0',
  other: '#888780',
}

// What each duo-flow tier runs on, for planned tasks that have no run yet.
const colorOf = (tier: string): string => TIER_COLOR[tier] ?? '#888780'

const TIER_MODEL: Record<string, [model: string, effort: string]> = {
  fable: ['Fable', 'high'],
  heavy: ['Opus', 'xhigh'],
  careful: ['Opus', 'high'],
  medium: ['Opus', 'medium'],
  light: ['Opus', 'low'],
  'duo-low': ['Sonnet', 'low'],
  'duo-medium': ['Sonnet', 'medium'],
  'duo-high': ['Sonnet', 'high'],
  'duo-xhigh': ['Sonnet', 'xhigh'],
  'duo-max': ['Sonnet', 'max'],
  'duo-opus': ['Opus', 'xhigh'],
  'duo-advisor': ['Opus', 'high'],
  'duo-reviewer': ['Opus', 'high'],
  'duo-verifier': ['Sonnet', 'medium'],
}

// "Opus · xhigh", with the effort word in the panel's language; '' for an unknown tier.
const tierModel = (tier: string): string => {
  const m = TIER_MODEL[tier]
  return m ? `${m[0]} · ${effortWord(m[1])}` : ''
}

// "Opus 5.5 · low" for a run, or just the model when no effort was seen.
const runModel = (a: AgentRun): string => (a.effort ? `${modelName(a.model)} · ${effortWord(a.effort)}` : modelName(a.model))

// USD per million tokens: input, output, cache read, cache write. The first row that
// matches a model id wins, so a release sits above its family.
// The engine reports tokens, not money, so the panel's cost is an estimate. It reports
// one cache-write count with no split by lifetime; writes are priced at the 1-hour
// rate (2x input), which is what Claude Code writes on a subscription.
type Price = [input: number, output: number, cacheRead: number, cacheWrite: number]

const PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, [10, 50, 0.25, 20]],
  [/fable|mythos/, [10, 50, 1, 20]],
  [/opus-5-5/, [4, 20, 0.2, 8]],
  [/opus/, [5, 25, 0.5, 10]],
  [/sonnet-5-5/, [2, 10, 0.1, 4]],
  [/sonnet-5/, [2, 10, 0.2, 4]],
  [/sonnet/, [3, 15, 0.3, 6]],
  [/haiku-5-5/, [0.1, 0.5, 0.01, 0.2]],
  [/haiku/, [1, 5, 0.1, 2]],
]

// Haiku 5.5 is priced by prompt length: a request whose prompt (input, cache reads and
// cache writes together) is over 100,000 tokens pays these prices instead.
const HAIKU_LONG_PROMPT = 100_000
const HAIKU_LONG: Price = [0.5, 2.5, 0.05, 1]

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const priceOf = (model: string, prompt: number): Price => {
  const id = model.toLowerCase()
  if (prompt > HAIKU_LONG_PROMPT && /haiku-5-5/.test(id)) return HAIKU_LONG
  return PRICES.find(([re]) => re.test(id))?.[1] ?? [4, 20, 0.2, 8]
}

// `isRequest` says the usage is one model request, which is what a prompt-length price
// is set by; a turn's sum is priced at the model's ordinary prices.
const costOf = (model: string, u: Usage, isRequest: boolean): number => {
  const prompt = isRequest ? (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) : 0
  const [i, o, r, w] = priceOf(model, prompt)
  return (
    ((u.input_tokens || 0) * i +
      (u.output_tokens || 0) * o +
      (u.cache_read_input_tokens || 0) * r +
      (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

// Haiku 4.5 and the Claude 3 models have a 200K window; the rest, Haiku 5.5 included, 1M.
const windowOf = (model: string): number => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

// `duo-flow-careful`, `duo-flow:duo-flow-careful` (or the legacy `savvy-careful`), `duo-high` or `duo:duo-high` (plugin-prefixed when the agents ship in a plugin).
const bareType = (type: string): string => type.replace(/^[^:]*:/, '')
const isPipelineAgent = (type: string): boolean => /^(?:savvy|duo)-/.test(bareType(type))
// The original flow's workers are `duo-flow-<tier>` (formerly `savvy-<tier>`); duo's own are `duo-<tier>`.
const flowTier = (bare: string): string | null => (bare.startsWith('duo-flow-') ? bare.slice(9) : bare.startsWith('savvy-') ? bare.slice(6) : null)
const tierOf = (type: string): string => {
  const bare = bareType(type)
  const flow = flowTier(bare.toLowerCase())
  const t = flow ?? bare.toLowerCase()
  return Object.hasOwn(TIER_COLOR, t) && isPipelineAgent(bare) && (flow !== null ? !t.startsWith('duo-') : t.startsWith('duo-')) ? t : 'other'
}

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const elapsed = (a: AgentRun, at: number): number => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

type Planned = PlannedTask & { n: number }

const plannedOf = (f: Flow | null, list: AgentRun[]): Planned[] => {
  if (!f || f.isFinished) return []
  const started = new Set(list.map(a => norm(a.description)))
  return (f.tasks ?? []).map((t, i) => ({ ...t, n: i + 1 })).filter(t => !started.has(norm(t.title)))
}

const totals = (list: AgentRun[], at: number) => {
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = list.reduce((s, a) => s + a.tokens, 0)
  const start = Math.min(...list.map(a => a.startedAt))
  const end = Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt)))
  return { cost, tokens, time: list.length ? end - start : 0 }
}

// --- grouped view: a big fan-out (many workers sharing a `stage:name` label) is
// shown per stage, not per agent. The engine reports no workflow phase, so the
// label prefix is the only grouping signal there is.

export const GROUP_THRESHOLD = 8
export const isGrouped = (count: number): boolean => count > GROUP_THRESHOLD

// The agents that need a look: failed ones first, then running ones with no sign of life, the longest quiet first.
export const MAX_ATTENTION = 5
export const attentionOf = (list: readonly AgentRun[], at: number): AgentRun[] => {
  const quiet = (a: AgentRun): number => at - (a.lastAt ?? a.startedAt)
  const failed = list.filter(a => a.status === 'failed')
  const stalled = list.filter(a => isStalled(a, at)).sort((a, b) => quiet(b) - quiet(a))
  return [...failed, ...stalled]
}

// 'truth:A10' -> 'truth'. No usable prefix -> 'other'.
export const groupKey = (description: string): string => {
  const i = (description ?? '').indexOf(':')
  if (i <= 0) return 'other'
  const key = description.slice(0, i).trim().toLowerCase()
  return key.length >= 1 && key.length <= 24 ? key : 'other'
}

export type Group = { key: string; agents: AgentRun[]; done: number; running: number; failed: number; model: string }

const mostCommon = (xs: string[]): string => {
  const n = new Map<string, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  let best = ''
  let max = 0
  for (const [x, c] of n) if (c > max) [best, max] = [x, c]
  return best
}

// Groups in order of their earliest start; ties keep the order the agents came in.
export const groupAgents = (list: AgentRun[]): Group[] => {
  const by = new Map<string, AgentRun[]>()
  for (const a of list) {
    const k = groupKey(a.description)
    const group = by.get(k)
    if (group) group.push(a)
    else by.set(k, [a])
  }
  return [...by.entries()]
    .map(([key, agents]) => ({
      key,
      agents,
      done: agents.filter(a => a.status === 'done').length,
      running: agents.filter(a => a.status === 'running').length,
      failed: agents.filter(a => a.status === 'failed').length,
      model: mostCommon(agents.map(runModel)),
      first: Math.min(...agents.map(a => a.startedAt)),
    }))
    .sort((a, b) => a.first - b.first)
    .map(({ first: _first, ...g }) => g)
}

export const tally = (list: AgentRun[]) => {
  const running = list.filter(a => a.status === 'running').length
  const failed = list.filter(a => a.status === 'failed').length
  return { total: list.length, running, failed, done: list.length - running - failed, finished: list.length - running }
}

// Unknown models get a warm taupe, not the grey of secondary text.
const MODEL_COLORS: Record<string, string> = { opus: '#8E78FF', sonnet: '#F07A3E', haiku: '#2FA67A', fable: '#7F77DD', mythos: '#7F77DD' }
export const modelColor = (name: string): string => MODEL_COLORS[name.split(' ')[0]?.toLowerCase() ?? ''] ?? '#9C8F7E'
const MODEL_NAME_MAX = 22

export type ModelRow = { name: string; agents: number; tokens: number; pct: number; color: string }

// Per model: agents, tokens and share of tokens (share of agents while no tokens are counted yet).
export const modelMix = (list: AgentRun[]): { rows: ModelRow[]; isMixed: boolean; top: ModelRow | undefined } => {
  const by = new Map<string, { agents: number; tokens: number }>()
  for (const a of list) {
    const name = modelName(a.model)
    const m = by.get(name) ?? { agents: 0, tokens: 0 }
    by.set(name, { agents: m.agents + 1, tokens: m.tokens + a.tokens })
  }
  const sumTokens = [...by.values()].reduce((s, m) => s + m.tokens, 0)
  const sumAgents = list.length
  const rows = [...by.entries()]
    .map(([name, m]) => ({
      name,
      ...m,
      pct: Math.round(100 * (sumTokens ? m.tokens / sumTokens : sumAgents ? m.agents / sumAgents : 0)),
      color: modelColor(name),
    }))
    .sort((a, b) => b.tokens - a.tokens || b.agents - a.agents)
  return { rows, isMixed: rows.length > 1, top: rows[0] }
}

// Segment widths of the model share bar: at least 2px each, the last takes the rest, never negative;
// when the minimums alone overflow, the others shrink so the segments still fill the bar exactly.
export const barWidths = (pcts: number[], barW: number): number[] => {
  if (!pcts.length) return []
  const head = pcts.slice(0, -1).map(p => Math.max(2, Math.round((barW * p) / 100)))
  const sum = head.reduce((n, w) => n + w, 0)
  if (sum > barW) {
    const scaled = head.map(w => Math.floor((w * barW) / sum))
    scaled[0] = (scaled[0] ?? 0) + barW - scaled.reduce((n, w) => n + w, 0)
    return [...scaled, 0]
  }
  return [...head, barW - sum]
}

// Stage keyword -> costume; a key matches a keyword or starts with it ("reviewer", "truth2").
const STAGE_COSTUMES: [costume: string, words: string[]][] = [
  ['wizard', ['plan', 'advisor']],
  ['monocle', ['review', 'reviewer']],
  ['detective', ['truth', 'verify', 'verifier', 'check', 'test']],
  ['judge', ['value', 'judge', 'rank']],
  ['hardhat', ['risk', 'security', 'audit']],
  ['explorer', ['map', 'explore', 'scout']],
  ['bulb', ['ideate', 'brainstorm', 'design']],
  ['quill', ['synthesize', 'write', 'summary']],
  ['rocket', ['deploy', 'release', 'ship', 'launch']],
  ['robot', ['build', 'compile', 'generate', 'codegen']],
  ['scientist', ['research', 'analy', 'investigate', 'study']],
  ['artist', ['ui', 'visual', 'style', 'render', 'css']],
  ['ninja', ['perf', 'optimi', 'speed', 'fast', 'bench']],
  ['doctor', ['fix', 'debug', 'repair', 'patch', 'bug']],
  ['librarian', ['docs', 'readme', 'document']],
  ['viking', ['migrat', 'refactor', 'move']],
  ['cleaner', ['lint', 'clean', 'prune', 'tidy', 'format']],
  ['cyborg', ['guard', 'enforce', 'policy', 'compliance', 'protect', 'auth']],
  ['thunder', ['lightning', 'storm', 'async', 'parallel', 'concurren']],
  ['fireninja', ['hotfix', 'urgent', 'incident', 'burn']],
  ['iceninja', ['freeze', 'cache', 'cold', 'archive', 'snapshot']],
]
export const stageCostume = (key: string): string => {
  const k = key.toLowerCase()
  return STAGE_COSTUMES.find(([, words]) => words.some(w => k === w || k.startsWith(w)))?.[0] ?? 'other'
}
export const STAGE_COSTUME_NAMES: string[] = STAGE_COSTUMES.map(([c]) => c)

// --- desktop drawings: each row is one SVG, as the band above the prompt is.

// The pane's backdrop: a dotted grid as tall as the content laid over it; the
// row SVGs are transparent, so it shows through between their marks.
const GRID_STEP = 16
// A Text or Button row on the desktop is about 20px; the grid errs taller.
const LINE_H = 24
// The engine refuses an Svg taller than 4096px, so a long grid is stacked from
// tiles of at most this height; a multiple of GRID_STEP keeps the dots aligned.
const GRID_TILE = 4096
const gridTiles = (H: number) => Array.from({ length: Math.ceil(H / GRID_TILE) }, (_, i) => Math.min(GRID_TILE, H - i * GRID_TILE))
const gridSvg = (W: number, H: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>.d{fill:#d9d8d4}@media (prefers-color-scheme: dark){.d{fill:#3a3a38}}</style>
<defs><pattern id="g" width="${GRID_STEP}" height="${GRID_STEP}" patternUnits="userSpaceOnUse"><circle class="d" cx="${GRID_STEP / 2}" cy="${GRID_STEP / 2}" r="1"/></pattern></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`

const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#75756f}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#9a9a96}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

// Pixel Clawd from DockCrab (Clawdy): a 24×18 crab on a 30×28 grid, one costume per tier.
// The body keeps the brand clay; the tier's color lives in the costume's accent.
const CLAY = '#D97757'
const INK = '#1F1E1D'

// `cls` puts a pixel in a named group: `bd` (the default) is the body and its
// costume, `la`/`lb` the leg pairs, anything else a prop with its own motion.
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// `armCls` lets a raised claw travel with the prop it holds.
const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// Pure CSS, run by the compositor: no redraws. Periods divide one second, so the
// once-a-second redraw of a running row restarts them in phase. Every crab walks;
// each costume adds its prop's own motion on top.
const CRAB_CSS = `<style>
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
.c-fable.run{animation:float 1s ease-in-out infinite}
.c-fable.run .la,.c-fable.run .lb,.c-fable.run .bd{animation:none}
.c-fable.run .ant{animation:blink 1s steps(1) infinite}
.c-fable.run .star{animation:blink .5s steps(1) infinite -.25s}
@keyframes float{50%{transform:translateY(-2px)}}@keyframes blink{50%{opacity:.15}}
.c-heavy.run .it{animation:scan 1s steps(1) infinite}
.c-heavy.run .gl{animation:blink 1s steps(1) infinite -.5s}
@keyframes scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}
.c-careful.run .it{transform-origin:100% 100%;animation:twist .5s ease-in-out infinite}
@keyframes twist{50%{transform:rotate(-35deg)}}
.c-medium.run .pan{transform-origin:0 50%;animation:tilt 1s ease-in-out infinite}
.c-medium.run .egg{animation:flip 1s ease-in-out infinite}
@keyframes tilt{20%,40%{transform:rotate(-12deg)}}@keyframes flip{30%{transform:translateY(-5px) scaleY(-1)}60%{transform:translateY(0)}}
.c-light.run .la{animation-duration:.25s}.c-light.run .lb{animation-duration:.25s;animation-delay:-.125s}
.c-light.run .flag{transform-origin:0 50%;animation:wave .25s steps(1) infinite}
@keyframes wave{50%{transform:skewY(-12deg) scaleX(.85)}}
.c-detective.run .it,.c-explorer.run .it,.c-quill.run .it{animation:scan 1s steps(1) infinite}
.c-detective.run .gl,.c-hardhat.run .gl,.c-bulb.run .gl{animation:blink 1s steps(1) infinite -.5s}
.c-wizard.run .star{animation:blink .5s steps(1) infinite -.25s}
.c-judge.run .it{transform-origin:100% 100%;animation:twist .5s ease-in-out infinite}
.c-explore.run .it{transform-origin:50% 100%;animation:fence .5s ease-in-out infinite}
@keyframes fence{50%{transform:rotate(25deg)}}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}
</style>`

export const COSTUMES: Record<string, (f: Fill, t: string) => void> = {
  // Fable: astronaut in a glass dome; floats instead of walking, the antenna and the star blink.
  fable: (f, t) => {
    crabBody(f)
    f(6, 7, 18, 1, '#E6E8EE'); f(5, 8, 1, 14, '#E6E8EE'); f(24, 8, 1, 14, '#E6E8EE'); f(6, 22, 18, 1, '#C9CCD2')
    f(6, 8, 18, 14, 'rgba(169,214,245,.32)'); f(8, 9, 2, 1, '#fff'); f(8, 10, 1, 2, '#fff')
    f(14, 4, 2, 3, '#C9CCD2'); f(14, 2, 2, 2, t, 'ant'); f(13, 18, 4, 2, t)
    f(27, 3, 1, 3, '#F5C542', 'star'); f(26, 4, 3, 1, '#F5C542', 'star')
  },
  // Heavy: detective with a deerstalker; the magnifier sweeps and glints.
  heavy: (f, t) => {
    crabBody(f, -4, 'it')
    stamp(f, 6, 3, ['......bbbbbb......', '....bbcbbcbbbb....', '...bbbbbbbbbbbb...', '..bcbbcbbcbbcbbb..', '.bbbbbbbbbbbbbbbb.', 'dddddddddddddddddd'], { b: '#7A4A26', c: '#A0703F', d: '#5A3519' })
    f(6, 9, 18, 1, t)
    stamp(f, 23, 1, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(24, 2, 3, 3, 'rgba(169,214,245,.7)', 'it'); f(25, 6, 1, 4, '#7A4A26', 'it'); f(24, 2, 1, 1, '#fff', 'gl')
  },
  // Careful: engineer in a hard hat; the wrench turns a bolt.
  careful: (f, t) => {
    crabBody(f)
    stamp(f, 6, 4, ['.....yyyyyyyy.....', '...yyyyyhhyyyyy...', '..yyyyyyhhyyyyyy..', '..yyyyyyhhyyyyyy..', '.yyyyyyyhhyyyyyyy.', 'dddddddddddddddddd'], { y: '#F5C542', h: '#FBE08A', d: '#C99A1E' })
    f(13, 5, 4, 2, t)
    stamp(f, 0, 10, ['.s.s', 'sss.', '.s..', '.s..'], { s: '#8E929A' }, 'it')
  },
  // Medium: chef, the toque traced from DockCrab's Sprites.chefHat; tosses the omelette.
  medium: (f, t) => {
    crabBody(f, -4, 'pan')
    stamp(f, 6, 0, ['........lll.......', '.......lllll......', '.wwwwgwwwwwwgwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwgwwwwwggwwwww', '.wwwwgwwwwwggwwwww', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.'], { w: '#F4F3EE', l: '#F7F6F2', g: '#D2D1C8', b: t, d: '#B45F43' })
    f(22, 8, 7, 2, '#4A4A48', 'pan'); f(26, 10, 1, 1, '#4A4A48', 'pan'); f(24, 7, 3, 1, '#F5B731', 'egg')
  },
  // Light: racer in a helmet; runs at double pace, the checkered flag flutters.
  light: (f, t) => {
    crabBody(f, -4)
    stamp(f, 6, 5, ['....rrrrrrrrrr....', '..rrrrrrwwrrrrrr..', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.kkkkkkkkkkkkkkkkr'], { r: t, w: '#F8F6F1', k: INK })
    f(25, 1, 1, 9, '#8E929A')
    stamp(f, 26, 1, ['wkwk', 'kwkw', 'wkwk'], { w: '#F8F6F1', k: INK }, 'flag')
  },
  // Explore: pirate scouting the code; the cutlass fences.
  explore: f => {
    crabBody(f)
    stamp(f, 5, 3, ['.kk..............kk.', '.kkk....kkkk....kkk.', '..kkkkkkkwwkkkkkkk..', '..kkkkkkkkkkkkkkkk..', '.gggggggggggggggggg.'], { k: '#55514C', w: '#F8F6F1', g: '#F5C542' })
    f(7, 11, 11, 1, INK); f(18, 11, 4, 3, INK)
    f(27, 6, 1, 9, '#C9CCD2', 'it'); f(26, 15, 3, 1, '#7A4A26', 'it')
  },
  // Wizard (plan, advisor): pointy hat with a star that twinkles.
  wizard: (f, t) => {
    crabBody(f)
    stamp(f, 6, 0, ['........pp........', '.......pppp.......', '.......pppp.......', '......ppyppp......', '......pyyypp......', '.....pppyppp.....', '.....pppppppp.....', '...pppppppppppp...', '.bbbbbbbbbbbbbbbb.', 'bbbbbbbbbbbbbbbbbb'], { p: '#5B4BC4', y: '#F5C542', b: t })
    f(11, 8, 1, 1, '#F5C542', 'star'); f(18, 2, 1, 1, '#F5C542', 'star')
  },
  // Monocle (review, reviewer): a gold-rimmed lens over one eye on a chain, and a bow tie.
  monocle: (f, t) => {
    crabBody(f)
    stamp(f, 16, 8, ['..gggg..', '.g....g.', 'g......g', 'g......g', 'g......g', 'g......g', '.g....g.', '..gggg..'], { g: '#F2C84B' })
    f(17, 10, 2, 1, 'rgba(255,255,255,.55)')
    for (let i = 0; i < 9; i++) f(23 + (i % 2), 16 + i, 1, 1, '#F2C84B')
    stamp(f, 12, 19, ['rr...rr', 'rrrkrrr', 'rr...rr'], { r: t, k: INK })
  },
  // Detective (truth, verify, check, test, verifier): deerstalker, magnifier held in the left claw.
  detective: (f, t) => {
    crabBody(f)
    stamp(f, 6, 3, ['......tttttt......', '....tttttttttt....', '...tttttttttttt...', '.tttttttttttttttt.', 'dddddddddddddddddd'], { t: '#B8935A', d: '#7A5A30' })
    f(6, 6, 18, 1, '#8A6A3A'); f(6, 8, 2, 3, '#7A5A30'); f(22, 8, 2, 3, '#7A5A30')
    stamp(f, 0, 5, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(1, 6, 3, 3, 'rgba(169,214,245,.7)', 'it'); f(2, 10, 2, 5, '#7A4A26', 'it'); f(1, 6, 1, 1, '#fff', 'gl')
  },
  // Judge (value, judge, rank): white wig, gavel in the raised claw.
  judge: f => {
    crabBody(f, -4, 'it')
    stamp(f, 5, 4, ['......wwwwww......', '....wwwwwwwwww....', '...wwwwwwwwwwww...', '..wwwwwwwwwwwwww..', '.wwww..........www', '.www............ww', '.ww..............w'], { w: '#F1EFE9' })
    stamp(f, 23, 1, ['kkkkk', 'kkkkk'], { k: '#7A4A26' }, 'it')
    f(25, 3, 1, 7, '#A0703F', 'it')
  },
  // Hardhat (risk, security, audit): yellow hat with a lamp and a stripe.
  hardhat: (f, t) => {
    crabBody(f)
    stamp(f, 6, 4, ['.....yyyyyyyy.....', '...yyyyyyyyyyyy...', '..yyyyyyyyyyyyyy..', '..yyyyyyyyyyyyyy..', '.yyyyyyyyyyyyyyyy.', 'dddddddddddddddddd'], { y: '#F5C542', d: '#C99A1E' })
    f(13, 5, 4, 2, '#FBE08A', 'gl'); f(14, 6, 2, 1, '#fff', 'gl')
    f(6, 8, 18, 1, t)
  },
  // Explorer (map, explore, scout): safari hat, binoculars in the raised claw.
  explorer: f => {
    crabBody(f, -4, 'it')
    stamp(f, 5, 3, ['......cccccc......', '.....cccccccc.....', '.....cccccccc.....', '.....bbbbbbbb.....', '..cccccccccccccc..', 'cccccccccccccccccc'], { c: '#D2B97A', b: '#6B4F2A' })
    stamp(f, 22, 3, ['kk.kk', 'kk.kk', 'kkkkk', 'bb.bb'], { k: '#3A3A3C', b: '#7FB5E0' }, 'it')
  },
  // Bulb (ideate, brainstorm, design): a lightbulb over the head that glows.
  bulb: f => {
    crabBody(f)
    stamp(f, 11, 0, ['..yyyy..', '.yyyyyy.', 'yywyyyyy', 'yyyyyyyy', '.yyyyyy.', '..yyyy..'], { y: '#FFD84A', w: '#fff' }, 'gl')
    stamp(f, 12, 6, ['gggggg', '.kkkk.'], { g: '#9A9EA6', k: '#5A5E66' })
    f(8, 2, 2, 1, '#FFD84A', 'gl'); f(20, 2, 2, 1, '#FFD84A', 'gl'); f(9, 5, 2, 1, '#FFD84A', 'gl'); f(19, 5, 2, 1, '#FFD84A', 'gl')
  },
  // Quill (synthesize, write, summary): beret and a quill pen in the raised claw.
  quill: f => {
    crabBody(f, -4, 'it')
    stamp(f, 5, 4, ['......rrrrrrr.......', '....rrrrrrrrrrr.....', '..rrrrrrrrrrrrrrr...', '.rrrrrrrrrrrrrrrrr..', '..dddddddddddddd....'].map(r => r.slice(0, 18)), { r: '#B23A48', d: '#7E2632' })
    f(10, 3, 1, 1, '#7E2632')
    stamp(f, 24, 0, ['...ww', '..www', '.www.', 'www..', 'w.k..', '..k..', '.k...'], { w: '#F4F1EA', k: INK }, 'it')
  },
  // Crown (duo-opus): gold crown with a red and a blue jewel.
  crown: f => {
    crabBody(f)
    stamp(f, 8, 3, ['.g....gg....g.', '.gg..gggg..gg.', '.gggggggggggg.', '.gggrgggbgggg.', '.gggggggggggg.', '.dddddddddddd.'], { g: '#F5C542', d: '#C99A1E', r: '#E5484D', b: '#4A8BE8' })
  },
  // Rocket (deploy, release, ship, launch): a rocket over the raised claw, its flame flickers.
  rocket: f => {
    crabBody(f, -4, 'it')
    stamp(f, 24, 0, ['..r..', '.www.', '.wbw.', '.www.', 'rwwwr'], { r: '#E5484D', w: '#F4F1EA', b: '#4A8BE8' }, 'it')
    stamp(f, 24, 5, ['.ooo.', '..o..'], { o: '#FF9A3C' }, 'gl')
  },
  // Robot (build, compile, generate, codegen): blinking antenna, riveted brow plate, cyan eyes, grille mouth.
  robot: f => {
    crabBody(f)
    f(14, 5, 2, 5, '#8E96A3'); f(13, 2, 4, 3, '#E5484D', 'gl')
    f(7, 10, 16, 2, '#8E96A3'); f(9, 10, 1, 1, INK); f(20, 10, 1, 1, INK)
    f(9, 12, 2, 2, '#7FE0FF'); f(19, 12, 2, 2, '#7FE0FF')
    f(11, 17, 8, 3, '#8E96A3')
    for (const x of [12, 14, 16, 18]) f(x, 17, 1, 3, INK)
  },
  // Scientist (research, analyze, investigate, study): wild white hair, goggles, a bubbling flask.
  scientist: f => {
    crabBody(f, -4, 'it')
    stamp(f, 6, 5, ['..w..w..ww..w..w..', '.wwwwwwwwwwwwwwwww.', 'wwwwwwwwwwwwwwwwwww', '.wwwwwwwwwwwwwwww..', '..wwwwwwwwwwwwww...'].map(r => r.slice(0, 18)), { w: '#F1EFE9' })
    stamp(f, 8, 11, ['.kkkk.', 'k....k', 'k....k', 'k....k', '.kkkk.'], { k: '#3A3A3C' })
    stamp(f, 17, 11, ['.kkkk.', 'k....k', 'k....k', 'k....k', '.kkkk.'], { k: '#3A3A3C' })
    f(9, 12, 4, 3, 'rgba(150,220,255,.35)'); f(18, 12, 4, 3, 'rgba(150,220,255,.35)'); f(14, 13, 3, 1, '#3A3A3C')
    stamp(f, 24, 1, ['.kk.', '.kk.', 'kggk', 'gggg', 'gggg'], { k: '#9FB4C7', g: '#6FCF97' }, 'it')
    f(25, 0, 1, 1, '#B9F5D0', 'gl')
  },
  // Artist (ui, visual, style, render, css): a paint palette in the left claw, a brush in the raised one.
  artist: f => {
    crabBody(f, -4, 'it')
    stamp(f, 0, 11, ['.ppppp.', 'prpbppp', 'ppgpypp', '.ppppp.'], { p: '#C99A5E', r: '#E5484D', b: '#4A8BE8', g: '#3FB68B', y: '#F5C542' })
    f(25, 3, 1, 8, '#7A4A26', 'it'); f(24, 0, 3, 3, '#E5484D', 'it')
  },
  // Ninja (perf, optimize, speed, fast, bench): black mask with an eye slit, red headband tails that flutter.
  ninja: f => {
    crabBody(f)
    f(7, 10, 16, 7, '#2B2B33'); f(7, 10, 16, 1, '#E5484D')
    f(9, 12, 2, 2, '#F4F1EA'); f(19, 12, 2, 2, '#F4F1EA'); f(10, 13, 1, 1, INK); f(20, 13, 1, 1, INK)
    f(23, 10, 5, 2, '#E5484D', 'it'); f(26, 12, 3, 2, '#E5484D', 'it')
  },
  // Doctor (fix, debug, repair, patch, bug): white cap with a red cross, a stethoscope.
  doctor: f => {
    crabBody(f)
    stamp(f, 6, 4, ['......wwwwww......', '...wwwwwrrwwwww...', '..wwwwwrrrrwwwww..', '.wwwwwwrrrrwwwwww.', '..wwwwwwrrwwwwww..', 'wwwwwwwwwwwwwwwwww'], { w: '#F4F1EA', r: '#E5484D' })
    f(11, 19, 1, 3, '#5A5E66'); f(18, 19, 1, 3, '#5A5E66'); f(12, 21, 6, 1, '#5A5E66'); f(14, 22, 2, 2, '#C9CCD2')
  },
  // Librarian (docs, readme, document): round glasses and a book in the raised claw.
  librarian: f => {
    crabBody(f, -4, 'it')
    stamp(f, 8, 11, ['.kkkk.', 'k....k', 'k....k', 'k....k', '.kkkk.'], { k: '#8B5E3C' })
    stamp(f, 17, 11, ['.kkkk.', 'k....k', 'k....k', 'k....k', '.kkkk.'], { k: '#8B5E3C' })
    f(14, 13, 3, 1, '#8B5E3C')
    stamp(f, 24, 2, ['rrrrr', 'rwwwr', 'rwwwr', 'rwwwr', 'rrrrr'], { r: '#B23A48', w: '#F4F1EA' }, 'it')
  },
  // Viking (migrate, refactor, move): horned iron helmet.
  viking: f => {
    crabBody(f)
    stamp(f, 6, 5, ['......gggggg......', '....gggggggggg....', '...gggggggggggg...', '..gggggggggggggg..', 'dddddddddddddddddd'], { g: '#9AA0A8', d: '#5A5E66' })
    f(3, 1, 2, 2, '#F4F1EA'); f(4, 3, 2, 2, '#F4F1EA'); f(5, 5, 2, 2, '#F4F1EA')
    f(25, 1, 2, 2, '#F4F1EA'); f(24, 3, 2, 2, '#F4F1EA'); f(23, 5, 2, 2, '#F4F1EA')
  },
  // Cleaner (lint, clean, prune, tidy, format): blue bandana, a broom in the raised claw, sparkles.
  cleaner: f => {
    crabBody(f, -4, 'it')
    f(7, 10, 16, 1, '#4A8BE8'); f(7, 11, 16, 1, '#78AEF2')
    f(25, 0, 1, 11, '#A0703F', 'it'); stamp(f, 23, 11, ['.bbb.', 'bbbbb', 'b.b.b'], { b: '#E7C65A' }, 'it')
    stamp(f, 2, 5, ['.w.', 'www', '.w.'], { w: '#FFFFFF' }, 'star'); f(8, 1, 1, 1, '#FFFFFF', 'star')
  },
  // Cyborg (guard, enforce, policy, compliance, protect, auth): steel helmet, dark visor, a sidearm.
  cyborg: f => {
    crabBody(f, -4, 'it')
    stamp(f, 6, 5, ['......gggggg......', '....gggggggggg....', '...gggggggggggg...', '..gggggggggggggg..', '..gggggggggggggg..', '..gggggggggggggg..'], { g: '#A9B4C4' })
    f(8, 11, 14, 4, '#1B1F27'); f(10, 12, 3, 1, '#7FB0FF', 'gl'); f(17, 12, 3, 1, '#7FB0FF', 'gl')
    f(12, 17, 6, 1, INK)
    stamp(f, 22, 5, ['.kkkkkk', 'kkkkkkk', '...kk..'], { k: '#5A5E66' }, 'it')
  },
  // Thunder (lightning, storm, async, parallel, concurren): a big straw cone hat, glowing eyes, a bolt in the claw.
  thunder: f => {
    crabBody(f, -4, 'it')
    stamp(f, 4, 0, ['..........cc..........', '.........cccc.........', '........cccccc........', '.......cccccccc.......', '......cccccccccc......', '.....cccccccccccc.....', '....cccccccccccccc....', '...cccccccccccccccc...', '..cccccccccccccccccc..', 'dddddddddddddddddddddd'], { c: '#EAD9A8', d: '#B89A55' })
    f(9, 12, 2, 2, '#7FE0FF', 'gl'); f(19, 12, 2, 2, '#7FE0FF', 'gl')
    stamp(f, 24, 0, ['...yy', '..yy.', '.yyyy', '..yy.', '.yy..', 'yy...'], { y: '#FFE04A' }, 'gl')
  },
  // Fire ninja (hotfix, urgent, incident, burn): all-yellow suit, black face mask, bone-white eyes, a skull on the belt, a flaming claw, a kunai on a rope.
  fireninja: f => {
    crabBody(f, -4, 'it')
    f(7, 10, 16, 12, '#F2C230'); f(3, 14, 4, 4, '#F2C230'); f(23, 10, 4, 4, '#F2C230', 'it')
    f(3, 14, 4, 1, '#1B1B1B'); f(23, 10, 4, 1, '#1B1B1B', 'it')
    f(7, 22, 2, 4, '#F2C230', 'la'); f(17, 22, 2, 4, '#F2C230', 'la'); f(11, 22, 2, 4, '#F2C230', 'lb'); f(21, 22, 2, 4, '#F2C230', 'lb')
    f(8, 14, 14, 3, '#1B1B1B')
    f(9, 12, 2, 2, '#F4F1EA'); f(19, 12, 2, 2, '#F4F1EA'); f(10, 13, 1, 1, '#1B1B1B'); f(20, 13, 1, 1, '#1B1B1B')
    f(7, 18, 16, 1, '#1B1B1B'); stamp(f, 13, 17, ['wwww', 'wkkw', '.ww.'], { w: '#F4F1EA', k: '#1B1B1B' })
    stamp(f, 2, 8, ['..o..', '.oro.', 'ooroo', 'ooooo', '.ooo.', '..o..'], { o: '#FF8A1E', r: '#E5484D' }, 'gl')
    stamp(f, 25, 0, ['.g.', 'ggg', '.g.', '.k.'], { g: '#C9CCD2', k: '#7A4A26' }, 'it'); f(24, 4, 1, 6, '#7A4A26', 'it')
  },
  // Ice ninja (freeze, cache, cold, archive, snapshot): blue suit, dark-blue face mask, pale eyes, a silver belt, ice bracers, a crystal blast.
  iceninja: f => {
    crabBody(f)
    f(7, 10, 16, 12, '#2F6FDB'); f(3, 14, 4, 4, '#8FD3FF'); f(23, 14, 4, 4, '#8FD3FF')
    f(8, 14, 14, 3, '#1F4FA8')
    f(7, 22, 2, 4, '#2F6FDB', 'la'); f(17, 22, 2, 4, '#2F6FDB', 'la'); f(11, 22, 2, 4, '#2F6FDB', 'lb'); f(21, 22, 2, 4, '#2F6FDB', 'lb')
    f(9, 12, 2, 2, '#E6F7FF'); f(19, 12, 2, 2, '#E6F7FF'); f(10, 13, 1, 1, '#10234F'); f(20, 13, 1, 1, '#10234F')
    f(7, 18, 16, 1, '#C9CCD2'); f(14, 17, 2, 3, '#8FD3FF')
    stamp(f, 24, 6, ['..w..', '.www.', 'wwwww', '.www.', '..w..'], { w: '#BFEFFF' }, 'star')
    stamp(f, 3, 2, ['.w.w.', '..w..', 'wwwww', '..w..', '.w.w.'], { w: '#BFEFFF' }, 'star'); f(20, 3, 1, 1, '#E6F7FF', 'star')
  },
  other: f => crabBody(f),
}

// The duo tiers reuse an existing crab; their own colour still tints it.
export const COSTUME_ALIAS: Record<string, string> = {
  'duo-low': 'light',
  'duo-medium': 'medium',
  'duo-high': 'careful',
  'duo-xhigh': 'heavy',
  'duo-max': 'fable',
  'duo-opus': 'crown',
  'duo-advisor': 'wizard',
  'duo-reviewer': 'monocle',
  'duo-verifier': 'detective',
}
// Costume tint where the costume is no tier (the tier colours live in TIER_COLOR).
const COSTUME_TINT: Record<string, string> = { wizard: '#5B4BC4', monocle: '#C9444A', detective: '#B8935A', judge: '#7A4A26', hardhat: '#F5C542', explorer: '#D2B97A', bulb: '#FFD84A', quill: '#B23A48', crown: '#F5C542', rocket: '#E5484D', robot: '#8E96A3', scientist: '#6FCF97', artist: '#E8913A', ninja: '#2B2B33', doctor: '#E5484D', librarian: '#8B5E3C', viking: '#9AA0A8', cleaner: '#E7C65A', cyborg: '#A9B4C4', thunder: '#7FB0FF', fireninja: '#F2C230', iceninja: '#2F6FDB' }

export const costumeOf = (type: string): string => (type === 'Explore' ? 'explore' : tierOf(type))

const CRAB_SCALE = 1.1

// Body and props nest inside `bd` so a prop rides the bob and adds its own motion;
// legs stay outside it and step on their own. `mirror` flips the crab inside its
// own box (x .. x + CRAB_BOX * scale) so it faces left.
const crab = (x: number, y: number, costume: string, dim = false, isWalking = false, scale = CRAB_SCALE, mirror = false): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  const look = COSTUME_ALIAS[costume] ?? costume
  const draw = COSTUMES[look] ?? ((g: Fill) => crabBody(g))
  draw(f, COSTUME_TINT[look] ?? colorOf(costume))
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  const place = mirror ? `translate(${x + CRAB_BOX * scale},${y}) scale(${-scale},${scale})` : `translate(${x},${y}) scale(${scale})`
  return `<g transform="${place}" opacity="${dim ? 0.45 : 1}" shape-rendering="crispEdges"><g class="c-${look}${isWalking ? ' run' : ''}">${body}${group('la')}${group('lb')}</g></g>`
}

const statusMark = (x: number, y: number, status: string, color: string): string => {
  if (status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (status === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (status === 'failed') return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
  return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#9a9a96" stroke-width="1.4"/><path d="M${x} ${y - 2.5}v2.8l1.8 1.2" fill="none" stroke="#9a9a96" stroke-width="1.4" stroke-linecap="round"/>`
}

// Panel rows are laid out left to right; in Hebrew each box mirrors across the
// row (`mx`) and text hugs the mirrored side. `words` text may hold Hebrew and
// takes `direction="rtl"` (whose `start` is the right edge); numbers stay
// left to right so "≈$0.25" keeps its order.
const mx = (W: number, x: number, w = 0): number => (isRtl() ? W - x - w : x)

// Text that starts at x: left-aligned, or right-aligned at the mirrored x.
const startText = (W: number, x: number, y: number, words = true): string =>
  !isRtl()
    ? `x="${x}" y="${y}"`
    : `x="${W - x}" y="${y}"${words ? ' direction="rtl" text-anchor="start"' : ' text-anchor="end"'}`

// Text that ends at x: right-aligned, or left-aligned at the mirrored x.
const endText = (W: number, x: number, y: number, words = false): string =>
  !isRtl() ? `x="${x}" y="${y}" text-anchor="end"` : `x="${W - x}" y="${y}"${words ? ' direction="rtl" text-anchor="end"' : ''}`

// Text on a coloured fill: whichever of near-black and white reads better (WCAG contrast).
const channel = (v: number): number => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4))
export const luminance = (hex: string): number => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const n = parseInt(m[1], 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const BAND_INK = '#10151a'
export const inkOn = (fill: string): string => (contrast(fill, BAND_INK) >= contrast(fill, '#ffffff') ? BAND_INK : '#ffffff')

const crabWidth = (scale: number): number => Math.round(CRAB_BOX * scale * 100) / 100

// A panel crab at x in a row of width W: on the mirrored side and facing left in Hebrew.
const rowCrab = (W: number, x: number, y: number, costume: string, dim = false, isWalking = false): string =>
  crab(mx(W, x, crabWidth(CRAB_SCALE)), y, costume, dim, isWalking, CRAB_SCALE, isRtl())

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${CRAB_CSS}${body}</svg>`

// A finished run shows all its steps done, whatever the worker last reported.
export const stepsDone = (a: AgentRun): number => (a.status === 'done' && a.stepTotal ? a.stepTotal : (a.stepDone ?? 0))

const WINDOWS: readonly (readonly [string, string])[] = [['five_hour', '5h'], ['seven_day', '7d']]

// The usage tile: the label names the windows, the value their percentages; null off a
// subscription or before the host has a reading.
export const limitTile = (list: readonly Limit[]): { label: string; value: string } | null => {
  const rows = WINDOWS.flatMap(([kind, short]) => {
    const l = list.find(x => x.kind === kind)
    return l && Number.isFinite(l.percentUsed) ? [{ short, pct: Math.round(l.percentUsed) }] : []
  })
  return rows.length ? { label: rows.map(r => r.short).join(' · '), value: rows.map(r => `${r.pct}%`).join(' · ') } : null
}

// What a tool call was doing, in a few words, for the one-line status.
const baseName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

export const describeAction = (tool: string, input: Record<string, unknown>): string => {
  const str = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (tool) {
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return str('file_path') ? `editing ${baseName(str('file_path'))}` : 'editing'
    case 'Write':
      return str('file_path') ? `writing ${baseName(str('file_path'))}` : 'writing'
    case 'Read':
      return str('file_path') ? `reading ${baseName(str('file_path'))}` : 'reading'
    case 'Bash':
      // Only the program: the arguments can hold tokens or passwords.
      return str('command').trim() ? `running: ${clip(baseName(str('command').trim().split(/\s+/)[0]), 24)}` : 'running a command'
    case 'Grep':
    case 'Glob':
      return 'searching'
    case 'WebFetch':
    case 'WebSearch':
      return 'looking things up'
    default:
      return tool.replace(/^mcp__.+?__/, '')
  }
}

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

export const verdictOf = (answer: unknown): 'pass' | 'fail' | undefined => {
  const m = typeof answer === 'string' ? /^[\s*_#>`"'-]*(pass|fail)\b/i.exec(answer) : null
  return m ? (m[1].toLowerCase() as 'pass' | 'fail') : undefined
}

// Running with no sign of life for STALL_MS.
export const isStalled = (a: AgentRun, at: number): boolean => a.status === 'running' && at - (a.lastAt ?? a.startedAt) > (a.busy ? STALL_BUSY_MS : STALL_MS)

// What the usage tool answers: the same shape duo's usage file has (percent used, reset as epoch
// seconds, per window), or a plain sentence when the host has no reading.
export const usageReport = (list: readonly Limit[]): string => {
  const out: Record<string, { used_percentage: number; resets_at?: number }> = {}
  for (const [kind] of WINDOWS) {
    const l = list.find(x => x.kind === kind)
    if (!l || !Number.isFinite(l.percentUsed)) continue
    const ms = l.resetsAt ? Date.parse(l.resetsAt) : Number.NaN
    out[kind] = { used_percentage: l.percentUsed, ...(Number.isFinite(ms) ? { resets_at: Math.floor(ms / 1000) } : {}) }
  }
  return Object.keys(out).length ? JSON.stringify(out) : 'no reading: the host reports no usage windows (not a subscription, or no response yet)'
}

// The pane's own title already says "Agents": the header names the flow, if any.
export const headerSvg = (W: number, title: string, t: ReturnType<typeof totals>, lim: readonly Limit[] = []): string => {
  const s = tr()
  const gap = 6
  const tw = (W - gap * 2) / 3
  const top = title ? 28 : 0
  const tile = (i: number, k: string, v: string) =>
    `<rect class="tile" x="${mx(W, i * (tw + gap), tw)}" y="${top}" width="${tw}" height="40" rx="8"/>
<text class="s" ${startText(W, i * (tw + gap) + 9, top + 16)} font-family="${FONT}" font-size="11">${k}</text>
<text class="t" ${startText(W, i * (tw + gap) + 9, top + 33, false)} font-family="${FONT}" font-size="15" font-weight="600" font-variant-numeric="tabular-nums">${v}</text>`
  return svg(
    W,
    headerHeight(title),
    `${title ? `<text class="t" ${startText(W, 0, 15)} font-family="${FONT}" font-size="14" font-weight="600">${xml(fitText(title, 14, W))}</text>` : ''}
${tile(0, ...(limitTile(lim) ? [`${s.limit} ${limitTile(lim)!.label}`, limitTile(lim)!.value] : [s.cost, '≈' + fmtCost(t.cost)]) as [string, string])}${tile(1, s.tokens, fmtTokens(t.tokens))}${tile(2, s.time, fmtTime(t.time))}`,
  )
}

const headerHeight = (title: string): number => (title ? 72 : 44)

// The task's own progress when the worker reports steps; a finished run is full.
const progressOf = (a: AgentRun): number | null => {
  if (a.status === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)
  return null
}

const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

const clock = (ms: number): string => new Date(ms).toTimeString().slice(0, 8)

// The expanded rows' text, from data the run already holds. First line: which model ran it.
export const detailLines = (a: AgentRun, at: number): string[] => {
  const s = tr()
  const tier = tierOf(a.type)
  const state = a.status === 'running' ? s.isRunning : a.status === 'failed' ? s.failed : s.isFinished
  const lines = [
    `${s.model}: ${runModel(a)}${a.model ? ` (${a.model})` : ''}`,
    `${s.agentType}: ${a.type}${tier === 'other' ? '' : ` · ${tierWord(tier)}`}`,
    `${s.task}: ${a.description || a.type}`,
    `${s.status}: ${state}${a.round > 1 ? ` · ${s.round} ${a.round}` : ''}${isStalled(a, at) ? ` · ${s.stalled} ${fmtTime(at - (a.lastAt ?? a.startedAt))}` : ''}`,
    `${s.ctx} ${ctxOf(a)}% · ${fmtTokens(a.contextTokens)} · ${fmtTokens(a.tokens)} ${s.tokensWord} · ≈${fmtCost(a.costUsd)}`,
    `${s.timeWord}: ${clock(a.startedAt)}${a.endedAt ? ` – ${clock(a.endedAt)}` : ''} · ${fmtTime(elapsed(a, at))}`,
  ]
  if (a.why) lines.push(`${s.whyWord}: ${a.why}`)
  if (a.status === 'running' && a.action) lines.push(`${s.nowWord}: ${a.action}`)
  const done = stepsDone(a)
  const log = a.stepLog ?? []
  if (a.stepTotal || log.length) lines.push(`${s.stepsWord}: ${done}/${a.stepTotal || '?'}${a.stepNote ? ` · ${a.stepNote}` : ''}`)
  // With a plan the checklist is its titles; without one, the notes the worker logged, in order.
  if (a.stepPlan?.length) {
    a.stepPlan.forEach((title, i) => {
      const mark = i < done ? '✓' : i === done && a.status === 'running' ? '▸' : '○'
      lines.push(`  ${mark} ${i + 1}. ${title}`)
    })
  } else {
    const noted = log.filter(l => l.note)
    noted.forEach((l, i) => {
      const mark = i < noted.length - 1 || a.status !== 'running' ? '✓' : '▸'
      lines.push(`  ${mark} ${l.n + 1}. ${l.note}`)
    })
  }
  if (a.verdict) lines.push(`${s.verdictWord}: ${a.verdict.toUpperCase()}`)
  if (a.result) lines.push(`${s.resultWord}: ${a.result}`)
  if (a.files?.length) lines.push(`${s.filesWord}: ${a.files.map(baseName).join(', ')}`)
  return lines
}

const openOf = (p: Panel): string[] => (Array.isArray(p.openIds) ? p.openIds : [])
const isOpen = (p: Panel, a: AgentRun): boolean => openOf(p).includes(a.id)
// Not known whether an Svg takes a press, so a plain Button (proven pressable here) under each row toggles the details.
// Wide (CJK) characters take two columns.
const wideLen = (t: string): number => [...t].reduce((n, c) => n + ((c.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1), 0)
// Cuts a line to `cols` terminal columns, with an ellipsis when it had to cut.
const fitCols = (t: string, cols: number): string => {
  if (wideLen(t) <= cols) return t
  let out = ''
  for (const ch of t) {
    if (wideLen(out + ch) > cols - 1) break
    out += ch
  }
  return out + '…'
}
// Pads to `cols` display columns: wide characters count two.
const padCols = (t: string, cols: number): string => t + ' '.repeat(Math.max(0, cols - wideLen(t)))
const detailLineCount = (a: AgentRun, at: number, cols: number): number =>
  detailLines(a, at).reduce((n, l) => n + Math.max(1, Math.ceil(wideLen(l) / Math.max(20, cols))), 0)

const agentSvg = (W: number, a: AgentRun, at: number): string => {
  const s = tr()
  const tier = tierOf(a.type)
  const color = colorOf(tier)
  const ctx = ctxOf(a)
  const textW = W - 42 - 22
  const meta = [runModel(a)]
  if (a.round > 1) meta.push(`${s.round} ${a.round}`)
  if (a.status === 'failed') meta.push(s.failed)
  const isQuiet = isStalled(a, at)
  if (isQuiet) meta.push(`${s.stalled} ${fmtTime(at - (a.lastAt ?? a.startedAt))}`)
  const barW = textW
  const progress = progressOf(a)
  const stats = `${s.ctx} ${ctx}% · ${fmtTokens(a.contextTokens)}  ≈${fmtCost(a.costUsd)}  ${fmtTime(elapsed(a, at))}`
  // Reported steps, else what the agent's last tool call was doing.
  const steps = a.stepTotal ? `${stepsDone(a)}/${a.stepTotal}${a.stepNote ? ' · ' + a.stepNote : ''}` : a.status === 'running' ? (a.action ?? '') : ''
  const stepsW = Math.max(0, barW - textWidth(stats, 11) - 12)
  // Without reported steps the bar falls back to the context, drawn grey.
  const fillW = Math.round(barW * (progress ?? ctx / 100))
  return svg(
    W,
    66,
    `${rowCrab(W, 0, 14, costumeOf(a.type), isQuiet, a.status === 'running' && !isQuiet)}
<text class="t" ${startText(W, 42, 18)} font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(a.description || a.type, 13, textW))}</text>
<text ${startText(W, 42, 34)} font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tier === 'other' ? a.type : tierWord(tier))}</tspan><tspan class="t" font-weight="500">  ${xml(meta.join('  ·  '))}</tspan></text>
${steps && stepsW > 30 ? `<text class="t" ${startText(W, 42, 49)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(fitText(steps, 11, stepsW))}</text>` : ''}
<text class="s" ${endText(W, 42 + barW, 49, true)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${stats}</text>
<rect class="k" x="${mx(W, 42, barW)}" y="55" width="${barW}" height="4" rx="2"/><rect${progress === null ? ' class="m"' : ''} x="${mx(W, 42, fillW)}" y="55" width="${fillW}" height="4" rx="2"${progress === null ? '' : ` fill="${color}"`}/>
${statusMark(mx(W, W - 8), 16, a.status, color)}
<line class="ln" x1="0" y1="65.5" x2="${W}" y2="65.5"/>`,
  )
}

const plannedSvg = (W: number, p: Planned): string => {
  const tier = p.tier in TIER_COLOR ? p.tier : 'other'
  const color = colorOf(tier)
  const textW = W - 42 - 22
  const meta = [tierModel(tier)]
  if (p.after.length) meta.push(`${tr().after} ${p.after.join(', ')}`)
  return svg(
    W,
    46,
    `${rowCrab(W, 0, 6, tier, true)}
<text class="s" ${startText(W, 42, 18)} font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(`${p.n}. ${p.title}`, 13, textW))}</text>
<text ${startText(W, 42, 34)} font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tierWord(tier))}</tspan><tspan class="m">  ${xml(meta.filter(Boolean).join('  ·  '))}</tspan></text>
${statusMark(mx(W, W - 8), 16, 'planned', color)}
<line class="ln" x1="0" y1="45.5" x2="${W}" y2="45.5"/>`,
  )
}

const compactSvg = (W: number, list: AgentRun[], planned: Planned[], t: ReturnType<typeof totals>): string => {
  const icons = [
    ...list.filter(a => a.status === 'running').map(a => ({ k: costumeOf(a.type), c: colorOf(tierOf(a.type)), s: 'running', dim: false })),
    ...list.filter(a => a.status !== 'running').map(a => ({ k: costumeOf(a.type), c: colorOf(tierOf(a.type)), s: a.status, dim: false })),
    ...planned.map(p => ({ k: p.tier in TIER_COLOR ? p.tier : 'other', c: colorOf(p.tier), s: 'planned', dim: true })),
  ]
  const fit = Math.max(1, Math.floor((W - 150) / 36))
  const shown = icons.slice(0, fit)
  const more = icons.length - shown.length
  const body = shown
    .map((ic, i) => rowCrab(W, i * 36, 0, ic.k, ic.dim, ic.s === 'running') + (ic.s === 'running' ? `<circle class="live" cx="${mx(W, i * 36 + 32)}" cy="4" r="3" fill="${ic.c}"/>` : ''))
    .join('')
  const x = shown.length * 36 + (more ? 4 : 0)
  return svg(
    W,
    32,
    `${body}${more ? `<text class="s" ${startText(W, x, 21, false)} font-family="${FONT}" font-size="12">+${more}</text>` : ''}
<text class="s" ${endText(W, W, 21)} font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} · ${fmtTime(t.time)}</text>`,
  )
}

// --- desktop drawings of the grouped view.

const C_DONE = '#3FB68B'
const C_RUN = '#F5B44A'
const C_FAIL = '#E5484D'
const GP = 6
const STAGE_CRAB = 1.2
const MAX_SQUARES = 40
const MAX_FINISHED_ROWS = 60

const fmtSpan = (ms: number): string => {
  const m = Math.floor(Math.max(0, ms) / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m ? `${m}m ${Math.floor(ms / 1000) % 60}s` : fmtTime(ms)
}

// An agent type with its own crab keeps it; a plain worker takes its stage's.
export const agentCostume = (a: AgentRun): string => {
  const c = costumeOf(a.type)
  return c !== 'other' ? c : stageCostume(groupKey(a.description))
}

const crabAt = (W: number, x: number, y: number, costume: string, scale: number, isWalking: boolean): string =>
  crab(mx(W, x, crabWidth(scale)), y, costume, false, isWalking, scale, isRtl())

const T = (W: number, cls: string, x: number, y: number, size: number, weight: number, text: string, side: 'start' | 'end', extra = ''): string =>
  `<text class="${cls}" ${side === 'start' ? startText(W, x, y) : endText(W, x, y, true)} font-family="${FONT}" font-size="${size}" font-weight="${weight}"${extra}>${xml(text)}</text>`

const sectionLabel = (W: number, y: number, text: string): string =>
  T(W, 'm', GP, y, 10.5, 700, isRtl() ? text : text.toUpperCase(), 'start', isRtl() ? '' : ' letter-spacing="1.2"')

const stageBadge = (cx: number, cy: number, kind: 'done' | 'running' | 'failed'): string =>
  kind === 'done'
    ? `<circle cx="${cx}" cy="${cy}" r="6.5" fill="${C_DONE}"/><path d="M${cx - 3.2} ${cy}l2.2 2.2 4.2-4.4" fill="none" stroke="#0F2B22" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    : kind === 'failed'
      ? `<circle cx="${cx}" cy="${cy}" r="6.5" fill="${C_FAIL}"/><path d="M${cx - 2.6} ${cy - 2.6}l5.2 5.2M${cx + 2.6} ${cy - 2.6}l-5.2 5.2" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>`
      : `<circle cx="${cx}" cy="${cy}" r="6.5" fill="#1d1d1c" stroke="${C_RUN}" stroke-width="1.8"/><circle class="live" cx="${cx}" cy="${cy}" r="2.6" fill="${C_RUN}"/>`

const countsText = (g: { done: number; running: number; failed: number }): string => {
  const s = tr()
  return [g.done ? `${g.done} ${s.doneN}` : '', g.running ? `${g.running} ${s.isRunning}` : '', g.failed ? `${g.failed} ${s.failedN}` : ''].filter(Boolean).join(' · ') || `0 ${s.doneN}`
}

// Header, models and stages, running now: one drawing. Returns the markup and its height.
export const groupedSvg = (W: number, list: AgentRun[], at: number, title: string, planned: Planned[] = []): { source: string; height: number } => {
  const s = tr()
  const out: string[] = []
  const tl = tally(list)
  const t = totals(list, at)
  const rule = (y: number) => `<rect class="k" x="${GP}" y="${y}" width="${W - GP * 2}" height="1"/>`
  const wide = W - GP * 2

  // Header
  const headCounts = `${tl.running} ${s.isRunning} · ${tl.done} ${s.doneN}${tl.failed ? ` · ${tl.failed} ${s.failedN}` : ''}`
  out.push(T(W, 't', GP, 22, 16, 700, fitText(title, 16, Math.max(40, W - GP * 3 - textWidth(headCounts, 12.5))), 'start'))
  out.push(T(W, 's', W - GP, 22, 12.5, 400, headCounts, 'end'))
  const seg = (from: number, n: number, color: string) => (n ? `<rect x="${mx(W, GP + from, Math.round((wide * n) / tl.total))}" y="34" width="${Math.round((wide * n) / tl.total)}" height="8" rx="4" fill="${color}"/>` : '')
  const wd = Math.round((wide * tl.done) / tl.total)
  const wr = Math.round((wide * tl.running) / tl.total)
  out.push(`<rect class="k" x="${GP}" y="34" width="${wide}" height="8" rx="4"/>${seg(0, tl.done, C_DONE)}${seg(wd, tl.running, C_RUN)}${seg(wd + wr, tl.failed, C_FAIL)}`)
  out.push(T(W, 's', GP, 62, 12, 400, `${tl.total} ${s.startedSoFar}, ${tl.finished} ${s.nFinished}`, 'start'))
  const right = `${fmtSpan(t.time)} ${s.totalWord} · ${fmtTokens(t.tokens)} ${s.tokensWord}`
  const leftW = textWidth(`${tl.total} ${s.startedSoFar}, ${tl.finished} ${s.nFinished}`, 12)
  out.push(T(W, 's', W - GP, 62, 12, 400, fitText(right, 12, Math.max(40, wide - leftW - 12)), 'end'))

  // Needs attention: failed and stalled agents, named, with the reason and the last thing they did.
  let y = 88
  const needs = attentionOf(list, at)
  if (needs.length) {
    out.push(sectionLabel(W, y, `${s.attention} · ${needs.length}`))
    y += 10
    for (const a of needs.slice(0, MAX_ATTENTION)) {
      const why = a.status === 'failed' ? s.failed : `${s.stalled} ${fmtTime(at - (a.lastAt ?? a.startedAt))}`
      const detail = a.status === 'failed' ? a.result || a.action || '' : a.action || a.stepNote || ''
      const rw = textWidth(why, 12)
      out.push(crabAt(W, GP + 2, y + 5, agentCostume(a), 0.73, false))
      out.push(T(W, 't', GP + 2 + 22 + 10, y + 20, 13, 600, fitText(a.description || a.type, 13, Math.max(40, W - GP * 2 - 34 - rw - 14)), 'start'))
      out.push(T(W, 's', W - GP, y + 20, 12, 600, why, 'end'))
      if (detail) out.push(T(W, 'm', GP + 34, y + 35, 11.5, 400, fitText(detail, 11.5, Math.max(40, W - GP * 2 - 34)), 'start'))
      y += detail ? 42 : 30
    }
    if (needs.length > MAX_ATTENTION) {
      out.push(T(W, 's', GP + 34, y + 14, 12, 400, `+${needs.length - MAX_ATTENTION}`, 'start'))
      y += 24
    }
    y += 6
    out.push(rule(y))
    y += 22
  }

  // Models
  out.push(sectionLabel(W, y, s.groupModels))
  const mix = modelMix(list)
  const narrow = W < 480
  const barW = narrow ? wide : Math.min(210, Math.round(W * 0.38))
  const bar = (by: number) => {
    const shown = mix.rows.filter(r => r.tokens > 0 || !mix.rows.some(q => q.tokens > 0))
    const widths = barWidths(shown.map(r => r.pct), barW)
    let x = 0
    const segs = shown.map((r, i) => {
      const w = widths[i] ?? 0
      const mark = `<rect x="${mx(W, (narrow ? GP : W - GP - barW) + x, w)}" y="${by}" width="${w}" height="8" fill="${r.color}"/>`
      x += w
      return mark
    })
    return `<clipPath id="mb"><rect x="${mx(W, narrow ? GP : W - GP - barW, barW)}" y="${by}" width="${barW}" height="8" rx="4"/></clipPath><g clip-path="url(#mb)"><rect class="k" x="${mx(W, narrow ? GP : W - GP - barW, barW)}" y="${by}" width="${barW}" height="8"/>${segs.join('')}</g>`
  }
  const rowsY = y + 18
  mix.rows.forEach((r, i) => {
    const ry = rowsY + i * 22
    const shownName = clip(r.name, MODEL_NAME_MAX)
    const nameW = textWidth(shownName, 13) + 4
    out.push(`<circle cx="${mx(W, GP + 5)}" cy="${ry - 4}" r="5" fill="${r.color}"/>`)
    out.push(T(W, 't', GP + 18, ry, 13, 600, shownName, 'start'))
    const free = (narrow ? wide : wide - barW - 16) - 18 - nameW - 8
    out.push(T(W, 's', GP + 18 + nameW + 8, ry, 12, 400, fitText(`${r.agents} ${agentsWord(r.agents)} · ${fmtTokens(r.tokens)} ${s.tokensWord}`, 12, Math.max(30, free)), 'start'))
  })
  const rowsEnd = rowsY + (mix.rows.length - 1) * 22
  if (narrow) {
    out.push(bar(rowsEnd + 12))
    y = rowsEnd + 12
    if (mix.isMixed && mix.top) out.push(T(W, 's', W - GP, y + 24, 12, 400, `${mix.top.pct}% ${s.shareOn} ${clip(mix.top.name.split(' ')[0] ?? '', 14)}`, 'end'))
    y += mix.isMixed ? 32 : 14
  } else {
    out.push(bar(rowsY - 12))
    if (mix.isMixed && mix.top) out.push(T(W, 's', W - GP, rowsY + 10, 12, 400, `${mix.top.pct}% ${s.shareOn} ${clip(mix.top.name.split(' ')[0] ?? '', 14)}`, 'end'))
    y = Math.max(rowsEnd, rowsY + 10) + 14
  }
  out.push(rule(y))

  // Stages
  y += 26
  out.push(sectionLabel(W, y, s.groupStages))
  y += 12
  const cw = Math.round(crabWidth(STAGE_CRAB))
  const textX = GP + 2 + cw + 12
  for (const g of groupAgents(list)) {
    const active = g.running > 0
    const costume = (() => {
      const c = stageCostume(g.key)
      return c !== 'other' ? c : agentCostume(g.agents[0] as AgentRun)
    })()
    const name = g.key === 'other' ? tierWord('other') : g.key
    const counts = countsText(g)
    const countsW = textWidth(counts, 12)
    const cells = Math.min(g.agents.length, MAX_SQUARES)
    const more = g.agents.length - cells
    const moreText = more ? `+${more}` : ''
    const nCells = cells + (more ? 1 : 0)
    let rowH = 48
    let sq: string[] = []
    let nameMax = Math.max(40, W - textX - GP - countsW - 10)
    let place = (_i: number) => ({ x: 0, y: 0 })
    if (active) {
      const sx = textX + Math.min(Math.max(textWidth(name, 14), textWidth(g.model, 11.5)) + 14, W * 0.3)
      const per = Math.floor((W - GP - countsW - 12 - sx + 4) / 16)
      if (per >= 6) {
        const lines = Math.ceil(nCells / per)
        const blockH = lines * 16 - 4
        rowH = Math.max(56, blockH + 18)
        const top = y + (rowH - blockH) / 2
        place = i => ({ x: sx + (i % per) * 16, y: top + Math.floor(i / per) * 16 })
        nameMax = sx - textX - 10
      } else {
        const perB = Math.max(1, Math.floor((W - GP - textX + 4) / 16))
        const lines = Math.ceil(nCells / perB)
        rowH = 54 + lines * 16
        place = i => ({ x: textX + (i % perB) * 16, y: y + 52 + Math.floor(i / perB) * 16 })
      }
      const order = [...Array(g.done).fill(C_DONE), ...Array(g.running).fill(C_RUN), ...Array(g.failed).fill(C_FAIL)].slice(0, cells)
      sq = order.map((c, i) => {
        const p = place(i)
        return `<rect x="${mx(W, p.x, 12)}" y="${p.y}" width="12" height="12" rx="3" fill="${c}"/>`
      })
      if (more) {
        const p = place(cells)
        sq.push(T(W, 's', p.x + 2, p.y + 10, 11, 600, moreText, 'start'))
      }
    }
    const cy = y + (active && rowH > 56 && place(0).x === textX ? 28 : rowH / 2)
    const crabY = cy - Math.round(28 * STAGE_CRAB) / 2
    const kind = active ? 'running' : g.failed ? 'failed' : 'done'
    const body = `${crabAt(W, GP + 2, crabY, costume, STAGE_CRAB, active)}${stageBadge(mx(W, GP + 2 + cw - 3), crabY + Math.round(28 * STAGE_CRAB) - 3, kind)}
${T(W, 't', textX, cy - 4, 14, 700, fitText(name, 14, nameMax), 'start')}${T(W, 's', textX, cy + 12, 11.5, 400, fitText(g.model, 11.5, nameMax), 'start')}${sq.join('')}${T(W, 's', W - GP, cy + 4, 12, 400, counts, 'end')}`
    out.push(active ? `<g>${body}</g>` : `<g opacity="0.62">${body}</g>`)
    y += rowH
    out.push(rule(y))
  }

  // Running now
  const running = list.filter(a => a.status === 'running').sort((a, b) => b.startedAt - a.startedAt)
  if (running.length) {
    y += 20
    const shown = running.slice(0, 4)
    out.push(sectionLabel(W, y, s.runningNow))
    out.push(T(W, 's', W - GP, y, 11.5, 400, `${shown.length}/${running.length}`, 'end'))
    y += 10
    for (const a of shown) {
      const right = `${fmtTokens(a.tokens)} ${s.tokensWord} · ${fmtTime(elapsed(a, at))}`
      const rw = textWidth(right, 12)
      out.push(crabAt(W, GP + 2, y + 5, agentCostume(a), 0.73, true))
      out.push(T(W, 't', GP + 2 + 22 + 10, y + 20, 13, 600, fitText(a.description || a.type, 13, Math.max(40, W - GP * 2 - 34 - rw - 14)), 'start'))
      out.push(T(W, 's', W - GP, y + 20, 12, 400, right, 'end', ' font-variant-numeric="tabular-nums"'))
      y += 30
    }
    if (running.length > shown.length) {
      out.push(T(W, 's', GP + 34, y + 14, 12, 400, `+${running.length - shown.length} ${s.moreRunning}`, 'start'))
      y += 24
    }
    y += 6
    out.push(rule(y))
  }
  if (planned.length) {
    out.push(T(W, 'm', GP, y + 20, 12, 400, `◷ ${s.planned} · ${planned.length}`, 'start'))
    y += 30
  }
  const height = Math.ceil(y + 4)
  return { source: svg(W, height, out.join('\n')), height }
}

// "3.6M tokens · ≈$4.20 API-equivalent" under the Finished toggle.
export const footerSvg = (W: number, finished: AgentRun[]): string => {
  const s = tr()
  const tokens = finished.reduce((n, a) => n + a.tokens, 0)
  const cost = finished.reduce((n, a) => n + a.costUsd, 0)
  return svg(W, 22, `<text class="s" ${endText(W, W - GP, 15, true)} font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${xml(`${fmtTokens(tokens)} ${s.tokensWord}`)}<tspan class="m"> · ≈${xml(fmtCost(cost))} ${xml(s.apiEq)}</tspan></text>`)
}

// Compact rows: still crab, label, model, tokens, time. Capped, newest first.
// The pane redraws every second while anything runs; finished rows do not change, so the last drawing is kept.
let finishedMemo = { key: '', out: { source: '', height: 0 } }
const finishedCached = (W: number, list: AgentRun[], at: number): { source: string; height: number } => {
  const key = `${W}|${lang}|${finishedRows(list).map(a => `${a.id}${a.status}${a.tokens}`).join(',')}`
  if (finishedMemo.key !== key) finishedMemo = { key, out: finishedSvg(W, list, at) }
  return finishedMemo.out
}
export const FINISHED_ROW = 30
export const finishedRows = (list: AgentRun[]): AgentRun[] => list.slice(0, MAX_FINISHED_ROWS)
export const finishedSvg = (W: number, list: AgentRun[], at: number): { source: string; height: number } => {
  const s = tr()
  const rows = finishedRows(list)
  const out = rows.map((a, i) => {
    const y = i * FINISHED_ROW
    const right = `${modelName(a.model)} · ${fmtTokens(a.tokens)} · ${fmtTime(elapsed(a, at))}`
    const rw = textWidth(right, 11.5)
    const label = fitText(a.description || a.type, 12.5, Math.max(40, W - GP * 2 - 30 - rw - 12))
    return `${crabAt(W, GP + 2, y + 6, agentCostume(a), 0.6, false)}${T(W, a.status === 'failed' ? 'f' : 't', GP + 2 + 18 + 10, y + 19, 12.5, 500, label, 'start')}${T(W, 's', W - GP, y + 19, 11.5, 400, right, 'end', ' font-variant-numeric="tabular-nums"')}${a.status === 'failed' ? `<text class="f" ${startText(W, GP + 2 + 18 + 10 + textWidth(label, 12.5) + 6, y + 19, false)} font-family="${FONT}" font-size="10.5">${xml(s.failed)}</text>` : ''}`
  })
  const height = Math.max(1, rows.length) * FINISHED_ROW
  return { source: svg(W, height, `<style>.f{fill:#E5484D}</style>${out.join('')}`), height }
}

// --- terminal drawing: the same rows in text.

const ctxBar = (pct: number, width: number): string => {
  const filled = Math.round((width * pct) / 100)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

const STATUS_GLYPH: Record<string, string> = { running: '●', done: '✓', failed: '✗', planned: '◷' }

// Opens the agents pane, or closes it when it is up; true when it ends up open.
async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: PANE, title: tr().pane })
  return true
}

async function autoOpen($: EngineInterface, key: string): Promise<void> {
  const p = await read($, panel)
  if (p.autoOpenedFor === key) return
  await update($, panel, prev => ({ ...prev, autoOpenedFor: key }))
  void $.ui.open({ id: PANE, title: tr().pane })
}

// The host's reading now, else the last one the panel saw.
// What a render shows: the host's reading now, else the last one the panel kept (nothing is stale
// longer than the next response).
async function freshLimits($: EngineInterface): Promise<Limit[]> {
  const reading = await currentLimits($)
  return reading.length ? reading : read($, limits)
}

async function currentLimits($: EngineInterface): Promise<Limit[]> {
  try {
    const u = await $.session.usage()
    return u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
  } catch {
    return read($, limits)
  }
}

// ---------------------------------------------------------------------------
// The run receipt: what the agents actually did, built by the panel from what it saw (not
// written by a model), for the user to keep or paste into a pull request.

export type Receipt = { key?: string; at: number; title: string; used: string; agents: AgentRun[] }

// Free text from an agent (its task, answer, file names) goes into markdown the user may paste into a pull
// request: every character that could make a link, an image, a heading or HTML is escaped.
export const mdCell = (t: string): string =>
  t
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\`*_{}\[\]()<>#!|~]/g, c => `\\${c}`)

export const receiptMarkdown = (r: Receipt): string => {
  const rows = r.agents.map(
    a =>
      `| ${mdCell(a.description || a.type)} | ${mdCell(runModel(a))} | ${a.status}${a.verdict ? ` (${a.verdict.toUpperCase()})` : ''} | ${a.stepTotal ? `${stepsDone(a)}/${a.stepTotal}` : '-'} | ${fmtTokens(a.tokens)} | ≈${fmtCost(a.costUsd)} | ${fmtTime(a.endedAt ? a.endedAt - a.startedAt : 0)} |`,
  )
  const detail = r.agents.flatMap(a => {
    const bits = [
      a.why ? `- Why this tier (the orchestrator's words): ${mdCell(a.why)}` : '',
      a.verdict ? `- Verdict: ${a.verdict.toUpperCase()}` : '',
      a.result ? `- Result: ${mdCell(a.result)}` : '',
      a.files?.length ? `- Files: ${a.files.map(f => mdCell(f)).join(', ')}` : '',
    ].filter(Boolean)
    return bits.length ? [`### ${mdCell(a.description || a.type)} (${mdCell(a.type)})`, ...bits, ''] : []
  })
  return [
    `# duo run receipt: ${mdCell(r.title)}`,
    '',
    `${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')} UTC · ${r.agents.length} agent${r.agents.length === 1 ? '' : 's'}${r.used ? ` ·${r.used}` : ''}`,
    '',
    '| Agent | Model · effort | Status | Steps | Tokens | Cost (est.) | Time |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    ...detail,
    '_Built by duo-progress from what the agents did. Cost is an API-price estimate, not your bill._',
  ].join('\n')
}

async function currentReceipt($: EngineInterface): Promise<Receipt | null> {
  const f = await read($, flow)
  const list = await read($, agents)
  const mine = f?.isImplicit ? list.filter(a => a.startedAt >= (f.since ?? 0)) : list
  if (!mine.length) return null
  const used = runSentence(runDelta(await read($, runBase), await currentLimits($))).replace(/\.$/, '')
  const key = f?.isImplicit ? `agents:${f.since ?? 0}` : `flow:${f?.title ?? ''}`
  return { key, at: await $.clock.now(), title: f?.title ?? 'Agents', used, agents: mine.slice(-50) }
}

// Keeps the last ten finished runs between sessions.
async function persistReceipt($: EngineInterface): Promise<void> {
  try {
    const r = await currentReceipt($)
    if (!r) return
    const old = (await $.store.get('receipts')) as Receipt[] | undefined
    // A run that went on after it finished (another agent, a later report) replaces its own entry.
    const rest = (Array.isArray(old) ? old : []).filter(x => !r.key || x.key !== r.key)
    await $.store.set('receipts', [r, ...rest].slice(0, 10))
  } catch {}
}

// The panel's own flow for agents started outside a duo flow, so the bar above the prompt follows
// them: it counts the agents spawned since it began, and finishes when none runs.
async function syncImplicit($: EngineInterface): Promise<void> {
  const f = await read($, flow)
  if (!f?.isImplicit) return
  const mine = (await read($, agents)).filter(a => a.startedAt >= (f.since ?? 0))
  const running = mine.filter(a => a.status === 'running').length
  const total = mine.length
  const isFinished = running === 0 && total > 0
  const justFinished = isFinished && !f.isFinished
  await update($, flow, p => (p?.isImplicit ? { ...p, total, done: total - running, running, isFinished, phase: isFinished ? 'close' : 'delegate' } : p))
  if (justFinished) await persistReceipt($)
  try {
    $.ui.invalidate('ui.render')
  } catch {}
}

// No duo flow is running and an agent started anyway: the bar follows these agents too, from `before`.
async function ensureImplicit($: EngineInterface, at: number): Promise<void> {
  const prev = await read($, flow)
  // A duo flow in progress, or an implicit one still running, is left as it is.
  if (prev && !prev.isFinished) return
  // An agent that follows within a few minutes of the last one is the same job: the window reopens.
  if (prev?.isImplicit) {
    const mine = (await read($, agents)).filter(a => a.startedAt >= (prev.since ?? 0))
    const lastEnd = Math.max(0, ...mine.map(a => a.endedAt ?? 0))
    if (at - lastEnd < SAME_JOB_MS) {
      await update($, flow, p => (p?.isImplicit ? { ...p, isFinished: false, phase: 'delegate' } : p))
      return
    }
  }
  const base = baseOf(await currentLimits($))
  await update($, runBase, () => base)
  await update($, flow, () => ({ ...blank(), title: 'Agents', phase: 'delegate', isImplicit: true, since: at }))
}

export const register: Register = (on, options) => {
  on('session.measure', async ($, e, next) => {
    await update($, limits, () => e.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })))
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      const u = await $.session.usage()
      await update($, limits, () => u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })))
    } catch {}
    lang = await detectLang($, options.language)
    await $.tool.register({
      name: 'progress',
      description:
        'Report /duo-flow progress to the progress bar above the prompt and the agents panel. ' +
        'Call it after presenting the plan (title, total, tasks, phase "delegate"), each time a task is accepted (done), ' +
        'when switching phase or re-planning (tasks), and once at the end with finished: true. Fields left out keep their previous value. ' +
        'For the main session only: a call from a subagent is ignored (workers report with `step`).',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name of the overall task, a few words.' },
          total: { type: 'integer', minimum: 0, description: 'Number of planned worker tasks.' },
          done: { type: 'integer', minimum: 0, description: 'Number of tasks accepted after review.' },
          phase: { type: 'string', enum: [...PHASES] },
          finished: { type: 'boolean', description: 'True once the flow is closed.' },
          tasks: {
            type: 'array',
            description:
              'The planned worker tasks in order, numbered from 1. Each title must equal the Agent tool `description` the task will be delegated with, so the panel can match runs to tasks.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'A few words; reused verbatim as the Agent description.' },
                tier: { type: 'string', enum: [...TIERS] },
                after: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the tasks this one waits for.' },
                why: { type: 'string', description: 'One short sentence: why this tier fits the task (shown to the user as your reason).' },
              },
              required: ['title', 'tier'],
            },
          },
        },
      },
    })
    await $.tool.register({
      name: 'step',
      description:
        'For duo-flow workers: report progress on your own task to the agents panel. ' +
        'Right after reading the brief, call it with `total` (your plan in 3-8 steps), `plan` (their titles) and `done: 0`; ' +
        'call it again as each step finishes. Cheap and silent: it only draws a bar.',
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
          total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
          note: { type: 'string', description: 'The step in progress, a few words.' },
          plan: { type: 'array', items: { type: 'string' }, description: 'Optional, on the first call: the titles of your planned steps, a few words each.' },
        },
        required: ['done'],
      },
      // In every agent's tool list, not behind ToolSearch: workers do not go looking for it.
      isDeferred: false,
    })
    await $.tool.register({
      name: 'usage',
      description:
        'The subscription usage right now: JSON with `five_hour` and `seven_day`, each `used_percentage` (0-100) and `resets_at` ' +
        '(epoch seconds), or a sentence saying there is no reading. For the duo orchestrator: call before choosing tiers and before each dispatch.',
      inputSchema: { type: 'object', properties: {} },
    })
    await $.tool.register({
      name: 'receipt',
      description:
        'A markdown receipt of the current or last run: each agent with its model, effort, status, steps, tokens, estimated cost, time, ' +
        'the orchestrator\'s reason for its tier, the checker\'s PASS or FAIL, a start of its answer and the files it edited, plus how much of the usage window the run took. ' +
        'Built by the panel from what the agents did. Show it to the user as is.',
      inputSchema: { type: 'object', properties: {} },
    })
    await $.command.register({
      name: 'agents-info',
      description: 'Show or hide the panel of subagents: running, finished and planned, with model, context, cost and time',
    })

    // Ticks the running agents' clocks; quiet when nothing runs.
    $.clock.every(1000, () => {
      void (async () => {
        const list = await read($, agents)
        if (!list.some(a => a.status === 'running')) return
        const at = await $.clock.now()
        await update($, now, () => at)
      })()
    })
    return started
  })

  on('command.run', { command: 'agents-info' }, async ($, e) => {
    // `/agents-info open` opens the panel, or brings it forward from behind another tab, without toggling it.
    if ((e.args ?? '').trim() === 'open') {
      const at = await $.clock.now()
      await update($, now, () => at)
      await $.ui.open({ id: PANE, title: tr().pane })
      return { text: tr().opened }
    }
    const isOpen = await togglePane($)
    return { text: isOpen ? tr().opened : tr().closed }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // The flow is the main session's: a call from a worker's loop carries its agentId
    // and changes nothing, or any subagent could rename, finish or reset the flow.
    if (e.agentId) return { result: 'ignored: only the main session reports the flow' }
    const input = e as unknown as ProgressInput
    const prev = await read($, flow)
    if (isNewFlow(prev, input) && input.title !== undefined) {
      // A new flow starts with a clean list; agents still running stay.
      await update($, agents, list => list.filter(a => a.status === 'running'))
      const base = baseOf(await currentLimits($))
      await update($, runBase, () => base)
    }
    const next = await update($, flow, p => merge(p, input))
    // The band above the prompt read `flow` while it was empty and drew nothing; ask for a redraw so it
    // appears with the plan, not after the next message.
    try {
      $.ui.invalidate('ui.render')
    } catch {}
    if (next && input.tasks?.length) await autoOpen($, next.title)
    if (next?.isFinished && !prev?.isFinished) await persistReceipt($)
    const note = next?.isFinished && !prev?.isFinished ? runSentence(runDelta(await read($, runBase), await currentLimits($))) : ''
    return { result: `ok: ${label(next ?? blank())}${note}` }
  })

  // A worker's own progress: the call runs in the worker's loop, so agentId names it.
  on('tool.call', { tool: USAGE_TOOL }, async $ => ({ result: usageReport(await currentLimits($)) }))

  on('tool.call', { tool: RECEIPT_TOOL }, async $ => {
    const live = await currentReceipt($)
    if (live) return { result: receiptMarkdown(live) }
    const old = (await $.store.get('receipts').catch(() => undefined)) as Receipt[] | undefined
    return { result: Array.isArray(old) && old[0] ? receiptMarkdown(old[0]) : 'No run to report yet.' }
  })

  // A sign of life and a one-line status from every tool call a subagent makes; edited files are kept for the receipt.
  on('tool.call', async ($, e, next) => {
    try {
      const agentId = (e as { agentId?: string }).agentId
      if (agentId) {
        const input = e as unknown as Record<string, unknown>
        const tool = String(input.tool ?? '')
        const at = await $.clock.now()
        const path = EDIT_TOOLS.has(tool) && typeof input.file_path === 'string' ? (input.file_path as string) : ''
        await update($, agents, list =>
          list.map(a =>
            a.agentId !== agentId
              ? a
              : {
                  ...a,
                  lastAt: at,
                  busy: true,
                  action: describeAction(tool, input),
                  files: path && !(a.files ?? []).includes(path) ? [...(a.files ?? []), path].slice(0, MAX_FILES) : a.files,
                },
          ),
        )
      }
    } catch {}
    try {
      return await next(e)
    } finally {
      // The call is over: the clock for "no sign of life" starts again from now.
      const agentId = (e as { agentId?: string }).agentId
      if (agentId) {
        try {
          const done = await $.clock.now()
          await update($, agents, list => list.map(a => (a.agentId === agentId ? { ...a, busy: false, lastAt: done } : a)))
        } catch {}
      }
    }
  })

  on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
    const input = e as unknown as { done?: number; total?: number; note?: string; plan?: unknown }
    const agentId = e.agentId
    if (!agentId) return { result: 'ignored: only subagents report steps' }
    const at = await $.clock.now()
    let matched = false
    await update($, agents, list =>
      list.map(a => {
        if (a.agentId !== agentId) return a
        matched = true
        const total = Math.max(0, Math.round(input.total ?? a.stepTotal ?? 0))
        const done = Math.max(0, Math.round(input.done ?? a.stepDone ?? 0))
        const plan = cleanPlan(input.plan)
        const stepDone = total ? Math.min(total, done) : done
        const note = typeof input.note === 'string' && input.note.trim() ? clip(input.note.trim(), MAX_NOTE) : ''
        const stepLog = [...(a.stepLog ?? []), { n: stepDone, note, at }].slice(-MAX_STEPLOG)
        return { ...a, lastAt: at, stepTotal: plan && !input.total && !a.stepTotal ? plan.length : total, stepDone, stepNote: note || undefined, stepPlan: plan ?? a.stepPlan, stepLog }
      }),
    )
    return { result: matched ? 'ok' : `ignored: no panel row for agent ${agentId}` }
  })

  // Safety net: worker launches move the faint layer even if the orchestrator forgets to report.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const type = String(e.subagent_type ?? '')
    if (!isPipelineAgent(type)) return next(e)

    await update($, flow, prev => {
      const base = prev && !prev.isFinished ? { ...blank(), ...prev } : blank()
      return { ...base, running: base.running + 1, phase: base.phase === 'plan' ? 'delegate' : base.phase }
    })
    try {
      return await next(e)
    } finally {
      await update($, flow, prev => (prev ? { ...prev, running: Math.max(0, prev.running - 1) } : prev))
    }
  })

  on('agent.spawn', async ($, e, next) => {
    // The read-only agents (advisor, reviewer, verifier) have a restricted tool list without `step`.
    const isGate = /^(?:[^:]*:)?duo-(?:advisor|reviewer|verifier)$/.test(e.subagentType)
    const isUnbriefed = isPipelineAgent(e.subagentType) && !isGate && !e.prompt.includes(STEP_TOOL)
    const started = await next(isUnbriefed ? { ...e, prompt: e.prompt + STEP_BRIEF } : e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    const planned = (await read($, flow))?.tasks.find(t => norm(t.title) === norm(e.description) && e.description)
    await update($, agents, list => {
      const round = 1 + list.filter(a => norm(a.description) === norm(e.description) && e.description).length
      const run: AgentRun = {
        id: started.agentId ?? e.tool_use_id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        round,
        lastAt: at,
        ...(planned?.why ? { why: planned.why } : {}),
      }
      return [...list.filter(a => a.id !== run.id), run].slice(-200)
    })
    await update($, now, () => at)
    if (!isPipelineAgent(e.subagentType)) await ensureImplicit($, at)
    await syncImplicit($)
    if (isPipelineAgent(e.subagentType)) {
      const f = await read($, flow)
      await autoOpen($, f && !f.isFinished ? f.title : 'duo-flow')
    } else if (options.autoOpen === 'any') {
      await autoOpen($, 'any-agent')
    }
    return started
  })

  // Each model request of a subagent: live context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const usage = result.usage
    if (!agentId || !usage) return result

    const model = usage.model || e.model
    const stepAt = await $.clock.now().catch(() => 0)
    await update($, agents, list =>
      list.map((a): AgentRun =>
        a.agentId !== agentId
          ? a
          : {
              ...a,
              lastAt: stepAt || a.lastAt,
              model,
              effort: typeof e.effort === 'string' ? e.effort : a.effort,
              status: 'running',
              endedAt: undefined,
              contextTokens:
                (usage.input_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0) +
                (usage.output_tokens || 0),
              contextMax: windowOf(model),
              tokens:
                a.tokens +
                (usage.input_tokens || 0) +
                (usage.output_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0),
              costUsd: a.costUsd + costOf(model, usage, true),
              steps: a.steps + 1,
            },
      ),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map((a): AgentRun => {
          if (a.agentId !== agentId) return a
          // A run whose steps went unseen still gets the turn's own sum.
          const fallback = a.steps === 0 && e.usage
          return {
            ...a,
            status: e.reason === 'answer' ? 'done' : 'failed',
            endedAt: at,
            lastAt: at,
            ...(typeof e.answer === 'string' && e.answer.trim() ? { result: clip(e.answer.trim().replace(/\s+/g, ' '), MAX_RESULT) } : {}),
            ...(verdictOf(e.answer) ? { verdict: verdictOf(e.answer) } : {}),
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || a.model,
                  tokens:
                    e.usage.input_tokens +
                    e.usage.output_tokens +
                    e.usage.cache_read_input_tokens +
                    e.usage.cache_creation_input_tokens,
                  costUsd: costOf(e.usage.model || a.model, e.usage, false),
                }
              : {}),
          }
        }),
      )
      await update($, now, () => at)
      await syncImplicit($)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const f = await read($, flow)
    const p: Panel = await read($, panel)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)

    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()
    const planned = plannedOf(f, list)
    const t = totals(list, at)
    const lim = await freshLimits($)
    // The pane's title says "Agents"; inside, only the flow's own name.
    const title = f && !f.isFinished ? f.title : ''

    const toggleCompact = (
      <Button
        key="compact"
        label={p.isCompact ? s.expand : s.collapse}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isCompact: !prev.isCompact }))}
      />
    )
    // The grouped view has its own switch, closed by default: its point is to avoid the long list.
    const isGroupedView = isGrouped(list.length)
    const finClosed = isGroupedView ? !p.isFinishedOpen : p.isDoneCollapsed
    const toggleDone = (
      <Button
        key="done"
        label={`${finClosed ? (isRtl() ? '◂' : '▸') : '▾'} ${s.finished} · ${finished.length}`}
        plain
        onPress={() => update($, panel, prev => (isGroupedView ? { ...prev, isFinishedOpen: !prev.isFinishedOpen } : { ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
      />
    )
    const toggleRow = (a: AgentRun) => (
      <Button
        key={`open-${a.id}`}
        label={`${isOpen(p, a) ? '▾' : (isRtl() ? '◂' : '▸')} ${s.details} · ${runModel(a)}`}
        plain
        onPress={() =>
          update($, panel, prev => {
            const ids = openOf(prev)
            return { ...prev, openIds: (ids.includes(a.id) ? ids.filter(x => x !== a.id) : [...ids, a.id]).slice(-MAX_OPEN) }
          })
        }
      />
    )
    const detailsBlock = (a: AgentRun) =>
      isOpen(p, a) ? (
        <Box key={`det-${a.id}`} flexDirection="column" paddingLeft={isRtl() ? 0 : 2} paddingRight={isRtl() ? 2 : 0} alignItems={isRtl() ? 'flex-end' : undefined}>
          {detailLines(a, at).map((l, i) => (
            <Text key={i} dimColor={i > 0} bold={i === 0} color={i === 0 ? colorOf(tierOf(a.type)) : undefined}>
              {l}
            </Text>
          ))}
        </Box>
      ) : null
    const isEmpty = list.length === 0 && planned.length === 0
    const summary = `≈${fmtCost(t.cost)}, ${fmtTokens(t.tokens)} ${s.tokensWord}, ${fmtTime(t.time)}`

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))
      const section = (key: string, text: string) => (
        <Text key={key} dimColor>
          {text}
        </Text>
      )

      // In Hebrew the column hugs the right edge: section heads and buttons right-aligned.
      const align = isRtl() ? 'flex-end' : undefined
      if (p.isCompact) {
        return (
          <Box flexDirection="column" gap={1} alignItems={align}>
            <Svg source={compactSvg(W, list, planned, t)} alt={`${list.length} ${s.agentsCount}, ${summary}`} width={W} height={32} />
            {toggleCompact}
          </Box>
        )
      }
      if (isGrouped(list.length)) {
        const g = groupedSvg(W, list, at, title || s.pane, planned)
        const fin = finClosed || finished.length === 0 ? null : finishedCached(W, finished, at)
        const more = finished.length - finishedRows(finished).length
        const gridH = g.height + 2 * LINE_H + (finished.length > 0 ? 22 : 0) + (fin ? fin.height : 0) + (fin && more > 0 ? LINE_H : 0)
        return (
          <Box flexDirection="column">
            {gridTiles(gridH).map((tileH, i) => (
              <Svg key={`grid-${i}`} source={gridSvg(W, tileH)} alt="dotted grid" width={W} height={tileH} />
            ))}
            <Box flexDirection="column" position="absolute" top={0} left={0} right={0} alignItems={align}>
              <Svg source={g.source} alt={`${title || s.pane}: ${summary}`} width={W} height={g.height} />
              {finished.length > 0 && toggleDone}
              {fin && <Svg source={fin.source} alt={`${s.finished} · ${finished.length}`} width={W} height={fin.height} />}
              {fin && more > 0 && <Text dimColor>+{more}</Text>}
              {finished.length > 0 && <Svg source={footerSvg(W, finished)} alt={s.finished} width={W} height={22} />}
              {toggleCompact}
            </Box>
          </Box>
        )
      }
      const shownDone = p.isDoneCollapsed ? 0 : finished.length
      const lines = 1 + (isEmpty ? 1 : 0) + (running.length > 0 ? 1 : 0) + (finished.length > 0 ? 1 : 0) + (planned.length > 0 ? 1 : 0)
      const gridH = headerHeight(title) + lines * LINE_H + (running.length + shownDone) * (66 + LINE_H) + planned.length * 46 +
        [...running, ...(p.isDoneCollapsed ? [] : finished)].filter(a => isOpen(p, a)).reduce((n, a) => n + detailLineCount(a, at, (e.props.bodyColumns || 40) - 4) * LINE_H, 0)
      return (
        <Box flexDirection="column">
          {/* The grid sizes the pane; the content is placed over it, as an
              absolute Box paints over the siblings before it. */}
          {gridTiles(gridH).map((tileH, i) => (
            <Svg key={`grid-${i}`} source={gridSvg(W, tileH)} alt="dotted grid" width={W} height={tileH} />
          ))}
          <Box flexDirection="column" position="absolute" top={0} left={0} right={0} alignItems={align}>
            <Svg source={headerSvg(W, title, t, lim)} alt={title ? `${title}: ${summary}` : summary} width={W} height={headerHeight(title)} />
            {toggleCompact}
            {isEmpty && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && section('h-run', `${s.running} · ${running.length}`)}
            {running.map(a => (
              <Box key={a.id} flexDirection="column" alignItems={align}>
                <Svg source={agentSvg(W, a, at)} alt={`${a.description}: ${modelName(a.model)}, ${s.isRunning}`} width={W} height={66} />
                {toggleRow(a)}
                {detailsBlock(a)}
              </Box>
            ))}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed &&
              finished.map(a => (
                <Box key={a.id} flexDirection="column" alignItems={align}>
                  <Svg source={agentSvg(W, a, at)} alt={`${a.description}: ${modelName(a.model)}, ${s.isFinished}`} width={W} height={66} />
                  {toggleRow(a)}
                  {detailsBlock(a)}
                </Box>
              ))}
            {planned.length > 0 && section('h-plan', `${s.planned} · ${planned.length}`)}
            {planned.map(pl => (
              <Svg key={`plan-${pl.n}`} source={plannedSvg(W, pl)} alt={`${pl.n}. ${pl.title}: ${s.isPlanned}`} width={W} height={46} />
            ))}
          </Box>
        </Box>
      )
    }

    // Terminal: the same content in text rows.
    const cols = Math.max(24, e.props.bodyColumns || 40)
    const barW = Math.max(6, Math.min(20, cols - 34))
    const row = (a: AgentRun) => {
      const tier = tierOf(a.type)
      const color = colorOf(tier)
      const ctx = ctxOf(a)
      const progress = progressOf(a)
      const model = runModel(a)
      const steps = a.stepTotal ? `${stepsDone(a)}/${a.stepTotal}${a.stepNote ? ' ' + a.stepNote : ''} · ` : ''
      return (
        <Box key={a.id} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={color}>▣</Text>
            <Text bold wrap="truncate-end">
              {a.description || a.type}
            </Text>
            <Text color={a.status === 'failed' ? 'red' : a.status === 'done' ? 'green' : color}>{STATUS_GLYPH[a.status]}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {tier === 'other' ? a.type : tierWord(tier)} · {model}
            {a.round > 1 ? ` · ${s.round} ${a.round}` : ''}
          </Text>
          <Text wrap="truncate-end">
            {'  '}
            {progress === null ? <Text dimColor>{ctxBar(ctx, barW)}</Text> : <Text color={color}>{ctxBar(progress * 100, barW)}</Text>}
            <Text dimColor>
              {' '}
              {steps}{s.ctx} {ctx}% · {fmtTokens(a.contextTokens)} ≈{fmtCost(a.costUsd)} {fmtTime(elapsed(a, at))}
            </Text>
          </Text>
          {toggleRow(a)}
          {detailsBlock(a)}
        </Box>
      )
    }

    // Grouped terminal view: one text line per stage; every line is cut to the columns.
    const groupedTerminal = () => {
      const tl = tally(list)
      const mix = modelMix(list)
      const cut = (text: string) => fitCols(text, cols)
      const stages = groupAgents(list)
      const nameW = Math.min(14, Math.max(...stages.map(g => wideLen(g.key === 'other' ? tierWord('other') : g.key))))
      const running = list.filter(a => a.status === 'running').sort((a, b) => b.startedAt - a.startedAt)
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text wrap="truncate-end">
            {cut(`${tl.running} ${s.isRunning} · ${tl.done} ${s.doneN}${tl.failed ? ` · ${tl.failed} ${s.failedN}` : ''} · ${tl.total} ${s.startedSoFar}, ${tl.finished} ${s.nFinished}`)}
          </Text>
          {attentionOf(list, at).slice(0, MAX_ATTENTION).map(a => (
            <Text key={`att-${a.id}`} color={a.status === 'failed' ? '#E5484D' : '#D4A24C'} wrap="truncate-end">
              {cut(`${a.status === 'failed' ? '✗' : '⏸'} ${a.description || a.type} · ${a.status === 'failed' ? s.failed : `${s.stalled} ${fmtTime(at - (a.lastAt ?? a.startedAt))}`}${a.action ? ` · ${a.action}` : ''}`)}
            </Text>
          ))}
          <Text dimColor wrap="truncate-end">
            {cut(mix.rows.map(r => `${clip(r.name, MODEL_NAME_MAX)} ${r.agents} · ${fmtTokens(r.tokens)}`).join('  ') + (mix.isMixed && mix.top ? `  ${mix.top.pct}% ${s.shareOn} ${clip(mix.top.name.split(' ')[0] ?? '', 14)}` : ''))}
          </Text>
          {stages.map(g => {
            const name = g.key === 'other' ? tierWord('other') : g.key
            const counts = countsText(g)
            const glyph = g.running ? '●' : g.failed ? '✗' : '✓'
            const used = 2 + nameW + 1 + 1 + wideLen(counts)
            const bw = Math.max(0, Math.min(16, cols - used - 1))
            const filled = Math.round((bw * (g.done + g.failed)) / g.agents.length)
            const bar = bw >= 4 ? `${'█'.repeat(filled)}${'░'.repeat(bw - filled)} ` : ''
            return (
              <Text key={g.key} dimColor={!g.running} wrap="truncate-end">
                {cut(`${glyph} ${padCols(fitCols(name, nameW), nameW)} ${bar}${counts}`)}
              </Text>
            )
          })}
          {running.slice(0, 4).map(a => (
            <Text key={a.id} wrap="truncate-end">
              {cut(`● ${a.description || a.type}  ${fmtTokens(a.tokens)} · ${fmtTime(elapsed(a, at))}`)}
            </Text>
          ))}
          {running.length > 4 && <Text dimColor>{cut(`+${running.length - 4} ${s.moreRunning}`)}</Text>}
          {finished.length > 0 && toggleDone}
          {!finClosed &&
            finishedRows(finished).map(a => (
              <Text key={a.id} dimColor wrap="truncate-end">
                {cut(`${a.status === 'failed' ? '✗' : '✓'} ${a.description || a.type}  ${modelName(a.model)} · ${fmtTokens(a.tokens)} · ${fmtTime(elapsed(a, at))}`)}
              </Text>
            ))}
          {!finClosed && finished.length > finishedRows(finished).length && <Text dimColor>+{finished.length - finishedRows(finished).length}</Text>}
          {planned.length > 0 && <Text dimColor>{cut(`◷ ${s.planned} · ${planned.length}`)}</Text>}
          {finished.length > 0 && (
            <Text dimColor wrap="truncate-end">
              {cut(`${fmtTokens(finished.reduce((n, a) => n + a.tokens, 0))} ${s.tokensWord} · ≈${fmtCost(finished.reduce((n, a) => n + a.costUsd, 0))} ${s.apiEq}`)}
            </Text>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate-end">
            {title}
          </Text>
          {toggleCompact}
        </Box>
        <Text dimColor>
          ≈{fmtCost(t.cost)} · {fmtTokens(t.tokens)} {s.tokensWord} · {fmtTime(t.time)}
        </Text>
        {p.isCompact ? (
          <Text wrap="truncate-end">
            {[...running, ...finished].map(a => (
              <Text key={a.id} color={colorOf(tierOf(a.type))}>
                {STATUS_GLYPH[a.status]}{' '}
              </Text>
            ))}
            {planned.map(pl => (
              <Text key={`plan-${pl.n}`} dimColor>
                ◷{' '}
              </Text>
            ))}
          </Text>
        ) : (
          isGrouped(list.length) ? groupedTerminal() : (
          <Box flexDirection="column" marginTop={1}>
            {isEmpty && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && <Text dimColor>{s.running} · {running.length}</Text>}
            {running.map(row)}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed && finished.map(row)}
            {planned.length > 0 && <Text dimColor>{s.planned} · {planned.length}</Text>}
            {planned.map(pl => {
              const tier = pl.tier in TIER_COLOR ? pl.tier : 'other'
              return (
                <Box key={`plan-${pl.n}`} flexDirection="column" marginBottom={1}>
                  <Text dimColor wrap="truncate-end">
                    <Text color={colorOf(tier)}>▢</Text> {pl.n}. {pl.title} ◷
                  </Text>
                  <Text dimColor wrap="truncate-end">
                    {'  '}
                    {tierWord(tier)} · {tierModel(tier)}
                    {pl.after.length ? ` · ${s.after} ${pl.after.join(', ')}` : ''}
                  </Text>
                </Box>
              )
            })}
          </Box>
          )
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, flow)
    if (f === null || e.props.hasSurvey) return next(e)
    // Draw this row with the other mods' bands beneath it. Claude Code's own placeholder ({ type: 'engine' }) is
    // never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const crew = list.length + plannedOf(f, list).length
    const isWorking = list.some(a => a.status === 'running')
    const crewLabel = `${crew} ${agentsWord(crew)}`
    const crewButton = <Button key="duo-agents" label={crewLabel} plain onPress={() => void togglePane($)} />
    const percent = `${Math.round(ratio(f) * 100)}%`
    const usage = usageShort(await freshLimits($), f.isFinished ? await read($, runBase) : null)
    const needs = attentionOf(list, await read($, now))
    const alert = needs.length ? `⚠ ${needs.length}` : ''
    const dismiss = (
      <Button
        key="savvy-dismiss"
        label="✕"
        plain
        role="dismiss"
        onPress={() => update($, flow, () => null)}
      />
    )

    // The terminal's element table is completed with an `Svg` that draws nothing: test the surface too.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      // About 8 CSS px per reported column; the rest is the count, the dismiss
      // and their gaps. No floor above the slot: a row wider than it would wrap.
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 96 - Math.max(0, Math.round(textWidth(crewLabel, 12)) - 20)))
      return (
        <Box flexDirection="column">
          <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" gap={1}>
            <Svg source={rowSvg(f, width, isWorking, usage, alert)} alt={`${f.title}: ${label(f)}, ${percent}`} width={width} height={H} />
            {crewButton}
            {dismiss}
          </Box>
          {below}
        </Box>
      )
    }

    const cols = e.props.bodyColumns
    const titleW = Math.max(8, Math.min(30, f.title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 32))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Box width={titleW} flexShrink={0}>
            <Text color={f.isFinished ? DONE : ACCENT}>● </Text>
            <Text wrap="truncate-end">{f.title}</Text>
          </Box>
          <Text color={f.isFinished ? DONE : ACCENT}>{barText(f, width)}</Text>
          <Text bold>{label(f)}</Text>
          <Text dimColor>{percent}</Text>
          <Text color={CLAY}>▣</Text>
          {crewButton}
          {dismiss}
        </Box>
        {below}
      </Box>
    )
  })
}
