# Story 2.2: Offscreen Document Setup with Lifecycle Management

## Story Info

| Field | Value |
|-------|-------|
| Epic | 2 - First Play Experience (The Magic Moment) |
| Story ID | 2-2 |
| Story Key | 2-2-offscreen-document-setup-with-lifecycle-management |
| Status | ready-for-dev |
| Created | 2025-12-11 |

---

## User Story

As a developer,
I want a properly managed offscreen document for TTS processing,
So that WebGPU/WASM can run isolated from the service worker.

---

## Context & Background

This is the **second story in Epic 2**, establishing the critical infrastructure for TTS processing. Chrome MV3 service workers cannot run WebGPU or WebAssembly directly - they lack DOM access and have restricted APIs. The offscreen document pattern solves this by providing a hidden document context where these APIs are available.

### Why Offscreen Documents?

Chrome MV3 introduced significant restrictions on background scripts:
- Service workers have no DOM access
- WebGPU requires a document context
- WebAssembly execution is restricted
- Audio playback requires `<audio>` elements or Web Audio API

The offscreen document provides a hidden HTML page that:
- Has full DOM and Web API access
- Can run WebGPU for Kokoro TTS acceleration
- Can execute WebAssembly for WASM fallback
- Supports Web Audio API for audio generation

### Architecture Reference

From `docs/architecture.md`:
- **ARCH-4**: Offscreen document REQUIRED for TTS - service workers cannot run WebGPU/WASM
- **ARCH-8**: Always check if offscreen document exists before creating (`getContexts()`)
- **ARCH-9**: Chrome closes offscreen docs after ~30s of audio inactivity - handle lifecycle

From `docs/project_context.md`:
```typescript
// ALWAYS check if offscreen document exists before creating
const contexts = await chrome.runtime.getContexts({
  contextTypes: ['OFFSCREEN_DOCUMENT']
});

if (contexts.length === 0) {
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'TTS audio generation and playback'
  });
}
```

### Current State

The offscreen document exists as a stub (`entrypoints/offscreen/index.ts`):

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

The background script (`entrypoints/background.ts`) has no offscreen management yet.

### Target State

After this story:
1. Background script can create/manage offscreen document lifecycle
2. Offscreen document receives TTS messages reliably
3. System handles Chrome's automatic closure gracefully
4. Keep-alive mechanism prevents premature closure during TTS
5. Foundation ready for Kokoro TTS integration (Story 2-3)

---

## Acceptance Criteria

### AC1: Offscreen Document Creation with Existence Check

**Given** the extension is loaded and TTS is requested
**When** the background script needs to use the offscreen document
**Then**:
- It checks for existing offscreen document via `chrome.runtime.getContexts()`
- Only creates a new document if one doesn't exist
- Uses `AUDIO_PLAYBACK` as the creation reason
- Provides clear justification string for debugging
- Handles "Only a single offscreen" error gracefully

### AC2: Offscreen Document Lifecycle Manager Module

**Given** the project structure per architecture
**When** the lifecycle manager is created
**Then**:
- File is created at `lib/offscreen-manager.ts`
- Module exports `ensureOffscreenDocument()` function
- Module exports `closeOffscreenDocument()` function (for cleanup)
- Module exports `isOffscreenDocumentReady()` function
- Functions are async and properly typed
- Module only imports from `lib/` (no chrome API in function signatures)

### AC3: Message Routing from Background to Offscreen

**Given** the offscreen document is created
**When** a TTS message is sent from background
**Then**:
- Background routes TTS messages to offscreen document
- Offscreen document receives the message via `chrome.runtime.onMessage`
- Response flows back through the message channel
- Message typing is preserved (uses `lib/messages.ts` types)

### AC4: Keep-Alive Mechanism During TTS Processing

