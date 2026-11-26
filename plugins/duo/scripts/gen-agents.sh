#!/usr/bin/env bash
# Regenerates the eight duo worker agents from one shared body so they cannot drift.
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
- Progress reporting: report steps as the appended brief says (the `mcp__duo-progress__step` tool; load it with ToolSearch if it is deferred; skip silently if it is absent).
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
    printf -- '---\nname: duo-%s\ndescription: %s\nmodel: %s\neffort: %s\ndisallowedTools: Agent\n---\n\n' "$1" "$4" "$2" "$3"
    body
  } > "$dir/duo-$1.md"
}

gen low sonnet low "Duo worker (sonnet, low effort). Mechanical edits, renames, boilerplate, config, small isolated fixes. Spawned only by the /duo orchestrator."
gen medium sonnet medium "Duo worker (sonnet, medium effort). Standard feature work, bug fixes with a known cause, a few files with clear requirements. Spawned only by the /duo orchestrator."
gen high sonnet high "Duo worker (sonnet, high effort). Delicate but well-understood changes: multi-file refactors, invariants, many edge cases. Spawned only by the /duo orchestrator."
gen xhigh sonnet xhigh "Duo worker (sonnet, xhigh effort). Unfamiliar or messy code, unclear root cause, non-obvious architecture. Spawned only by the /duo orchestrator."
gen max sonnet max "Duo worker (sonnet, max effort). Hardest Sonnet tier: very complex logic or a bug that survived xhigh. Last stop before Opus. Spawned only by the /duo orchestrator."
gen opus opus xhigh "Duo worker (opus, xhigh effort). Escalation only: tasks Sonnet max could not solve, and only with the user's consent. Spawned only by the /duo orchestrator."
gen haiku haiku low "Duo worker (haiku, low effort). Purely mechanical edits: one exact pattern applied in many places, no judgment. Always followed by a verifier. Spawned only by the /duo orchestrator."
gen fable fable high "Duo worker (fable, high effort). Last resort: tasks Opus xhigh could not solve, or the hardest logic, high-stakes decisions and design that needs insight. Spawned only by the /duo orchestrator."
