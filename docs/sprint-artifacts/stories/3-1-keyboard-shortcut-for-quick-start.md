# Story 3.1: Keyboard Shortcut for Quick Start

## Story Info

| Field | Value |
|-------|-------|
| Epic | 3 - Playback Controls & Mini-Player |
| Story ID | 3-1 |
| Story Key | 3-1-keyboard-shortcut-for-quick-start |
| Status | ready-for-dev |
| Created | 2025-12-12 |

---

## User Story

As a user,
I want to start/stop playback with a keyboard shortcut,
So that I can control the extension without using my mouse.

---

## Context & Background

This is the **first story in Epic 3**, extending the playback controls established in Story 2-7. The keyboard shortcut provides a hands-free way to toggle playback from any webpage without needing to click the extension icon or open the popup.

### What Exists

From **Story 2-7** (`entrypoints/background.ts`):
```typescript
// Toggle playback based on current state
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  switch (playback.state) {
    case 'stopped':
      await startPlayback(tab.id);
      break;
    case 'playing':
      pausePlayback();
      break;
    case 'paused':
      resumePlayback();
      break;
    case 'loading':
      console.log('[SimpleReader] Already loading, ignoring click');
      break;
  }
});
```

The toggle logic already exists - we just need to wire it to a keyboard shortcut.

### Chrome Extension Commands API

Chrome extensions register keyboard shortcuts via the `commands` manifest key:

```json
{
  "commands": {
    "toggle-playback": {
      "suggested_key": {
        "default": "Alt+Shift+P"
      },
      "description": "Toggle playback (start/pause)"
    }
  }
}
```

Then listen via `chrome.commands.onCommand`:

```typescript
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-playback') {
    // Same toggle logic as icon click
  }
});
```

### WXT Manifest Configuration

WXT uses `wxt.config.ts` to configure the manifest:

```typescript
// wxt.config.ts
export default defineConfig({
  manifest: {
    commands: {
      'toggle-playback': {
        suggested_key: {
          default: 'Alt+Shift+P',
          mac: 'Alt+Shift+P',
        },
        description: 'Toggle SimpleReader playback',
      },
    },
  },
});
```

### Why Alt+Shift+P?

The PRD specifies `Alt+Shift+R`, but we should verify this doesn't conflict with:
- Browser shortcuts (Ctrl+Shift+R = hard refresh)
- Common extension shortcuts
- Accessibility tools

`Alt+Shift+P` is chosen because:
- **P** for **P**lay/Pause is intuitive
- Alt+Shift combinations are rarely used by browsers
- Doesn't conflict with common developer shortcuts
- Works on Windows, Mac, and Linux

Note: Users can customize shortcuts via `chrome://extensions/shortcuts`.

### Architecture Reference

From `docs/epics.md`:
- **FR19**: User can start playback with keyboard shortcut (Alt+Shift+R)
- Story 3.1: "Shortcut works regardless of which element has focus"
- Story 3.1: "Shortcut is registered via chrome.commands API"

From `docs/project_context.md`:
- Global keyboard shortcuts available via Chrome Commands API
- Service worker handles all command events

---

## Acceptance Criteria

### AC1: Shortcut Toggles Playback

**Given** I'm on any webpage with readable content
**When** I press Alt+Shift+P (or the configured shortcut)
**Then**:
- If stopped: Playback starts (same as clicking extension icon)
- If playing: Playback pauses
- If paused: Playback resumes
- If loading: No action (ignores shortcut during load)

### AC2: Shortcut Works Globally

**Given** focus is on any element (input field, iframe, etc.)
**When** I press the shortcut
**Then**:
- The command triggers regardless of focus
- Works in text inputs, textareas, contenteditable elements
- Works when focus is in iframe (if extension has access)

### AC3: Shortcut Registered in Manifest

**Given** the extension is installed
**When** I check `chrome://extensions/shortcuts`
**Then**:
- "Toggle SimpleReader playback" appears in the shortcut list
- Default is Alt+Shift+P (configurable by user)
- Shortcut is not marked as conflicting

### AC4: No Conflicts with Common Shortcuts

