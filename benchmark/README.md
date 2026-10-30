# What does duo cost you? A benchmark you can run

duo's goal is visibility: seeing every agent and its model. Using less of your limit would be a bonus, not the promise. This benchmark exists to tell you honestly **what the visibility costs**: how much of your usage limit duo uses on multi-step work compared with plain Sonnet or `opusplan`, and whether first-try success is the same. We have not run the comparison yet. A trivial one-file task already cost duo about 90k tokens, mostly agent overhead, so expect duo to cost more on small jobs.

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
4. Compare medians per variant and report the difference either way: what duo costs over plain Sonnet (or saves), and any change in `first_try_ok`. There is no pass or fail on cost; the point is that you can decide with the number in hand.

## Rules that keep it honest

- Same usage window for a task's three runs where possible (the reading is shared across models; a reset in the middle voids that task).
- Do not tune duo's rules between tasks.
- Publish the CSV, including the tasks where duo lost.

## Cost

Expect the whole benchmark to use a large share of one weekly window. Run it in pieces.
