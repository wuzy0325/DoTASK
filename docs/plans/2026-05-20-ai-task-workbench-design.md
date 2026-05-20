# AI Task Workbench Design

Date: 2026-05-20

## 1. Product Positioning

AI Task Workbench is a local-first Ubuntu web console for managing coding tasks that are manually copied from an external task website.

The user manually logs into the website, copies task requirements or QA bug feedback, and imports them into this system. The system then manages the local development workflow: creating an isolated workspace, starting Claude Code and Codex terminals, coordinating development and review, running tests, committing and pushing code, and generating the final submission artifacts.

## 2. Scope

### In Scope

- Local single-user task management.
- Manual task and QA feedback import.
- One independent Git repository per task.
- Per-task isolated workspace.
- Per-task tmux session with Claude Code, Codex, test runner, and shell windows.
- Skill profile selection and context generation.
- Semi-automatic pipeline with manual takeover.
- Git diff, commit, and push support.
- Test command execution and result recording.
- Final artifact generation for manual website submission.
- Multi-task dashboard and status tracking.

### Out of Scope for MVP

- Automatic login to the task website.
- Automatic task scraping.
- Automatic QA feedback scraping.
- Automatic website submission.
- Multi-user permissions.
- Remote machine scheduling.
- Distributed execution.

## 3. Architecture

```text
+------------------------------------------------+
| Web Console                                    |
| React + Vite + Tailwind + xterm.js             |
| Dashboard / Task Detail / Terminal / Artifacts  |
+-----------------------+------------------------+
                        | HTTP + WebSocket
+-----------------------v------------------------+
| Local Backend Service                           |
| Node.js + TypeScript + Fastify                  |
| API / Pipeline / Agent / Git / Test / Artifact  |
+-------+---------------+---------------+--------+
        |               |               |
+-------v------+  +-----v------+  +-----v--------+
| SQLite DB     |  | tmux/pty    |  | Git/Test CLI |
| task metadata |  | terminals   |  | runner       |
+-------+------+  +-----+------+  +-----+--------+
        |               |               |
+-------v---------------v---------------v--------+
| Local Workspace                                 |
| ~/ai-task-workbench/tasks/task-10001/repo       |
| ~/ai-task-workbench/tasks/task-10001/.task-meta |
+------------------------------------------------+
```

## 4. Recommended Stack

- Frontend: React, Vite, Tailwind, xterm.js.
- Backend: Node.js, TypeScript, Fastify.
- Database: SQLite.
- ORM: Drizzle ORM or Prisma. Drizzle is preferred for a lightweight local app.
- Terminal orchestration: tmux, node-pty, WebSocket.
- Git operations: git CLI.
- Process manager: `systemd --user` or pm2.
- Package manager: pnpm.
- OS target: Ubuntu.

## 5. Repository Layout

```text
ai-task-workbench/
  apps/
    web/
      src/
    server/
      src/
  packages/
    shared/
      src/
    core/
      src/
  templates/
    prompts/
      claude-feature-dev.md
      claude-qa-fix.md
      codex-review.md
      claude-review-fix.md
      codex-final-check.md
      final-report.md
  config/
    app.config.yaml
    skill-profiles.yaml
  docs/
    plans/
  package.json
  pnpm-workspace.yaml
```

Runtime data lives outside the source tree by default:

```text
~/ai-task-workbench/
  app.db
  skills/
  tasks/
```

## 6. Task Workspace Layout

Each task has an isolated directory:

```text
~/ai-task-workbench/tasks/
  task-10001-login/
    repo/
    .task-meta/
      task.json
      requirement.md
      qa-feedback.md
      skill-context.md
      claude-prompt.md
      codex-prompt.md
      dev-summary.md
      codex-review.md
      review-fix-summary.md
      test-result.md
      final-report.md
      artifacts.json
      logs/
        claude.log
        codex.log
        test.log
        git.log
```

`repo/` contains the actual Git repository. `.task-meta/` contains all task metadata, prompts, review output, logs, and submission artifacts.

## 7. Task Types

The MVP supports two task types:

- `feature`: a new development task.
- `qa_fix`: a QA feedback repair task.

QA fixes can be modeled as repair rounds attached to an existing task, so one task can go through multiple QA cycles:

```text
feature development -> artifact ready -> manual website submission -> QA rejected -> qa fix round 1 -> artifact ready -> manual website submission
```

