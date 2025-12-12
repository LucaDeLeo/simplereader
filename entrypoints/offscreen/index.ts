// entrypoints/offscreen/index.ts
// Offscreen document for TTS processing (WebGPU/WASM)

import {
  addMessageListener,
  isTTSMessage,
  type TTSMessage,
  type MessageResponse,
  Messages,
} from '@/lib/messages';
import { isExtensionError, serializeError } from '@/lib/errors';
import { initializeTTS, generateSpeech, getModelStatus, type GenerationChunk } from './tts-engine';

console.log('[SimpleReader] Offscreen document loaded');

// ============================================
// Keep-Alive Mechanism
// ============================================

/**
 * Keep-alive mechanism to prevent Chrome from closing the document
 * during long TTS operations. Chrome closes offscreen docs after ~30s
 * of inactivity.
 */
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepAlive(): void {
  if (keepAliveInterval) return;

  // Use a 20-second interval - well within Chrome's ~30s timeout window
  // The interval itself signals the document is "in use"
  keepAliveInterval = setInterval(() => {
    console.debug('[SimpleReader] Offscreen keep-alive ping');
  }, 20000);

  console.log('[SimpleReader] Keep-alive started');
}

function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('[SimpleReader] Keep-alive stopped');
  }
}

// ============================================
// Message Handling
// ============================================

// Listen for TTS messages from background
addMessageListener((message, _sender, sendResponse) => {
  if (isTTSMessage(message)) {
    handleTTSMessage(message, sendResponse);
    return true; // Async response
  }
  return false;
});

/**
 * Handle TTS messages from background script.
 * Integrates with Kokoro TTS engine for audio generation.
 */
async function handleTTSMessage(
  message: TTSMessage,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  switch (message.type) {
    case 'TTS_GENERATE':
      await handleTTSGenerate(message, sendResponse);
      break;

    case 'TTS_COMPLETE':
      stopKeepAlive();
      sendResponse({ success: true });
      break;

    case 'TTS_ERROR':
      stopKeepAlive();
      console.error('[SimpleReader] TTS error:', message.error);
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: true });
  }
}

/**
 * Handle TTS_GENERATE message.
 * Initializes model if needed, generates speech with streaming chunks.
 */
async function handleTTSGenerate(
  message: Extract<TTSMessage, { type: 'TTS_GENERATE' }>,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  startKeepAlive();

  try {
    console.log('[SimpleReader] TTS generate requested:', {
      textLength: message.text.length,
      voice: message.voice,
      speed: message.speed,
    });

    // Initialize TTS if needed (with progress reporting)
    const status = getModelStatus();
    if (!status.loaded) {
      console.log('[SimpleReader] Model not loaded, initializing...');
      await initializeTTS((progress) => {
        // Send loading progress to background (0-50% range for loading)
        sendProgressMessage(Math.round(progress * 0.5));
      });
    }

    // Generate speech with chunk callbacks
    const result = await generateSpeech(
      message.text,
      message.voice,
      message.speed,
      // Chunk callback - send each chunk as it's generated
      (chunk: GenerationChunk) => {
        sendChunkMessage(chunk);
      },
      // Progress callback (50-100% range for generation)
      (progress) => {
        sendProgressMessage(50 + Math.round(progress * 0.5));
      }
    );

    // Send completion message
    sendCompleteMessage();

    // Log completion info
    console.log('[SimpleReader] TTS complete:', {
      wordCount: result.wordTimings.length,
      durationSeconds: result.audio.length / result.sampleRate,
      device: getModelStatus().device,
    });

    sendResponse({ success: true });
  } catch (error) {
    console.error('[SimpleReader] TTS generation failed:', error);

    // Handle errors
    if (isExtensionError(error)) {
      const serialized = serializeError(error);
      sendErrorMessage(JSON.stringify(serialized));
      sendResponse({
        success: false,
        error: serialized.message,
      });
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sendErrorMessage(errorMessage);
      sendResponse({
        success: false,
        error: errorMessage,
      });
    }
  } finally {
    stopKeepAlive();
  }
}

// ============================================
// Message Sending Helpers
// ============================================

/**
 * Send TTS_PROGRESS message to background.
 */
function sendProgressMessage(progress: number): void {
  try {
    chrome.runtime.sendMessage(Messages.ttsProgress(progress));
  } catch (e) {
    console.warn('[SimpleReader] Failed to send progress message:', e);
  }
}

/**
 * Send TTS_CHUNK_READY message with audio data to background.
 */
function sendChunkMessage(chunk: GenerationChunk): void {
  try {
    // Convert Float32Array to ArrayBuffer for message passing
    // We need to copy the underlying buffer slice that contains our data
    const audioBuffer = chunk.audio.buffer.slice(
      chunk.audio.byteOffset,
      chunk.audio.byteOffset + chunk.audio.byteLength
    ) as ArrayBuffer;

    chrome.runtime.sendMessage(Messages.ttsChunkReady(audioBuffer, chunk.wordTimings));
  } catch (e) {
    console.warn('[SimpleReader] Failed to send chunk message:', e);
  }
}

/**
 * Send TTS_COMPLETE message to background.
 */
function sendCompleteMessage(): void {
  try {
    chrome.runtime.sendMessage(Messages.ttsComplete());
  } catch (e) {
    console.warn('[SimpleReader] Failed to send complete message:', e);
  }
}

/**
 * Send TTS_ERROR message to background.
 */
function sendErrorMessage(error: string): void {
  try {
    chrome.runtime.sendMessage(Messages.ttsError(error));
  } catch (e) {
    console.warn('[SimpleReader] Failed to send error message:', e);
  }
}

// ============================================
// Lifecycle
// ============================================

// Cleanup on unload
globalThis.addEventListener('beforeunload', () => {
  stopKeepAlive();
  console.log('[SimpleReader] Offscreen document unloading');
});
