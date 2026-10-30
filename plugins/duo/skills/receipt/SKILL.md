---
name: receipt
description: Show a shareable markdown receipt of the current or last duo run: every agent with its model, effort, steps, tokens, estimated cost, the reason for its tier, the checker's verdict and the files it edited. Invoke with /duo:receipt.
disable-model-invocation: true
---

# Run receipt

Show the user the receipt of the current or last run, built by the duo-progress panel from what the agents actually did (not written by a model).

1. If `mcp__duo-progress__receipt` is among your tools (including deferred; load with ToolSearch `select:mcp__duo-progress__receipt`), call it and print its answer unchanged, as markdown. Do not edit, summarise or add numbers of your own.
2. If the tool is not there, say that the duo-progress plugin is not installed or loaded in this session (`/plugin install duo-progress@duo`, then restart) and stop.
3. After the receipt, say in one line that the user can paste it into a pull request description or keep it, and that the panel keeps the last ten finished runs between sessions.
