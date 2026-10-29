<p align="center">
  <img src="assets/duo-hero.svg" alt="duo: see and steer the agents your AI spawns" width="100%">
</p>

<p align="center">
  <b>Visibility and control over the many AI agents Claude spawns for you.</b><br>
  Built for Claude Pro / Max, where every agent spends your usage limit.
</p>

---

## The problem

When you give Claude Code a big job, it doesn't work alone. It **creates agents on its own**: one to explore, several to build, one to test, one to review. You don't write them and you don't pick them. By default you also can't see them: which model each one runs on, what it is doing, how far along it is, what it costs.

On a subscription that's your usage limit draining in a place you can't look.

## What duo gives you

You still just describe the task. The AI still creates the agents. `duo` adds the two things that were missing:

| | |
| --- | --- |
| 👁 **Visibility** | A live panel with **every agent**: its task, the **model and effort** it runs on, its steps, progress, tokens, cost and time. Open any task to see its steps. |
| 🎛 **Control** | **You set the rules** the AI follows: which model runs each stage, how hard each task works, how much Opus is allowed, what needs your approval, and what happens when your limit runs low. |

### Control: the right model at every stage

<p align="center">
  <img src="assets/duo-stages.svg" alt="The seven duo stages and the model used at each: explore on Haiku or Sonnet, plan on your session model, plan check on Opus, build on Sonnet from low to max effort, verify on Sonnet, review on Opus, last resort on Opus" width="100%">
</p>

Sonnet does the volume. Opus is a gate (a plan check and a review), not a worker. Small jobs skip the Opus stages.

### Control: what happens to every task

<p align="center">
  <img src="assets/duo-task.svg" alt="Each task: brief, built by Sonnet, checked by a fresh checker, reviewed by Opus, accepted. Failures go back with a defect list, max two attempts, Opus as a worker only with your approval" width="100%">
</p>

The agents run in parallel where they can, but not without limits: **two attempts per task**, a fresh checker that did not write the code, and **Opus as a worker only if you say yes**. Design decisions (anything users see) stay with you; agents don't invent UI.

### Visibility: open any agent

<p align="center">
  <img src="assets/duo-panel.svg" alt="The agents panel: each task with the model it ran on, its step count, and an expandable list of steps" width="100%">
</p>

Every task row shows the model and effort that ran it. Press Details under a task to see the steps the agent planned and which are done. *(Illustration with example tasks.)*

## Try it

Install duo and the panel:

```
/plugin marketplace add googlarz/duo
/plugin install duo@duo
/plugin install savvy-progress@duo
```

Restart Claude Code, then give it a task:

```
/duo:duo add rate limiting to the upload endpoint and cover it with tests
```

duo plans, spawns the agents, runs them, and at the end tells you what changed, what was verified, what was left out, and which models did the work. If the panel doesn't appear, load it by hand: `claude --plugin-dir ~/duo/plugins/savvy-progress`.

> Shorter command: try plain `/duo <task>`. If your version doesn't accept it, copy the skill once:
> `git clone https://github.com/googlarz/duo.git ~/duo && cp -R ~/duo/plugins/duo/skills/duo ~/.claude/skills/`

## Control over your usage limit

- **Opus budget:** one plan check and up to two reviews per run. Opus as a worker only with your consent.
- **Effort ceiling:** tasks run at `high` at most; `xhigh` and `max` only after a failed attempt or when the cause is unclear.
- **Limit-aware** *(optional, 2 min setup)*: at 80% used, duo skips the plan check and early review and caps workers at `medium`. At 95% it stops starting new work and reports where it stands, so you can continue after the reset. Setup: **[usage-limits guide](plugins/duo/docs/usage-limits.md)** (Pro/Max only; the plan reports usage only there).
- **Your session model:** run duo from a Sonnet session. On Opus it reviews itself instead of calling a second Opus; on Haiku the plan check is mandatory.

## Questions

**Do I have to create or configure agents?** No. Claude creates them. duo ships ready-made roles (`duo-low` … `duo-max`, `duo-verifier`, `duo-advisor`, `duo-reviewer`, `duo-opus`), and the AI picks the right ones for each task.

**Will it burn my Opus limit?** That's what the rules prevent: one plan check and up to two reviews per run, none on small jobs.

**Is it worth it for a small fix?** No. Use plain Sonnet or the built-in `opusplan`. duo pays off on multi-step work with several agents.

**What if I hit my limit mid-run?** With the limit helper set up, duo stops before the wall and reports which tasks are done and which are waiting. Say "continue" after the reset.

**Does it change my files without asking?** The builder agents edit your project, as in any Claude Code run, and you see every change. The plan checker, reviewer and verifier have no Edit or Write tools (they keep a shell to run checks and are told not to change files).

**Which Claude Code version?** Recent. duo uses subagents with per-agent model and effort. Effort `low` to `max` is available on Sonnet 5.5; on older Sonnets an unsupported level falls back to the closest lower one.

<details>
<summary><b>Effort per task</b></summary>

| Effort | Used for |
| --- | --- |
| `low` | renames, boilerplate, config, small fixes |
| `medium` | standard features, bugs with a known cause |
| `high` | delicate work: refactors, many edge cases (default ceiling) |
| `xhigh` | unfamiliar code, unclear root cause (after a failure or when explicit) |
| `max` | very complex logic, or a bug that survived xhigh |

Agents behind the stages: Explore subagent, the orchestrator (your session), `duo-advisor` (plan check), `duo-low` … `duo-max` (build), `duo-verifier`, `duo-reviewer`, `duo-opus` (last resort). Full rules: [SKILL.md](plugins/duo/skills/duo/SKILL.md).

</details>

<details>
<summary><b>Honest status</b></summary>

Verified: all plugins pass `claude plugin validate`; the panel's tests pass; the helper scripts ran against sample input; the effort levels and agent settings duo relies on were checked against the Claude Code docs.

Not yet verified, because it needs a live session: the statusline helper in daily use, the rate-limit hook firing on a real limit, how the panel's details view looks on screen, and whether a bare `/duo` resolves on your version. The panel is built on Claude Code's early-access hooks and may change between releases. If something looks off, please open an issue with what you saw.

</details>

<details>
<summary><b>What's in this repo</b></summary>

| Plugin | What it is |
| --- | --- |
| [duo](plugins/duo) | The rules and the agents: model per stage, effort per task, Opus budget, limit awareness |
| [savvy-progress](plugins/savvy-progress) | The panel: every agent with its model, steps, cost; understands the duo tiers |
| [savvy-flow](plugins/savvy-flow) | The original flow by JohnnyVizz (tiered Opus/Fable workers), for API-style budgets |
| [session-band](plugins/session-band) | Band above the prompt: turn, speed, cost, cache countdown, context |

Develop: `claude plugin validate .` · `cd plugins/savvy-progress && claude plugin test .` · `plugins/duo/scripts/gen-agents.sh` (regenerates duo's six worker agents from one shared body).

</details>

---

## Credits

`duo` stands on the work of **[JohnnyVizz](https://github.com/JohnnyVizz)**. The savvy-flow orchestration pattern, the tiered-worker idea, the savvy-progress panel and session-band all come from [JohnnyVizz/claude-kit](https://github.com/JohnnyVizz/claude-kit). This repo started as a fork of it, keeps that code and its licence, and adapts the idea to subscription budgets. Thank you.

MIT licence, see [LICENSE](LICENSE). Original work © 2026 johnnyvizz; duo additions © 2026 googlarz.