**Given** TTS processing may take longer than Chrome's ~30s timeout
**When** TTS generation is in progress
**Then**:
- A keep-alive mechanism prevents Chrome from closing the document
- Keep-alive uses minimal resource (e.g., periodic audio context ping)
- Keep-alive stops when TTS completes or is cancelled
- System doesn't leak resources (intervals are cleaned up)

### AC5: Graceful Recovery from Document Closure

**Given** Chrome has closed the offscreen document due to inactivity
**When** a new TTS request arrives
**Then**:
- System detects the document is closed (via `getContexts()`)
- System recreates the document automatically
- TTS request is processed after document is ready
- User sees no interruption (seamless recovery)
- Console logs document lifecycle events for debugging

### AC6: Error Handling for Offscreen Operations

**Given** offscreen document operations may fail
**When** errors occur (creation, messaging, closure)
**Then**:
- Errors are caught and wrapped as `ExtensionError`
- Error codes use `OFFSCREEN_*` prefix
- Errors include recoverable flag (most are recoverable)
- Console logs errors with `[SimpleReader]` prefix
- Errors propagate appropriately to callers

---

## Technical Implementation Notes

### Offscreen Manager Module (`lib/offscreen-manager.ts`)

```typescript
import { createOffscreenError, ERROR_CODES } from './errors';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

/**
 * State tracking for offscreen document
 */
let isCreating = false;

/**
 * Ensures an offscreen document exists, creating one if needed.
 *
 * CRITICAL: Chrome only allows ONE offscreen document per extension.
 * Always check existence before creating.
 *
 * @throws ExtensionError if creation fails
 */
export async function ensureOffscreenDocument(): Promise<void> {
  // Check if already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    // Document already exists
    return;
  }

  // Prevent concurrent creation attempts
  if (isCreating) {
    // Wait for ongoing creation to complete
    await waitForCreation();
    return;
  }

  isCreating = true;

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'TTS audio generation and playback via Kokoro',
    });
    console.log('[SimpleReader] Offscreen document created');
  } catch (error) {
    // Handle "Only a single offscreen" race condition
    if (error instanceof Error &&
        error.message.includes('Only a single offscreen')) {
      console.log('[SimpleReader] Offscreen document already exists (race condition)');
      return;
    }

    throw createOffscreenError(
      ERROR_CODES.OFFSCREEN_CREATION_FAILED,
      `Failed to create offscreen document: ${error instanceof Error ? error.message : String(error)}`,
      true, // recoverable
      error
    );
  } finally {
    isCreating = false;
  }
}

/**
 * Wait for ongoing creation to complete
 */
async function waitForCreation(maxWaitMs = 5000): Promise<void> {
  const startTime = Date.now();
  while (isCreating && Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/**
 * Check if offscreen document currently exists
 */
export async function isOffscreenDocumentReady(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  return contexts.length > 0;
}

/**
 * Close the offscreen document if it exists.
 * Call this for cleanup or to force recreation.
 */
export async function closeOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (contexts.length > 0) {
    await chrome.offscreen.closeDocument();
    console.log('[SimpleReader] Offscreen document closed');
  }
}
```

### Error Codes to Add (`lib/errors.ts`)

Add these error codes to the existing `ERROR_CODES` object:

```typescript
export const ERROR_CODES = {
  // ... existing codes

  // Offscreen Document Errors (Background)
  OFFSCREEN_CREATION_FAILED: 'OFFSCREEN_CREATION_FAILED',
  OFFSCREEN_MESSAGE_FAILED: 'OFFSCREEN_MESSAGE_FAILED',
  OFFSCREEN_NOT_READY: 'OFFSCREEN_NOT_READY',
} as const;
```

Add factory function:

```typescript
export function createOffscreenError(
  code: string,
  message: string,
  recoverable: boolean,
  originalError?: unknown
): ExtensionError {
  return {
    code,
    message,
    context: 'background',
    recoverable,
    originalError,
  };
}
```

### Updated Background Script (`entrypoints/background.ts`)

