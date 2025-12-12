# Story 1.6: Create Extension Entrypoint Skeletons

## Story Info

| Field | Value |
|-------|-------|
| Epic | 1 - Project Setup & Architecture Foundation |
| Story ID | 1-6 |
| Story Key | 1-6-create-extension-entrypoint-skeletons |
| Status | ready-for-dev |
| Created | 2025-12-11 |

---

## User Story

As a developer,
I want skeleton entrypoints for all extension contexts,
So that the project structure is complete and ready for feature implementation.

---

## Context & Background

This is the final story in Epic 1, completing the foundational architecture setup. Stories 1-1 through 1-5 have established:

- **1-1**: WXT project initialized with React template
- **1-2**: Manifest configured with WASM CSP and permissions
- **1-3**: Typed message protocol in `lib/messages.ts`
- **1-4**: Storage keys and helpers in `lib/storage.ts`
- **1-5**: Error handling foundation in `lib/errors.ts`

This story wires up the extension entrypoints to use these foundation modules, creating a working skeleton that Epic 2 will build upon.

### Current State

The entrypoints exist with placeholder content:

- `entrypoints/background.ts` - logs "Hello background!"
- `entrypoints/content.ts` - logs "SimpleReader content script loaded"
- `entrypoints/popup/App.tsx` - displays placeholder UI

### Target State

Entrypoints should:
1. Import and use foundation modules from `lib/`
2. Set up message listeners (background)
3. Initialize storage defaults on install (background)
4. Prepare content script for message handling
5. Wire popup for basic status display

---

## Acceptance Criteria

### AC1: Background Service Worker Skeleton

**Given** the WXT project with lib/ foundation
**When** the background service worker loads
**Then**:
- It imports `addMessageListener` from `lib/messages.ts`
- It imports `initializeDefaults` from `lib/storage.ts`
- It sets up a message listener using the typed `addMessageListener` helper
- Message handler logs received messages with their type (dev mode)
- Message handler returns `{ success: true }` for all messages initially

### AC2: Storage Initialization on Install

**Given** the extension is installed for the first time
**When** the `chrome.runtime.onInstalled` event fires
**Then**:
- `initializeDefaults()` from `lib/storage.ts` is called
- Default values for `preferredVoice`, `preferredSpeed`, `highlightColor`, `codeBlockHandling` are set
- Console logs confirm defaults were initialized

### AC3: Content Script Skeleton with Message Handling

**Given** a webpage is loaded with the content script
**When** the content script initializes
**Then**:
- It imports `addMessageListener`, `Message` types from `lib/messages.ts`
- It sets up a message listener for content-relevant messages
- It handles `CONTENT_EXTRACT`, `HIGHLIGHT_WORD`, `HIGHLIGHT_RESET` message types (stub handlers)
- Stub handlers log the message type and return `{ success: true }`
- Content script exports are isolated (no cross-import with other entrypoints)

### AC4: Offscreen Document Skeleton

**Given** the extension project structure
**When** the offscreen entrypoint files are created
**Then**:
- `entrypoints/offscreen/index.html` exists with minimal HTML shell
- `entrypoints/offscreen/index.ts` exists with message listener setup
- Offscreen script imports `addMessageListener`, TTS message types from `lib/messages.ts`
- Offscreen script handles `TTS_GENERATE` message type (stub that logs and returns success)
- HTML file references the TypeScript entry via script tag

### AC5: Popup Component Wired to Storage

**Given** the popup UI component
**When** the popup is opened
**Then**:
- `App.tsx` imports from `lib/storage.ts` (at minimum `STORAGE_KEYS`)
- Popup displays current extension status ("Ready", "Loading Model", etc.)
- Popup is prepared for future settings integration
- All imports are from `lib/` only (not from other entrypoints)

### AC6: Clean Extension Load

**Given** all entrypoint skeletons are in place
**When** the extension is loaded in Chrome (dev mode)
**Then**:
- No console errors appear on extension load
- Background service worker starts without errors
- Content script injects on page load without errors
- Popup opens without errors
- Message passing works between contexts (can test via console)

---

## Technical Implementation Notes

### Background Service Worker (`entrypoints/background.ts`)

