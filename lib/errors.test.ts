// lib/errors.test.ts

import { describe, expect, test } from 'vitest';
import {
  ERROR_CODES,
  createTTSError,
  createContentError,
  createStorageError,
  createNetworkError,
  serializeError,
  deserializeError,
  isExtensionError,
  isTTSError,
  isContentError,
  isStorageError,
  isNetworkError,
  isRecoverable,
  getErrorContext,
  type ExtensionError,
  type SerializedError,
} from './errors';

describe('ERROR_CODES', () => {
  test('has TTS error codes', () => {
    expect(ERROR_CODES.TTS_MODEL_LOAD_FAILED).toBe('TTS_MODEL_LOAD_FAILED');
    expect(ERROR_CODES.TTS_SYNTHESIS_FAILED).toBe('TTS_SYNTHESIS_FAILED');
    expect(ERROR_CODES.TTS_WEBGPU_UNAVAILABLE).toBe('TTS_WEBGPU_UNAVAILABLE');
    expect(ERROR_CODES.TTS_WASM_FAILED).toBe('TTS_WASM_FAILED');
  });

  test('has CONTENT error codes', () => {
    expect(ERROR_CODES.CONTENT_EXTRACTION_FAILED).toBe('CONTENT_EXTRACTION_FAILED');
    expect(ERROR_CODES.CONTENT_EMPTY).toBe('CONTENT_EMPTY');
  });

  test('has STORAGE error codes', () => {
    expect(ERROR_CODES.STORAGE_QUOTA_EXCEEDED).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(ERROR_CODES.STORAGE_SYNC_FAILED).toBe('STORAGE_SYNC_FAILED');
  });

  test('has NETWORK error codes', () => {
    expect(ERROR_CODES.NETWORK_DOWNLOAD_FAILED).toBe('NETWORK_DOWNLOAD_FAILED');
    expect(ERROR_CODES.NETWORK_TIMEOUT).toBe('NETWORK_TIMEOUT');
  });
});

describe('Error Factory Functions', () => {
  describe('createTTSError', () => {
    test('creates error with offscreen context', () => {
      const error = createTTSError(
        ERROR_CODES.TTS_MODEL_LOAD_FAILED,
        'Failed to load model',
        true
      );

      expect(error.code).toBe('TTS_MODEL_LOAD_FAILED');
      expect(error.message).toBe('Failed to load model');
      expect(error.context).toBe('offscreen');
      expect(error.recoverable).toBe(true);
      expect(error.originalError).toBeUndefined();
    });

    test('includes originalError when provided', () => {
      const originalError = new Error('WebGPU not available');
      const error = createTTSError(
        ERROR_CODES.TTS_WEBGPU_UNAVAILABLE,
        'WebGPU is not available',
        false,
        originalError
      );

      expect(error.originalError).toBe(originalError);
    });
  });

  describe('createContentError', () => {
    test('creates error with content context', () => {
      const error = createContentError(
        ERROR_CODES.CONTENT_EMPTY,
        'No content found',
        true
      );

      expect(error.code).toBe('CONTENT_EMPTY');
      expect(error.context).toBe('content');
      expect(error.recoverable).toBe(true);
    });
  });

  describe('createStorageError', () => {
    test('creates error with background context', () => {
      const error = createStorageError(
        ERROR_CODES.STORAGE_QUOTA_EXCEEDED,
        'Storage quota exceeded',
        false
      );

      expect(error.code).toBe('STORAGE_QUOTA_EXCEEDED');
      expect(error.context).toBe('background');
      expect(error.recoverable).toBe(false);
    });
  });

  describe('createNetworkError', () => {
    test('creates error with offscreen context', () => {
      const error = createNetworkError(
        ERROR_CODES.NETWORK_TIMEOUT,
        'Request timed out',
        true
      );

      expect(error.code).toBe('NETWORK_TIMEOUT');
      expect(error.context).toBe('offscreen');
      expect(error.recoverable).toBe(true);
    });
  });
});