## 8. State Machine

Primary states:

```text
DRAFT
READY
CLONING
WORKSPACE_READY
CONTEXT_READY
AGENTS_READY
DEV_RUNNING
DEV_DONE
REVIEW_RUNNING
REVIEW_DONE
FIXING_REVIEW
FIX_DONE
TESTING
TEST_PASSED
COMMITTING
COMMITTED
PUSHING
PUSHED
ARTIFACT_GENERATING
ARTIFACT_READY
DONE
```

Failure and manual states:

```text
FAILED_CLONE
FAILED_CONTEXT
FAILED_AGENT_START
FAILED_DEV
FAILED_REVIEW
FAILED_FIX
FAILED_TEST
FAILED_COMMIT
FAILED_PUSH
FAILED_ARTIFACT
NEEDS_HUMAN
PAUSED
CANCELLED
```

Rules:

- Every state must be recoverable.
- Every pipeline step must be rerunnable.
- Every failure must have a recorded reason.
- The user can pause, resume, retry, skip, or manually take over.

## 9. Pipeline

The system uses a semi-automatic pipeline. The default action is to run from the current state to `ARTIFACT_READY`. If a step fails, the task stops at the failure state and waits for user intervention.

Pipeline steps:

```text
clone
prepareContext
startAgents
dev
review
fixReview
test
commit
push
generateArtifact
```

Each step records:

- Status.
- Start time.
- End time.
- Output path.
- Error message.
- Log path.

## 10. Agent Orchestration

Each task owns one tmux session:

```text
tmux session: task-10001

window 1: claude-dev
window 2: codex-review
window 3: test-runner
window 4: shell
```

Responsibilities:

- Claude Code: development and bug fixing.
- Codex: code review, risk review, test gap review, final checks.
- System coordinator: prompt generation, terminal orchestration, test execution, Git operations, artifact generation.

The agents communicate through files rather than relying on free-form terminal chat:

```text
.task-meta/requirement.md
.task-meta/qa-feedback.md
.task-meta/skill-context.md
.task-meta/dev-summary.md
.task-meta/codex-review.md
.task-meta/review-fix-summary.md
.task-meta/test-result.md
.task-meta/final-report.md
```

## 11. Agent Collaboration Flow

Feature development:

```text
1. Claude reads requirement.md and skill-context.md.
2. Claude implements the task and writes dev-summary.md.
3. The system captures git diff.
4. Codex reviews the diff and writes codex-review.md.
5. Claude fixes review feedback and writes review-fix-summary.md.
6. The system runs configured tests.
7. Codex optionally performs a final check.
8. The system commits, pushes, and generates artifacts.
```

QA fix:

```text
1. The user imports QA feedback.
2. Codex analyzes qa-feedback.md and current code state.
3. Claude fixes the bug.
4. Codex reviews the fix.
5. The system runs tests.
6. The system commits, pushes, and generates artifacts.
```

## 12. Skill Profiles

Skills are stored under:

```text
~/ai-task-workbench/skills/
```

Skill profiles are configured in `config/skill-profiles.yaml`:

```yaml
profiles:
  fullstack-feature:
    - global/coding-standard.md
    - global/git-standard.md
    - workflow/feature-flow.md
    - review/review-standard.md

  qa-fix:
    - global/coding-standard.md
    - workflow/qa-fix-flow.md
    - review/bug-root-cause.md

  frontend:
    - global/coding-standard.md
    - frontend/react-standard.md

  backend:
    - global/coding-standard.md
    - backend/api-standard.md
```

The selected profile is rendered into:

```text
.task-meta/skill-context.md
```

Claude and Codex must read this file before acting.

## 13. Web Console Pages

MVP pages:

- Dashboard: all tasks, statuses, concurrency, failures, artifact-ready tasks.
- New Task: paste task requirement, Git repo, branch, task type, and skill profile.
- Task Detail: requirement, QA feedback, state, Git data, test result, artifact summary.
- Pipeline: step-by-step progress and controls.
- Terminal: Claude, Codex, Test, and Shell terminal views.
- Review: diff, Codex review, Claude fix summary, final checks.
- Artifacts: final report, commit hash, branch, submit text, copy actions.

## 14. API Draft

