# Story 1.5: Create Error Handling Foundation

## Story Info

| Field | Value |
|-------|-------|
| Epic | 1 - Project Setup & Architecture Foundation |
| Story ID | 1-5 |
| Story Key | 1-5-create-error-handling-foundation |
| Title | Create Error Handling Foundation |
| Status | ready-for-dev |
| Created | 2025-12-11 |
| Dependencies | 1-3 (messages.ts), 1-4 (storage.ts) |

## User Story

**As a** developer,
**I want** a typed error system in `lib/errors.ts`,
**So that** errors are consistently structured across all extension contexts.

## Context

SimpleReader is a Chrome extension with multiple isolated execution contexts:
- **Service Worker** (background): Message routing, command handling
- **Offscreen Document**: TTS engine (Kokoro), WebGPU/WASM processing
- **Content Script**: Content extraction, word highlighting, mini-player
- **Popup**: Settings UI

Each context can produce different error types that need consistent handling:
- **TTS errors**: Model loading failures, synthesis failures, WebGPU/WASM unavailability
- **Content extraction errors**: Readability failures, empty content, malformed HTML
- **Storage errors**: Quota exceeded, sync failures
- **Network errors**: Model download failures, timeout

The architecture document (ARCH-3) specifies creating `lib/errors.ts` as part of the foundational shared infrastructure, with the `ExtensionError` interface pattern documented in the Implementation Patterns section.

## Acceptance Criteria

### AC1: ExtensionError Interface
**Given** the project with storage helpers (1-4 complete)
**When** I create `lib/errors.ts`
**Then** it exports an `ExtensionError` interface with:
- `code`: Machine-readable error code (string)
- `message`: Human-readable error message (string)
- `context`: Extension context where error occurred ('offscreen' | 'content' | 'background' | 'popup')
- `recoverable`: Whether the user can retry (boolean)
- `originalError?`: Original error for debugging (optional unknown)

### AC2: Error Codes Enum
**Given** the ExtensionError interface exists
**When** I define error codes
**Then** error codes follow SCREAMING_SNAKE_CASE naming with context prefix:
- `TTS_MODEL_LOAD_FAILED`
- `TTS_SYNTHESIS_FAILED`
- `TTS_WEBGPU_UNAVAILABLE`
- `TTS_WASM_FAILED`
- `CONTENT_EXTRACTION_FAILED`
- `CONTENT_EMPTY`
- `STORAGE_QUOTA_EXCEEDED`
- `STORAGE_SYNC_FAILED`
- `NETWORK_DOWNLOAD_FAILED`
- `NETWORK_TIMEOUT`

### AC3: Error Factory Functions
**Given** the error codes are defined
**When** I create helper functions
**Then** it exports factory functions to create errors:
- `createTTSError(code, message, recoverable, originalError?)` - TTS-specific errors
- `createContentError(code, message, recoverable, originalError?)` - Content extraction errors
- `createStorageError(code, message, recoverable, originalError?)` - Storage errors
- `createNetworkError(code, message, recoverable, originalError?)` - Network errors

### AC4: Error Integration with Message Protocol
**Given** the error system is created
**When** errors need to be propagated via messages
**Then** errors can be serialized for message passing:
- `serializeError(error: ExtensionError): SerializedError` - Convert to JSON-safe format
- `deserializeError(data: SerializedError): ExtensionError` - Reconstruct from message

### AC5: Type Guards and Utilities
**Given** the error types are defined
**When** I need to identify error types in handlers
**Then** it exports type guards and utilities:
- `isExtensionError(error: unknown): error is ExtensionError`
- `isTTSError(error: ExtensionError): boolean`
- `isRecoverable(error: ExtensionError): boolean`
- `getErrorContext(error: ExtensionError): string`

### AC6: TypeScript Compilation
**Given** all error handling code is written
**When** I run TypeScript compilation
**Then** TypeScript compiles without errors
**And** no `any` types are used (strict mode compliant)

## Technical Notes

### Architecture Reference
From `docs/architecture.md` - Implementation Patterns & Consistency Rules:

```typescript
interface ExtensionError {
  code: string;           // Machine-readable: 'TTS_MODEL_LOAD_FAILED'
  message: string;        // Human-readable: 'Failed to load voice model'
  context: 'offscreen' | 'content' | 'background' | 'popup';
  recoverable: boolean;   // Can user retry?
  originalError?: unknown; // For debugging
}

// Propagate via message protocol
| { type: 'TTS_ERROR'; error: ExtensionError }
| { type: 'CONTENT_ERROR'; error: ExtensionError }
```

### File Location
`src/lib/errors.ts` - following the project structure in `docs/architecture.md`

### Co-located Test
`src/lib/errors.test.ts` - per ARCH-13, tests are co-located with source

