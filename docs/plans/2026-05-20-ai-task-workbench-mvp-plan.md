# AI Task Workbench MVP Implementation Plan

Date: 2026-05-20

## Goal

Build the first usable version of AI Task Workbench: a local Ubuntu single-user web app that lets the user manually import task requirements or QA feedback, create an isolated Git workspace, run Claude Code and Codex in task-specific terminals, coordinate a semi-automatic develop-review-test-commit-push pipeline, and generate final submission artifacts.

## Non-Goals

- Do not automate login to the external task website.
- Do not scrape tasks or QA feedback from the website.
- Do not submit back to the website automatically.
- Do not support multiple users.
- Do not support remote execution.

## Phase 0: Project Bootstrap

### Tasks

- Create pnpm monorepo.
- Add `apps/web` for React + Vite.
- Add `apps/server` for Fastify + TypeScript.
- Add `packages/shared` for shared types.
- Add `packages/core` for state machine, pipeline, and shared backend logic.
- Add base lint, format, and TypeScript configs.

### Verification

- `pnpm install` succeeds.
- `pnpm -r typecheck` succeeds.
- Web dev server starts.
- Backend dev server starts.

## Phase 1: Configuration and Runtime Directories

### Tasks

- Add `config/app.config.yaml`.
- Add `config/skill-profiles.yaml`.
- Implement config loader.
- Implement runtime directory creation for:
  - `~/ai-task-workbench/`
  - `~/ai-task-workbench/tasks/`
  - `~/ai-task-workbench/skills/`
- Add validation for required commands: `git`, `tmux`, `claude`, `codex`.

### Verification

- Starting the server creates missing runtime directories.
- Invalid config returns a clear startup error.
- Missing command checks produce actionable diagnostics.

## Phase 2: Database and Task Model

### Tasks

- Add SQLite database.
- Add ORM schema for:
  - `tasks`
  - `qa_rounds`
  - `pipeline_steps`
  - `agents`
  - `test_runs`
  - `artifacts`
- Implement migrations.
- Implement task repository functions.
- Add task statuses and pipeline step statuses as shared constants.

### Verification

- Database file is created at the configured location.
- Migrations run successfully.
- A task can be created, listed, read, and updated through repository functions.

## Phase 3: Task Creation API and UI

### Tasks

- Implement `POST /api/tasks`.
- Implement `GET /api/tasks`.
- Implement `GET /api/tasks/:id`.
- Implement `PATCH /api/tasks/:id`.
- Build Dashboard page.
- Build New Task page.
- Build Task Detail page skeleton.
- Support task fields:
  - title
  - type
  - repo URL
  - base branch
  - target branch
  - skill profile
  - requirement markdown

### Verification

- A user can create a task from the UI.
- Created tasks appear on the dashboard.
- Task detail displays the pasted requirement.

## Phase 4: Workspace Manager

### Tasks

- Implement workspace slug generation.
- Create per-task directories.
- Write `.task-meta/task.json`.
- Write `.task-meta/requirement.md`.
- Write `.task-meta/qa-feedback.md` when applicable.
- Implement Git clone into `repo/`.
- Implement branch checkout/create.
- Implement status transitions:
  - `READY`
  - `CLONING`
  - `WORKSPACE_READY`
  - `FAILED_CLONE`

### Verification

- A task can clone an independent repository into its workspace.
- Required `.task-meta` files are created.
- Clone failures are recorded and visible.

## Phase 5: Skill Manager and Context Generation

### Tasks

- Load `skill-profiles.yaml`.
- Resolve skill files from configured skills root.
- Concatenate selected skill files into `.task-meta/skill-context.md`.
- Generate `.task-meta/claude-prompt.md`.
- Generate `.task-meta/codex-prompt.md`.
- Implement status transitions:
  - `CONTEXT_READY`
  - `FAILED_CONTEXT`

### Verification

- A selected skill profile generates a deterministic `skill-context.md`.
- Missing skill files produce clear errors.
- Generated prompts reference the correct task files.

## Phase 6: tmux Agent Orchestration

### Tasks

- Implement tmux session wrapper.
- Create one session per task.
- Create windows:
  - `claude-dev`
  - `codex-review`
  - `test-runner`
  - `shell`
- Start each window in the task repo directory.
- Record agent metadata in the database.
- Implement status transitions:
  - `AGENTS_READY`
  - `FAILED_AGENT_START`

### Verification

- Starting agents creates a tmux session and all expected windows.
- The user can attach manually with `tmux attach -t task-<id>`.
- Re-running agent startup is idempotent or clearly reports existing sessions.

## Phase 7: Web Terminal

### Tasks

- Add WebSocket endpoint for terminal output.
- Stream tmux pane output or attach through pty.
- Add xterm.js terminal component.
- Add Terminal page with tabs:
  - Claude
  - Codex
  - Test
  - Shell
- Support sending input from the browser to the selected terminal.

### Verification

- Terminal output is visible in the browser.
- Commands typed in the browser are sent to the correct tmux window.
- Switching tabs does not mix terminal streams.

## Phase 8: Git and Diff Operations

### Tasks