```typescript
// Pattern: Import from lib/ only
import { addMessageListener, Message, MessageResponse } from '@/lib/messages';
import { initializeDefaults } from '@/lib/storage';

export default defineBackground(() => {
  console.log('[SimpleReader] Background service worker started');

  // Initialize defaults on install
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      console.log('[SimpleReader] First install - initializing defaults');
      await initializeDefaults();
    }
  });

  // Set up typed message listener
  addMessageListener((message, sender, sendResponse) => {
    console.log('[SimpleReader] Received message:', message.type, sender.tab?.id);

    // Route messages based on type prefix
    // TTS messages -> forward to offscreen (Epic 2)
    // Playback messages -> handle state (Epic 2)
    // Settings messages -> handle (Epic 4)

    sendResponse({ success: true });
    return false; // Sync response for now
  });
});
```

### Content Script (`entrypoints/content.ts`)

```typescript
import { addMessageListener, Message, isHighlightMessage, isContentMessage } from '@/lib/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[SimpleReader] Content script loaded');

    // Listen for messages from background
    addMessageListener((message, sender, sendResponse) => {
      if (isContentMessage(message)) {
        switch (message.type) {
          case 'CONTENT_EXTRACT':
            // TODO: Epic 2 - Extract with Readability
            console.log('[SimpleReader] Content extraction requested');
            sendResponse({ success: true });
            return false;
        }
      }

      if (isHighlightMessage(message)) {
        switch (message.type) {
          case 'HIGHLIGHT_WORD':
            // TODO: Epic 2 - Highlight word
            console.log('[SimpleReader] Highlight word:', message.wordIndex);
            sendResponse({ success: true });
            return false;
          case 'HIGHLIGHT_RESET':
            // TODO: Epic 2 - Reset highlighting
            console.log('[SimpleReader] Reset highlighting');
            sendResponse({ success: true });
            return false;
        }
      }

      return false;
    });
  },
});
```

### Offscreen Document (`entrypoints/offscreen/index.html`)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SimpleReader Offscreen</title>
</head>
<body>
  <!-- Offscreen document for TTS processing -->
  <!-- No visible UI - audio/TTS engine runs here -->
  <script type="module" src="./index.ts"></script>
</body>
</html>
```

### Offscreen Script (`entrypoints/offscreen/index.ts`)

```typescript
import { addMessageListener, isTTSMessage } from '@/lib/messages';

console.log('[SimpleReader] Offscreen document loaded');

// Listen for TTS messages from background
addMessageListener((message, sender, sendResponse) => {
  if (isTTSMessage(message)) {
    switch (message.type) {
      case 'TTS_GENERATE':
        // TODO: Epic 2 - Kokoro TTS integration
        console.log('[SimpleReader] TTS generate requested:', {
          textLength: message.text.length,
          voice: message.voice,
          speed: message.speed,
        });
        sendResponse({ success: true });
        return false;
    }
  }
  return false;
});
```

### Popup Component (`entrypoints/popup/App.tsx`)

```typescript
import { useState, useEffect } from 'react';
import { STORAGE_KEYS, getSyncValue } from '@/lib/storage';
import './App.css';

function App() {
  const [status, setStatus] = useState<'ready' | 'loading'>('ready');
  const [voiceName, setVoiceName] = useState<string>('');

  useEffect(() => {
    // Load current settings to display
    async function loadSettings() {
      const voice = await getSyncValue(STORAGE_KEYS.preferredVoice);
      if (voice) setVoiceName(voice);
    }
    loadSettings();
  }, []);

  return (
    <div className="popup">
      <h1>SimpleReader</h1>
      <p className="description">
        Text-to-speech with word-level highlighting
      </p>
      <p className="status">
        Status: {status === 'ready' ? 'Ready' : 'Loading...'}
      </p>
      {voiceName && (
        <p className="voice">Voice: {voiceName}</p>
      )}
    </div>
  );
}

