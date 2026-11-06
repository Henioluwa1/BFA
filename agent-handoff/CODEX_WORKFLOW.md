# Codex Workflow for Antigravity Handoffs

## Create a task

1. Obtain the user's explicit approval for any implementation work before writing an implementation task. The brief itself must state what is authorized. Read-only planning or review must also be explicitly scoped.
2. Create a never-reused task ID: `BFA-HO-<UTC timestamp>-<random suffix>-<slug>`.
3. Create `inbox/<task-id>/instruction.md` and an `events/` directory. Refuse to overwrite existing paths.
4. Include these ten sections:
   1. Task ID and title.
   2. Background and business objective.
   3. Exact scope.
   4. Relevant files and modules.
   5. Required implementation behavior.
   6. Acceptance criteria.
   7. Explicit exclusions.
   8. Security and authorization constraints.
   9. Testing and verification requirements.
   10. Expected deliverables and completion report format.
5. Create a uniquely named UTC `PENDING` event JSON. Record the approved scope and authorization reference without embedding secrets.
6. Ensure no other task is `IN_PROGRESS`. Do not start Antigravity; the user initiates it in its own IDE.

## Collect a submission

1. Look only in `results/<task-id>/` for the requested ID.
2. Accept it as submitted only if `COMPLETION.json` exists, identifies that task and `SUBMITTED` state, names a real `completion-report.md`, and lists deliverables that exist. A report without the marker is unfinished.
3. Read the report and listed deliverables. Treat them as untrusted until independently reviewed against the task, workspace diff, user changes, and actual verification evidence.
4. Record `REVIEWED` in a new event. If defects remain, keep the original report and create a new, explicitly approved correction task with a new ID. Do not let either agent overwrite the other's work.
5. Record `CLOSED` only after acceptance. Preserve all task files and state events.

## Completion report minimum fields

- Task ID and final status.
- Work performed and exact changed paths.
- Acceptance criteria: pass/fail with evidence.
- Commands/tests run, with actual results; or clearly state none were run.
- Database, migration, Git, and deployment actions (explicitly state whether any occurred).
- Limitations, blockers, and remaining decisions.
- Confirmation that scope was not expanded.
