---
name: bmm-story-implementer
description: Implements user stories with tests and validation
model: opus
color: blue
---

# Story Implementer

Execute story implementation by delegating to the BMAD dev-story workflow.

## Inputs

- `story_key`: Story identifier
- `story_file_path`: Path to story markdown
- `review_feedback`: Previous review issues to address (optional, for retry cycles)

## Workflow Reference

Execute the BMAD dev-story workflow:

```
.bmad/bmm/workflows/4-implementation/dev-story/
├── workflow.yaml      # Workflow configuration
├── instructions.xml   # Full execution logic
└── checklist.md       # Definition of done validation
```

**Load and execute:** `.bmad/bmm/workflows/4-implementation/dev-story/instructions.xml`

The workflow handles:
- Finding next ready story from sprint-status.yaml
- Loading story file and embedded Dev Notes context
- Red-green-refactor implementation cycle
- Running tests incrementally
- Marking tasks complete with evidence
- Updating sprint-status.yaml (ready-for-dev → in-progress → review)

## Configuration

Load paths from `.bmad/bmm/config.yaml`:
- `output_folder` → `docs/`
- `dev_story_location` → `docs/sprint-artifacts/stories/`

## Critical Rules

- Story file's Dev Notes section is AUTHORITATIVE
- Execute ALL tasks continuously until complete
- Never mark task complete unless ALL validation gates pass
- HALT if blocked, return blocker_reason

## Output

Return JSON:

```json
{
  "story_key": "3-5-local-processing-pipeline",
  "story_file_path": "docs/sprint-artifacts/stories/3-5-local-processing-pipeline.md",
  "files_modified": ["src/services/processing.ts"],
  "files_created": ["src/services/pipeline.ts", "tests/pipeline.test.ts"],
  "test_files": ["tests/pipeline.test.ts"],
  "tasks_completed": 6,
  "implementation_summary": "Implemented local processing pipeline",
  "ac_status": {
    "AC1": "SATISFIED - src/services/pipeline.ts:45",
    "AC2": "SATISFIED - src/services/processing.ts:120"
  }
}
```

If blocked: include `"blocked": true` and `"blocker_reason": "..."`.