describe('Serialization', () => {
  describe('serializeError', () => {
    test('serializes basic error', () => {
      const error = createTTSError(
        ERROR_CODES.TTS_SYNTHESIS_FAILED,
        'Synthesis failed',
        true
      );

      const serialized = serializeError(error);

      expect(serialized.code).toBe('TTS_SYNTHESIS_FAILED');
      expect(serialized.message).toBe('Synthesis failed');
      expect(serialized.context).toBe('offscreen');
      expect(serialized.recoverable).toBe(true);
      expect(serialized.originalError).toBeUndefined();
    });

    test('serializes Error object in originalError', () => {
      const originalError = new Error('Something went wrong');
      originalError.stack = 'Error: Something went wrong\n    at test.ts:1:1';

      const error = createTTSError(
        ERROR_CODES.TTS_MODEL_LOAD_FAILED,
        'Model load failed',
        true,
        originalError
      );

      const serialized = serializeError(error);

      expect(serialized.originalError).toEqual({
        name: 'Error',
        message: 'Something went wrong',
        stack: 'Error: Something went wrong\n    at test.ts:1:1',
      });
    });

    test('serializes error-like object in originalError', () => {
      const originalError = { name: 'CustomError', message: 'Custom message' };

      const error = createNetworkError(
        ERROR_CODES.NETWORK_DOWNLOAD_FAILED,
        'Download failed',
        true,
        originalError
      );

      const serialized = serializeError(error);

      expect(serialized.originalError?.name).toBe('CustomError');
      expect(serialized.originalError?.message).toBe('Custom message');
    });

    test('serializes primitive originalError', () => {
      const error = createContentError(
        ERROR_CODES.CONTENT_EXTRACTION_FAILED,
        'Extraction failed',
        false,
        'string error'
      );

      const serialized = serializeError(error);

      expect(serialized.originalError?.message).toBe('string error');
    });
  });

  describe('deserializeError', () => {
    test('deserializes to ExtensionError', () => {
      const serialized: SerializedError = {
        code: 'TTS_MODEL_LOAD_FAILED',
        message: 'Model load failed',
        context: 'offscreen',
        recoverable: true,
      };

      const error = deserializeError(serialized);

      expect(error.code).toBe('TTS_MODEL_LOAD_FAILED');
      expect(error.message).toBe('Model load failed');
      expect(error.context).toBe('offscreen');
      expect(error.recoverable).toBe(true);
      expect(error.originalError).toBeUndefined();
    });

    test('deserializes with originalError', () => {
      const serialized: SerializedError = {
        code: 'NETWORK_TIMEOUT',
        message: 'Request timed out',
        context: 'offscreen',
        recoverable: true,
        originalError: {
          name: 'TimeoutError',
          message: 'Timeout',
          stack: 'TimeoutError: Timeout\n    at fetch.ts:1:1',
        },
      };

      const error = deserializeError(serialized);

      expect(error.originalError).toEqual({
        name: 'TimeoutError',
        message: 'Timeout',
        stack: 'TimeoutError: Timeout\n    at fetch.ts:1:1',
      });
    });
  });

  describe('roundtrip', () => {
    test('serialize -> deserialize preserves data', () => {
      const original = createTTSError(
        ERROR_CODES.TTS_WASM_FAILED,
        'WASM initialization failed',
        false,
        new Error('WASM error')
      );

      const serialized = serializeError(original);
      const deserialized = deserializeError(serialized);

      expect(deserialized.code).toBe(original.code);
      expect(deserialized.message).toBe(original.message);
      expect(deserialized.context).toBe(original.context);
      expect(deserialized.recoverable).toBe(original.recoverable);
      // originalError is serialized, so structure differs but data preserved
      expect(deserialized.originalError).toBeDefined();
    });
  });
});