```typescript
import { addMessageListener, isTTSMessage, sendMessageToBackground } from '@/lib/messages';
import { initializeDefaults } from '@/lib/storage';
import { ensureOffscreenDocument } from '@/lib/offscreen-manager';

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

    // Route TTS messages to offscreen document
    if (isTTSMessage(message)) {
      handleTTSMessage(message, sendResponse);
      return true; // Async response
    }

    // Playback messages - handle state (Epic 2)
    // Settings messages - handle (Epic 4)

    sendResponse({ success: true });
    return false;
  });
});

/**
 * Handle TTS messages by routing to offscreen document
 */
async function handleTTSMessage(
  message: TTSMessage,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  try {
    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Forward message to offscreen document
    // The offscreen document listens via chrome.runtime.onMessage
    // and filters by message type prefix
    const response = await chrome.runtime.sendMessage(message);
    sendResponse(response);
  } catch (error) {
    console.error('[SimpleReader] TTS message handling failed:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

### Updated Offscreen Document (`entrypoints/offscreen/index.ts`)

```typescript
import { addMessageListener, isTTSMessage, MessageResponse } from '@/lib/messages';
import type { TTSMessage } from '@/lib/messages';

console.log('[SimpleReader] Offscreen document loaded');

/**
 * Keep-alive mechanism to prevent Chrome from closing the document
 * during long TTS operations.
 */
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepAlive(): void {
  if (keepAliveInterval) return;

  // Create a silent audio context to keep the document alive
  // Chrome considers audio playback as "active use"
  keepAliveInterval = setInterval(() => {
    // Minimal keep-alive ping - just maintaining the interval is enough
    // to signal the document is in use
    console.debug('[SimpleReader] Offscreen keep-alive ping');
  }, 20000); // Every 20 seconds (Chrome timeout is ~30s)

  console.log('[SimpleReader] Keep-alive started');
}

function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('[SimpleReader] Keep-alive stopped');
  }
}

// Listen for TTS messages from background
addMessageListener((message, sender, sendResponse) => {
  if (isTTSMessage(message)) {
    handleTTSMessage(message, sendResponse);
    return true; // Async response
  }
  return false;
});

async function handleTTSMessage(
  message: TTSMessage,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  switch (message.type) {
    case 'TTS_GENERATE':
      startKeepAlive();
      console.log('[SimpleReader] TTS generate requested:', {
        textLength: message.text.length,
        voice: message.voice,
        speed: message.speed,
      });
      // TODO: Story 2-3 - Kokoro TTS integration
      // For now, acknowledge receipt
      sendResponse({ success: true });
      break;

    case 'TTS_COMPLETE':
      stopKeepAlive();
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: true });
  }
}

// Cleanup on unload
globalThis.addEventListener('beforeunload', () => {
  stopKeepAlive();
  console.log('[SimpleReader] Offscreen document unloading');
});
```

### Offscreen HTML (`entrypoints/offscreen/index.html`)

Verify the existing file has proper structure:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>SimpleReader Offscreen</title>
  </head>
  <body>
    <!-- Offscreen document for TTS processing -->
    <!-- No visible UI - this runs in a hidden context -->
    <script type="module" src="./index.ts"></script>
  </body>
</html>
```

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| ARCH-4: Offscreen required for TTS | Creates offscreen document for TTS processing |
| ARCH-5: Cross-context via typed messages | Uses `lib/messages.ts` for all communication |
| ARCH-6: Only import from lib/ | `offscreen-manager.ts` in `lib/`, imports from `lib/` |
| ARCH-8: Check before creating | Uses `getContexts()` before `createDocument()` |
| ARCH-9: Handle ~30s closure | Implements keep-alive mechanism |

### File Structure After Implementation

