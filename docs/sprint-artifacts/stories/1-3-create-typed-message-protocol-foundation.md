# Story 1.3: Create Typed Message Protocol Foundation

**Epic:** 1 - Project Setup & Architecture Foundation
**Status:** ready-for-dev
**Priority:** P0 - Critical Path
**Points:** 3

---

## User Story

**As a** developer,
**I want** a typed message protocol in `lib/messages.ts`,
**So that** all cross-context communication is type-safe and consistent.

---

## Background & Context

SimpleReader is a Chrome extension with multiple execution contexts that must communicate:

1. **Content Script** <-> **Background Service Worker** - Content extraction triggers, playback commands
2. **Background** <-> **Offscreen Document** - TTS generation requests and audio data
3. **Popup** <-> **Background** - Settings changes, playback control

Chrome's `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage` APIs are untyped by default. Without a typed protocol, message handling becomes error-prone and difficult to refactor.

**Architecture Requirements:**
- ARCH-5: All cross-context communication via typed messages from `lib/messages.ts`
- ARCH-10: Message types in SCREAMING_SNAKE_CASE with context prefix (e.g., `TTS_GENERATE`)
- ARCH-6: Never import extension-specific code between contexts - only from `lib/`

**Pattern Decision:**
The architecture specifies TypeScript discriminated unions for message types. This enables:
- Compile-time type checking
- IDE autocomplete for message payloads
- Safe narrowing in message handlers via the `type` discriminant
- Refactor-safe message renaming

---

## Acceptance Criteria

### AC1: Message Type Definitions
**Given** the configured WXT project from Stories 1.1 and 1.2
**When** I create `lib/messages.ts`
**Then:**
- [ ] File exports a discriminated union `Message` type
- [ ] All message types use SCREAMING_SNAKE_CASE naming
- [ ] Message types are prefixed with context (TTS_, PLAYBACK_, HIGHLIGHT_, CONTENT_, SETTINGS_)
- [ ] TypeScript compiles without errors

### AC2: TTS Message Types
**Given** the message protocol file exists
**When** I define TTS-related message types
**Then:**
- [ ] `TTS_GENERATE` message includes: text, voice, speed
- [ ] `TTS_PROGRESS` message includes: progress (0-100)
- [ ] `TTS_CHUNK_READY` message includes: audioData (ArrayBuffer), wordTimings (WordTiming[])
- [ ] `TTS_COMPLETE` message exists (no payload)
- [ ] `TTS_ERROR` message includes: error (ExtensionError or string)

### AC3: Playback Message Types
**Given** the TTS messages are defined
**When** I define playback control message types
**Then:**
- [ ] `PLAYBACK_PLAY` message exists (optional: fromPosition)
- [ ] `PLAYBACK_PAUSE` message exists
- [ ] `PLAYBACK_STOP` message exists
- [ ] `PLAYBACK_STATE_CHANGED` message includes: state ('playing' | 'paused' | 'stopped'), position

### AC4: Highlight Message Types
**Given** the playback messages are defined
**When** I define highlighting message types
**Then:**
- [ ] `HIGHLIGHT_WORD` message includes: wordIndex
- [ ] `HIGHLIGHT_RESET` message exists (no payload)
- [ ] `HIGHLIGHT_SCROLL_TO` message includes: wordIndex

### AC5: Content Message Types
**Given** the highlight messages are defined
**When** I define content extraction message types
**Then:**
- [ ] `CONTENT_EXTRACT` message exists (trigger extraction)
- [ ] `CONTENT_READY` message includes: text, wordCount, title (optional)
- [ ] `CONTENT_ERROR` message includes: error

### AC6: Settings Message Types
**Given** the content messages are defined
**When** I define settings message types
**Then:**
- [ ] `SETTINGS_CHANGED` message includes: key, value
- [ ] `SETTINGS_GET` message includes: key
- [ ] `SETTINGS_VALUE` message includes: key, value

### AC7: Helper Functions
**Given** all message types are defined
**When** I create helper functions
**Then:**
- [ ] `sendMessageToBackground(message)` function wraps `chrome.runtime.sendMessage`
- [ ] `sendMessageToTab(tabId, message)` function wraps `chrome.tabs.sendMessage`
- [ ] `sendMessageToOffscreen(message)` function wraps messaging to offscreen document
- [ ] `addMessageListener(handler)` function wraps `chrome.runtime.onMessage.addListener`
- [ ] All helpers are type-safe with proper return types
- [ ] Helpers handle the async response pattern correctly

