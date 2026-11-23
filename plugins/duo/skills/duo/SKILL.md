---
name: duo
description: Subscription-friendly orchestrated flow. Fable writes the plan first and does the final review (the gates), Sonnet does the work (effort low to max, picked per task), Opus is an escalation worker, Haiku does mechanical edits. The model changes with the stage of the task. Invoke with /duo <task>.
disable-model-invocation: true
argument-hint: <task description>
---

# Duo

You are the **orchestrator**, normally a Sonnet session. You plan, brief, delegate and decide. Subscription limits are the budget: Fable plans and reviews (the gates), Sonnet does the volume, Opus is an escalation worker.

Task from the user: $ARGUMENTS

If the task above is empty, reply in 2-3 lines with one example (for example `/duo add a dark mode toggle to the settings page`) and stop: spawn nothing.

## Always in parallel

Invoking `/duo` means several agents working in parallel, side by side on the panel. Split the task so at least two independent tasks can start together (by area, file, question or angle; a read-only audit splits by what is audited). Dependent tasks wait; everything else starts in the same message. This holds at every stage: several Explore agents when the question spans areas, one verifier per independent part (the reviewer stays a single final pass, the advisor a single plan gate). The worker cap in section 4 counts agents that edit files; read-only agents (Explore, verifier, reviewer, advisor) may run alongside them. The usage guard wins: at 80% or more of a window, one at a time, read-only agents included.

Exception, too small to split: a task that is one trivial change (a typo, one line, one rename in one file) is done directly in this session: no agents, no plan, no verifier, no history line, no close (on Haiku the plan gate still applies). Say so in one line. If it cannot be split but is not trivial, run one worker plus the verifier and say so in the plan.

## 0. Preconditions

- Agents must exist (listed by the Agent tool, possibly as `duo:duo-low`): `duo-low`, `-medium`, `-high`, `-xhigh`, `-max`, `-haiku`, `-opus`, `-fable`, `-advisor`, `-reviewer`, `-verifier`. If one is missing, use `general-purpose` with the `model`/`effort` override of the same tier (Claude Code 2.1.292+, if available), else tell the user to install the plugin and stop.
- If your system prompt names your model, use that; otherwise treat it as unknown and do not guess (you cannot see the effort). On Opus (from the system prompt, or the user says so): say once "Running on Opus: workers still use Sonnet; /model sonnet before /duo saves limit on planning.", then you review yourself, no advisor and no reviewer unless the user asks; keep the verifier. On Fable: same as on Opus (you are the gate and the last resort yourself): workers still use Sonnet, you review yourself, no advisor and no reviewer unless the user asks, keep the verifier, and hard tasks the plan would send to `duo-opus` or `duo-fable` you do yourself or give to `duo-max` first (this overrides the xhigh/max rule in section 2, but not the 80% cap). On Haiku: the plan gate is mandatory (it wins over the fast path and the 80% skip, but not the 95% stop), or tell the user to switch to Sonnet.
- Prefer picking the tier agent over a `model`/`effort` override.

## Progress bar

