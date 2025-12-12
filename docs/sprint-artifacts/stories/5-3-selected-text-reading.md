# Story 5.3: Selected Text Reading

## Story Info

| Field | Value |
|-------|-------|
| Epic | 5 - Content Intelligence |
| Story ID | 5-3 |
| Story Key | 5-3-selected-text-reading |
| Status | ready-for-dev |
| Created | 2025-12-12 |

---

## User Story

As a user,
I want to read only my selected text,
So that I can listen to specific sections without hearing the full article.

---

## Context & Background

This story addresses **FR12: User can read selected text instead of full page** from the PRD.

### The Problem

Users often want to:
1. Listen to a specific paragraph or section rather than the entire article
2. Quickly hear a quote or definition without full extraction
3. Re-listen to a confusing passage they missed

Currently, SimpleReader always extracts and reads the entire article via Readability. There's no way to scope playback to just a selection.

### The Solution

When the user triggers playback, check if they have text selected on the page:

1. **Selection exists** -> Use the selected text directly (skip Readability extraction)
2. **No selection** -> Fall back to full article extraction (current behavior)

Access methods:
1. **Context menu**: Right-click selected text -> "Read with SimpleReader"
2. **Keyboard shortcut**: Alt+Shift+S (new, dedicated to selection)
3. **Existing playback trigger with selection**: Alt+Shift+P or icon click when text is selected

### Architecture Reference

From `docs/prd.md`:
- **FR12**: User can read selected text instead of full page

From `docs/architecture.md`:
- **ARCH-5**: All cross-context communication via typed messages
- **ARCH-10**: Message types in SCREAMING_SNAKE_CASE with context prefix

From `docs/project_context.md`:
- Message protocol in `lib/messages.ts`
- CSS prefix with `sr-` for content script elements

### Current Implementation

The playback flow in `background.ts`:

```typescript
async function startPlayback(tabId: number): Promise<void> {
  // ...
  // 1. Extract content from tab
  const extractResponse = await sendMessageToTab<{ text: string; title?: string; wordCount: number }>(
    tabId,
    Messages.contentExtract()
  );
  // ...
}
```

The content script (`content/index.ts`) responds to `CONTENT_EXTRACT` by calling `extractContent()` which uses Readability.

**New flow**: Add a `CONTENT_EXTRACT_SELECTION` message that:
1. Checks `window.getSelection()`
2. Returns selected text if present, or signals to use full extraction

---

## Acceptance Criteria

### AC1: Selection Detection

**Given** I have selected text on the page
**When** I trigger playback (any method)
**Then**:
- The content script detects the selection via `window.getSelection()`
- Selection text is extracted and cleaned (whitespace normalized)
- Minimum length check applies (e.g., 10 characters)
- If selection is too short, fall back to full extraction

### AC2: Context Menu Integration

**Given** I have selected text on the page
**When** I right-click on the selection
**Then**:
- A "Read with SimpleReader" option appears in the context menu
- Clicking it reads the selected text
- The context menu item only appears when text is selected (not on images, links without selection, etc.)

### AC3: Keyboard Shortcut for Selection

**Given** I have selected text on the page
**When** I press Alt+Shift+S
**Then**:
- The selected text is read via TTS
- If no selection exists, nothing happens (or user is notified)
- The shortcut is registered via `chrome.commands` API

### AC4: Existing Trigger with Selection

**Given** I have selected text on the page
**When** I click the extension icon OR press Alt+Shift+P
**Then**:
- Selection is detected and used for TTS
- Falls back to full article if no selection

### AC5: Highlighting on Selection

**Given** I am reading selected text
**When** playback is in progress
**Then**:
- Word highlighting applies ONLY to the selected text region
- The highlighter wraps words in the selection, not the entire article
- Scrolling keeps the current word visible within the selection area

### AC6: Fallback to Full Article

**Given** no text is selected
**When** I trigger any playback method
**Then**:
- Full article extraction occurs (existing behavior)
- No change from current implementation

### AC7: Selection Cleared After Playback Start

**Given** I have selected text and triggered playback
**When** playback starts
**Then**:
- The visual selection can be cleared (user may click elsewhere)
- Highlighting takes over for visual feedback
- Playback continues with originally selected text

