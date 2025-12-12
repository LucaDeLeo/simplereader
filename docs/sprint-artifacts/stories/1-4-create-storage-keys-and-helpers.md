# Story 1.4: Create Storage Keys and Helpers

## Story Overview

**Epic:** 1 - Project Setup & Architecture Foundation
**Story ID:** 1-4
**Title:** Create Storage Keys and Helpers
**Status:** ready-for-dev

### User Story

As a developer,
I want centralized storage keys in `lib/storage.ts`,
So that all storage access is consistent and typo-proof.

### Business Value

Type-safe storage access prevents runtime bugs from typos in storage key strings. Centralized definitions ensure consistency across all extension contexts (background, content, popup, offscreen) and make refactoring safe.

---

## Acceptance Criteria

### AC1: STORAGE_KEYS Constant Object

**Given** the project with message protocol in place
**When** I create `lib/storage.ts`
**Then** it exports a `STORAGE_KEYS` const object with all planned storage keys grouped by category

**Verification:**
- TypeScript compiles without errors
- Object is `as const` for literal types
- Keys follow camelCase naming per architecture

### AC2: Typed Storage Value Definitions

**Given** the STORAGE_KEYS constant
**When** using storage helpers
**Then** each key has an associated TypeScript type for its value

**Verification:**
- TypeScript infers correct value types from keys
- Invalid values cause compile-time errors
- Union types used where appropriate (e.g., highlight colors)

### AC3: Get/Set Helper Functions for Sync Storage

**Given** user preferences need to be stored
**When** I use `getStorageValue` and `setStorageValue` helpers
**Then** they work with `chrome.storage.sync` for user preferences
**And** return type-safe values based on the key

**Verification:**
- `getStorageValue(STORAGE_KEYS.preferredVoice)` returns `Promise<string | undefined>`
- `setStorageValue(STORAGE_KEYS.preferredVoice, 'af_bella')` compiles
- `setStorageValue(STORAGE_KEYS.preferredVoice, 123)` causes TypeScript error

### AC4: Local Storage Helpers for Session State

**Given** session-specific data needs storage
**When** I use local storage helpers
**Then** they work with `chrome.storage.local` for session state
**And** clearly distinguish from sync storage

**Verification:**
- `getLocalValue(STORAGE_KEYS.modelLoaded)` works for local-only keys
- Documentation clarifies sync vs local usage
- Keys are organized by storage type

---

## Technical Context

### Architecture References

From `docs/architecture.md`:
- Storage Key Naming: camelCase, grouped by feature, defined as const object
- State Boundaries: `chrome.storage.sync` for cross-device prefs, `chrome.storage.local` for device-local session state
- Anti-pattern: Never use string literals for storage keys

From `docs/project_context.md`:
- Storage keys defined in `lib/storage.ts` only
- Sync storage for user prefs, local for session state

### Existing Code Patterns

From `lib/messages.ts`:
- Use discriminated unions and const objects for type safety
- Export helper functions for common operations
- Use `as const` for literal type inference

### Storage Requirements (from PRD/Architecture)

**User Preferences (sync - cross-device):**
- `preferredVoice` - Selected Kokoro voice ID
- `preferredSpeed` - Playback speed (0.5 to 2.0)
- `highlightColor` - Highlight color preference
- `codeBlockHandling` - How to handle code blocks (skip/read)

**Session State (local - device-only):**
- `modelLoaded` - Whether TTS model is currently loaded
- `lastPlayedUrl` - URL of last played article
- `lastPlayedPosition` - Word index where playback stopped
- `deviceCapability` - Detected runtime (webgpu/wasm/webspeech)

**Model State (local):**
- `modelDownloadProgress` - Current download progress (0-100)
- `modelCachedAt` - Timestamp when model was cached

---

## Implementation Tasks

### Task 1: Create storage.ts with STORAGE_KEYS constant

**File:** `lib/storage.ts`

Define all storage keys in a single const object:

```typescript
export const STORAGE_KEYS = {
  // User Preferences (chrome.storage.sync)
  preferredVoice: 'preferredVoice',
  preferredSpeed: 'preferredSpeed',
  highlightColor: 'highlightColor',
  codeBlockHandling: 'codeBlockHandling',

  // Session State (chrome.storage.local)
  modelLoaded: 'modelLoaded',
  lastPlayedUrl: 'lastPlayedUrl',
  lastPlayedPosition: 'lastPlayedPosition',
  deviceCapability: 'deviceCapability',

  // Model State (chrome.storage.local)
  modelDownloadProgress: 'modelDownloadProgress',
  modelCachedAt: 'modelCachedAt',
} as const;
```

