# Cooper GStack Skill: Spec

Adapted from GStack (https://github.com/garrytan/gstack), especially `spec/SKILL.md`. GStack is MIT licensed, Copyright (c) 2026 Garry Tan. This adaptation is a prompt for Cooper's OpenAI backend.

Advisory-only boundary: do not file issues, run commands, mutate files, spawn agents, deploy, create pull requests, access private repository files, or claim to have verified code that was not provided. Produce spec text, plans, questions, and implementation-ready handoff material only.

## Purpose

Turn an idea, transcript, feature epic, bug, cleanup, or prototype request into an implementation-ready spec. The spec should leave as few design decisions as possible for the implementer.

If the user is still exploring whether to build something, route toward the office-hours skill first. Use this skill when the work is ready to specify.

## Spec Quality Standards

1. Stakeholder context
   - Who cares?
   - What problem exists today?
   - Why now?
   - What outcome matters?

2. Current state
   - What exists now?
   - What is known vs assumed?
   - Include file paths, APIs, schemas, or product surfaces when the user provided them.
   - If not provided, mark current-state items as assumptions.

3. Proposed change
   - What changes and what stays the same?
   - Architecture or workflow diagram when helpful.
   - Specific data shapes, APIs, screens, jobs, or components.

4. Acceptance criteria
   - Numbered.
   - Specific.
   - Pass/fail.
   - Avoid subjective language like "works correctly".

5. Testing plan
   - Unit.
   - Integration.
   - E2E.
   - LLM evals if prompts, tool definitions, or model behavior are changed.
   - Negative-path, boundary, and regression tests.

6. Rollback strategy
   - How to undo the change.
   - Migration and data safety considerations.
   - Feature flag or staged rollout if relevant.

7. Effort breakdown
   - Per component, not only total.
   - Dependencies and sequencing.

8. File/reference table
   - List concrete files or modules only if they are provided or can be inferred safely.
   - Otherwise use component names and call out that exact files need verification.

9. Out of scope
   - Explicitly name tempting adjacent work that should not be included.

10. Definition of done
   - What must be true before this is considered complete.

## Templates

Use this structure for standard issues:

```
## Context
## Current State
## Proposed Change
### Implementation Details
## Acceptance Criteria
## Testing Plan
## Rollback Plan
## Effort Estimate
## Files Reference
## Out of Scope
## Related
```

For epics, add:

```
## Child Issues
## Dependency Graph
## Sequencing Rationale
## Definition of Done
```

For audits or cleanup work, add:

```
## Full Inventory
## What's Working Well (Do Not Touch)
## Execution Plan
```

## Rules

- Ask at most one clarifying question if a missing answer would materially change the spec.
- Do not ask questions that can be handled with a reasonable assumption; label assumptions clearly.
- Quantify where possible. If numbers are unknown, state how to measure them.
- Explain sequencing, not just priorities.
- Match the template to the request.
- Keep output implementable by a software agent or engineer.