### AC8: Supporting Types
**Given** the protocol is complete
**When** I examine supporting type definitions
**Then:**
- [ ] `WordTiming` interface is exported with: word, startTime, endTime, index
- [ ] `PlaybackState` type is exported: 'playing' | 'paused' | 'stopped' | 'loading'
- [ ] Response types are defined for request/response patterns

---

## Technical Details

### File Location

```
simplereader/
├── lib/
│   └── messages.ts    # <- Create this file
├── entrypoints/
│   ├── background.ts
│   ├── popup/
│   └── ...
└── ...
```

**Note:** WXT 0.20+ uses `entrypoints/` at root level (not `src/entrypoints/`). The `lib/` folder should also be at root level alongside `entrypoints/`.

### Message Protocol Implementation

```typescript
// lib/messages.ts

// ============================================
// Supporting Types
// ============================================

export interface WordTiming {
  word: string;
  startTime: number;  // ms from audio start
  endTime: number;    // ms from audio start
  index: number;      // word position in text
}

export type PlaybackState = 'loading' | 'playing' | 'paused' | 'stopped';

// ============================================
// Message Type Definitions (Discriminated Union)
// ============================================

// TTS Engine Messages (Background <-> Offscreen)
export type TTSMessage =
  | { type: 'TTS_GENERATE'; text: string; voice: string; speed: number }
  | { type: 'TTS_PROGRESS'; progress: number }
  | { type: 'TTS_CHUNK_READY'; audioData: ArrayBuffer; wordTimings: WordTiming[] }
  | { type: 'TTS_COMPLETE' }
  | { type: 'TTS_ERROR'; error: string };

// Playback Control Messages (Content <-> Background)
export type PlaybackMessage =
  | { type: 'PLAYBACK_PLAY'; fromPosition?: number }
  | { type: 'PLAYBACK_PAUSE' }
  | { type: 'PLAYBACK_STOP' }
  | { type: 'PLAYBACK_STATE_CHANGED'; state: PlaybackState; position: number };

// Word Highlighting Messages (Background -> Content)
export type HighlightMessage =
  | { type: 'HIGHLIGHT_WORD'; wordIndex: number }
  | { type: 'HIGHLIGHT_RESET' }
  | { type: 'HIGHLIGHT_SCROLL_TO'; wordIndex: number };

// Content Extraction Messages (Content <-> Background)
export type ContentMessage =
  | { type: 'CONTENT_EXTRACT' }
  | { type: 'CONTENT_READY'; text: string; wordCount: number; title?: string }
  | { type: 'CONTENT_ERROR'; error: string };

// Settings Messages (Popup <-> Background)
export type SettingsMessage =
  | { type: 'SETTINGS_CHANGED'; key: string; value: unknown }
  | { type: 'SETTINGS_GET'; key: string }
  | { type: 'SETTINGS_VALUE'; key: string; value: unknown };

// Combined Message Type (all possible messages)
export type Message =
  | TTSMessage
  | PlaybackMessage
  | HighlightMessage
  | ContentMessage
  | SettingsMessage;

// ============================================
// Response Types
// ============================================

export interface MessageResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// Type Guards
// ============================================

export function isTTSMessage(msg: Message): msg is TTSMessage {
  return msg.type.startsWith('TTS_');
}

export function isPlaybackMessage(msg: Message): msg is PlaybackMessage {
  return msg.type.startsWith('PLAYBACK_');
}

export function isHighlightMessage(msg: Message): msg is HighlightMessage {
  return msg.type.startsWith('HIGHLIGHT_');
}

export function isContentMessage(msg: Message): msg is ContentMessage {
  return msg.type.startsWith('CONTENT_');
}

export function isSettingsMessage(msg: Message): msg is SettingsMessage {
  return msg.type.startsWith('SETTINGS_');
}

// ============================================
// Message Sending Helpers
// ============================================

/**
 * Send a message to the background service worker.
 * Use from: content scripts, popup, options page
 */
export async function sendMessageToBackground<T = void>(
  message: Message
): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        resolve(response ?? { success: true });
      }
    });
  });
}

/**
 * Send a message to a specific tab's content script.
 * Use from: background service worker
 */
export async function sendMessageToTab<T = void>(
  tabId: number,
  message: Message
): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        resolve(response ?? { success: true });
      }
    });
  });
}

/**
 * Send a message to the offscreen document.
 * Use from: background service worker only
 *
 * Note: Offscreen documents receive messages via chrome.runtime.onMessage
 * just like other extension contexts. The target filtering happens
 * in the offscreen document's message handler.
 */
export async function sendMessageToOffscreen<T = void>(
  message: TTSMessage
): Promise<MessageResponse<T>> {
  // Offscreen documents receive runtime messages like other contexts
  // The offscreen handler filters by message type prefix
  return sendMessageToBackground<T>(message);
}

// ============================================
// Message Listener Helper
// ============================================

export type MessageHandler = (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
) => boolean | void;

/**
 * Add a typed message listener.
 * Return true from handler to indicate async response (call sendResponse later).
 * Return false/undefined for sync response.
 */
export function addMessageListener(handler: MessageHandler): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Type guard: ensure message has a type property
    if (typeof message === 'object' && message !== null && 'type' in message) {
      return handler(message as Message, sender, sendResponse);
    }
    return false;
  });
}

// ============================================
// Message Creation Helpers (for type safety)
// ============================================

export const Messages = {
  // TTS
  ttsGenerate: (text: string, voice: string, speed: number): TTSMessage => ({
    type: 'TTS_GENERATE',
    text,
    voice,
    speed,
  }),
  ttsProgress: (progress: number): TTSMessage => ({
    type: 'TTS_PROGRESS',
    progress,
  }),
  ttsChunkReady: (audioData: ArrayBuffer, wordTimings: WordTiming[]): TTSMessage => ({
    type: 'TTS_CHUNK_READY',
    audioData,
    wordTimings,
  }),
  ttsComplete: (): TTSMessage => ({ type: 'TTS_COMPLETE' }),
  ttsError: (error: string): TTSMessage => ({ type: 'TTS_ERROR', error }),

  // Playback
  playbackPlay: (fromPosition?: number): PlaybackMessage => ({
    type: 'PLAYBACK_PLAY',
    ...(fromPosition !== undefined && { fromPosition }),
  }),
  playbackPause: (): PlaybackMessage => ({ type: 'PLAYBACK_PAUSE' }),
  playbackStop: (): PlaybackMessage => ({ type: 'PLAYBACK_STOP' }),
  playbackStateChanged: (state: PlaybackState, position: number): PlaybackMessage => ({
    type: 'PLAYBACK_STATE_CHANGED',
    state,
    position,
  }),

  // Highlight
  highlightWord: (wordIndex: number): HighlightMessage => ({
    type: 'HIGHLIGHT_WORD',
    wordIndex,
  }),
  highlightReset: (): HighlightMessage => ({ type: 'HIGHLIGHT_RESET' }),
  highlightScrollTo: (wordIndex: number): HighlightMessage => ({
    type: 'HIGHLIGHT_SCROLL_TO',
    wordIndex,
  }),

  // Content
  contentExtract: (): ContentMessage => ({ type: 'CONTENT_EXTRACT' }),
  contentReady: (text: string, wordCount: number, title?: string): ContentMessage => ({
    type: 'CONTENT_READY',
    text,
    wordCount,
    ...(title && { title }),
  }),
  contentError: (error: string): ContentMessage => ({ type: 'CONTENT_ERROR', error }),

  // Settings
  settingsChanged: (key: string, value: unknown): SettingsMessage => ({
    type: 'SETTINGS_CHANGED',
    key,
    value,
  }),
  settingsGet: (key: string): SettingsMessage => ({ type: 'SETTINGS_GET', key }),
  settingsValue: (key: string, value: unknown): SettingsMessage => ({
    type: 'SETTINGS_VALUE',
    key,
    value,
  }),
} as const;
```

