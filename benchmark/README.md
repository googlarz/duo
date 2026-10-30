# Does duo save your limit? A benchmark you can run

Claim to test: on multi-step work, duo uses **less of your usage limit** than plain Sonnet or `opusplan`, with the same or better first-try success. We have not run this yet. Until someone does, treat the claim as unproven (a trivial one-file task already cost duo about 90k tokens, mostly agent overhead).

## Protocol

1. Pick 10 real tasks from a repo you know, 3 to 8 files each (see `tasks.md` for the shape). Reset the repo to the same commit before every run.
2. Run each task three ways, in a fresh session each time, from the same model start state:
   - **A** plain Sonnet (`/model sonnet`, no duo);
   - **B** `opusplan`;
   - **C** `/duo:duo <task>`.
3. For every run record in `results.csv`:
   `task, variant, used_5h_points, used_7d_points, minutes, first_try_ok (0/1), human_fixups (count), notes`.
   - `used_*` is the move of the usage reading over the run. For C it is printed in the report and in the panel's band ("Usage 5h 13% (+4%)"). For A and B read the Usage tile before and after.
   - `first_try_ok` = the acceptance check passes without you asking for any change.
4. Compare medians per variant. duo earns its place only if its median `used_5h_points` is lower than A's **or** its `first_try_ok` rate is clearly higher at a similar cost.

## Rules that keep it honest

- Same usage window for a task's three runs where possible (the reading is shared across models; a reset in the middle voids that task).
- Do not tune duo's rules between tasks.
- Publish the CSV, including the tasks where duo lost.

## Cost

Expect the whole benchmark to use a large share of one weekly window. Run it in pieces.
