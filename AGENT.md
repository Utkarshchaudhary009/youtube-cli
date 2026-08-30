# AGENT.md

## Project

`youtube-cli` is a minimal, agent-first CLI for searching, exploring, and extracting knowledge from YouTube with an exceptionally clean terminal UX.

The project exists to create a simple and reliable interface between AI agents and YouTube. It should make YouTube information easy to discover, retrieve, understand, and consume programmatically without introducing unnecessary complexity.

## Product & UX Principles

The UX is a first-class part of the product.

The CLI should feel **instant, minimal, predictable, and terminal-native**. There should be zero unnecessary configuration, clutter, or ceremony. Output should be beautifully structured so humans can scan it quickly while remaining easy for AI agents to consume.

Design every command with two users in mind:

- **Humans:** clean, concise, readable terminal output.
- **Agents:** deterministic behavior, predictable structure, and machine-readable output through `--json`.

Prefer smart defaults over flags and configuration. Errors must be clear, actionable, and useful—never raw stack traces or vague failures unless debugging explicitly requires them.

## Engineering Principles

Always prefer:

1. **Simple implementations** over clever implementations.
2. **Reliable behavior** over feature breadth.
3. **Small, understandable abstractions** over unnecessary architecture.
4. **Clear errors** over silent failures.
5. **Tests** over assumptions.
6. **End-to-end verification** over believing that unit tests alone are sufficient.

Do not add complexity unless the problem genuinely requires it.

When there are multiple technically valid approaches, choose the simplest approach that is reliable, maintainable, and consistent with the existing project.

## The Single Source of Truth: `doc/plan.md`

**`doc/plan.md` is the single source of truth for implementation.**

The entire project plan is maintained in:

```text
doc/plan.md
```

The plan is divided into **phases**. Each phase represents a specific, independently implementable piece of the project.

### Non-negotiable rule

**Never start implementing code for a phase until `doc/plan.md` accurately describes what is supposed to be built.**

If requirements, architecture, UX, scope, or implementation details change:

1. Stop.
2. Update `doc/plan.md` first.
3. Review the updated plan.
4. Only then implement the code.

Do not allow the codebase and `plan.md` to drift apart.

The plan comes before the code.

## Phase Development Flow

Every phase follows the same lifecycle.

### 1. Plan

Read the relevant phase in `doc/plan.md`.

If anything is unclear, incomplete, outdated, or needs to change, modify `doc/plan.md` before writing implementation code.

### 2. Code

Implement only the current phase.

Keep the implementation focused on the requirements defined in the plan. Avoid prematurely implementing future phases or unrelated improvements.

Write **lots of useful tests**. Tests are part of the implementation, not an afterthought.

Keep all existing tests up to date as the code evolves.

### 3. Review Agent

After implementation, launch a review agent.

The review must check for:

- Bugs
- Incorrect behavior
- Missing edge cases
- Reliability problems
- Poor or unnecessarily complex implementation
- Incorrect error handling
- UX inconsistencies
- Missing or inadequate tests
- Regressions

Fix genuine issues found during the review.

Do not blindly apply review feedback; determine whether each finding is actually valid.

### 4. End-to-End Test

Test the completed phase **end-to-end**, using the actual user-facing interface wherever possible.

Verify that the feature works as a user or AI agent would actually use it.

Unit tests passing is not enough.

### 5. Commit and Pull Request

Once the phase passes review and end-to-end testing:

1. Create a new branch for the phase.
2. Commit the implementation and tests.
3. Push the branch.
4. Create a pull request.
5. Wait approximately **10 minutes** for GitHub bots/automated reviewers to provide feedback.

The PR should represent one coherent phase of work.

### 6. Review GitHub Bot Feedback

After the waiting period, inspect the automated reviews.

For every finding:

- Determine whether it is a genuine issue.
- Fix genuine issues.
- Ignore incorrect or irrelevant feedback.
- Keep the implementation simple.

After making fixes, run the relevant tests and perform end-to-end testing again.

### 7. Final Commit and Verification

If changes were required:

1. Commit the fixes.
2. Run the full relevant test suite.
3. Run end-to-end testing again.
4. Verify the feature still matches `doc/plan.md`.
5. Allow another approximately **10-minute** review window when appropriate.
6. Address any new genuine issues using the same process.

A phase is complete only when the implementation, tests, UX, and `doc/plan.md` are all in agreement.

## Testing

Testing is a continuous part of development.

Write comprehensive tests for:

- Core behavior
- Edge cases
- Error conditions
- CLI commands
- Output formatting
- JSON output
- Integration behavior
- End-to-end user flows

**Keep tests up to date.**

Whenever behavior changes, update the relevant tests in the same change. Never leave tests describing an outdated version of the product merely because they still pass.

Prefer many focused tests over a small number of vague tests.

## Definition of Done

A phase is not done merely because the code works locally.

A phase is done when:

- The implementation matches `doc/plan.md`.
- The UX is simple and consistent.
- Errors are clear and actionable.
- Tests are comprehensive and passing.
- Review-agent feedback has been evaluated.
- End-to-end testing has passed.
- The code has been committed on its own branch.
- A PR has been created.
- GitHub automated review feedback has been evaluated.
- Any genuine issues have been fixed and re-tested.

## Core Rule

**Plan first. Build simply. Test thoroughly. Review critically. Verify end-to-end. Keep the plan, code, and tests in sync.**

When in doubt, optimize for **simplicity, reliability, excellent UX, and correctness** rather than adding more functionality.