### AC8: Multi-Paragraph Selection

**Given** I select text spanning multiple paragraphs
**When** playback is triggered
**Then**:
- All selected text is read in order
- Paragraph breaks become natural pauses in TTS
- Highlighting spans all selected elements

---

## Technical Implementation Notes

### New Message Types (`lib/messages.ts`)

```typescript
// Add to ContentMessage union
export type ContentMessage =
  | { type: 'CONTENT_EXTRACT' }
  | { type: 'CONTENT_EXTRACT_SELECTION' }  // NEW: Extract only selected text
  | { type: 'CONTENT_READY'; text: string; wordCount: number; title?: string }
  | { type: 'CONTENT_ERROR'; error: string };

// Add to Messages factory
export const Messages = {
  // ...existing
  contentExtractSelection: (): ContentMessage => ({ type: 'CONTENT_EXTRACT_SELECTION' }),
};
```

### Selection Extractor (`entrypoints/content/selection-extractor.ts`)

```typescript
/**
 * Selection Text Extractor for TTS
 *
 * Extracts user-selected text from the page for TTS reading.
 * Falls back to null if no valid selection exists.
 */

export interface SelectionResult {
  text: string;
  wordCount: number;
  range: Range | null;  // For highlighting scope
}

const MIN_SELECTION_LENGTH = 10;

/**
 * Extract currently selected text from the page.
 * Returns null if no valid selection exists.
 */
export function extractSelection(): SelectionResult | null {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const text = selection.toString().trim();

  if (text.length < MIN_SELECTION_LENGTH) {
    return null;
  }

  // Clean the text (normalize whitespace)
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;

  // Get the range for highlighting scope
  const range = selection.getRangeAt(0);

  return {
    text: cleanedText,
    wordCount,
    range: range.cloneRange(),  // Clone to preserve even if selection clears
  };
}

/**
 * Get the common ancestor element containing the selection.
 * Used for scoped highlighting.
 */
export function getSelectionContainer(range: Range): Element | null {
  const container = range.commonAncestorContainer;

  if (container.nodeType === Node.ELEMENT_NODE) {
    return container as Element;
  }

  return container.parentElement;
}
```

### Context Menu Setup (`entrypoints/background.ts`)

```typescript
// Add to background script initialization
export default defineBackground(() => {
  console.log('[SimpleReader] Background service worker started');

  // Create context menu on install
  chrome.runtime.onInstalled.addListener(async (details) => {
    // ... existing install logic

    // Create context menu for selected text
    chrome.contextMenus.create({
      id: 'read-selection',
      title: 'Read with SimpleReader',
      contexts: ['selection'],  // Only show when text is selected
    });
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'read-selection' && tab?.id) {
      console.log('[SimpleReader] Context menu: Read selection');
      await startPlaybackWithSelection(tab.id);
    }
  });

  // ... rest of background script
});

/**
 * Start playback preferring selection over full extraction.
 */
async function startPlaybackWithSelection(tabId: number): Promise<void> {
  if (playback.state === 'loading' || playback.state === 'playing') {
    console.log('[SimpleReader] Playback already in progress');
    return;
  }

  playback.tabId = tabId;
  playback.wordTimings = [];
  playback.currentWordIndex = 0;
  playback.audioStartTime = null;
  playback.accumulatedAudioDurationMs = 0;
  setPlaybackState('loading');

  try {
    // Try to get selection first
    const selectionResponse = await sendMessageToTab<{ text: string; wordCount: number } | null>(
      tabId,
      Messages.contentExtractSelection()
    );

    let text: string;
    let wordCount: number;

    if (selectionResponse.success && selectionResponse.data) {
      // Use selection
      text = selectionResponse.data.text;
      wordCount = selectionResponse.data.wordCount;
      console.log(`[SimpleReader] Using selection: ${wordCount} words`);
    } else {
      // Fall back to full extraction
      console.log('[SimpleReader] No selection, extracting full content...');
      const extractResponse = await sendMessageToTab<{ text: string; title?: string; wordCount: number }>(
        tabId,
        Messages.contentExtract()
      );

      if (!extractResponse.success || !extractResponse.data) {
        throw new Error(extractResponse.error || 'Content extraction failed');
      }

      text = extractResponse.data.text;
      wordCount = extractResponse.data.wordCount;
    }

    console.log(`[SimpleReader] Extracted ${wordCount} words`);

    // Continue with TTS generation (existing flow)
    await ensureOffscreenDocument();
    const voice = await getSyncValue(STORAGE_KEYS.preferredVoice) || 'af_bella';
    const speed = await getSyncValue(STORAGE_KEYS.preferredSpeed) || 1.0;

    chrome.runtime.sendMessage(Messages.ttsGenerate(text, voice, speed)).catch((error) => {
      console.error('[SimpleReader] TTS request failed:', error);
      stopPlayback();
    });

  } catch (error) {
    console.error('[SimpleReader] Playback start failed:', error);
    stopPlayback();
  }
}
```