```text
POST   /api/tasks
GET    /api/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
POST   /api/tasks/:id/start
POST   /api/tasks/:id/pause
POST   /api/tasks/:id/resume
POST   /api/tasks/:id/retry-step
POST   /api/tasks/:id/qa-rounds

GET    /api/tasks/:id/pipeline
POST   /api/tasks/:id/pipeline/:step/run

GET    /api/tasks/:id/terminals
WS     /api/tasks/:id/terminals/:name

GET    /api/tasks/:id/diff
POST   /api/tasks/:id/review
POST   /api/tasks/:id/test
POST   /api/tasks/:id/commit
POST   /api/tasks/:id/push

GET    /api/tasks/:id/artifacts
POST   /api/tasks/:id/artifacts/generate

GET    /api/settings
PATCH  /api/settings
GET    /api/skills/profiles
```

## 15. Database Draft

```text
tasks
- id
- title
- type
- status
- phase
- repo_url
- workspace_path
- branch
- base_branch
- skill_profile
- created_at
- updated_at

qa_rounds
- id
- task_id
- round_number
- feedback_path
- status
- created_at
- updated_at

pipeline_steps
- id
- task_id
- step_name
- status
- started_at
- ended_at
- output_path
- error_message

agents
- id
- task_id
- role
- command
- tmux_session
- tmux_window
- status
- created_at
- updated_at

test_runs
- id
- task_id
- command
- status
- exit_code
- output_path
- started_at
- ended_at

artifacts
- id
- task_id
- branch
- commit_hash
- push_status
- test_status
- final_report_path
- submit_text
- created_at
```

## 16. Configuration Draft

```yaml
workspaceRoot: /home/you/ai-task-workbench/tasks

agents:
  claude:
    command: claude
    args: []
  codex:
    command: codex
    args: []

terminal:
  backend: tmux
  shell: /bin/bash

concurrency:
  maxAutoPipelines: 3
  maxClaudeAgents: 3
  maxCodexAgents: 3
  maxTestRunners: 2

git:
  defaultBaseBranch: main
  autoPush: true
  commitMessageTemplate:
    feature: "feat(task-{taskId}): {title}"
    fix: "fix(task-{taskId}): address QA feedback"

skills:
  root: /home/you/ai-task-workbench/skills
  defaultProfile: fullstack-feature

checks:
  autoDetect: true
  defaultCommands:
    node:
      install: "pnpm install"
      lint: "pnpm lint"
      test: "pnpm test"
      build: "pnpm build"
```

## 17. Artifact Format

The system generates:

```text
.task-meta/final-report.md
.task-meta/artifacts.json
```

Example `final-report.md`:

```markdown
# Task 10001 Delivery Report

## Task Info
Title: User login feature
Type: feature
Workspace: /home/you/ai-task-workbench/tasks/task-10001-login/repo

## Git Info
Repository: git@example.com:xxx/login.git
Branch: task/10001-login
Commit: abc1234
Push: completed

## Completed Work
- Implemented login form.
- Implemented error handling.
- Implemented login state persistence.

## Test Result
- lint: passed
- test: passed
- build: passed

## Review Result
Codex review completed. Blocking issues were fixed.

## Website Submission Text
Branch: task/10001-login
Commit: abc1234
Summary: Login feature completed and tests passed.
```

Example `artifacts.json`:

```json
{
  "taskId": "10001",
  "title": "User login feature",
  "type": "feature",
  "repo": "git@example.com:xxx/login.git",
  "branch": "task/10001-login",
  "commit": "abc1234",
  "pushStatus": "pushed",
  "testStatus": "passed",
  "submitText": "Branch: task/10001-login\nCommit: abc1234\nSummary: Login feature completed and tests passed."
}
```

## 18. MVP Acceptance Criteria

- A user can create a task by pasting requirements.
- The system can clone an independent Git repository.
- The system can create `.task-meta/requirement.md` and `.task-meta/skill-context.md`.
- The system can start Claude, Codex, Test, and Shell tmux windows.
- The web UI can show terminal output.
- The user can start a semi-automatic pipeline.
- Codex can review the current diff.
- The system can run configured checks and save results.
- The system can commit and push.
- The system can generate `final-report.md` and `artifacts.json`.
- Multiple tasks can run concurrently without sharing workspaces.
- A failed task can be paused, retried, or manually taken over.
