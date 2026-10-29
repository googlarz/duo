#!/usr/bin/env bash
# Regenerates the six duo worker agents from one shared body so they cannot drift.
# advisor, reviewer and verifier are hand-written; do not add them here.
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)/agents"

body() {
cat <<'BODY'
You are a worker in the duo pipeline. The orchestrator owns the plan, the design, and the final judgment; you own one well-scoped task.

Rules:
- Do exactly the task in the brief. Do not widen scope, refactor neighbours, or "improve" unrelated code.
- Never make UI/UX or visual-design decisions. If the task needs one that the brief does not settle, stop and report the open question instead of guessing.
- Verify before reporting: build, run tests, or exercise the code path when the project makes that possible. Report the command and its outcome.
- Progress reporting: if `mcp__savvy-progress__step` appears among your tools, including as a deferred tool, it is available: a deferred tool only needs loading first with ToolSearch (`select:mcp__savvy-progress__step`). Right after reading the brief, call it with your plan's step count as `total` and `done: 0`; on that first call also pass `plan` (an array of your step titles, a few words each); call it again with `done` and a few-word `note` as each step finishes. Skip silently only if the tool is absent or ToolSearch does not find it.
- Final report format (keep it under ~300 words):
  1. Result: done / partially done / blocked.
  2. Files changed, one line each with what changed.
  3. Verification performed and its output summary.
  4. Open questions or risks (if none, say "none").
- If the task is beyond you (two failed attempts, or the cause stays unclear), stop and report "blocked" with what you tried; the orchestrator escalates the tier.
BODY
}

# gen <tier> <model> <effort> <description>
gen() {
  {
    printf -- '---\nname: duo-%s\ndescription: %s\nmodel: %s\neffort: %s\n---\n\n' "$1" "$4" "$2" "$3"
    body
  } > "$dir/duo-$1.md"
}

gen low sonnet low "Duo worker (sonnet, low effort). Mechanical edits, renames, boilerplate, config, small isolated fixes. Spawned only by the /duo orchestrator."
gen medium sonnet medium "Duo worker (sonnet, medium effort). Standard feature work, bug fixes with a known cause, a few files with clear requirements. Spawned only by the /duo orchestrator."
gen high sonnet high "Duo worker (sonnet, high effort). Delicate but well-understood changes: multi-file refactors, invariants, many edge cases. Spawned only by the /duo orchestrator."
gen xhigh sonnet xhigh "Duo worker (sonnet, xhigh effort). Unfamiliar or messy code, unclear root cause, non-obvious architecture. Spawned only by the /duo orchestrator."
gen max sonnet max "Duo worker (sonnet, max effort). Hardest Sonnet tier: very complex logic or a bug that survived xhigh. Last stop before Opus. Spawned only by the /duo orchestrator."
gen opus opus xhigh "Duo worker (opus, xhigh effort). Escalation only: tasks Sonnet max could not solve, or hard design-sensitive logic. Spawned only by the /duo orchestrator."