- Implement Git status API.
- Implement Git diff API.
- Implement commit function.
- Implement push function.
- Add UI panels for status and diff.
- Add status transitions:
  - `COMMITTING`
  - `COMMITTED`
  - `FAILED_COMMIT`
  - `PUSHING`
  - `PUSHED`
  - `FAILED_PUSH`

### Verification

- Git status and diff are visible in the UI.
- Commit creates a real commit.
- Push sends the branch to the configured remote.
- Failures are recorded with command output.

## Phase 9: Test Runner

### Tasks

- Implement test command configuration.
- Add simple auto-detection for Node projects:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
- Allow custom commands per task.
- Run commands in the task repo directory.
- Save output to `.task-meta/test-result.md` and `.task-meta/logs/test.log`.
- Add status transitions:
  - `TESTING`
  - `TEST_PASSED`
  - `FAILED_TEST`

### Verification

- Configured commands run from the UI.
- Passing and failing results are recorded correctly.
- The final report can consume the latest test result.

## Phase 10: Pipeline Engine

### Tasks

- Implement step runner abstraction.
- Implement steps:
  - `clone`
  - `prepareContext`
  - `startAgents`
  - `dev`
  - `review`
  - `fixReview`
  - `test`
  - `commit`
  - `push`
  - `generateArtifact`
- Add controls:
  - start
  - pause
  - resume
  - retry current step
  - run single step
  - mark needs human
- Add pipeline UI.

### Verification

- A task can run from `READY` to the next blocking step.
- Pause prevents subsequent steps from starting.
- Retry reruns the current failed step.
- Step status is visible and persisted.

## Phase 11: Agent Prompt Commands

### Tasks

- Send generated Claude prompt to `claude-dev` window.
- Send generated Codex prompt to `codex-review` window.
- Add review trigger that asks Codex to inspect current diff and write `.task-meta/codex-review.md`.
- Add review-fix trigger that asks Claude to read `.task-meta/codex-review.md` and fix issues.
- Add timeout handling and manual takeover status.

### Verification

- Claude receives the development prompt in its terminal.
- Codex receives the review prompt in its terminal.
- Review output path is checked after review completion.
- Missing output moves task to a recoverable failure state.

## Phase 12: Artifact Generator

### Tasks

- Collect task metadata.
- Collect Git branch and commit hash.
- Collect push status.
- Collect latest test result.
- Collect review summary.
- Generate `.task-meta/final-report.md`.
- Generate `.task-meta/artifacts.json`.
- Add `GET /api/tasks/:id/artifacts`.
- Add Artifacts UI with copyable submit text.
- Add status transitions:
  - `ARTIFACT_GENERATING`
  - `ARTIFACT_READY`
  - `FAILED_ARTIFACT`

### Verification

- Final report is generated for a completed task.
- `artifacts.json` contains repo, branch, commit, push status, test status, and submit text.
- The UI can copy submit text.

## Phase 13: QA Fix Rounds

### Tasks

- Add `POST /api/tasks/:id/qa-rounds`.
- Add UI to paste QA feedback.
- Save feedback to `.task-meta/qa-feedback.md`.
- Create new fix branch naming default: `fix/{taskId}-qa-{round}`.
- Run QA fix pipeline with QA-specific prompts and skill profile.

### Verification

- A user can attach QA feedback to an existing task.
- The system can generate QA fix context.
- The pipeline can run a QA fix round and generate a new artifact.

## Phase 14: Multi-Task Concurrency

### Tasks

- Add concurrency configuration.
- Implement in-process task queue for auto pipelines.
- Limit active pipelines, Claude agents, Codex agents, and test runners.
- Show queue/running state on Dashboard.

### Verification

- Multiple tasks can be queued.
- At most the configured number of pipelines run concurrently.
- Tasks remain isolated by directory and tmux session.

## Phase 15: Hardening and MVP Polish

### Tasks

- Add structured logging.
- Add safe command execution helpers.
- Add clear error messages.
- Add confirmation for risky actions.
- Add empty states and loading states.
- Add basic README with setup instructions.
- Add smoke test script.

### Verification

- A clean Ubuntu machine can follow the README and start the app.
- The smoke test creates a task, prepares a workspace, starts tmux windows, and generates metadata.
- Failure states are understandable from the UI.

## MVP Acceptance Checklist

- Create task from pasted requirement.
- Clone one independent Git repository per task.
- Generate `.task-meta/requirement.md`.
- Generate `.task-meta/skill-context.md`.
- Start Claude, Codex, Test, and Shell tmux windows per task.
- View terminal output in Web UI.
- Trigger semi-automatic pipeline.
- Trigger Codex review of current diff.
- Run test commands and save output.
- Commit and push.
- Generate final report and artifacts JSON.
- Copy website submission text.
- Run multiple tasks concurrently without workspace conflicts.
- Pause, resume, retry, and manually take over failed tasks.

## Suggested First Development Slice

Build the smallest vertical slice first:

```text
New Task UI
  -> create task in SQLite
  -> create workspace and .task-meta/requirement.md
  -> clone repo
  -> create tmux session with four windows
  -> show task status on Dashboard
```

This slice proves the foundation before adding AI prompt orchestration, review, tests, Git commit, and artifact generation.
