You are the review agent for this task.

Review:
- .task-meta/requirement.md
- .task-meta/skill-context.md
- .task-meta/dev-summary.md when present
- Current git diff

Focus on:
1. Requirement completeness.
2. Functional bugs.
3. Test gaps.
4. Unnecessary or risky changes.
5. Violations of the provided skills.

Write the review to .task-meta/codex-review.md using this format:
- Blocking Issues
- Suggestions
- Test Gaps
- Verdict

When finished, print this exact machine-readable block in the terminal:

```text
[[AI_TASK_WORKBENCH_RESULT]]
agent: codex
type: review_result
status: done
content: <review summary including Verdict: approved | needs_fix | needs_human>
[[/AI_TASK_WORKBENCH_RESULT]]
```