describe('Type Guards', () => {
  describe('isExtensionError', () => {
    test('returns true for valid ExtensionError', () => {
      const error = createTTSError(
        ERROR_CODES.TTS_MODEL_LOAD_FAILED,
        'Failed',
        true
      );
      expect(isExtensionError(error)).toBe(true);
    });

    test('returns true for manually constructed ExtensionError', () => {
      const error: ExtensionError = {
        code: 'CUSTOM_ERROR',
        message: 'Custom error',
        context: 'popup',
        recoverable: false,
      };
      expect(isExtensionError(error)).toBe(true);
    });

    test('returns false for null', () => {
      expect(isExtensionError(null)).toBe(false);
    });

    test('returns false for undefined', () => {
      expect(isExtensionError(undefined)).toBe(false);
    });

    test('returns false for string', () => {
      expect(isExtensionError('error')).toBe(false);
    });

    test('returns false for plain Error', () => {
      expect(isExtensionError(new Error('error'))).toBe(false);
    });

    test('returns false for object missing required fields', () => {
      expect(isExtensionError({ code: 'ERROR' })).toBe(false);
      expect(isExtensionError({ code: 'ERROR', message: 'msg' })).toBe(false);
      expect(isExtensionError({
        code: 'ERROR',
        message: 'msg',
        context: 'invalid'
      })).toBe(false);
    });

    test('returns false for object with wrong context value', () => {
      expect(isExtensionError({
        code: 'ERROR',
        message: 'msg',
        context: 'invalid',
        recoverable: true,
      })).toBe(false);
    });
  });

  describe('isTTSError', () => {
    test('returns true for TTS errors', () => {
      const error = createTTSError(ERROR_CODES.TTS_MODEL_LOAD_FAILED, 'Failed', true);
      expect(isTTSError(error)).toBe(true);
    });

    test('returns false for non-TTS errors', () => {
      const error = createContentError(ERROR_CODES.CONTENT_EMPTY, 'Empty', true);
      expect(isTTSError(error)).toBe(false);
    });
  });

  describe('isContentError', () => {
    test('returns true for CONTENT errors', () => {
      const error = createContentError(ERROR_CODES.CONTENT_EXTRACTION_FAILED, 'Failed', true);
      expect(isContentError(error)).toBe(true);
    });

    test('returns false for non-CONTENT errors', () => {
      const error = createTTSError(ERROR_CODES.TTS_SYNTHESIS_FAILED, 'Failed', true);
      expect(isContentError(error)).toBe(false);
    });
  });

  describe('isStorageError', () => {
    test('returns true for STORAGE errors', () => {
      const error = createStorageError(ERROR_CODES.STORAGE_QUOTA_EXCEEDED, 'Exceeded', false);
      expect(isStorageError(error)).toBe(true);
    });

    test('returns false for non-STORAGE errors', () => {
      const error = createNetworkError(ERROR_CODES.NETWORK_TIMEOUT, 'Timeout', true);
      expect(isStorageError(error)).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    test('returns true for NETWORK errors', () => {
      const error = createNetworkError(ERROR_CODES.NETWORK_DOWNLOAD_FAILED, 'Failed', true);
      expect(isNetworkError(error)).toBe(true);
    });

    test('returns false for non-NETWORK errors', () => {
      const error = createStorageError(ERROR_CODES.STORAGE_SYNC_FAILED, 'Failed', true);
      expect(isNetworkError(error)).toBe(false);
    });
  });

  describe('isRecoverable', () => {
    test('returns true for recoverable errors', () => {
      const error = createTTSError(ERROR_CODES.TTS_MODEL_LOAD_FAILED, 'Failed', true);
      expect(isRecoverable(error)).toBe(true);
    });

    test('returns false for non-recoverable errors', () => {
      const error = createTTSError(ERROR_CODES.TTS_WEBGPU_UNAVAILABLE, 'Unavailable', false);
      expect(isRecoverable(error)).toBe(false);
    });
  });
});

describe('Utilities', () => {
  describe('getErrorContext', () => {
    test('formats error context for logging', () => {
      const error = createTTSError(
        ERROR_CODES.TTS_MODEL_LOAD_FAILED,
        'Failed to load Kokoro model',
        true
      );

      const context = getErrorContext(error);

      expect(context).toBe('[offscreen] TTS_MODEL_LOAD_FAILED: Failed to load Kokoro model');
    });

    test('works for all contexts', () => {
      expect(getErrorContext(createContentError('CODE', 'msg', true)))
        .toBe('[content] CODE: msg');
      expect(getErrorContext(createStorageError('CODE', 'msg', true)))
        .toBe('[background] CODE: msg');
      expect(getErrorContext(createNetworkError('CODE', 'msg', true)))
        .toBe('[offscreen] CODE: msg');
    });
  });
});
