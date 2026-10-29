# savvy-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Made for the [savvy-flow](../savvy-flow) skill, and useful with any subagents.

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something reports progress (savvy-flow does) or a `savvy-*` or `duo-*` worker starts.
- **Agents panel** (`/agents-info` toggles it; `/agents-info open` opens it or brings it forward without toggling): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. Working crabs walk, and each savvy tier animates its prop: the astronaut floats, the detective sweeps the magnifier, the engineer turns the wrench, the chef tosses the omelette, the racer runs with a fluttering flag. `prefers-reduced-motion` stops them.

## Tiers

Besides `fable`, `heavy`, `careful`, `medium` and `light`, the panel knows the [duo](../duo) agents (`duo-<x>`, also as `duo:duo-<x>`): `duo-low`, `duo-medium`, `duo-high`, `duo-xhigh`, `duo-max` (Sonnet), `duo-verifier` (Sonnet medium) and the Opus gate agents `duo-opus` (xhigh), `duo-advisor` and `duo-reviewer` (high). Planned tasks take the same names (`tier: "duo-high"`). They reuse the existing crabs (low light, medium medium, high careful, xhigh heavy, max fable; advisor, reviewer, verifier and opus have their own, see below) tinted with the tier colour; advisor, reviewer, verifier and opus have their own costumes, which carry the costume's own tint instead (the tier colour still marks their text and bars). Unknown agent types stay `other`.

## Details

Under each running or finished agent row a `▸ Details · <model>` button opens a block with the model (friendly name, effort and the id as reported), agent type, full description, status and round, context, tokens, cost, start/end/elapsed and the steps. With a `plan` the steps are its titles as a checklist (✓ done, ▸ in progress, ○ pending); without one, the notes the worker logged. Open rows are remembered in the panel state (`openIds`). Rendering was not checked visually.

## Grouped view (big fan-outs)

With more than 8 agents (`GROUP_THRESHOLD` in `hooks/register.tsx`) the panel stops listing one row per agent and shows a summary instead: a header with running/done counts and a started/running/failed bar, the models in use with agent and token counts and each model's share of tokens, one row per **stage**, the four most recently started running agents, and a `▸ Finished · N` toggle with compact rows, token total and the API-equivalent cost. A stage is the label prefix before the first colon (`truth:A10` belongs to `truth`; a label without a usable prefix goes to `other`); stages are ordered by their first start. An active stage shows one square per agent (green done, amber running, red failed; at most 40, then `+N`); a finished stage collapses to one dim row. The terminal gets the same content as text lines. Planned flow tasks show as a dim `Planned · N` line. The run list keeps only the last 200 runs, so "started so far" counts at most 200. With 8 agents or fewer the detailed view is unchanged.

Every stage and running row has a crab whose costume follows the stage name: wizard (plan, advisor), monocle (review, reviewer), detective (truth, verify, check, test), judge (value, judge, rank), hardhat (risk, security, audit), explorer (map, explore, scout), bulb (ideate, brainstorm, design), quill (synthesize, write, summary), rocket (deploy, release, ship, launch), robot (build, compile, generate), scientist (research, analyze, investigate, study), artist (ui, visual, style, render, css), ninja (perf, optimize, speed, bench), doctor (fix, debug, repair, patch, bug), librarian (docs, readme, document), viking (migrate, refactor, move), cleaner (lint, clean, prune, tidy, format); other names get the plain crab. The same costumes now mark `duo-advisor` (wizard), `duo-reviewer` (monocle), `duo-verifier` (detective) and `duo-opus` (crown) in the detailed view.

## Tools it adds

- `mcp__savvy-progress__progress`: the orchestrator reports the plan, phase and accepted tasks. Only the main session can: a call from a subagent is ignored, so a worker cannot rename, finish or reset the flow.
- `mcp__savvy-progress__step`: a worker reports its own steps (`done`, `total`, `note`, and on the first call an optional `plan`: the step titles). Every call is logged on the run (last 40 calls; plan capped at 30 titles). A worker that does not report shows its context fill in grey instead. The tool is listed up front rather than behind ToolSearch, and each `savvy-*` and `duo-*` worker (plugin-prefixed or not) gets one line at the end of its brief asking for these reports, except `duo-advisor`, `duo-reviewer` and `duo-verifier`.

Cost is a rough estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`, list prices as of 2026-10-10), not a bill. Cache writes are priced at the 1-hour rate, which is what Claude Code writes on a subscription; a session that writes 5-minute entries is overestimated there.

## Settings

`language`: `auto` (default), `en`, `ru` or `he`. Hebrew draws the bar and the panel right to left. `auto` follows Claude Code's `language` setting, then the system locale, and falls back to English. Set it in `/config`, or, for a mod loaded by hand, in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "savvy-progress": { "options": { "language": "ru" } } } }
```

`autoOpen`: `savvy` (default) or `any`. With `savvy` the panel opens by itself when a `savvy-*` or `duo-*` worker starts or a plan is reported. With `any` it also opens, once per session, when any other subagent starts. `/agents-info` toggles it either way.

Install instructions are in the [repository README](../../README.md).