**Given** the shortcut is active
**When** used alongside common browser/system shortcuts
**Then**:
- Does not conflict with Ctrl+Shift+R (hard refresh)
- Does not conflict with Ctrl+P (print)
- Does not conflict with common screen reader shortcuts
- Does not conflict with common developer tool shortcuts

---

## Technical Implementation Notes

### 1. Update WXT Config (`wxt.config.ts`)

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Existing CSP config
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    },
    // Existing permissions
    permissions: [
      'activeTab',
      'storage',
      'offscreen',
    ],
    // NEW: Keyboard shortcuts
    commands: {
      'toggle-playback': {
        suggested_key: {
          default: 'Alt+Shift+P',
          mac: 'Alt+Shift+P',
        },
        description: 'Toggle SimpleReader playback',
      },
    },
  },
});
```

### 2. Add Command Listener (`entrypoints/background.ts`)

```typescript
// Add near the top of defineBackground()
export default defineBackground(() => {
  console.log('[SimpleReader] Background service worker started');

  // Existing onInstalled listener...

  // Icon click handler (existing)
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    await handleTogglePlayback(tab.id);
  });

  // NEW: Keyboard shortcut handler
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-playback') return;

    console.log('[SimpleReader] Keyboard shortcut triggered');

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      console.log('[SimpleReader] No active tab found');
      return;
    }

    await handleTogglePlayback(tab.id);
  });

  // Existing message listener...
});

// Extract toggle logic into reusable function
async function handleTogglePlayback(tabId: number): Promise<void> {
  switch (playback.state) {
    case 'stopped':
      await startPlayback(tabId);
      break;
    case 'playing':
      pausePlayback();
      break;
    case 'paused':
      resumePlayback();
      break;
    case 'loading':
      console.log('[SimpleReader] Already loading, ignoring toggle');
      break;
  }
}
```

### 3. Refactor Icon Click Handler

The existing `chrome.action.onClicked` handler should delegate to the same `handleTogglePlayback()` function to ensure consistent behavior:

```typescript
// Before (in defineBackground)
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  // ... switch statement duplicated here
});

// After
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await handleTogglePlayback(tab.id);
});
```

### Why `chrome.commands.onCommand` Over Content Script Keydown?

1. **Global scope**: Works regardless of focus, even when user hasn't interacted with page
2. **No permission needed**: Doesn't require `<all_urls>` host permission
3. **User customizable**: Users can change shortcut via chrome://extensions/shortcuts
4. **Conflict prevention**: Chrome handles conflict detection automatically
5. **Consistent with Chrome patterns**: Standard approach for extension shortcuts

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| FR19: Keyboard shortcut | Alt+Shift+P triggers playback toggle |
| ARCH-5: Typed messages | Reuses existing playback message flow |
| Single responsibility | Shortcut only triggers existing toggle logic |
| DRY principle | `handleTogglePlayback()` shared by icon and shortcut |

### File Changes

```
wxt.config.ts              # UPDATE: Add commands manifest key
entrypoints/background.ts  # UPDATE: Add chrome.commands.onCommand listener
                          #         Extract handleTogglePlayback() function
```

---

## Tasks

### Task 1: Add Commands to WXT Config
**AC: 3, 4**
- [ ] Open `wxt.config.ts`
- [ ] Add `commands` object to manifest config
- [ ] Set `toggle-playback` command with `Alt+Shift+P`
- [ ] Add description: "Toggle SimpleReader playback"
- [ ] Verify manifest generates correctly with `bun run build`

### Task 2: Extract Toggle Logic to Function
**AC: 1**
- [ ] Create `handleTogglePlayback(tabId: number)` function in background.ts
- [ ] Move toggle switch statement from `chrome.action.onClicked` to new function
- [ ] Update `chrome.action.onClicked` to call `handleTogglePlayback()`
- [ ] Verify icon click still works after refactor

### Task 3: Add Command Listener
**AC: 1, 2**
- [ ] Add `chrome.commands.onCommand.addListener()` in `defineBackground()`
- [ ] Filter for `toggle-playback` command
- [ ] Query active tab with `chrome.tabs.query({ active: true, currentWindow: true })`
- [ ] Call `handleTogglePlayback()` with active tab ID
- [ ] Add console log for debugging: `[SimpleReader] Keyboard shortcut triggered`

### Task 4: Manual Testing
**AC: 1, 2, 3, 4**
- [ ] Load extension in dev mode (`bun run dev`)
- [ ] Navigate to article page
- [ ] Press Alt+Shift+P - verify playback starts
- [ ] Press Alt+Shift+P again - verify playback pauses
- [ ] Press Alt+Shift+P again - verify playback resumes
- [ ] Test shortcut while focused on:
  - Text input field
  - Google search box
  - Gmail compose window
  - DevTools console
- [ ] Check `chrome://extensions/shortcuts` - verify shortcut appears
- [ ] Verify no conflict with Ctrl+Shift+R (hard refresh)
- [ ] Test on Mac: verify Alt+Shift+P works (Option+Shift+P)

