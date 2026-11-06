# Task ID and title

**Task ID:** `BFA-HO-20261105T164801Z-6D2F9A41-ROUNDTRIP`  
**Title:** Verify the shared handoff file round trip

## Background and business objective

This is a communication-workflow demonstration only. Verify that Antigravity, when manually started by the user, can read a task file from the shared BFA workspace and write a completion response that Codex can later read from the same workspace.

## Exact scope

Read this task and `agent-handoff/README.md`. Write only:

- `agent-handoff/results/BFA-HO-20261105T164801Z-6D2F9A41-ROUNDTRIP/completion-report.md`
- `agent-handoff/results/BFA-HO-20261105T164801Z-6D2F9A41-ROUNDTRIP/COMPLETION.json`
- One unique `IN_PROGRESS` event and one unique `SUBMITTED` event under this task's `events/` directory.

## Relevant files and modules

Only this task file, `agent-handoff/README.md`, and the result/event paths listed above. No BFA application files or modules are in scope.

## Required implementation behavior

No application implementation is requested. Read the task through the shared workspace, then write a concise report confirming the task ID, title, protocol files read, and whether you were able to write the response through Antigravity. State explicitly that no application files, scripts, tests, databases, migrations, or Git state were touched.

## Acceptance criteria

1. The report is written at the exact path above without replacing any existing file.
2. The report accurately identifies the task ID and protocol files read.
3. A matching `SUBMITTED` event and `COMPLETION.json` marker are created only after the report is complete.
4. No other file is changed or created.

## Explicit exclusions

Do not inspect or change BFA source code, project configuration, documentation outside the handoff protocol, databases, migrations, tests, or Git state. Do not run scripts, shell commands, or tests. Do not invoke the Antigravity CLI, `agy.exe`, or the Codex MCP bridge.

## Security and authorization constraints

The user has authorized only this sample response and marker as part of the communication-workflow demonstration. Antigravity must be manually started by the user in the Antigravity IDE. Do not access or include credentials, tokens, secrets, or production data.

## Testing and verification requirements

No tests or scripts are needed or authorized. Verify only that the task and protocol files are readable and that the response can be written at the specified result path.

## Expected deliverables and completion report format

Write `completion-report.md` with:

- Task ID and final state.
- Protocol files read.
- Whether the shared write succeeded.
- Files created for this task.
- Confirmation of no out-of-scope access or changes.
- Any limitation or blocker.

After the report is complete, create `COMPLETION.json` as the final file with JSON fields `taskId`, `state` (`SUBMITTED`), `submittedAtUtc` (ISO 8601 UTC), `reportPath`, and `deliverables` (array; empty for this demonstration). Create state event files with unique UTC timestamp names and JSON fields `taskId`, `state`, `actor`, `timestampUtc`, and `note`.