### Usage Examples

**In Content Script:**
```typescript
import { sendMessageToBackground, Messages, addMessageListener } from '@/lib/messages';

// Send extracted content to background
const response = await sendMessageToBackground(
  Messages.contentReady(articleText, wordCount, pageTitle)
);

// Listen for highlight commands
addMessageListener((message, sender, sendResponse) => {
  if (message.type === 'HIGHLIGHT_WORD') {
    highlightWordAtIndex(message.wordIndex);
    sendResponse({ success: true });
  }
  return false;
});
```

**In Background Service Worker:**
```typescript
import { addMessageListener, sendMessageToTab, Messages } from '@/lib/messages';

addMessageListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'CONTENT_READY':
      // TypeScript knows message has text, wordCount, title
      startTTSGeneration(message.text, message.wordCount);
      sendResponse({ success: true });
      break;

    case 'PLAYBACK_PLAY':
      // TypeScript knows message may have fromPosition
      handlePlay(message.fromPosition);
      sendResponse({ success: true });
      break;
  }
  return false;
});

// Send highlight command to tab
await sendMessageToTab(tabId, Messages.highlightWord(currentWordIndex));
```

**In Popup:**
```typescript
import { sendMessageToBackground, Messages } from '@/lib/messages';

// Request current settings
const response = await sendMessageToBackground(Messages.settingsGet('preferredVoice'));
if (response.success && response.data) {
  setVoice(response.data as string);
}

// Change a setting
await sendMessageToBackground(Messages.settingsChanged('preferredSpeed', 1.5));
```

