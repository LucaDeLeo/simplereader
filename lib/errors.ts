// lib/errors.ts

// ============================================
// Extension Context Type
// ============================================

export type ExtensionContext = 'offscreen' | 'content' | 'background' | 'popup';

// ============================================
// ExtensionError Interface
// ============================================

export interface ExtensionError {
  code: string;           // Machine-readable: 'TTS_MODEL_LOAD_FAILED'
  message: string;        // Human-readable: 'Failed to load voice model'
  context: ExtensionContext;
  recoverable: boolean;   // Can user retry?
  originalError?: unknown; // For debugging
}

// ============================================
// Error Codes (Const Object for Type Safety)
// ============================================

export const ERROR_CODES = {
  // TTS Errors (Offscreen Document)
  TTS_MODEL_LOAD_FAILED: 'TTS_MODEL_LOAD_FAILED',
  TTS_SYNTHESIS_FAILED: 'TTS_SYNTHESIS_FAILED',
  TTS_WEBGPU_UNAVAILABLE: 'TTS_WEBGPU_UNAVAILABLE',
  TTS_WASM_FAILED: 'TTS_WASM_FAILED',

  // Content Extraction Errors (Content Script)
  CONTENT_EXTRACTION_FAILED: 'CONTENT_EXTRACTION_FAILED',
  CONTENT_EMPTY: 'CONTENT_EMPTY',
  CONTENT_NOT_READABLE: 'CONTENT_NOT_READABLE',
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',

  // Storage Errors (Background/All contexts)
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  STORAGE_SYNC_FAILED: 'STORAGE_SYNC_FAILED',

  // Network Errors (Offscreen Document)
  NETWORK_DOWNLOAD_FAILED: 'NETWORK_DOWNLOAD_FAILED',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ============================================
// Serialized Error Interface (JSON-safe)
// ============================================

export interface SerializedError {
  code: string;
  message: string;
  context: ExtensionContext;
  recoverable: boolean;
  originalError?: {
    name?: string;
    message?: string;
    stack?: string;
  };
}

// ============================================
// Base Error Factory
// ============================================

function createError(
  code: string,
  message: string,
  context: ExtensionContext,
  recoverable: boolean,
  originalError?: unknown
): ExtensionError {
  return {
    code,
    message,
    context,
    recoverable,
    ...(originalError !== undefined && { originalError }),
  };
}

// ============================================
// Context-Specific Error Factories
// ============================================

/**
 * Create a TTS-related error (offscreen document context).
 * Use for: model loading, synthesis, WebGPU/WASM failures.
 */
export function createTTSError(
  code: string,
  message: string,
  recoverable: boolean,
  originalError?: unknown
): ExtensionError {
  return createError(code, message, 'offscreen', recoverable, originalError);
}

/**
 * Create a content extraction error (content script context).
 * Use for: Readability failures, empty content, malformed HTML.
 */
export function createContentError(
  code: string,
  message: string,
  recoverable: boolean,
  originalError?: unknown
): ExtensionError {
  return createError(code, message, 'content', recoverable, originalError);
}

/**
 * Create a storage-related error (background context).
 * Use for: quota exceeded, sync failures.
 */
export function createStorageError(
  code: string,
  message: string,
  recoverable: boolean,
  originalError?: unknown
): ExtensionError {
  return createError(code, message, 'background', recoverable, originalError);
}

/**
 * Create a network-related error (offscreen document context).
 * Use for: model download failures, timeouts.
 */
export function createNetworkError(
  code: string,
  message: string,
  recoverable: boolean,
  originalError?: unknown
): ExtensionError {
  return createError(code, message, 'offscreen', recoverable, originalError);
}

// ============================================
// Serialization Functions
// ============================================

/**
 * Serialize an ExtensionError for message passing.
 * Converts Error objects to JSON-safe format and handles non-serializable data.
 */
export function serializeError(error: ExtensionError): SerializedError {
  const serialized: SerializedError = {
    code: error.code,
    message: error.message,
    context: error.context,
    recoverable: error.recoverable,
  };

  if (error.originalError !== undefined) {
    serialized.originalError = serializeOriginalError(error.originalError);
  }

  return serialized;
}

/**
 * Convert an unknown error value to a JSON-safe format.
 */
function serializeOriginalError(error: unknown): SerializedError['originalError'] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'object' && error !== null) {
    // Try to extract error-like properties
    const errorObj = error as Record<string, unknown>;
    return {
      name: typeof errorObj.name === 'string' ? errorObj.name : undefined,
      message: typeof errorObj.message === 'string' ? errorObj.message : String(error),
      stack: typeof errorObj.stack === 'string' ? errorObj.stack : undefined,
    };
  }

  // Primitive values
  return {
    message: String(error),
  };
}

/**
 * Deserialize a SerializedError back to an ExtensionError.
 * Reconstructs the error from message data.
 */
export function deserializeError(data: SerializedError): ExtensionError {
  const error: ExtensionError = {
    code: data.code,
    message: data.message,
    context: data.context,
    recoverable: data.recoverable,
  };

  if (data.originalError !== undefined) {
    error.originalError = data.originalError;
  }

  return error;
}

// ============================================
// Type Guards
// ============================================

/**
 * Type guard to check if an unknown value is an ExtensionError.
 */
export function isExtensionError(error: unknown): error is ExtensionError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const obj = error as Record<string, unknown>;

  return (
    typeof obj.code === 'string' &&
    typeof obj.message === 'string' &&
    typeof obj.context === 'string' &&
    ['offscreen', 'content', 'background', 'popup'].includes(obj.context) &&
    typeof obj.recoverable === 'boolean'
  );
}

/**
 * Check if an ExtensionError is a TTS-related error.
 */
export function isTTSError(error: ExtensionError): boolean {
  return error.code.startsWith('TTS_');
}

/**
 * Check if an ExtensionError is a content extraction error.
 */
export function isContentError(error: ExtensionError): boolean {
  return error.code.startsWith('CONTENT_');
}

/**
 * Check if an ExtensionError is a storage-related error.
 */
export function isStorageError(error: ExtensionError): boolean {
  return error.code.startsWith('STORAGE_');
}

/**
 * Check if an ExtensionError is a network-related error.
 */
export function isNetworkError(error: ExtensionError): boolean {
  return error.code.startsWith('NETWORK_');
}

/**
 * Check if an error is recoverable (user can retry).
 */
export function isRecoverable(error: ExtensionError): boolean {
  return error.recoverable;
}

// ============================================
// Utilities
// ============================================

/**
 * Get a formatted error context string for logging.
 * Returns: "[context] code: message"
 */
export function getErrorContext(error: ExtensionError): string {
  return `[${error.context}] ${error.code}: ${error.message}`;
}
