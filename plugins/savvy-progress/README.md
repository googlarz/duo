# savvy-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Made for the [savvy-flow](../savvy-flow) skill, and useful with any subagents.

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something reports progress (savvy-flow does) or a `savvy-*` or `duo-*` worker starts.
- **Agents panel** (`/agents-info` toggles it; `/agents-info open` opens it or brings it forward without toggling): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. Working crabs walk, and each savvy tier animates its prop: the astronaut floats, the detective sweeps the magnifier, the engineer turns the wrench, the chef tosses the omelette, the racer runs with a fluttering flag. `prefers-reduced-motion` stops them.

## Tiers

Besides `fable`, `heavy`, `careful`, `medium` and `light`, the panel knows the [duo](../duo) agents (`duo-<x>`, also as `duo:duo-<x>`): `duo-low`, `duo-medium`, `duo-high`, `duo-xhigh`, `duo-max` (Sonnet), `duo-verifier` (Sonnet medium) and the Opus gate agents `duo-opus` (xhigh), `duo-advisor` and `duo-reviewer` (high). Planned tasks take the same names (`tier: "duo-high"`). They reuse the existing crabs (low/verifier light, medium medium, high/reviewer careful, xhigh/advisor heavy, max/opus fable) with their own colour; the Opus gate agents are pink, crimson and violet. Unknown agent types stay `other`.

## Details

Under each running or finished agent row a `▸ Details · <model>` button opens a block with the model (friendly name, effort and the id as reported), agent type, full description, status and round, context, tokens, cost, start/end/elapsed and the steps. With a `plan` the steps are its titles as a checklist (✓ done, ▸ in progress, ○ pending); without one, the notes the worker logged. Open rows are remembered in the panel state (`openIds`). Rendering was not checked visually.

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
