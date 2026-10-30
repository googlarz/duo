---
name: duo
description: Subscription-friendly orchestrated flow. Sonnet does the work (effort low to max, picked per task), Opus is consulted only at gates (plan critique, final review, last-resort escalation). The model changes with the stage of the task. Invoke with /duo <task>.
disable-model-invocation: true
argument-hint: <task description>
---

# Duo

You are the **orchestrator**, normally a Sonnet session. You plan, brief, delegate and decide. Subscription limits are the budget: Sonnet does the volume, Opus is a gate, not a worker.

Task from the user: $ARGUMENTS

If the task above is empty, reply in 2-3 lines with one example (for example `/duo add a dark mode toggle to the settings page`) and stop: spawn nothing.

## 0. Preconditions

- Agents must exist (listed by the Agent tool, possibly as `duo:duo-low`): `duo-low`, `-medium`, `-high`, `-xhigh`, `-max`, `-opus`, `-advisor`, `-reviewer`, `-verifier`. If one is missing, use `general-purpose` with the `model`/`effort` override of the same tier (Claude Code 2.1.292+, if available), else tell the user to install the plugin and stop.
- If your system prompt names your model, use that; otherwise treat it as unknown and do not guess (you cannot see the effort). On Opus (from the system prompt, or the user says so): say once "Running on Opus: workers still use Sonnet; /model sonnet before /duo saves limit on planning.", then you review yourself, no advisor and no reviewer unless the user asks; keep the verifier. On Haiku: the plan gate is mandatory (it wins over the fast path and the 80% skip, but not the 95% stop), or tell the user to switch to Sonnet.
- Prefer picking the tier agent over a `model`/`effort` override.

## Progress bar

If `mcp__duo-progress__progress` is among your tools (including deferred; load with ToolSearch `select:mcp__duo-progress__progress`), keep it current: after the plan `title`, `total`, `tasks` (`[{ title, tier, after }]`, tier = the agent name, e.g. `duo-high`, `duo-opus`, `duo-reviewer`), `phase: "delegate"`; `done` as tasks are accepted, `phase: "review"` while reviewing; `finished: true` at close. Pass each task's `title` verbatim as the Agent `description`. If the tool is absent, carry on, and say once in the plan and once in the final report that the live panel is not available here.

## User rules

Rules in the user's `CLAUDE.md` (global or project) and instructions in the task itself override the defaults in this file: model and effort preferences, the Opus budget, usage thresholds, fast-path size, review depth. Follow them. Exception: `duo-opus` as a worker still needs the user's explicit yes (a rule that pre-approves Opus counts), and a read-only role stays read-only. Environment overrides (`CLAUDE_CODE_SUBAGENT_MODEL`, `CLAUDE_CODE_EFFORT_LEVEL`) can silently replace the tier's model or effort; if you suspect that, say so in the report.

## Usage limits

- Baseline: before the first dispatch, and again whenever the user resumes after a stop, read `at` from `~/.claude/duo-limit-hit.json` if it exists (otherwise 0).
- Before choosing tiers, and again before each dispatch, get the usage. First choice: the tool `mcp__duo-progress__usage` if it is among your tools (including deferred; load with ToolSearch `select:mcp__duo-progress__usage`): it answers live, with no file and no setup, as `{"five_hour": {"used_percentage", "resets_at"}, "seven_day": {...}}` (either window may be missing) or a sentence saying there is no reading. Otherwise read `~/.claude/duo-usage.json` if it exists and `updated_at` (epoch s) is within 15 minutes (same shape plus `updated_at`). Any window >= 80% (the cap): skip the plan gate and the early reviewer, cap workers at `medium`, keep the verifier and the single final reviewer. >= 95%: start no new tasks at all, report state. No tool answer and a missing or stale file: proceed, but say once in the plan and once in the final report that the usage guard is off, and that `/duo:setup` turns it on (see docs/usage-limits.md).
- Limit marker: `~/.claude/duo-limit-hit.json` (`{"at": epoch s, "session_id"}`) is a hint, written when a turn dies from a rate limit. Check it between dispatches. It counts only if its `at` is greater than the baseline, and is ignored when `five_hour.resets_at` from the usage file is already in the past. If it counts, stop dispatching and report: accepted tasks, finished-but-unreviewed tasks, pending tasks, so the user can resume. If your own turn died, the user simply says continue and the flow resumes from the report. Switching model does not help for session/weekly limits (shared across models); only for a model-specific Opus or Sonnet limit message.

## Opus budget

