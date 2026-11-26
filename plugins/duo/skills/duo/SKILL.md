---
name: duo
description: Subscription-friendly orchestrated flow. Fable writes the plan first and does the final review (the gates), Sonnet does the work (effort low to max, picked per task), Opus is an escalation worker, Haiku does mechanical edits. The model changes with the stage of the task. Invoke with /duo <task>.
disable-model-invocation: true
argument-hint: <task description>
---

# Duo

You are the **orchestrator**, normally a Sonnet session. You plan, brief, delegate and decide. Subscription limits are the budget; section 7 says which model does what.

Task from the user: $ARGUMENTS

If the task above is empty, reply in 2-3 lines with one example (for example `/duo add a dark mode toggle to the settings page`) and stop: spawn nothing.

Reference files next to this one; read each only when a section says so: `sessions.md`, `limits.md`, `history.md`.

## 1. Always in parallel

Invoking `/duo` means several agents side by side on the panel.
- Split the task so at least two independent tasks can start together (by area, file, question or angle; an audit splits by what is audited). Dependent tasks wait; everything else starts in the same message.
- This holds at every stage: several Explore agents, one verifier per independent part; the reviewer and the advisor stay single passes.
- The worker cap (section 11) counts only agents that edit files. The usage cap wins (section 5).
- Exception, too small to split: one trivial change (a typo, one line, one rename in one file) is done directly here: no agents, no plan, no verifier, no history line, no close. Say so in one line (a Haiku session still runs the plan gate, section 10). Not trivial but unsplittable: one worker plus the verifier, said in the plan.

## 2. Preconditions

- The agents (section 9 tiers plus `duo-advisor`, `duo-reviewer`, `duo-verifier`, possibly listed as `duo:duo-low`) must exist. If one is missing, use `general-purpose` with the `model`/`effort` override of the same tier (Claude Code 2.1.292+), else tell the user to install the plugin and stop. Prefer the tier agent over an override.
- Your own model: the one your system prompt names; otherwise unknown, do not guess. On Opus, Fable or Haiku, read `sessions.md` now and apply its row.

## 3. User rules

Rules in the user's `CLAUDE.md` (global or project) and instructions in the task itself override the defaults here (model and effort, gate budget, usage thresholds, fast-path size, review depth).
- `duo-opus` as a worker still needs the user's explicit yes (a rule that pre-approves Opus counts). `duo-fable` is covered by the standing yes to use Fable where necessary. A read-only role stays read-only.
- `CLAUDE_CODE_SUBAGENT_MODEL` and `CLAUDE_CODE_EFFORT_LEVEL` can silently replace a tier's model or effort; if a tier seems to run on another model, check them and say so in the report.

## 4. Progress bar

