You are performing the final check before commit and push.

Review:
- Current git diff
- .task-meta/test-result.md
- .task-meta/codex-review.md
- .task-meta/review-fix-summary.md

Write a concise verdict to .task-meta/final-check.md.

When finished, print this exact machine-readable block in the terminal:

```text
[[AI_TASK_WORKBENCH_RESULT]]
agent: codex
type: review_result
status: done
content: <final check summary including Verdict: approved | needs_fix | needs_human>
[[/AI_TASK_WORKBENCH_RESULT]]
```