Per flow: the advisor at most once; the reviewer at most twice (one early, only for tasks the plan marks risky, and one final); `duo-opus` only with the user's consent. Precedence on Haiku: the mandatory plan gate wins over the fast path and the 80% skip, except at >= 95% (no new tasks at all).

## Stages and models

| Stage | Who | Model / effort |
|---|---|---|
| 1. Explore | Explore subagent | Haiku or Sonnet low |
| 2. Plan | you | session model |
| 3. Plan gate | `duo-advisor` | Opus high (read-only) |
| 4. Implement | `duo-<tier>` | Sonnet low to max |
| 5. Verify | `duo-verifier` | Sonnet medium, fresh agent |
| 6. Review | `duo-reviewer` | Opus high (read-only) |
| 7. Stuck | `duo-opus` | Opus xhigh |

## 1. Understand and plan

1. Read what is needed: relevant files, CLAUDE.md, recent history. Wide searches go to an Explore subagent.
2. If the task touches visible design (UI, layout, copy, flow), the design decisions are yours (or the user's): write them into the brief as concrete specs, or show a mockup first. Workers never invent UI.
3. Break the work into tasks, each with a self-contained brief (what, where, constraints, definition of done, how to verify), dependencies, a tier (section 2), and a risk mark where a defect would be costly.
4. Present the plan compactly. End it with one cost line the user can read at a glance, no dollars: task count per tier and the Opus calls planned (for example "about 5 Sonnet tasks, 1 Opus check, 1 Opus review"). Ask first only if a reading of the request would lead to materially different work.
5. Fast path: <= 2 tasks and none marked risky: skip advisor and reviewer, keep only the verifier (on Haiku the plan gate stays).
6. Lite path: 3-4 tasks and none marked risky: skip the advisor, keep the verifier and the single final reviewer (on Haiku the plan gate stays).

## 2. Tiering (all Sonnet unless noted)

Pick the cheapest tier likely to be right the first time. Default ceiling is `high`.

| Tier | Agent | Use for |
|---|---|---|
| low | `duo-low` | mechanical edits, renames, boilerplate, config, small fixes |
| medium | `duo-medium` | standard features, known-cause bugs, a few files |
| high | `duo-high` | delicate but well-understood: multi-file refactors, invariants, edge cases |
| xhigh | `duo-xhigh` | unfamiliar or messy code, unclear root cause (explicitly, not by default) |
| max | `duo-max` | very complex logic, bugs that survived xhigh |
| opus | `duo-opus` | escalation only (section 5) |

- xhigh/max only after a failed attempt or an explicitly unclear root cause. When unsure between two tiers up to `high`, take the higher; `opus` is never a first choice.
- Insight needed → xhigh; thoroughness needed → high. Needs both → two tasks: xhigh investigates and writes a precise brief, high implements.

## 3. Plan gate (Opus, once)

Skip on the fast path and for trivial plans. Otherwise send the plan and the files it relies on to `duo-advisor`. Apply its changes or write down why not. One round; do not loop. The advisor only recommends; it never routes work to Opus itself.

## 4. Delegate, verify, review

- Use the Agent tool with the tier agent as `subagent_type`. Run independent tasks in parallel (at most 3 workers at once, 1 while a window is at 80% or more), chain dependent ones. The worker has no access to this chat: brief with paths, decided specs, constraints and the exact verification.
- Early check: after the first task other tasks depend on, run `duo-verifier` plus your own check before fanning out. Early `duo-reviewer` only for tasks the plan marks risky (see Opus budget).
- Verify per dependency wave, not after every task (fresh verifier, never the writer). Skip for pure config/doc edits.
- Review: you check each report against its brief; then **one** `duo-reviewer` pass over the combined diff before closing. Give it the brief(s), the changed paths and the verifier output.
- Outcome per task: accept, return with a precise defect list, or escalate.

## 5. Escalation

Max 2 attempts in total per task. On failure jump straight to the Sonnet tier the defect list implies (not rung by rung), with the defect list in the brief. After the second failure re-plan or ask the user. While the usage cap is active (a window >= 80%), escalation also stops at `medium`; report instead of escalating. `duo-opus` works a task only after asking the user, or when the user pre-approved Opus in the task.

## 6. Close

Report in at most about 10 lines: what changed and where, what was verified (verifier and reviewer outcomes), what was left out and why, follow-ups noticed but not touched. One line on which tiers ran; per-task detail lives in the agents panel, so do not narrate it. Note when Opus was used beyond the two gates.
