// lib/storage.ts

// ============================================
// Storage Keys (Const Object for Type Safety)
// ============================================

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

// ============================================
// Value Types
// ============================================

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

// ============================================
// Storage Key Type Unions
// ============================================

type SyncStorageKey =
  | typeof STORAGE_KEYS.preferredVoice
  | typeof STORAGE_KEYS.preferredSpeed
  | typeof STORAGE_KEYS.highlightColor
  | typeof STORAGE_KEYS.codeBlockHandling;

type LocalStorageKey =
  | typeof STORAGE_KEYS.modelLoaded
  | typeof STORAGE_KEYS.lastPlayedUrl
  | typeof STORAGE_KEYS.lastPlayedPosition
  | typeof STORAGE_KEYS.deviceCapability
  | typeof STORAGE_KEYS.modelDownloadProgress
  | typeof STORAGE_KEYS.modelCachedAt;

// ============================================
// Sync Storage Helpers (User Preferences)
// ============================================

/**
 * Get a value from chrome.storage.sync (cross-device storage).
 * Use for user preferences that should sync across devices.
 */
export async function getSyncValue<K extends SyncStorageKey>(
  key: K
): Promise<StorageValues[K] | undefined> {
  const result = await chrome.storage.sync.get(key);
  return result[key] as StorageValues[K] | undefined;
}

/**
 * Set a value in chrome.storage.sync (cross-device storage).
 * Use for user preferences that should sync across devices.
 */
export async function setSyncValue<K extends SyncStorageKey>(
  key: K,
  value: StorageValues[K]
): Promise<void> {
  await chrome.storage.sync.set({ [key]: value });
}

// ============================================
// Local Storage Helpers (Session/Model State)
// ============================================

/**
 * Get a value from chrome.storage.local (device-only storage).
 * Use for session state and model data that shouldn't sync.
 */
export async function getLocalValue<K extends LocalStorageKey>(
  key: K
): Promise<StorageValues[K] | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as StorageValues[K] | undefined;
}

/**
 * Set a value in chrome.storage.local (device-only storage).
 * Use for session state and model data that shouldn't sync.
 */
export async function setLocalValue<K extends LocalStorageKey>(
  key: K,
  value: StorageValues[K]
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

// ============================================
// Default Values
// ============================================

export const DEFAULT_STORAGE_VALUES: Partial<StorageValues> = {
  preferredVoice: 'af_bella', // Default Kokoro voice
  preferredSpeed: 1.0,
  highlightColor: 'yellow',
  codeBlockHandling: 'announce',
};

/**
 * Initialize default values for user preferences.
 * Only sets values that don't already exist in storage.
 */
export async function initializeDefaults(): Promise<void> {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_STORAGE_VALUES));
  const toSet: Partial<StorageValues> = {};

  for (const [key, defaultValue] of Object.entries(DEFAULT_STORAGE_VALUES)) {
    if (existing[key] === undefined) {
      (toSet as Record<string, unknown>)[key] = defaultValue;
    }
  }

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.sync.set(toSet);
  }
}

// ============================================
// Storage Change Listener
// ============================================

export type StorageChangeHandler<K extends keyof StorageValues> = (
  newValue: StorageValues[K] | undefined,
  oldValue: StorageValues[K] | undefined
) => void;

/**
 * Listen for changes to a specific storage key.
 * Returns an unsubscribe function to remove the listener.
 *
 * @param key - The storage key to watch
 * @param handler - Callback when value changes
 * @param storageArea - 'sync' for user preferences, 'local' for session state
 * @returns Unsubscribe function
 */
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
      handler(
        changes[key].newValue as StorageValues[K] | undefined,
        changes[key].oldValue as StorageValues[K] | undefined
      );
    }
  };

  chrome.storage.onChanged.addListener(listener);

  // Return unsubscribe function
  return () => chrome.storage.onChanged.removeListener(listener);
}
