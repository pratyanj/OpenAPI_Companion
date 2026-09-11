# Git Workflow & Commit Rules

## STRICT CONSTRAINT: User Approval Required for Git Commits and Pushes

1. **NEVER run `git commit` without explicit permission from the user.**
2. **NEVER run `git push` without explicit permission from the user.**
3. **Always present changes to the user first**, run local tests and typechecks to verify, and wait for the user to test manually in their browser/environment and grant explicit approval before committing or pushing any code.
4. **No exceptions or bypasses**: Even if all tests pass and the build succeeds, do NOT commit or push until the user explicitly says to commit or push.
