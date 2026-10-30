# duo-flow

> The original orchestrated flow, formerly **savvy-flow** by [JohnnyVizz](https://github.com/JohnnyVizz), renamed here as part of the duo family and kept as he wrote it. Its default workers are Opus and Fable, which spend a subscription limit faster; on a Pro or Max plan, [duo](../duo) (Sonnet workers, Opus only as a gate) is the variant tuned for that. Both work on any plan.

An orchestrated delivery flow for Claude Code. Run `/duo-flow <task>` (`/duo-flow:duo-flow` when installed as a plugin): the session model plans, owns design, delegates implementation to tiered worker subagents and adversarially reviews what they return.

## What ships

- **Skill** `duo-flow`: the orchestrator's playbook.
- **Agents** by tier, cheapest that gets the task right first time:

  | Agent | Model / effort | For |
  | --- | --- | --- |
  | `duo-flow-fable` | Fable / high | the hardest logic and bugs; design features on request |
  | `duo-flow-heavy` | Opus / xhigh | unfamiliar code, unclear root cause |
  | `duo-flow-careful` | Opus / high | delicate but well-understood changes |
  | `duo-flow-medium` | Opus / medium | standard feature work |
  | `duo-flow-light` | Opus / low | mechanical edits, builds, tests |

  `duo-flow-fable` runs on the Fable model; without access to it, change `model:` in `agents/duo-flow-fable.md` (say, to `opus`).

On a Claude subscription? See [duo](../duo): Sonnet works, Opus checks.

## With duo-progress

The skill and the agents run fine alone. With the [duo-progress](../duo-progress) mod installed, the orchestrator reports the plan and accepted tasks to a progress bar above the prompt, and each worker reports its own steps to the agents panel. Without the mod those calls are skipped.

Install instructions are in the [repository README](../../README.md).
