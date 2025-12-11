---
description: 'Automated story lifecycle: create, implement, and review one story end-to-end automatically'
---

# auto-story

You are orchestrating the complete story lifecycle from creation through code review. This workflow executes 3 specialized sub-agents in sequence, automatically proceeding through phases unless issues require user intervention.

## Workflow Overview

Execute the following phases in order, continuing automatically unless issues arise:

### Phase 1: Story Creation
1. Invoke the `bmm-story-creator` sub-agent using the Task tool
2. The sub-agent will execute the BMAD create-story workflow
3. It will return: story key, file path, status, ac_count
4. Log the story key for use in subsequent phases
5. **Auto-proceed** to Phase 2 (no checkpoint)

### Phase 2: Story Implementation
1. Invoke the `bmm-story-implementer` sub-agent using the Task tool
2. The sub-agent will execute the BMAD dev-story workflow
3. It will continuously implement until complete (no pausing)
4. It will return: implementation summary, files changed, test results, AC status
5. **Auto-proceed** to Phase 3 (no checkpoint)

### Phase 3: Code Review
1. Invoke the `bmm-story-reviewer` sub-agent using the Task tool
2. The sub-agent will execute the BMAD code-review workflow
3. It will return: review outcome (APPROVED/APPROVED_WITH_IMPROVEMENTS/CHANGES REQUESTED/BLOCKED), issues, action items
4. **CONDITIONAL CHECKPOINT** based on outcome:

   **If APPROVED**:
   - Present success summary: "Story approved! All acceptance criteria validated. Story is complete and ready for deployment."
   - Workflow complete successfully

   **If APPROVED_WITH_IMPROVEMENTS**:
   - Present MEDIUM issues found
   - Log: "Minor improvements needed. Auto-looping back to implementation to fix MEDIUM issues."
   - **Auto-proceed** to Phase 2 (story-implementer will detect review follow-ups and fix MEDIUM issues)
   - After fixes, automatically return to Phase 3 for re-review
   - No user intervention required

   **If CHANGES REQUESTED**:
   - Present action items clearly organized by severity (CRITICAL/HIGH issues found)
   - Explain that story has been cycled back to in-progress status
   - Ask: "Changes requested by code review. Loop back to implementation to address issues? (yes/no)"
   - If yes: Return to Phase 2 (story-implementer will detect review follow-ups)
   - If no: HALT workflow with status "Changes requested - manual intervention needed"

   **If BLOCKED**:
   - Present blocker details
   - HALT workflow with status "Blocked - external dependency or issue requires resolution"

## Critical Instructions

**Sub-Agent Invocation**:
- Use the Task tool with appropriate `subagent_type` parameter
- Pass clear prompts explaining what the sub-agent should do
- Example:
  ```
  Task tool:
  - subagent_type: "bmm-story-creator"
  - prompt: "Execute create-story workflow autonomously for the next backlog story. Return structured results including story key, file path, and summary."
  ```

**Automatic Flow**:
- Continue automatically through phases unless issues arise
- Log progress as each phase completes
- Only pause for user input when review problems occur
- Present summaries at natural stopping points (review outcomes)

**Conditional Checkpoints** (only stop when):
- Code review returns CHANGES REQUESTED or BLOCKED
- Any sub-agent returns an error

**Error Handling**:
- If any sub-agent fails, HALT immediately
- Report which phase failed and what error occurred
- Do not attempt to proceed to next phase

**One Story at a Time**:
- This workflow processes ONE story from start to finish
- To process multiple stories, run the workflow multiple times
- Each run is independent and complete

**State Tracking**:
- Track story key across all phases
- Reference the same story throughout the workflow
- Verify each phase operates on the correct story

## Expected Sub-Agent Outputs

Each sub-agent will return structured results. Look for these key fields:

**story-creator**: story_key, story_file_path, status, title, ac_count, task_count
**story-implementer**: story_key, status_update, ac_status, files_created, files_modified, test_files
**story-reviewer**: story_key, outcome (APPROVED/APPROVED_WITH_IMPROVEMENTS/CHANGES REQUESTED/BLOCKED), issues, summary, ac_status, task_status

Parse these outputs and log progress as the workflow advances automatically.

## Workflow Success Criteria

The workflow runs automatically and is successful when:
1. Story created with embedded context ✅
2. Story implemented with all ACs satisfied ✅
3. Code review APPROVED with no CRITICAL/HIGH issues ✅
4. MEDIUM issues auto-fixed (if any) via automatic implementation loop ✅
5. Story status updated to "done" in sprint-status.yaml ✅

Present a final summary showing all phases completed successfully.

**Automatic Loops**:
- MEDIUM issues: Auto-loop to implementation, no user input needed
- CRITICAL/HIGH issues from review: Ask user to continue or abort