### Task 2: Define storage value types

Create a type map that associates each key with its value type:

```typescript
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | string;
export type CodeBlockHandling = 'skip' | 'read' | 'announce';
export type DeviceCapability = 'webgpu' | 'wasm' | 'webspeech';

export interface StorageValues {
  // User Preferences
  preferredVoice: string;
  preferredSpeed: number;
  highlightColor: HighlightColor;
  codeBlockHandling: CodeBlockHandling;

  // Session State
  modelLoaded: boolean;
  lastPlayedUrl: string;
  lastPlayedPosition: number;
  deviceCapability: DeviceCapability;

  // Model State
  modelDownloadProgress: number;
  modelCachedAt: number;
}
```

### Task 3: Implement sync storage helpers

Create type-safe get/set for user preferences:

```typescript
type SyncStorageKey =
  | typeof STORAGE_KEYS.preferredVoice
  | typeof STORAGE_KEYS.preferredSpeed
  | typeof STORAGE_KEYS.highlightColor
  | typeof STORAGE_KEYS.codeBlockHandling;

export async function getSyncValue<K extends SyncStorageKey>(
  key: K
): Promise<StorageValues[K] | undefined> {
  const result = await chrome.storage.sync.get(key);
  return result[key];
}

export async function setSyncValue<K extends SyncStorageKey>(
  key: K,
  value: StorageValues[K]
): Promise<void> {
  await chrome.storage.sync.set({ [key]: value });
}
```

### Task 4: Implement local storage helpers

Create type-safe get/set for session and model state:

```typescript
type LocalStorageKey =
  | typeof STORAGE_KEYS.modelLoaded
  | typeof STORAGE_KEYS.lastPlayedUrl
  | typeof STORAGE_KEYS.lastPlayedPosition
  | typeof STORAGE_KEYS.deviceCapability
  | typeof STORAGE_KEYS.modelDownloadProgress
  | typeof STORAGE_KEYS.modelCachedAt;

export async function getLocalValue<K extends LocalStorageKey>(
  key: K
): Promise<StorageValues[K] | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

export async function setLocalValue<K extends LocalStorageKey>(
  key: K,
  value: StorageValues[K]
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}
```

### Task 5: Add default values and initialization helper

Provide sensible defaults for user preferences:

```typescript
export const STORAGE_DEFAULTS: Partial<StorageValues> = {
  preferredVoice: 'af_bella',  // Default Kokoro voice
  preferredSpeed: 1.0,
  highlightColor: 'yellow',
  codeBlockHandling: 'announce',
};

export async function initializeDefaults(): Promise<void> {
  const existing = await chrome.storage.sync.get(Object.keys(STORAGE_DEFAULTS));
  const toSet: Partial<StorageValues> = {};

  for (const [key, defaultValue] of Object.entries(STORAGE_DEFAULTS)) {
    if (existing[key] === undefined) {
      toSet[key as keyof StorageValues] = defaultValue;
    }
  }

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.sync.set(toSet);
  }
}
```

### Task 6: Add storage change listener helper

Enable reactive updates when storage changes:

```typescript
export type StorageChangeHandler<K extends keyof StorageValues> = (
  newValue: StorageValues[K] | undefined,
  oldValue: StorageValues[K] | undefined
) => void;

export function onStorageChange<K extends keyof StorageValues>(
  key: K,
  handler: StorageChangeHandler<K>,
  storageArea: 'sync' | 'local' = 'sync'
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === storageArea && key in changes) {
      handler(changes[key].newValue, changes[key].oldValue);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  // Return unsubscribe function
  return () => chrome.storage.onChanged.removeListener(listener);
}
```

---

## Definition of Done

- [ ] `lib/storage.ts` exports `STORAGE_KEYS` const object
- [ ] All planned storage keys are defined and categorized
- [ ] TypeScript value types are defined for each key
- [ ] `getSyncValue`/`setSyncValue` work with sync storage
- [ ] `getLocalValue`/`setLocalValue` work with local storage
- [ ] Type safety prevents invalid key/value combinations
- [ ] Default values defined for user preferences
- [ ] `initializeDefaults()` helper available
- [ ] `onStorageChange()` listener helper available
- [ ] TypeScript compiles without errors
- [ ] No string literals used for storage keys