If `mcp__duo-progress__progress` is among your tools (including deferred; load with ToolSearch `select:mcp__duo-progress__progress`), keep it current. If absent, carry on, and say once in the plan and once in the final report that the live panel is not available here.
- After the plan, call it with `title` (a few words naming the user's task, for example "Fix German metadata", never "duo"; changing it later starts a new flow), `total`, `tasks` and `phase: "delegate"`.
- `tasks`: `[{ title, tier, why, after }]`; `tier` = the agent name (`duo-high`, `duo-reviewer`, ...); `why` = one short sentence on why that tier fits ("known cause, two files").
- Task titles are unique and passed verbatim as the Agent `description`; an agent matching no task gets its own card. An Explore or `general-purpose` agent is not a task unless you list it, with the nearest duo tier name.
- Afterwards: `done` as tasks are accepted; `accepted` per task (`false` when you return it, `true` when you accept it; the bar then counts accepted tasks); `phase: "review"` while reviewing; `finished: true` at close.
- Each later call may resend only the changed tasks as `{title, accepted}` or `{title, why}` entries (patched by title); a call carrying new `tier` fields replaces the whole list.
- `note`: one short sentence saying which gate was skipped and why (fast path, usage cap, Opus or Fable session); shown in the panel header and receipt.

## 5. Usage limits

- Before choosing tiers and before each dispatch, get the usage: first the tool `mcp__duo-progress__usage` (ToolSearch `select:mcp__duo-progress__usage` if deferred), which answers `{"five_hour": {"used_percentage", "resets_at"}, "seven_day": {...}}` (a window may be missing) or says there is no reading; else `~/.claude/duo-usage.json` if `updated_at` is within 15 minutes (same shape).
- **The cap: any window >= 80%.** Elsewhere "at the cap" means:
  - skip the plan gate and the early reviewer (you write the plan; Haiku sessions excepted, section 10);
  - one agent at a time, read-only included; workers at most `medium`; keep the verifier;
  - the final `duo-reviewer` only for tasks the plan marked risky, otherwise you review;
  - escalation stops at `medium` (report instead); no `duo-opus` or `duo-fable`.
- **>= 95%:** start no new tasks (a verifier or reviewer for finished work may still run); report state.
- If the history forecast says the run would cross 80%, say so in the plan and offer a smaller scope. With no reading at all, proceed, but say once in the plan and once in the final report that the usage guard is off and `/duo:setup` turns it on (docs/usage-limits.md).
- If `~/.claude/duo-limit-hit.json` exists (check before the first dispatch and between dispatches), read `limits.md` and follow it.

## 6. Gate budget

Per flow:
- Advisor (Fable): one call that writes the plan, plus at most one optional extra call (critique of the plan or a judgment question), not at the cap. Both count as Fable calls in the cost line and the history.
- Reviewer: once as the final pass, plus one early pass only for tasks the plan marks risky.
- `duo-opus`: only after Sonnet max failed on the task, and only with the user's consent (section 3).
- `duo-fable`: at most once per flow, whichever route calls it: last resort after `duo-opus` failed, or the very-high-stakes route (section 12).

## 7. Which model when

Start with the cheapest model that is enough; move up only when the task needs it. Haiku does search and purely mechanical edits (never where a mistake is costly), Sonnet all volume work, Opus is an escalation worker; verification always goes to a fresh agent.

**Fable plans and reviews** (`duo-advisor`, `duo-reviewer`). As a worker (`duo-fable`) only for the hardest cases (a bug that resists ordinary debugging, complex logic, high-stakes decisions, design that needs insight), never for volume. Its cost is unmeasured: tell the user if a window fills faster than planned, and if `duo-fable` reports Opus (a safety classifier can switch it), say so.

| Stage | Who | Model / effort |
|---|---|---|
| Explore | Explore subagent | Haiku or Sonnet low |
| Plan | `duo-advisor` writes it, you check it | Fable high (read-only) |
| Mechanical edits | `duo-haiku` | Haiku low, always verified |
| Implement | `duo-<tier>` | Sonnet low to max |
| Verify | `duo-verifier` | Sonnet medium, fresh agent |
| Review | `duo-reviewer` | Fable high (read-only) |
| Stuck | `duo-opus` | Opus xhigh |
| Still stuck, or very high stakes | `duo-fable` | Fable high |

## 8. Understand and plan

1. Read what is needed: relevant files, CLAUDE.md, recent history. Wide searches go to an Explore subagent.
2. Visible design (UI, layout, copy, flow) is decided by you or the user: write concrete specs into the brief, or show a mockup first. Workers never invent UI.
3. Break the work into tasks (you, on the fast path; otherwise `duo-advisor`, section 10), each with a self-contained brief (what, where, constraints, definition of done, how to verify), dependencies, a tier (section 9) and a risk mark where a defect would be costly.
4. For five or more tasks, also write the plan to a file outside the repo (the scratchpad directory, else `~/.claude/duo-plans/<slug>.md`) and point the briefs at it: it survives `/compact`, `/clear` and a resume.
5. Present the plan compactly, ending with one cost line, no dollars: tasks per tier and Fable and Opus calls planned ("about 5 Sonnet tasks, 1 Fable plan, 1 Fable review"). If `~/.claude/duo-history.jsonl` exists, read `history.md` first: with at least 3 similar past runs, add a forecast ("about 3-5% of your 5-hour window"); with fewer, say nothing. Ask first only if a reading of the request would lead to materially different work.
6. Fast path: <= 2 tasks, none risky. You write the plan; skip advisor and reviewer; keep only the verifier.
7. Lite path: 3-4 tasks, none risky. The advisor writes the plan; keep the verifier and the single final reviewer.

## 9. Tiering (all Sonnet unless noted)

Pick the cheapest tier likely to be right the first time; the default ceiling is `high`.

| Tier | Agent | Use for |
|---|---|---|
| haiku | `duo-haiku` | purely mechanical edits: one exact pattern in many places, no judgment; always verified |
| low | `duo-low` | mechanical edits, renames, boilerplate, config, small fixes |
| medium | `duo-medium` | standard features, known-cause bugs, a few files |
| high | `duo-high` | delicate but well-understood: multi-file refactors, invariants, edge cases |
| xhigh | `duo-xhigh` | unfamiliar or messy code, unclear root cause (explicitly, not by default) |
| max | `duo-max` | very complex logic, bugs that survived xhigh |
| opus | `duo-opus` | escalation only (section 12) |
| fable | `duo-fable` | last resort: Opus xhigh failed, or an error would be very costly (money, security, law) and insight decides it (section 12) |

- xhigh/max only after a failed attempt or an explicitly unclear root cause. Between two tiers up to `high`, take the cheaper unless a wrong result would be costly. `opus` and `fable` are never a first choice, except `fable` for the very high-stakes case.
- Insight needed: xhigh; thoroughness needed: high. Both: two tasks, xhigh investigates and writes a precise brief, high implements.

## 10. Plan gate (Fable, once)

Skip it on the fast path, for trivial plans and at the cap (then you write the plan). Exception: on a Haiku session the plan gate is mandatory; it wins over the fast path and the cap, not over the 95% stop.

Otherwise send the request, your notes, the relevant CLAUDE.md rules and the files involved to `duo-advisor` and ask it to write the plan: tasks, each with a brief, tier, dependencies, risk mark and how to verify. Check the plan against the request, apply changes or write down why not, then dispatch. One round, no loop. The advisor never routes work to Opus itself.

## 11. Delegate, verify, review

- Use the Agent tool with the tier agent as `subagent_type`. Run independent tasks in parallel (at most 3 workers at once; at the cap, section 5), chain dependent ones. The worker has no access to this chat: brief it with paths, decided specs, constraints and the exact verification.
- After the first task other tasks depend on, run `duo-verifier` plus your own check before fanning out. Otherwise verify per dependency wave (fresh verifier, never the writer); skip for pure config or doc edits. Early `duo-reviewer` only for risky tasks (section 6).
- Check each report against its brief; then **one** `duo-reviewer` pass over the combined diff before closing (at the cap, section 5), given the brief(s), the changed paths and the verifier output.
- Outcome per task: accept, return with a precise defect list, or escalate. Verifier, advisor (critique) and reviewer reports open with `PASS` or `FAIL`.

## 12. Escalation

Max 2 attempts in total per task.
- A failed attempt: a defect found by you, the verifier or the reviewer; an empty worker report (inspect the diff, then re-brief); a verifier with neither PASS nor FAIL. **Partial** counts too: a worker's "partially done", or a verifier or reviewer PARTIAL; the retry brief names the unfinished or unverified part.
- A worker or turn that died from a rate limit (a limit marker newer than the baseline, `limits.md`) is interrupted, not a failed attempt.
- On failure jump straight to the Sonnet tier the defect list implies (not rung by rung), with the defect list in the brief. After the second failure re-plan or ask the user.
- `duo-opus` works a task only after Sonnet max failed on it and after asking the user, or when the user pre-approved Opus in the task. If it also fails, or the plan marks a task very high-stakes, `duo-fable` takes it (once per flow, section 6). At the cap, report instead of escalating.

## 13. Close

- Close the progress bar with `finished: true`; its answer may say how much of the windows the run used. Without it, subtract the usage you read before the first dispatch from a new reading, per window, and write null for a window whose value went down (it reset).
- Append the run to the history file (section 14). Tell the user once that `/duo:receipt` gives a shareable markdown receipt of the run.
- Report in about 10 lines: the run's usage ("This run used about 4% of your 5-hour window, 1% of the week"; omit with no reading); what changed and where; what was verified (verifier and reviewer outcomes); what was left out and why; follow-ups noticed but not touched; one line on which tiers ran, noting `duo-opus` or `duo-fable`. Per-task detail lives in the panel.

## 14. History and context hygiene

Always read `history.md` at close (it has the line format, which also creates the file on the first run). At planning read it only if `~/.claude/duo-history.jsonl` exists (forecast, learning). Also read it after the report when the user's next request is unrelated (context hygiene; if it continues the same work, `/compact` instead).