```
lib/
  offscreen-manager.ts      # NEW: Lifecycle management
  offscreen-manager.test.ts # NEW: Unit tests (Epic 8)
  errors.ts                 # UPDATED: Add OFFSCREEN_* error codes

entrypoints/
  background.ts             # UPDATED: TTS message routing
  offscreen/
    index.html              # EXISTING: Verify structure
    index.ts                # UPDATED: Keep-alive, proper message handling
```

---

## Tasks

### Task 1: Add Offscreen Error Codes
**AC: 6**
- [ ] Add `OFFSCREEN_CREATION_FAILED` to `ERROR_CODES` in `lib/errors.ts`
- [ ] Add `OFFSCREEN_MESSAGE_FAILED` to `ERROR_CODES`
- [ ] Add `OFFSCREEN_NOT_READY` to `ERROR_CODES`
- [ ] Add `createOffscreenError()` factory function

### Task 2: Create Offscreen Manager Module
**AC: 1, 2**
- [ ] Create `lib/offscreen-manager.ts`
- [ ] Implement `ensureOffscreenDocument()` with existence check
- [ ] Handle "Only a single offscreen" race condition
- [ ] Implement `isOffscreenDocumentReady()` helper
- [ ] Implement `closeOffscreenDocument()` for cleanup
- [ ] Add creation state tracking to prevent concurrent attempts

### Task 3: Update Background Script for TTS Routing
**AC: 3**
- [ ] Import `ensureOffscreenDocument` from `lib/offscreen-manager`
- [ ] Add `handleTTSMessage()` function
- [ ] Ensure offscreen document before forwarding messages
- [ ] Handle errors and send appropriate responses
- [ ] Update message listener to route TTS messages async

### Task 4: Implement Keep-Alive in Offscreen Document
**AC: 4**
- [ ] Add `keepAliveInterval` state variable
- [ ] Implement `startKeepAlive()` function (20s interval)
- [ ] Implement `stopKeepAlive()` function with cleanup
- [ ] Start keep-alive on `TTS_GENERATE`
- [ ] Stop keep-alive on `TTS_COMPLETE` or unload
- [ ] Add `beforeunload` listener for cleanup

### Task 5: Verify Offscreen HTML Structure
**AC: 1**
- [ ] Verify `entrypoints/offscreen/index.html` exists
- [ ] Confirm proper DOCTYPE and meta charset
- [ ] Confirm script module import is correct
- [ ] Test that document loads without errors

### Task 6: Manual Testing
**AC: 1, 3, 5**
- [ ] Load extension in dev mode (`bun run dev`)
- [ ] Open background service worker DevTools
- [ ] Send test TTS message from popup or content script
- [ ] Verify offscreen document is created (check DevTools)
- [ ] Verify message received in offscreen (check console)
- [ ] Wait 30+ seconds, verify keep-alive prevents closure
- [ ] Send another message, verify document reused (not recreated)
- [ ] Force close document via `closeOffscreenDocument()`, verify recreation works

---

## Definition of Done

- [ ] `lib/offscreen-manager.ts` module created with lifecycle functions
- [ ] Background script routes TTS messages to offscreen document
- [ ] Offscreen document receives and acknowledges TTS messages
- [ ] Keep-alive mechanism prevents premature document closure
- [ ] System recovers gracefully when Chrome closes the document
- [ ] Error codes added for offscreen operations
- [ ] All console logs use `[SimpleReader]` prefix
- [ ] No memory leaks from intervals or listeners

---

## Dependencies

### Depends On
- Story 1-3: Typed message protocol (`lib/messages.ts`)
- Story 1-5: Error handling foundation (`lib/errors.ts`)
- Story 1-6: Extension entrypoint skeletons (offscreen stub)

### Enables
- Story 2-3: Kokoro TTS Integration (needs working offscreen document)
- Story 2-4: TTS Fallback Chain (needs offscreen for WASM)
- Story 2-5: Word Timing Calculation (runs in offscreen)

---

## Test Scenarios

