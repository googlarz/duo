# duo-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Made for the [duo-flow](../duo-flow) skill, and useful with any subagents.

> Formerly **savvy-progress** from [JohnnyVizz's claude-kit](https://github.com/JohnnyVizz/claude-kit), renamed and extended here (usage tile, grouped view, run receipt, needs-attention queue).

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something reports progress (duo-flow does) or a `duo-flow-*` or `duo-*` worker (or a legacy `savvy-*` one) starts.
- **Agents panel** (`/agents-info` toggles it; `/agents-info open` opens it or brings it forward without toggling): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. Working crabs walk, and each duo-flow tier animates its prop: the astronaut floats, the detective sweeps the magnifier, the engineer turns the wrench, the chef tosses the omelette, the racer runs with a fluttering flag. `prefers-reduced-motion` stops them.

## Tiers

Besides `fable`, `heavy`, `careful`, `medium` and `light`, the panel knows the [duo](../duo) agents (`duo-<x>`, also as `duo:duo-<x>`): `duo-low`, `duo-medium`, `duo-high`, `duo-xhigh`, `duo-max` (Sonnet), `duo-verifier` (Sonnet medium) and the Opus gate agents `duo-opus` (xhigh), `duo-advisor` and `duo-reviewer` (high). Planned tasks take the same names (`tier: "duo-high"`). They reuse the existing crabs (low light, medium medium, high careful, xhigh heavy, max fable; advisor, reviewer, verifier and opus have their own, see below) tinted with the tier colour; advisor, reviewer, verifier and opus have their own costumes, which carry the costume's own tint instead (the tier colour still marks their text and bars). Unknown agent types stay `other`.

## Details

Under each running or finished agent row a `▸ Details · <model>` button opens a block with the model (friendly name, effort and the id as reported), agent type, full description, status and round, context, tokens, cost, start/end/elapsed and the steps. With a `plan` the steps are its titles as a checklist (✓ done, ▸ in progress, ○ pending); without one, the notes the worker logged. Open rows are remembered in the panel state (`openIds`). Rendering was not checked visually.

## The current run

The panel and the bar show the job you are watching now, not the whole session. For agents Claude starts outside a duo flow, agents that follow each other within five minutes count as one job; when a later agent starts after a longer pause, a new job begins and the earlier agents leave the panel. They are not lost: `/duo:receipt` prints the receipt of the current or last job, and the panel keeps the last ten. So the header counts and the grouped view are about what you are watching now, not the whole session. There is no collapse button: the grouped view and the `Finished` toggle keep long lists short.

## Needs attention

An agent that fails, or that has shown no sign of life (a model request, a step report or a tool call) for three minutes, is marked in its row ("stalled 4m", the crab stops walking) and shown, first, in a **Needs attention** block at the top of the grouped view with its last action or result. The bar above the prompt adds a count (⚠ 2). Each agent's row also shows what its last tool call was doing ("editing cart.py", "running: python3") when it has not reported steps. Agents Claude starts outside a duo flow get a bar of their own ("Agents", counting them). Not yet seen in a real run (unit-tested only).

## One layout for every number of agents

On the desktop the panel has one layout whatever the count, so nothing reflows when more agents start: the usage, tokens and time tiles; a summary (title, counts and a progress bar, the model mix, and what needs attention); the agents at work as full rows (the six newest, the rest counted); the finished agents as compact rows; what is planned. From twelve agents on, a **Stages** block (one row per stage) is added under the summary, because that is when many agents share a few stages and a list is too long to read. A finished checker that said FAIL counts as needing attention, so a failed check is on top and marks its stage red, not green. The terminal still switches between per-agent rows and per-stage lines, with a margin so it does not flip back and forth.

## What happened, at a glance

Once agents have finished, each row of the Finished list shows who did it, on which model, how long and how many tokens, a green **PASS** or red **FAIL** badge when the agent was a checker, and the start of what it answered (muted, one line). A `Details` switch under every row opens the steps, the result, the files it edited and the reason for its tier. Above the list, one line says how many started and finished, how many PASS and FAIL, and what the run used of your 5-hour window ("this run: 1% 5h", "<1%" when it was under a point). `/duo:receipt` prints the same as markdown.

## Stages (big fan-outs)

From twelve agents the panel adds a block with one row per **stage**: its crab, its model, one square per agent (green done, amber running, red failed or FAIL; at most 40, then `+N`), and the counts ("4 done · 2 FAIL"). A stage is the label prefix before the first colon in the agent's description (`truth:A12` is in `truth`), otherwise `other`. A finished stage with no failure is dimmed.

Every stage and running row has a crab whose costume follows the stage name: wizard (plan, advisor), monocle (review, reviewer), detective (truth, verify, check, test), judge (value, judge, rank), hardhat (risk, security, audit), explorer (map, explore, scout), bulb (ideate, brainstorm, design), quill (synthesize, write, summary), rocket (deploy, release, ship, launch), robot (build, compile, generate), scientist (research, analyze, investigate, study), artist (ui, visual, style, render, css), ninja (perf, optimize, speed, bench), doctor (fix, debug, repair, patch, bug), librarian (docs, readme, document), viking (migrate, refactor, move), cleaner (lint, clean, prune, tidy, format), cyborg (guard, enforce, policy, compliance, protect, auth), thunder (lightning, storm, async, parallel), fireninja (hotfix, urgent, incident, burn), iceninja (freeze, cache, cold, archive, snapshot); other names get the plain crab. The same costumes now mark `duo-advisor` (wizard), `duo-reviewer` (monocle), `duo-verifier` (detective) and `duo-opus` (crown) in the detailed view.

## Tools it adds

- `mcp__duo-progress__progress`: the orchestrator reports the plan, phase and accepted tasks. Only the main session can: a call from a subagent is ignored, so a worker cannot rename, finish or reset the flow.
- `mcp__duo-progress__usage`: the subscription usage right now (`five_hour` and `seven_day`, percent used and reset time), read live from Claude Code.
- `mcp__duo-progress__receipt`: a markdown receipt of the current or last run (every agent with model, effort, status, steps, tokens, estimated cost, the orchestrator's reason for its tier, a PASS or FAIL verdict, the start of its answer and the files it edited), built by the panel, not by a model. The last ten finished runs are kept in the plugin's store between sessions. `/duo:receipt` (in the duo plugin) prints it.
- `mcp__duo-progress__step`: a worker reports its own steps (`done`, `total`, `note`, and on the first call an optional `plan`: the step titles). Every call is logged on the run (last 40 calls; plan capped at 30 titles). A worker that does not report shows its context fill in grey instead. The tool is listed up front rather than behind ToolSearch, and each `duo-flow-*` and `duo-*` worker (and legacy `savvy-*` ones) (plugin-prefixed or not) gets one line at the end of its brief asking for these reports, except `duo-advisor`, `duo-reviewer` and `duo-verifier`.

Cost is a rough estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`, list prices as of 2026-10-10), not a bill. Cache writes are priced at the 1-hour rate, which is what Claude Code writes on a subscription; a session that writes 5-minute entries is overestimated there.

## Settings

`language`: `auto` (default), `en`, `ru` or `he`. Hebrew draws the bar and the panel right to left. `auto` follows Claude Code's `language` setting, then the system locale, and falls back to English. Set it in `/config`, or, for a mod loaded by hand, in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "duo-progress": { "options": { "language": "ru" } } } }
```

`autoOpen`: `flow` (default) or `any`. With `flow` the panel opens by itself when a `duo-flow-*` or `duo-*` worker (or a legacy `savvy-*` one) starts or a plan is reported. With `any` it also opens, once per session, when any other subagent starts. `/agents-info` toggles it either way.

Install instructions are in the [repository README](../../README.md).