### Path Alias Configuration

WXT uses `@/` as an alias for the project root. Verify `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

This allows imports like `import { Messages } from '@/lib/messages'`.

---

## Implementation Tasks

### Task 1: Create lib/ Directory Structure
- [ ] Create `lib/` directory at project root (alongside `entrypoints/`)
- [ ] Verify directory is not inside `entrypoints/` (common mistake)

### Task 2: Implement Supporting Types (AC: 8)
- [ ] Create `lib/messages.ts` file
- [ ] Define `WordTiming` interface
- [ ] Define `PlaybackState` type
- [ ] Define `MessageResponse<T>` interface

### Task 3: Implement Message Type Unions (AC: 1-6)
- [ ] Define `TTSMessage` discriminated union (5 variants)
- [ ] Define `PlaybackMessage` discriminated union (4 variants)
- [ ] Define `HighlightMessage` discriminated union (3 variants)
- [ ] Define `ContentMessage` discriminated union (3 variants)
- [ ] Define `SettingsMessage` discriminated union (3 variants)
- [ ] Define combined `Message` union type

### Task 4: Implement Type Guards
- [ ] Create `isTTSMessage` type guard
- [ ] Create `isPlaybackMessage` type guard
- [ ] Create `isHighlightMessage` type guard
- [ ] Create `isContentMessage` type guard
- [ ] Create `isSettingsMessage` type guard

### Task 5: Implement Helper Functions (AC: 7)
- [ ] Implement `sendMessageToBackground`
- [ ] Implement `sendMessageToTab`
- [ ] Implement `sendMessageToOffscreen`
- [ ] Implement `addMessageListener`

### Task 6: Implement Message Factory (Messages object)
- [ ] Create `Messages` const object with factory functions
- [ ] Ensure all message types have corresponding factory

### Task 7: TypeScript Verification
- [ ] Run `bun run build` to verify TypeScript compilation
- [ ] Verify no type errors in `lib/messages.ts`
- [ ] Test import in `entrypoints/background.ts` (add and remove test import)

---

## Testing Checklist

### Manual Testing
- [ ] `lib/messages.ts` file exists at correct location
- [ ] TypeScript compiles without errors (`bun run build`)
- [ ] Can import from `@/lib/messages` in entrypoints
- [ ] IDE autocomplete works for message types
- [ ] IDE autocomplete works for `Messages.*` factory functions

### Type Verification Script

Add this temporary test in `entrypoints/background.ts` to verify types work:

```typescript
// TEMPORARY TYPE TEST - Remove after verification
import { Message, Messages, addMessageListener } from '@/lib/messages';

// Test discriminated union narrowing
function handleMessage(msg: Message) {
  switch (msg.type) {
    case 'TTS_GENERATE':
      // TypeScript should know: msg.text, msg.voice, msg.speed
      console.log(msg.text, msg.voice, msg.speed);
      break;
    case 'PLAYBACK_STATE_CHANGED':
      // TypeScript should know: msg.state, msg.position
      console.log(msg.state, msg.position);
      break;
    case 'HIGHLIGHT_WORD':
      // TypeScript should know: msg.wordIndex
      console.log(msg.wordIndex);
      break;
  }
}