---

## Test Scenarios

### Unit Tests (lib/storage.test.ts)

```typescript
describe('STORAGE_KEYS', () => {
  it('should have all required user preference keys', () => {
    expect(STORAGE_KEYS.preferredVoice).toBe('preferredVoice');
    expect(STORAGE_KEYS.preferredSpeed).toBe('preferredSpeed');
    expect(STORAGE_KEYS.highlightColor).toBe('highlightColor');
  });

  it('should have all required session state keys', () => {
    expect(STORAGE_KEYS.modelLoaded).toBeDefined();
    expect(STORAGE_KEYS.lastPlayedUrl).toBeDefined();
  });
});

describe('getSyncValue/setSyncValue', () => {
  it('should store and retrieve string values', async () => {
    await setSyncValue(STORAGE_KEYS.preferredVoice, 'af_bella');
    const value = await getSyncValue(STORAGE_KEYS.preferredVoice);
    expect(value).toBe('af_bella');
  });

  it('should store and retrieve number values', async () => {
    await setSyncValue(STORAGE_KEYS.preferredSpeed, 1.5);
    const value = await getSyncValue(STORAGE_KEYS.preferredSpeed);
    expect(value).toBe(1.5);
  });

  it('should return undefined for missing keys', async () => {
    const value = await getSyncValue(STORAGE_KEYS.preferredVoice);
    expect(value).toBeUndefined();
  });
});

describe('getLocalValue/setLocalValue', () => {
  it('should store and retrieve boolean values', async () => {
    await setLocalValue(STORAGE_KEYS.modelLoaded, true);
    const value = await getLocalValue(STORAGE_KEYS.modelLoaded);
    expect(value).toBe(true);
  });
});

describe('initializeDefaults', () => {
  it('should set defaults for missing values only', async () => {
    await setSyncValue(STORAGE_KEYS.preferredSpeed, 1.8);
    await initializeDefaults();

    // Custom value preserved
    expect(await getSyncValue(STORAGE_KEYS.preferredSpeed)).toBe(1.8);
    // Default applied to missing
    expect(await getSyncValue(STORAGE_KEYS.preferredVoice)).toBe('af_bella');
  });
});

describe('onStorageChange', () => {
  it('should call handler when value changes', async () => {
    const handler = vi.fn();
    const unsubscribe = onStorageChange(STORAGE_KEYS.preferredVoice, handler);

    await setSyncValue(STORAGE_KEYS.preferredVoice, 'af_sarah');

    expect(handler).toHaveBeenCalledWith('af_sarah', undefined);
    unsubscribe();
  });
});
```

---

## Dependencies

### Requires Completion Of
- Story 1.1: WXT project initialization (for chrome types)
- Story 1.2: Manifest configuration (for storage permission)
- Story 1.3: Typed message protocol (for pattern reference)

### Enables
- Story 1.5: Error handling foundation
- Story 4.1-4.4: All user preferences stories
- Story 6.2: Offline model caching
- Story 2.7: Playback state persistence

---

## Notes for Developer

1. **Follow the pattern from messages.ts** - Use similar structure with const objects, type maps, and helper functions

2. **Sync vs Local distinction is critical** - User preferences go in sync (cross-device), session state goes in local (device-only)

3. **Never use string literals** - Always use `STORAGE_KEYS.keyName`, never `'keyName'`

4. **Default voice** - Use `'af_bella'` as the default Kokoro voice (natural-sounding female voice)

5. **Speed range** - Valid range is 0.5 to 2.0, default is 1.0

6. **Highlight colors** - Support preset colors plus custom hex codes

7. **Test with chrome.storage mock** - WxtVitest provides mocked chrome APIs

---

## File Structure After Completion

```
lib/
  messages.ts      # (from 1-3)
  storage.ts       # <- This story
  storage.test.ts  # <- This story
```

---

## References

- Architecture: `/Users/luca/dev/simplereader/docs/architecture.md` (Storage Key Naming, State Boundaries)
- Project Context: `/Users/luca/dev/simplereader/docs/project_context.md` (Storage Keys section)
- Message Protocol Pattern: `/Users/luca/dev/simplereader/lib/messages.ts`
- Epic Definition: `/Users/luca/dev/simplereader/docs/epics.md` (Story 1.4)