### Update Manifest for Context Menu Permission (`wxt.config.ts`)

```typescript
export default defineConfig({
  manifest: {
    // ... existing config
    permissions: [
      'activeTab',
      'storage',
      'offscreen',
      'contextMenus',  // NEW: For right-click menu
    ],
    commands: {
      'toggle-playback': {
        suggested_key: { default: 'Alt+Shift+P', mac: 'Alt+Shift+P' },
        description: 'Toggle SimpleReader playback',
      },
      'read-selection': {  // NEW
        suggested_key: { default: 'Alt+Shift+S', mac: 'Alt+Shift+S' },
        description: 'Read selected text with SimpleReader',
      },
    },
  },
});
```

### Content Script Handler (`entrypoints/content/index.ts`)

```typescript
import { extractSelection, getSelectionContainer } from './selection-extractor';

// Add to message handler
addMessageListener((message, _sender, sendResponse) => {
  if (isContentMessage(message)) {
    switch (message.type) {
      case 'CONTENT_EXTRACT':
        handleContentExtract((response) => sendResponse(response as { success: boolean }));
        return true;

      case 'CONTENT_EXTRACT_SELECTION':  // NEW
        handleSelectionExtract((response) => sendResponse(response as { success: boolean }));
        return true;
    }
  }
  // ... rest
});

async function handleSelectionExtract(
  sendResponse: (response: { success: boolean; data?: { text: string; wordCount: number } | null }) => void
): Promise<void> {
  try {
    const selection = extractSelection();

    if (!selection) {
      sendResponse({ success: true, data: null });
      return;
    }

    // Initialize highlighter scoped to selection container
    const container = getSelectionContainer(selection.range!);
    if (container) {
      // Use a different initialization that only wraps words in the selection
      await initializeHighlighterForSelection(container, selection.range!);
    }

    sendResponse({
      success: true,
      data: {
        text: selection.text,
        wordCount: selection.wordCount,
      },
    });
  } catch (error) {
    console.error('[SimpleReader] Selection extraction failed:', error);
    sendResponse({ success: true, data: null });  // Fall back, don't error
  }
}
```

### Scoped Highlighting (`entrypoints/content/highlighter.ts`)

```typescript
/**
 * Initialize highlighter for a specific selection range.
 * Only wraps words within the selection, not the entire article.
 */
export async function initializeHighlighterForSelection(
  container: Element,
  selectionRange: Range
): Promise<number> {
  // Clear any existing highlighting
  resetHighlight();

  // Get text nodes within the selection
  const textNodes = getTextNodesInRange(selectionRange);

  let wordIndex = 0;

  for (const textNode of textNodes) {
    const words = textNode.textContent?.split(/(\s+)/) || [];
    const fragment = document.createDocumentFragment();

    for (const word of words) {
      if (word.match(/\s+/)) {
        // Preserve whitespace
        fragment.appendChild(document.createTextNode(word));
      } else if (word.length > 0) {
        // Wrap word in span
        const span = document.createElement('span');
        span.className = 'sr-word';
        span.dataset.wordIndex = String(wordIndex);
        span.textContent = word;
        fragment.appendChild(span);
        wordIndex++;
      }
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  state.wordCount = wordIndex;
  return wordIndex;
}

/**
 * Get all text nodes within a Range.
 */
function getTextNodesInRange(range: Range): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (range.intersectsNode(node)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      },
    }
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  return textNodes;
}
```

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| ARCH-5: Typed messages | New message type added to lib/messages.ts |
| ARCH-10: SCREAMING_SNAKE_CASE | CONTENT_EXTRACT_SELECTION follows convention |
| ARCH-6: Only import from lib/ | Selection extractor imports only from lib/ |
| ARCH-12: CSS prefix | sr-word classes maintained |
| NFR8: Minimal permissions | contextMenus is minimal addition for feature |