export default App;
```

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| ARCH-5: Cross-context via typed messages | Uses `addMessageListener` from `lib/messages.ts` |
| ARCH-6: Only import from lib/ | All entrypoints import from `lib/` only |
| ARCH-10: SCREAMING_SNAKE_CASE messages | Message types from `lib/messages.ts` follow pattern |
| ARCH-11: Storage keys from lib/ | Uses `STORAGE_KEYS` constant |
| ARCH-13: Co-located tests | Test files will be `*.test.ts` next to source |

### Boundary Enforcement

```
entrypoints/background.ts  -->  lib/messages.ts
entrypoints/background.ts  -->  lib/storage.ts
entrypoints/content.ts     -->  lib/messages.ts
entrypoints/offscreen/     -->  lib/messages.ts
entrypoints/popup/App.tsx  -->  lib/storage.ts

(No cross-imports between entrypoints)
```

---

## Tasks

### Task 1: Update Background Service Worker
**File**: `entrypoints/background.ts`
- [ ] Import `addMessageListener` from `@/lib/messages`
- [ ] Import `initializeDefaults` from `@/lib/storage`
- [ ] Add `chrome.runtime.onInstalled` listener for first install
- [ ] Call `initializeDefaults()` on install
- [ ] Set up message listener with type logging
- [ ] Return `{ success: true }` for all messages
- [ ] Add descriptive console logs with `[SimpleReader]` prefix

### Task 2: Update Content Script
**File**: `entrypoints/content.ts`
- [ ] Import message helpers and type guards from `@/lib/messages`
- [ ] Add message listener with `addMessageListener`
- [ ] Handle `CONTENT_EXTRACT` message (stub)
- [ ] Handle `HIGHLIGHT_WORD` message (stub)
- [ ] Handle `HIGHLIGHT_RESET` message (stub)
- [ ] Log messages with `[SimpleReader]` prefix
- [ ] Return appropriate responses

### Task 3: Create Offscreen Document
**Files**: `entrypoints/offscreen/index.html`, `entrypoints/offscreen/index.ts`
- [ ] Create `entrypoints/offscreen/` directory
- [ ] Create minimal `index.html` with script reference
- [ ] Create `index.ts` with message listener
- [ ] Handle `TTS_GENERATE` message (stub)
- [ ] Log TTS requests with parameters

### Task 4: Update Popup Component
**File**: `entrypoints/popup/App.tsx`
- [ ] Import `STORAGE_KEYS`, `getSyncValue` from `@/lib/storage`
- [ ] Add state for extension status
- [ ] Load and display current voice preference
- [ ] Update UI to show status and settings preview
- [ ] Keep styling minimal and clean

### Task 5: Verify Extension Load
- [ ] Run `bun run dev` to start development mode
- [ ] Verify no console errors in background page
- [ ] Verify no console errors in content script (on any page)
- [ ] Verify popup opens without errors
- [ ] Test message passing via console (optional manual test)

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] Background service worker initializes storage on first install
- [ ] Message listeners set up in background, content, and offscreen
- [ ] Popup displays status and wired to storage
- [ ] Extension loads without console errors
- [ ] All imports are from `lib/` (no cross-entrypoint imports)
- [ ] Code follows established patterns (SCREAMING_SNAKE_CASE, sr- prefix)
- [ ] Console logs use `[SimpleReader]` prefix for easy filtering

---

## Dependencies

### Depends On
- Story 1-3: Typed message protocol (`lib/messages.ts`)
- Story 1-4: Storage keys and helpers (`lib/storage.ts`)
- Story 1-5: Error handling foundation (`lib/errors.ts`)

### Enables
- Epic 2: First Play Experience (all stories)
- Story 2.1: Content extraction can be implemented
- Story 2.2: Offscreen document lifecycle management
- Story 2.3: TTS integration in offscreen

---

## Test Considerations

### Manual Testing
1. Load extension in Chrome dev mode
2. Check background page console for init logs
3. Navigate to any article page, check content script logs
4. Open popup, verify UI renders
5. (Optional) Send test message via background console

### Future Unit Tests (Epic 8)
- Test message listener setup
- Test storage initialization logic
- Test type guards work correctly

---

## Notes

- This is a **skeleton implementation** - handlers just log and return success
- Real functionality comes in Epic 2 (TTS, extraction, highlighting)
- Focus is on **wiring up the architecture** correctly
- All TODOs reference future epics for traceability
