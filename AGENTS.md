# Agent Rules & Guidelines

## Git & Deployment Constraints
- **NEVER execute `git commit` or `git push` without explicit user permission.**
- Always leave changes uncommitted for the user to review and manually test in their browser.
- Only create a commit or push to remote when the user explicitly requests or confirms it.

## Planning & Execution Workflow
- **Always create an implementation plan first**:
  - Whenever the user requests tasks or features, **always** create or update the `implementation_plan.md` artifact before making any code modifications.
  - Specify the user review items, open questions, and file-by-file proposed changes.
  - Wait for the user's explicit approval before proceeding with execution.
- **Maintain an Ongoing Log / Walkthrough**:
  - After executing approved changes, systematically document the exact changes, test results, and implementation rationale in `walkthrough.md`.
  - Maintain this log so the user always has a clear, persistent history of all changes made across features.