### File Structure After Implementation

```
entrypoints/
  background.ts               # Updated - context menu, selection flow
  content/
    index.ts                  # Updated - handle CONTENT_EXTRACT_SELECTION
    selection-extractor.ts    # NEW: Selection text extraction
    selection-extractor.test.ts # NEW: Unit tests
    highlighter.ts            # Updated - scoped highlighting
lib/
  messages.ts                 # Updated - new message type
wxt.config.ts                 # Updated - contextMenus permission, new command
```

---

## Tasks

### Task 1: Add Message Types
**AC: 1, 4**
- [ ] Add `CONTENT_EXTRACT_SELECTION` to ContentMessage union in `lib/messages.ts`
- [ ] Add `contentExtractSelection()` factory function to Messages object
- [ ] Export new types

### Task 2: Create Selection Extractor Module
**AC: 1, 8**
- [ ] Create `entrypoints/content/selection-extractor.ts`
- [ ] Implement `extractSelection()` function
- [ ] Implement `getSelectionContainer()` helper
- [ ] Handle multi-paragraph selections
- [ ] Handle edge cases (collapsed selection, selection in inputs, etc.)

### Task 3: Update Manifest Configuration
**AC: 2, 3**
- [ ] Add `contextMenus` permission to `wxt.config.ts`
- [ ] Add `read-selection` command with `Alt+Shift+S` shortcut
- [ ] Verify permissions are minimal

### Task 4: Implement Context Menu
**AC: 2**
- [ ] Create context menu item on install in `background.ts`
- [ ] Set `contexts: ['selection']` for text-only display
- [ ] Handle `chrome.contextMenus.onClicked` event
- [ ] Route to selection playback flow

### Task 5: Implement Selection Keyboard Shortcut
**AC: 3**
- [ ] Add `read-selection` command handler in `background.ts`
- [ ] Check for selection before starting playback
- [ ] Provide feedback if no selection (badge change or notification)

### Task 6: Update Existing Playback Flow
**AC: 4, 6**
- [ ] Modify `startPlayback()` to check selection first
- [ ] Implement `startPlaybackWithSelection()` function
- [ ] Maintain fallback to full extraction
- [ ] Update `handleTogglePlayback()` to use selection-aware flow

### Task 7: Handle Selection Message in Content Script
**AC: 1, 7**
- [ ] Add `CONTENT_EXTRACT_SELECTION` case to message handler
- [ ] Implement `handleSelectionExtract()` function
- [ ] Return null for no/invalid selection
- [ ] Clear selection visual after extraction (optional, configurable)

### Task 8: Implement Scoped Highlighting
**AC: 5, 8**
- [ ] Add `initializeHighlighterForSelection()` to highlighter.ts
- [ ] Implement `getTextNodesInRange()` helper
- [ ] Only wrap words within the selection range
- [ ] Ensure scroll-to-word works within selection area

### Task 9: Unit Tests
**AC: All**
- [ ] Create `selection-extractor.test.ts`
- [ ] Test selection detection
- [ ] Test multi-paragraph extraction
- [ ] Test minimum length validation
- [ ] Test no-selection case returns null
- [ ] Test whitespace normalization

### Task 10: Manual Testing
**AC: All**
- [ ] Test context menu appears only with selection
- [ ] Test Alt+Shift+S shortcut
- [ ] Test existing shortcuts respect selection
- [ ] Test multi-paragraph selection
- [ ] Test selection on various sites (Medium, GitHub, news)
- [ ] Test highlighting stays within selection area
- [ ] Test fallback when no selection

---

## Definition of Done