### Manual Testing Checklist

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| First TTS request | Send TTS_GENERATE message | Offscreen document created, message received |
| Subsequent request | Send another TTS_GENERATE | Same document reused, no recreation |
| Keep-alive active | Wait 30s during "processing" | Document stays open, keep-alive pings logged |
| Document recovery | Force close, send new message | Document recreated automatically |
| Race condition | Send 2 messages simultaneously | Only one document created, both handled |
| Clean shutdown | Trigger beforeunload | Keep-alive stopped, cleanup logged |

### Console Log Expectations

```
[SimpleReader] Background service worker started
[SimpleReader] Received message: TTS_GENERATE <tabId>
[SimpleReader] Offscreen document created
[SimpleReader] Offscreen document loaded
[SimpleReader] Keep-alive started
[SimpleReader] TTS generate requested: { textLength: 1234, voice: 'af_heart', speed: 1 }
[SimpleReader] Offscreen keep-alive ping  (every 20s)
[SimpleReader] Keep-alive stopped
```

### Unit Test Cases (Epic 8)

```typescript
// offscreen-manager.test.ts (to be implemented in Epic 8)
describe('ensureOffscreenDocument', () => {
  it('creates document when none exists');
  it('does not create duplicate when document exists');
  it('handles "Only a single offscreen" error gracefully');
  it('prevents concurrent creation attempts');
  it('throws ExtensionError on creation failure');
});

describe('isOffscreenDocumentReady', () => {
  it('returns true when document exists');
  it('returns false when no document');
});

describe('closeOffscreenDocument', () => {
  it('closes existing document');
  it('does nothing when no document exists');
});
```

---

## References

- [Source: docs/architecture.md#Extension Architecture] - ARCH-4, ARCH-8, ARCH-9
- [Source: docs/project_context.md#Offscreen Document Lifecycle] - Code pattern
- [Source: docs/epics.md#Story 2.2] - Original story definition
- [Source: lib/messages.ts] - `TTSMessage` types
- [Source: lib/errors.ts] - `ExtensionError` pattern
- [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) - Official docs
- [runtime.getContexts()](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getContexts) - Context checking

---

## Dev Notes

### Why getContexts() Before createDocument()?

Chrome only allows ONE offscreen document per extension. Attempting to create a second throws an error. The pattern of checking first is CRITICAL:

```typescript
// WRONG - will throw on second call
await chrome.offscreen.createDocument({...});

// CORRECT - check first
const contexts = await chrome.runtime.getContexts({
  contextTypes: ['OFFSCREEN_DOCUMENT']
});
if (contexts.length === 0) {
  await chrome.offscreen.createDocument({...});
}
```

### Chrome's 30-Second Timeout

Chrome closes offscreen documents after ~30 seconds of "inactivity". What counts as activity:
- Audio playing (via `<audio>` or Web Audio API)
- Active message exchanges
- Periodic "pings" via intervals

Our keep-alive uses a 20-second interval - well within the 30-second timeout window.

### Race Condition Handling

Multiple messages arriving simultaneously could trigger concurrent `createDocument()` calls. We handle this with:
1. An `isCreating` flag to block concurrent attempts
2. Catching the "Only a single offscreen" error as a success case
3. A `waitForCreation()` helper for blocked callers

### Offscreen Document Permissions

The offscreen document runs with extension permissions, not page permissions. It can:
- Access `chrome.runtime` for messaging
- Use Web Audio API without user gesture
- Run WebGPU (on supported devices)
- Execute WebAssembly

It cannot:
- Access the current tab's DOM
- Make requests to arbitrary origins (CSP applies)
- Show UI (it's hidden)

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

### File List

- `lib/offscreen-manager.ts` (new)
- `lib/errors.ts` (add OFFSCREEN_* error codes and factory)
- `entrypoints/background.ts` (update for TTS routing)
- `entrypoints/offscreen/index.ts` (update with keep-alive)
- `entrypoints/offscreen/index.html` (verify structure)
