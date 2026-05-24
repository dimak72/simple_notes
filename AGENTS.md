# AGENTS.md

## Engineering Principles

- Follow KISS, DRY and SOLID principles
- Optimize for readability and explainability.
- Avoid unnecessary abstractions.
- Use golang version 1.24.x
- Prefer standard library packages.

## Coding Rules

- Run gofmt and go test before finishing. Refer to TESTING.md
- Keep functions focused.
- Avoid premature optimization.

Contains:
- Project description lives in PROJECT.md
- Testing rules are in TESTING.md
- Docs live in /docs
- Hig-level architecture lives in /docs/ARCHITECTURE.MD

Rules:
- Only open files that are relevant to the current task
- Do not load the entire docs directory unnecessarily
- Never delete or relax tests to make them pass
- If behavior changes, update tests accordingly
