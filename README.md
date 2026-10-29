<p align="center">
  <img src="assets/duo-hero.svg" alt="duo: Sonnet works. Opus checks." width="100%">
</p>

<p align="center">
  <b>A Claude Code plugin for people on a Claude subscription.</b><br>
  Give it a task. Sonnet does the work, Opus double-checks it, and your usage limit lasts longer.
</p>

---

## The problem

On a Pro or Max plan you don't pay per task, you spend a **usage limit**. Run everything on the biggest model and the limit disappears by lunch. Run everything on a smaller one and you ship mistakes.

## The idea

Do what a good team does: the **builder** does the hours of work, and the **inspector** looks at the plan and the result.

|  | Who | What they do |
| --- | --- | --- |
| 🔨 | **Sonnet** | Reads your code, writes the changes, runs the tests. Works harder on hard tasks, lighter on easy ones. |
| 🔍 | **Opus** | Criticises the plan before work starts and reviews the result at the end. Doesn't do the grunt work. |

You just describe the task. And the model isn't fixed: it changes at every stage of the job.

<p align="center">
  <img src="assets/duo-stages.svg" alt="The seven duo stages and the model used at each: explore on Haiku or Sonnet, plan on your session model, plan check on Opus, build on Sonnet from low to max effort, verify on Sonnet, review on Opus, last resort on Opus" width="100%">
</p>

Small jobs (two tasks, or a tiny change) skip the two Opus stages. The usage-limit helper can also trim stages when your limit runs low (see below). If you install the optional panel, you see each stage's model live, per task.

## Try it

```
/plugin marketplace add googlarz/duo
/plugin install duo@duo
```

Restart Claude Code, then:

```
/duo:duo add a dark mode toggle to the settings page and make sure the tests pass
```

That's it. `duo` plans the work, splits it up, builds it, tests it, has it reviewed, and tells you what changed.

> Shorter command: try plain `/duo <task>`. If your version doesn't accept it, copy the skill once:
> `git clone https://github.com/googlarz/duo.git ~/duo && cp -R ~/duo/plugins/duo/skills/duo ~/.claude/skills/`

## What a run looks like

*An illustration of the flow, not a recording.*

```
You      /duo:duo add rate limiting to the upload endpoint, with tests

duo      Plan: 3 tasks.  1 middleware (medium)  2 config (low)  3 tests (medium)
Opus     Plan check: add a limit per user, not per IP. Otherwise fine.
Sonnet   Task 1 done · Task 2 done · Task 3 done
Sonnet   Tests: 14 passed, 0 failed (a separate checker ran them)
Opus     Review: one missing edge case in the middleware, sent back
Sonnet   Fixed, tests re-run: 15 passed
duo      Done. 4 files changed. Opus was used twice: plan check and review.
```

## Why you'll like it

- **Your limit goes further.** Sonnet carries the load. Opus is used at most three times per run (one plan check, up to two reviews), and only when it pays off.
- **Fewer mistakes get through.** The code is tested by a fresh checker and reviewed by a different model than the one that wrote it.
- **It's in control of itself.** Never more than two attempts per task. It asks you before it reaches for Opus as a worker.
- **It watches your limit** *(optional, 2 min setup)*. At 80% used it cuts back; at 95% it stops starting new work and tells you where it stands, so you can pick up after the reset.
- **You can see what happened** *(optional)*. A panel shows every task, which model did it, how hard it worked, its steps and its cost.

## Questions

**Do I need Pro or Max?** `duo` works wherever Sonnet and Opus are available to you. The limit-watching feature needs Pro or Max, because only those plans report usage.

**Will it burn my Opus limit?** That's what it's built to avoid. Opus is a reviewer, not a worker: one plan check and up to two reviews per run. Small jobs (two tasks, or a tiny change) skip Opus altogether.

**Is it worth it for a small fix?** No. For small things, use plain Sonnet or Claude Code's built-in `opusplan`. `duo` pays off on multi-step work.

**What if I hit my limit mid-run?** If you've set up the limit helper, `duo` stops before it hits the wall and reports which tasks are done and which are waiting. Say "continue" after the reset.