- [ ] `selection-extractor.ts` module created and tested
- [ ] Context menu "Read with SimpleReader" appears for text selection
- [ ] Alt+Shift+S shortcut reads selected text
- [ ] Alt+Shift+P and icon click respect selection
- [ ] Highlighting scoped to selection area
- [ ] Fallback to full article when no selection
- [ ] `contextMenus` permission added to manifest
- [ ] New command registered in manifest
- [ ] Message types added to lib/messages.ts
- [ ] Unit tests passing
- [ ] Console logs use `[SimpleReader]` prefix

---

## Dependencies

### Depends On
- Story 2-1: Content Extraction (completed - baseline extraction)
- Story 2-6: Word Highlighting (completed - highlighting infrastructure)
- Story 3-1: Keyboard Shortcut (completed - command registration pattern)

### Enables
- Better user control over what gets read
- Shorter TTS sessions for quick lookups
- More flexible usage patterns

---

## Test Scenarios

### Manual Testing Checklist

| Test Case | Expected Behavior |
|-----------|-------------------|
| Right-click selected text | "Read with SimpleReader" appears in menu |
| Click context menu item | Selected text is read with TTS |
| Alt+Shift+S with selection | Selection is read |
| Alt+Shift+S no selection | Nothing happens or badge shows info |
| Alt+Shift+P with selection | Selection is read (not full article) |
| Icon click with selection | Selection is read |
| Multi-paragraph selection | All paragraphs read in order |
| Very short selection (<10 chars) | Falls back to full article |
| No selection, click play | Full article extracted and read |
| Selection spans multiple elements | Highlighting works across elements |
| Click elsewhere during playback | Playback continues, highlighting takes over |

### Unit Test Cases

```typescript
// selection-extractor.test.ts
describe('extractSelection', () => {
  it('returns null when no selection exists');
  it('returns null when selection is collapsed');
  it('returns null when selection is too short');
  it('extracts text from simple selection');
  it('normalizes whitespace in extracted text');
  it('calculates correct word count');
  it('preserves range for highlighting scope');
});

describe('getSelectionContainer', () => {
  it('returns element node directly');
  it('returns parent element for text nodes');
  it('handles selection spanning multiple elements');
});
```

---

## References

- [Source: docs/prd.md#FR12] - Selected text reading requirement
- [Source: docs/epics.md#Story 5.3] - Original story definition
- [Source: entrypoints/background.ts] - Existing playback flow
- [Source: entrypoints/content/index.ts] - Content script message handling
- [Source: lib/messages.ts] - Message protocol
- [Chrome contextMenus API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus)
- [Chrome commands API](https://developer.chrome.com/docs/extensions/reference/api/commands)

---

## Dev Notes

### Why Check Selection First?

The selection check happens in the background script (by sending a message to content script) rather than always sending `CONTENT_EXTRACT`. This:
1. Avoids Readability processing when unnecessary
2. Provides faster startup for selection playback
3. Keeps logic centralized in background

### Context Menu Considerations

- `contexts: ['selection']` ensures menu only appears when text is selected
- The menu item is created once on install, not dynamically
- Chrome handles showing/hiding based on context automatically

### Selection vs Full Article UX

Users might expect:
- Selection reading = quick, short
- Full article = longer commitment

The implementation should make it clear which mode is active (perhaps via badge or mini-player label).

### Edge Cases to Watch

- **Inputs and textareas**: Selection in form fields - should work but verify
- **Shadow DOM**: Selection in web components might not be accessible
- **iframes**: Selection in iframes requires additional permissions
- **PDF viewers**: Embedded PDFs have their own selection model
- **Contenteditable**: Selection in editable areas should work

### Performance Note

Selection extraction is fast (<1ms) compared to Readability (~50-200ms), so the user experience should feel snappier when reading selections.

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

### File List

- `entrypoints/content/selection-extractor.ts` (new)
- `entrypoints/content/selection-extractor.test.ts` (new)
- `entrypoints/content/index.ts` (modified - handle CONTENT_EXTRACT_SELECTION)
- `entrypoints/content/highlighter.ts` (modified - scoped highlighting)
- `entrypoints/background.ts` (modified - context menu, selection flow)
- `lib/messages.ts` (modified - new message type)
- `wxt.config.ts` (modified - contextMenus permission, new command)
