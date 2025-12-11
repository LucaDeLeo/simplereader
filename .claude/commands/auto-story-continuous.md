---
description: 'Continuous autonomous story execution with checkpoint/resume support'
---

# auto-story-continuous

Process pending stories sequentially: create, implement, review, commit. Halt on failure with detailed report.

## Core Principles

1. **Autonomous execution** - Make decisions without prompting for confirmation
2. **Checkpoint after each phase** - Enable crash recovery
3. **Verify before review** - Tests, types, lint must pass
4. **Commit after each success** - Atomic commits with push
5. **Halt on failure** - Write detailed report, stop immediately

<default_to_action>
Implement changes autonomously. Infer intent and proceed. Use tools to discover missing details rather than asking.
</default_to_action>

## Orchestrator Role

You coordinate sub-agents but do not perform detailed work yourself.

**You handle:**
- Reading: `sprint-status.yaml`, tracking files, checkpoints (small files only)
- Bash: Git commands, verification commands (`bun test`, `cargo test`, etc.)
- Task: Invoke sub-agents for all substantive work
- Write: Only tracking files and failure reports

**Sub-agents handle:**
- Reading large docs (PRD, architecture, epics)
- Creating stories with embedded context
- Writing code and tests
- Code review

Before each sub-agent call, output: `→ {agent} | {description}`

## Sub-Agents

All agents invoked via Task tool with appropriate `subagent_type`.

| Agent | Purpose | Key Inputs | Returns (JSON) |
|-------|---------|------------|----------------|
| bmm-story-creator | Create story with context | story_key, epic_id, validation_issues? | `{story_file_path, title, ac_count, status}` |
| bmm-story-validator | Validate and improve story | story_key, story_file_path | `{validation_result, issues_found, issues_fixed, status}` |
| bmm-story-implementer | Write code + tests | story_key, story_file_path, feedback? | `{files_modified, files_created, test_files}` |
| bmm-story-reviewer | Code review | story_key, story_file_path | `{outcome, issues, summary}` |

## Paths

- Sprint status: `docs/sprint-artifacts/sprint-status.yaml`
- Stories: `docs/sprint-artifacts/stories/{story_key}.md`
- Tracking: `docs/sprint-artifacts/continuous-run-{timestamp}.yaml`

## Story Validation Heuristics

When the validator returns issues after story creation:

- **No issues / low only** → Proceed to implementation
- **Medium or higher** → Call bmm-story-creator to fix specific issues, then revalidate (max 3 cycles)
- **Repeated same failure** → Likely systemic, halt with diagnosis

**Critical:** ALL validation issues must be resolved before proceeding to implementation.

## Code Review Heuristics

When a reviewer returns issues after implementation:

- **No issues / low only** → Proceed (APPROVED)
- **Medium only** → Auto-fix once, proceed (APPROVED_WITH_IMPROVEMENTS)
- **High/critical** → Fix with implementer, re-review (max 3 cycles)
- **Repeated same failure** → Likely systemic, halt with diagnosis

## Workflow

### 1. Pre-Flight
```
Read sprint-status.yaml
Run: git status && git branch --show-current
Create tracking file: continuous-run-{YYYYMMDD-HHMMSS}.yaml
Check for existing checkpoint → resume if found
```

### 2. Build Queue
```
Filter stories: status NOT "done", status IN [ready-for-dev, in-progress, review, drafted, backlog]
Skip entries starting with "epic-" or ending with "-retrospective"
Sort: ready-for-dev > in-progress > review > drafted > backlog
```

### 3. Process Each Story

For each story, extract epic_id from story_key (e.g., "3-5-foo" → epic "3").

**Story Creation + Validation Loop** (max 3 cycles): If story status is "backlog" or "drafted":
1. → bmm-story-creator | Create story with embedded context (or fix issues if retry)
2. → bmm-story-validator | Validate story quality
3. Apply story validation heuristics:
   - If no issues or low only → break loop, proceed
   - If medium or higher → pass issues to bmm-story-creator, loop back to step 1
4. Update sprint-status: {story_key} → "ready-for-dev"

**Implementation + Review Loop** (max 3 cycles):
1. → bmm-story-implementer | Implement (pass feedback if retry)
2. Update sprint-status: {story_key} → "in-progress"
3. Run verification gates:
   - Typecheck: `bun typecheck` or `cargo check`
   - Tests: `bun test` or `cargo test`
   - Lint: `bun lint` or `cargo clippy`
4. If gates fail → loop back to implementer with errors
5. → bmm-story-reviewer | Review
6. Update sprint-status: {story_key} → "review"
7. Apply validation heuristics on review outcome
8. If approved → break loop

**On Success:**
```bash
git add -A
git commit -m "[Story {story_key}] {title}

{summary}

Co-Authored-By: Claude <noreply@anthropic.com>"
git push
```
Update sprint-status: {story_key} → "done"
Clear checkpoint.

**On Failure:**
Write failure report to `docs/sprint-artifacts/failure-report-{story_key}-{timestamp}.md`:
- Phase, attempts, error messages
- Files modified before failure
- Root cause analysis
- Resume instructions

Output: `HALTED: {story_key} failed at {phase}. Report: {path}`
Stop execution immediately.

### 4. Final Report
```
COMPLETE | {N} stories | {commits} commits
Stories: {story_key} (commit), ...
Log: {tracking_file}
```

## Checkpointing

Save after each phase to tracking file:
```yaml
checkpoint:
  story_key: "3-5-local-processing"
  phase: "create"  # create | validate | implement | verify | review
  saved_at: "2025-12-06T10:30:00Z"
  data:
    story_file_path: "..."
    review_cycles: 0
```

On resume: Skip completed phases, continue from checkpoint.phase.

## Example: Successful Story

```
Found 2 pending stories:
  1. 3-5-local-processing (backlog)
  2. 3-6-depth-export (backlog)

Story 1/2: 3-5-local-processing
  → bmm-story-creator | Create story with context for 3-5
    Result: 3-5-local-processing.md, 4 ACs
  → bmm-story-validator | Validate story (cycle 1)
    Result: 2 medium issues (missing arch constraints, wrong lib version)
  → bmm-story-creator | Fix validation issues
    Result: updated story with fixes
  → bmm-story-validator | Validate story (cycle 2)
    Result: PASSED, no medium+ issues
  Status: 3-5-local-processing → ready-for-dev

  → bmm-story-implementer | Implement (cycle 1)
  Verification: typecheck OK, tests OK, lint OK
  → bmm-story-reviewer | Review
    Result: APPROVED, 1 low issue
  Status: 3-5-local-processing → done

  git commit -m "[Story 3-5] Local processing pipeline..."
  git push ✓

Story 2/2: 3-6-depth-export
  ...

COMPLETE | 2 stories | 2 commits
```

---

Begin: Read sprint-status.yaml, create tracking file, build queue.
