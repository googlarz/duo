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

## The plan and the work, as a picture

The panel is a picture, not a list. On top: the job's name, your limit ("5h 27% · ↻ 1h 54m"), a line with how far it is ("3/6 done · 2 running · 1:42", and what this run took of your window once it ends) and a segmented bar (done, running, failed). Under it, one **card** per task, with its crab: green border and tick when done, amber with a pulsing dot while it runs (and what it is doing: "editing cart.py"; when the worker reported a plan of up to ten steps, one dot per step, filled as they are done), dashed and dimmed while it waits, red when it broke (with the reason the agent gave, after "error ·"), amber and asleep when it has shown no sign of life for three minutes ("stalled 4m"). A bar at the bottom of each card fills with its progress. Each card also names the model that does the task, with a dot in the model's colour: the one that ran it ("Sonnet 5.5 · medium", as the host reported it), or for a task that has not started the one it is planned for ("Opus · high"). The effort shows as well, as the word in the name and as one to five rising bars (low to max) in the model's colour, with the word on hover. A started task shows its effort once the host has reported it, a few seconds in. In a plan of more than 24 cards only the dot is drawn. A title that does not fit takes two lines, and then every card is taller, so they keep one size. When Claude gave a plan, the cards sit in layers, a task one layer below everything it waits for, with **arrows** between them (green once the task they come from is done), so you see the dependencies and where the work is. Without a plan (agents Claude started on its own) the cards wrap into a grid. A card keeps its place while its colour changes, and the picture stays the same when the job ends (the plan and the job's name are kept), so nothing jumps. The bar above the prompt shows the job's name, "Tasks 3/10" and a bar that fills with the agents that really finished, with a second colour for the ones running now (it follows the agents, not only what the orchestrator reported), your usage, and a count of what broke or went quiet (⚠ 2).

Costume crabs are up to 9 KB of drawing each and the engine refuses a drawing past 128 KB, so from eleven cards on the crabs are plain, and a plan of more than forty cards shows the ones not done yet and counts the rest ("+160 agents"). There are no switches on the desktop; `/duo:receipt` prints everything (answers, files, steps, tokens) as markdown. The terminal still switches between per-agent rows and per-stage lines, with a margin so it does not flip back and forth.

## Costumes

Every card has a crab. Its costume follows the label prefix before the first colon in the agent's description (`truth:A12` is `truth`), or else the first word of the title that names one ("Map internal links" wears the explorer, "Prepare SEO fix list" the doctor); advisor, reviewer, verifier and Opus workers keep their own. Each card's crab also has its own body colour (orange, blue, teal, violet, rose, gold, then round again), so two cards in the same costume still tell apart. The costumes: wizard (plan, advisor), monocle (review, reviewer), detective (truth, verify, check, test), judge (value, judge, rank), hardhat (risk, security, audit), explorer (map, explore, scout), bulb (ideate, brainstorm, design), quill (synthesize, write, summary), rocket (deploy, release, ship, launch), robot (build, compile, generate), scientist (research, analyze, investigate, study), artist (ui, visual, style, render, css), ninja (perf, optimize, speed, bench), doctor (fix, debug, repair, patch, bug), librarian (docs, readme, document), viking (migrate, refactor, move), cleaner (lint, clean, prune, tidy, format), cyborg (guard, enforce, policy, compliance, protect, auth), thunder (lightning, storm, async, parallel), fireninja (hotfix, urgent, incident, burn), iceninja (freeze, cache, cold, archive, snapshot); other names get the plain crab. The same costumes now mark `duo-advisor` (wizard), `duo-reviewer` (monocle), `duo-verifier` (detective) and `duo-opus` (crown) in the detailed view.

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

## The job's name

The name above the agents is the one the orchestrator gives the job (a few words about your task or project). If it gives none, the panel and the bar show the name of the folder you work in, never a placeholder.