### Task 5: Build Verification
**AC: 3**
- [ ] Run `bun run build`
- [ ] Check `.output/chrome-mv3/manifest.json` includes commands
- [ ] Verify no TypeScript errors
- [ ] Verify no console errors on load

---

## Definition of Done

- [ ] `commands` added to manifest via wxt.config.ts
- [ ] Alt+Shift+P triggers playback toggle
- [ ] Same behavior as icon click (stopped->play, playing->pause, paused->resume)
- [ ] Works when any element is focused
- [ ] Shortcut visible in chrome://extensions/shortcuts
- [ ] No conflicts with common browser shortcuts
- [ ] No TypeScript errors
- [ ] Icon click handler still works after refactor
- [ ] Console logs show "Keyboard shortcut triggered"

---

## Dependencies

### Depends On
- Story 2-7: Basic playback controls (`startPlayback()`, `pausePlayback()`, `resumePlayback()`, `playback.state`)

### Enables
- Story 3-3: Mini-player may show shortcut hint
- Story 7-1: Keyboard navigation foundation

---

## Test Scenarios

### Manual Testing Checklist

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| Start from stopped | Focus input, press Alt+Shift+P | Playback starts, badge shows ">" |
| Pause while playing | Playing, press Alt+Shift+P | Playback pauses, badge shows "||" |
| Resume from paused | Paused, press Alt+Shift+P | Playback resumes, badge shows ">" |
| During loading | Loading, press Alt+Shift+P | No action, still loading |
| Focus in input | Type in search box, press shortcut | Playback toggles, input unaffected |
| DevTools open | Focus console, press shortcut | Playback toggles |
| Shortcut settings | Open chrome://extensions/shortcuts | "Toggle SimpleReader playback" visible |
| Conflict check | Press Ctrl+Shift+R | Browser hard refresh, not playback |

### Console Log Expectations

```
[SimpleReader] Keyboard shortcut triggered
[SimpleReader] Playback state: stopped -> loading
[SimpleReader] Extracting content...
...
```

---

## References

- [Chrome Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands) - Official documentation
- [MDN commands manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands) - Cross-browser reference
- [Source: docs/epics.md#Story 3.1] - Original story definition
- [Source: entrypoints/background.ts] - Existing playback toggle logic

---

## Dev Notes

### Alternative Shortcut Considerations

If Alt+Shift+P conflicts for some users:
- **Alt+Shift+R**: Original PRD suggestion, but 'R' could conflict with rotate in some apps
- **Alt+P**: Simpler, but may conflict with browser shortcuts
- **Ctrl+Shift+Y**: Rarely used, but hard to reach

Users can always customize via chrome://extensions/shortcuts.

### Mac Compatibility

On Mac:
- `Alt` maps to `Option` key
- `Command` cannot be used in extension shortcuts (reserved by browser)
- `MacCtrl` would use Control key (non-standard for Mac users)

`Alt+Shift+P` works well cross-platform.

### Service Worker Persistence

The `chrome.commands.onCommand` listener persists even when service worker is inactive - Chrome wakes the service worker to handle the command. This is built into the extension architecture.

### No Additional Permissions

The commands API does not require any additional permissions. The `activeTab` permission we already have is sufficient for querying the current tab.

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

<!-- Populated after implementation -->

### File List

- `wxt.config.ts` (update: add commands manifest key)
- `entrypoints/background.ts` (update: add chrome.commands.onCommand listener, extract handleTogglePlayback)