**Does it change my files without asking?** The workers edit your project, like any Claude Code run, and you see every change. The plan checker, reviewer and verifier have no Edit or Write tools (they keep a shell for running checks, and are instructed not to change files).

**Which Claude Code version?** Recent. `duo` uses subagents with per-agent model and effort. Effort levels `low` to `max` are available on Sonnet 5.5; on older Sonnets an unsupported level falls back to the closest lower one.

## Go further (optional)

<details>
<summary><b>Let duo watch your usage limit</b></summary>

Claude Code passes your usage windows to the statusline command (Pro/Max only). A tiny helper saves them to a file that `duo` reads before it plans. Setup takes about two minutes: **[usage-limits guide](plugins/duo/docs/usage-limits.md)**. Without it, everything else still works; `duo` just won't downshift on its own.

</details>

<details>
<summary><b>See inside every task</b></summary>

```
/plugin install savvy-progress@duo
```

Adds a progress bar and a live agents panel. For duo you see each task with the model and effort that ran it (for example `duo-high · Sonnet 5.5 · high`), and you can expand a task to see its steps (planned, current, done), tokens, context, cost and time. If the mod doesn't appear after installing, load it by hand: `claude --plugin-dir ~/duo/plugins/savvy-progress`.

</details>

<details>
<summary><b>How it decides who does what</b></summary>

Agents behind the stages: Explore subagent, the orchestrator (your session), `duo-advisor` (plan check, no Edit/Write), `duo-low` … `duo-max` (build), `duo-verifier` (no Edit/Write), `duo-reviewer` (no Edit/Write), `duo-opus` (last resort).

| Effort | Used for |
| --- | --- |
| `low` | renames, boilerplate, config, small fixes |
| `medium` | standard features, bugs with a known cause |
| `high` | delicate work: refactors, many edge cases (default ceiling) |
| `xhigh` | unfamiliar code, unclear root cause (after a failure or when explicit) |
| `max` | very complex logic, or a bug that survived xhigh |

Opus budget per run: plan check at most once, review at most twice (one early only for risky tasks, one final). Full rules: [SKILL.md](plugins/duo/skills/duo/SKILL.md).

</details>

<details>
<summary><b>Honest status</b></summary>

Verified: all plugins pass `claude plugin validate`; the panel's tests pass; the helper scripts ran against sample input; the effort levels and agent settings `duo` relies on were checked against the Claude Code docs.

Not yet verified, because it needs a live session: the statusline helper in daily use, the rate-limit hook firing on a real limit, how the details view looks on screen, and whether a bare `/duo` resolves on your version. The panel is built on Claude Code's early-access hooks and may change between releases. If something looks off, please open an issue with what you saw.

</details>

<details>
<summary><b>What's in this repo</b></summary>

| Plugin | What it is |
| --- | --- |
| [duo](plugins/duo) | The subscription flow above |
| [savvy-progress](plugins/savvy-progress) | Progress bar and agents panel; understands the duo tiers |
| [savvy-flow](plugins/savvy-flow) | The original flow by JohnnyVizz (tiered Opus/Fable workers), for API-style budgets |
| [session-band](plugins/session-band) | Band above the prompt: turn, speed, cost, cache countdown, context |

Develop: `claude plugin validate .` · `cd plugins/savvy-progress && claude plugin test .` · `plugins/duo/scripts/gen-agents.sh` (regenerates duo's six worker agents from one shared body).

</details>

---

## Credits

`duo` stands on the work of **[JohnnyVizz](https://github.com/JohnnyVizz)**. The savvy-flow orchestration pattern, the tiered-worker idea, the savvy-progress panel and session-band all come from [JohnnyVizz/claude-kit](https://github.com/JohnnyVizz/claude-kit). This repo started as a fork of it, keeps that code and its licence, and adapts the idea to subscription budgets. Thank you.

MIT licence, see [LICENSE](LICENSE). Original work © 2026 johnnyvizz; duo additions © 2026 googlarz.