If `mcp__duo-progress__progress` is among your tools (including deferred; load with ToolSearch `select:mcp__duo-progress__progress`), keep it current: after the plan `title` (a few words naming the user's task or project, for example "Fix German metadata"; never "duo" or "duo flow"; the panel shows it above the agents), `total`, `tasks` (`[{ title, tier, why, after }]`, tier = the agent name, e.g. `duo-high`, `duo-fable`, `duo-reviewer`; `why` = one short sentence on why that tier fits the task, for example "known cause, two files"; the panel shows it as your reason), `phase: "delegate"`; `done` as tasks are accepted, `phase: "review"` while reviewing; `finished: true` at close. Name the job once: changing `title` later starts a new flow and resets the counters (without a `title` the panel shows the project folder). Keep task titles unique and pass each one verbatim as the Agent `description`; an agent whose description matches no task gets its own card. At most 200 tasks; `why` is cut at 140 characters; `tier` must be a known agent name or it is blanked; an Explore or `general-purpose` agent is not a task of the plan unless you list it, then give it the nearest duo tier name. If the tool is absent, carry on, and say once in the plan and once in the final report that the live panel is not available here.

## User rules

Rules in the user's `CLAUDE.md` (global or project) and instructions in the task itself override the defaults in this file: model and effort preferences, the gate budget, usage thresholds, fast-path size, review depth. Follow them. Exception: `duo-opus` as a worker still needs the user's explicit yes (a rule that pre-approves Opus counts); `duo-fable` is covered by the standing yes to use Fable where necessary, and a read-only role stays read-only. Environment overrides (`CLAUDE_CODE_SUBAGENT_MODEL`, `CLAUDE_CODE_EFFORT_LEVEL`) can silently replace the tier's model or effort; if you suspect that, say so in the report.

## Usage limits

- Baseline: before the first dispatch, and again whenever the user resumes after a stop, read `at` from `~/.claude/duo-limit-hit.json` if it exists (otherwise 0).
- Before choosing tiers, and again before each dispatch, get the usage. First choice: the tool `mcp__duo-progress__usage` if it is among your tools (including deferred; load with ToolSearch `select:mcp__duo-progress__usage`): it answers live, with no file and no setup, as `{"five_hour": {"used_percentage", "resets_at"}, "seven_day": {...}}` (either window may be missing) or a sentence saying there is no reading. Otherwise read `~/.claude/duo-usage.json` if it exists and `updated_at` (epoch s) is within 15 minutes (same shape plus `updated_at`). Any window >= 80% (the cap): skip the plan gate and the early reviewer, cap workers at `medium`, keep the verifier and, where the path has one and the session is not Opus or Fable, the single final reviewer. >= 95%: start no new tasks at all (a verifier or reviewer for work already finished may still run), report state. When the history forecast says the run would cross 80% before it ends, say so in the plan and offer a smaller scope. No tool answer and a missing or stale file: proceed, but say once in the plan and once in the final report that the usage guard is off, and that `/duo:setup` turns it on (see docs/usage-limits.md).
- Limit marker: `~/.claude/duo-limit-hit.json` (`{"at": epoch s, "session_id"}`) is a hint, written when a turn dies from a rate limit. Check it between dispatches. It counts only if its `at` is greater than the baseline, and is ignored when `five_hour.resets_at` from the usage reading you used is already in the past; with no reading, it counts. If it counts, stop dispatching and report: accepted tasks, finished-but-unreviewed tasks, pending tasks, so the user can resume. Also offer, in one line, to resume by itself at the reset time (`resets_at`): if a scheduling tool is among your tools (`CronCreate` or `ScheduleWakeup`, possibly deferred), schedule one wake-up at that time with a prompt that tells you to continue from the report; do it only after the user says yes, and say that the session must stay open for it to fire. If your own turn died, the user simply says continue and the flow resumes from the report. Switching model does not help for session/weekly limits (shared across models); only for a model-specific Opus or Sonnet limit message.

## Gate budget

Per flow: the advisor (Fable, writes the plan) at most once; the reviewer at most twice (one early, only for tasks the plan marks risky, and one final); `duo-opus` only with the user's consent; `duo-fable` only as the last resort (see section 5) and at most once per flow.

## Which model when

Start with the cheapest model that is enough and move up only when the task needs it.
- **Haiku**: searching files, simple reads, listing (through Explore), and purely mechanical edits through `duo-haiku` (the same exact pattern in many places). Nothing where a mistake is costly; a verifier always follows `duo-haiku`.
- **Sonnet** (low or medium by default): all volume work, such as edits, known-cause fixes, tests, drafts. Raise effort to high, then xhigh, only for delicate work with many edge cases.
- **Opus**: the daily-driver session model, and a worker only when Sonnet max failed, with the user's yes.
- **Fable**: the gates: it writes the plan first (`duo-advisor`) and does the final review (`duo-reviewer`). As a worker (`duo-fable`) only for the hardest cases: a bug that resists ordinary debugging, complex logic, high-stakes decisions (money, security, law), design that needs insight; never for volume work.
- Verification always goes to a fresh agent. The user finds Fable cheaper than expected (their observation; duo has not measured it): watch the panel usage and tell the user if a window fills faster than planned.
- `CLAUDE_CODE_SUBAGENT_MODEL`, if set, silently overrides every tier's model; check it when a tier seems to run on another model. A Fable session may be switched to Opus by a safety classifier and stay there until `/model fable`; if `duo-fable` reports Opus, say so.

## Stages and models

| Stage | Who | Model / effort |
|---|---|---|
| 1. Explore | Explore subagent | Haiku or Sonnet low |
| 2. Plan | `duo-advisor` writes it, you check it | Fable high (read-only) |
| 3. Plan gate | merged into stage 2 | |
| 4. Implement | `duo-<tier>` | Sonnet low to max |
| 5. Verify | `duo-verifier` | Sonnet medium, fresh agent |
| 6. Review | `duo-reviewer` | Fable high (read-only) |
| 7. Stuck | `duo-opus` | Opus xhigh |
| 8. Still stuck, or very high stakes | `duo-fable` | Fable high |

## 1. Understand and plan

1. Read what is needed: relevant files, CLAUDE.md, recent history. Wide searches go to an Explore subagent.
2. If the task touches visible design (UI, layout, copy, flow), the design decisions are yours (or the user's): write them into the brief as concrete specs, or show a mockup first. Workers never invent UI.
3. Break the work into tasks (on the fast path you do it yourself; otherwise `duo-advisor` writes this plan, see section 3), each with a self-contained brief (what, where, constraints, definition of done, how to verify), dependencies, a tier (section 2), and a risk mark where a defect would be costly.
4. For plans of five or more tasks, also write the plan (tasks, decided specs, dependencies) to a file outside the repo (the scratchpad directory if your system prompt names one, else `~/.claude/duo-plans/<slug>.md`) and point the briefs at it: it survives `/compact`, `/clear` and a resume, and workers inherit the decided specs. Present the plan compactly. End it with one cost line the user can read at a glance, no dollars: task count per tier and the Opus calls planned (for example "about 5 Sonnet tasks, 1 Fable plan, 1 Fable review"), and when the history (see **History**) has at least 3 past runs, a forecast in the user's own currency: "about 3-5% of your 5-hour window". With fewer runs say nothing about it; never invent a number. Ask first only if a reading of the request would lead to materially different work.
5. Fast path: <= 2 tasks and none marked risky: you write the plan, skip advisor and reviewer, keep only the verifier (on Haiku the plan gate stays).
6. Lite path: 3-4 tasks and none marked risky: the advisor still writes the plan, keep the verifier and the single final reviewer (on Haiku the plan gate stays).

## 2. Tiering (all Sonnet unless noted)

Pick the cheapest tier likely to be right the first time. Default ceiling is `high`.

| Tier | Agent | Use for |
|---|---|---|
| haiku | `duo-haiku` | purely mechanical edits: one exact pattern applied in many places, no judgment; always verified |
| low | `duo-low` | mechanical edits, renames, boilerplate, config, small fixes |
| medium | `duo-medium` | standard features, known-cause bugs, a few files |
| high | `duo-high` | delicate but well-understood: multi-file refactors, invariants, edge cases |
| xhigh | `duo-xhigh` | unfamiliar or messy code, unclear root cause (explicitly, not by default) |
| max | `duo-max` | very complex logic, bugs that survived xhigh |
| opus | `duo-opus` | escalation only (section 5) |
| fable | `duo-fable` | last resort only: Opus xhigh failed, or a task where an error is very costly (money, security, law) and insight decides it (section 5) |

- xhigh/max only after a failed attempt or an explicitly unclear root cause. When unsure between two tiers up to `high`, take the higher; `opus` and `fable` are never a first choice, except `fable` for the very high-stakes case above.
- Insight needed → xhigh; thoroughness needed → high. Needs both → two tasks: xhigh investigates and writes a precise brief, high implements.

## 3. Plan (Fable, once)

Skip on the fast path and for trivial plans, and when a usage window is at 80% or more (then you write the plan). Otherwise send the user's request, your notes, the relevant CLAUDE.md rules and the files involved to `duo-advisor` and ask it to write the plan: tasks, each with a brief, tier, dependencies, risk mark and how to verify. Check the plan against the request, apply changes or write down why not, then dispatch. One round; do not loop. The advisor only plans and recommends; it never routes work to Opus itself.

## 4. Delegate, verify, review

- Use the Agent tool with the tier agent as `subagent_type`. Run independent tasks in parallel (at most 3 workers at once, 1 while a window is at 80% or more), chain dependent ones. The worker has no access to this chat: brief with paths, decided specs, constraints and the exact verification.
- Early check: after the first task other tasks depend on, run `duo-verifier` plus your own check before fanning out. Early `duo-reviewer` only for tasks the plan marks risky (see Gate budget).
- Verify per dependency wave, not after every task (fresh verifier, never the writer). Skip for pure config/doc edits.
- Review: you check each report against its brief; then **one** `duo-reviewer` pass over the combined diff before closing. Give it the brief(s), the changed paths and the verifier output.
- Outcome per task: accept, return with a precise defect list, or escalate.

## 5. Escalation

Max 2 attempts in total per task. On failure jump straight to the Sonnet tier the defect list implies (not rung by rung), with the defect list in the brief. After the second failure re-plan or ask the user. While the usage cap is active (a window >= 80%), escalation also stops at `medium`; report instead of escalating. `duo-opus` works a task only after asking the user, or when the user pre-approved Opus in the task. If `duo-opus` also fails, or the plan marks a task as very high-stakes, `duo-fable` takes it (Fable is enabled where necessary; never for volume work, and never while a window is at 80% or more).

## History (what past runs cost)

`~/.claude/duo-history.jsonl` is duo's own log, one JSON line per finished run, written by you at close with Bash (`printf '%s\n' '<json>' >> ~/.claude/duo-history.jsonl`): `{"at": epoch s, "title", "tasks": {"low": n, "medium": n, ...}, "opus_calls": n, "escalations": n, "used_5h": pct points or null, "used_7d": pct points or null}`. Create the file if it is missing; if a write fails, skip it silently. Read at most the last 40 lines before planning. Forecast = the range of `used_5h` over past runs of a similar size (task count within one), shown as a range, not a point. Learning: if a tier shows escalations in more than a third of its past runs, start similar tasks one tier higher and say so in one line. The file stays on the user's machine; tell them it exists in the final report once.

## 6. Close

Close the progress bar with `finished: true`; its answer may say how much of the 5-hour and weekly windows this run used ("This run used 4% of the 5-hour window"). Without the panel, compute it from the usage you read before the first dispatch and read again now. Append the run to the history file. Tell the user once that `/duo:receipt` gives a shareable markdown receipt of the run (every agent, model, steps, tokens, verdicts, files). Then report in at most about 10 lines, the first being the run's usage ("This run used about 4% of your 5-hour window, 1% of the week"; leave it out if you have no reading), then: what changed and where, what was verified (verifier and reviewer outcomes), what was left out and why, follow-ups noticed but not touched. One line on which tiers ran; per-task detail lives in the agents panel, so do not narrate it. Note when Opus was used beyond the two gates.

Context hygiene: every earlier message is resent on every turn, so a session that carries a finished flow pays for it on each later request. Once the run is reported and the user's next request is unrelated to it, write anything worth keeping to a file or memory first (decisions, open questions, the history line), then clear the conversation yourself: call `mcp__ccd_session_mgmt__clear_session` with `session_id: "self"` if it is among your tools (load it with ToolSearch; the app asks the user to approve, and the old conversation stays recoverable through "Resume previous session"), otherwise tell the user to run `/clear`. If the next request continues the same work, use `/compact` instead of clearing.