### Integration Points
- **messages.ts**: Error messages integrate with `TTS_ERROR` and `CONTENT_ERROR` message types
- **storage.ts**: Storage errors use storage key constants for error context
- **All entrypoints**: Import error utilities from `lib/errors.ts`

### Error Serialization Note
`originalError` may contain non-serializable data (Error objects, stack traces). The `serializeError` function should:
1. Convert Error objects to `{ name, message, stack }` format
2. Handle circular references safely
3. Preserve essential debugging information

## Tasks

### Task 1: Create ExtensionError Interface and Error Codes
Create the base types in `lib/errors.ts`:
- [ ] Define `ExtensionError` interface per architecture spec
- [ ] Define `ExtensionContext` type union
- [ ] Create `ERROR_CODES` const object with all error codes
- [ ] Group error codes by context (TTS_, CONTENT_, STORAGE_, NETWORK_)

### Task 2: Implement Error Factory Functions
Create typed factory functions:
- [ ] `createError(code, message, context, recoverable, originalError?)` - base factory
- [ ] `createTTSError(...)` - sets context to 'offscreen'
- [ ] `createContentError(...)` - sets context to 'content'
- [ ] `createStorageError(...)` - sets context to 'background'
- [ ] `createNetworkError(...)` - sets context to 'offscreen'

### Task 3: Implement Serialization Functions
Enable error passing via chrome.runtime messages:
- [ ] Define `SerializedError` interface (JSON-safe)
- [ ] Implement `serializeError(error)` - handles Error objects, removes non-serializable data
- [ ] Implement `deserializeError(data)` - reconstructs ExtensionError

### Task 4: Implement Type Guards and Utilities
Create runtime type checking utilities:
- [ ] `isExtensionError(error)` - type guard for unknown errors
- [ ] `isTTSError(error)` - checks if code starts with 'TTS_'
- [ ] `isContentError(error)` - checks if code starts with 'CONTENT_'
- [ ] `isStorageError(error)` - checks if code starts with 'STORAGE_'
- [ ] `isNetworkError(error)` - checks if code starts with 'NETWORK_'
- [ ] `isRecoverable(error)` - checks recoverable flag
- [ ] `getErrorContext(error)` - returns context string for logging

### Task 5: Write Unit Tests
Create comprehensive tests in `lib/errors.test.ts`:
- [ ] Test ExtensionError creation with all factory functions
- [ ] Test error code validation
- [ ] Test serialization/deserialization roundtrip
- [ ] Test type guards with various inputs
- [ ] Test handling of non-serializable originalError values

### Task 6: Verify Integration
Ensure errors work with existing infrastructure:
- [ ] TypeScript compiles without errors
- [ ] Error types align with message protocol (`TTS_ERROR`, `CONTENT_ERROR`)
- [ ] No circular dependencies between lib/ modules
- [ ] Run `bun test` to verify all tests pass

## Dev Notes

### Example Usage Pattern

```typescript
// In offscreen document (TTS engine)
import { createTTSError, ERROR_CODES, serializeError } from '@/lib/errors';
import { Messages, sendMessageToBackground } from '@/lib/messages';

try {
  await loadKokoroModel();
} catch (e) {
  const error = createTTSError(
    ERROR_CODES.TTS_MODEL_LOAD_FAILED,
    'Failed to load Kokoro TTS model',
    true, // recoverable - user can retry
    e
  );

  // Propagate via message
  sendMessageToBackground(Messages.ttsError(serializeError(error).message));
}
```

```typescript
// In background service worker (error routing)
import { isExtensionError, isRecoverable, deserializeError } from '@/lib/errors';

addMessageListener((message, sender, sendResponse) => {
  if (message.type === 'TTS_ERROR') {
    const error = deserializeError(message.error);

    if (isRecoverable(error)) {
      // Show retry UI
    } else {
      // Fall back to Web Speech API
    }
  }
});
```

### Alignment with messages.ts
The existing `TTS_ERROR` message type uses `error: string`. This story maintains backward compatibility while enabling richer error handling:
- Simple string errors continue to work
- ExtensionError can be serialized to string via `serializeError`
- Future stories can update message types to use `ExtensionError` directly

### No External Dependencies
This module uses only TypeScript and standard JavaScript - no external packages required.

## Definition of Done

- [ ] `lib/errors.ts` exports all types and functions per acceptance criteria
- [ ] `lib/errors.test.ts` covers all error factory functions and utilities
- [ ] TypeScript compiles with no errors (`bun run typecheck`)
- [ ] All tests pass (`bun test`)
- [ ] No `any` types used (strict TypeScript compliance)
- [ ] Error codes follow SCREAMING_SNAKE_CASE with context prefix
- [ ] File follows project patterns (const objects, discriminated unions)
