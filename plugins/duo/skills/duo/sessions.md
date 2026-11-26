# Session overrides (read from SKILL.md section 2)

Find your row, say what it says once, and apply it in place of the defaults for gates and hard tasks. Everything else in SKILL.md still holds, including the usage cap (see Usage limits).

| Session | Say once | Gates | Hard tasks |
|---|---|---|---|
| Opus | "Running on Opus: workers still use Sonnet; /model sonnet before /duo saves limit on planning." | You review yourself; no advisor and no reviewer unless the user asks; keep the verifier. | Normal tiering. |
| Fable | Nothing: you are the gate and the last resort yourself. | Same as Opus: you review yourself; no advisor and no reviewer unless the user asks; keep the verifier; workers still use Sonnet. | A task the plan would send to `duo-opus` or `duo-fable`: do it yourself or give it to `duo-max` first. This overrides the xhigh/max rule in section 9, not the usage cap. |
| Haiku | The plan gate is mandatory (section 10), or ask the user to switch to Sonnet. | Plan gate always, even on the fast path or at the cap, but not at 95% or more. | Normal tiering. |