// Test factory functions
const msg1 = Messages.ttsGenerate('Hello', 'af_bella', 1.0);
const msg2 = Messages.playbackPlay(0);
const msg3 = Messages.highlightWord(5);

// If this compiles, types are working
// END TEMPORARY TYPE TEST
```

### Verification Commands

```bash
# Check TypeScript compilation
bun run build

# Start dev server to verify no runtime errors
bun run dev

# If using tsc directly
bunx tsc --noEmit
```

---

## Definition of Done

- [ ] `lib/messages.ts` exists at project root level
- [ ] All 5 message category types are defined (TTS, Playback, Highlight, Content, Settings)
- [ ] Combined `Message` discriminated union type is exported
- [ ] All helper functions are implemented (`sendMessageToBackground`, `sendMessageToTab`, `sendMessageToOffscreen`, `addMessageListener`)
- [ ] `Messages` factory object is implemented with all message creators
- [ ] Type guards are implemented for each message category
- [ ] `WordTiming` and `PlaybackState` types are exported
- [ ] TypeScript compiles without errors
- [ ] Types enable proper narrowing in switch statements
- [ ] IDE autocomplete works for all exports

---

## Dependencies

**Depends on:**
- Story 1.1 (WXT project initialization) - DONE
- Story 1.2 (Manifest configuration) - DONE

**Blocks:**
- Story 1.4 (Storage keys) - needs similar patterns
- Story 1.5 (Error handling) - may integrate with message errors
- Story 1.6 (Entrypoint skeletons) - will use message listeners
- All Epic 2 stories - will use message protocol

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Path alias not configured | Import errors | Verify `tsconfig.json` paths config |
| Wrong directory location | Import confusion | Document correct location (`lib/` at root, not in `src/`) |
| ArrayBuffer serialization issues | Runtime errors for TTS chunks | Test with actual ArrayBuffer in Epic 2 |
| Type inference too complex | Slow IDE | Keep union types flat, avoid deep nesting |

---

## Dev Notes

### WXT Project Structure Clarification

WXT 0.20+ moved away from `src/` prefix. The standard structure is:

```
simplereader/
├── entrypoints/     # NOT src/entrypoints/
├── lib/             # Shared code (create this)
├── public/
├── wxt.config.ts
└── package.json
```

### Why Discriminated Unions?

The `type` property acts as a discriminant that TypeScript uses to narrow types:

```typescript
function handle(msg: Message) {
  if (msg.type === 'TTS_GENERATE') {
    // TypeScript narrows msg to { type: 'TTS_GENERATE'; text: string; ... }
    console.log(msg.text); // OK
    console.log(msg.wordIndex); // ERROR - doesn't exist on this type
  }
}
```

### ArrayBuffer Serialization Note

`ArrayBuffer` cannot be directly cloned via `chrome.runtime.sendMessage` in all cases. For TTS audio data, we may need to:
1. Convert to `Uint8Array` before sending
2. Use `chrome.runtime.sendMessage` with transfer support
3. Or stream audio via a different mechanism

This will be addressed in Epic 2 when implementing actual TTS integration.

### Alternative: webext-bridge / @webext-core/messaging

The architecture chose vanilla typed messages over these libraries for:
- Zero dependencies
- Full control over message format
- Simpler debugging

Libraries like `@webext-core/messaging` provide similar type-safe patterns but add dependency weight.

---

## References

- [Source: docs/architecture.md#Message Protocol Design] - Discriminated union pattern
- [Source: docs/architecture.md#Implementation Patterns] - SCREAMING_SNAKE_CASE naming
- [Source: docs/project_context.md#Message Protocol] - Critical rules
- [Source: docs/epics.md#Story 1.3] - Original story definition
- [Chrome Runtime API](https://developer.chrome.com/docs/extensions/reference/api/runtime)
- [TypeScript Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [WXT Path Aliases](https://wxt.dev/guide/essentials/config/typescript.html)

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

### File List

- `lib/messages.ts` - New file with typed message protocol
