// entrypoints/offscreen/index.ts
// Offscreen document for TTS processing (WebGPU/WASM)

import {
  addMessageListener,
  isTTSMessage,
  isPlaybackMessage,
  type TTSMessage,
  type PlaybackMessage,
  type MessageResponse,
  Messages,
} from '@/lib/messages';
import { isExtensionError, serializeError } from '@/lib/errors';
import {
  initializeTTSWithFallback,
  generateSpeechWithFallback,
  getActiveEngine,
  getDeviceCapability,
  stopCurrentPlayback,
  pauseCurrentPlayback,
  resumeCurrentPlayback,
  type GenerationChunk,
} from './tts-engine';
import {
  queueAudioChunk,
  pause as pauseAudio,
  resume as resumeAudio,
  stop as stopAudio,
  reset as resetAudio,
  play as playAudio,
  onPlaybackEnd,
} from './audio-player';

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
// Audio Player Callbacks
// ============================================

// Set up playback end callback to notify background
onPlaybackEnd(() => {
  console.log('[SimpleReader] Audio playback ended');
  sendCompleteMessage();
});

// ============================================
// Message Handling
// ============================================

// Listen for TTS and playback messages from background
addMessageListener((message, _sender, sendResponse) => {
  if (isTTSMessage(message)) {
    handleTTSMessage(message, sendResponse);
    return true; // Async response
  }

  if (isPlaybackMessage(message)) {
    handlePlaybackMessage(message, sendResponse);
    return false; // Sync response
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
 * Uses fallback chain: WebGPU -> WASM -> Web Speech API.
 */
async function handleTTSGenerate(
  message: Extract<TTSMessage, { type: 'TTS_GENERATE' }>,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  startKeepAlive();

  // Reset audio player for new generation
  resetAudio();

  try {
    console.log('[SimpleReader] TTS generate requested:', {
      textLength: message.text.length,
      voice: message.voice,
      speed: message.speed,
    });

    // Initialize TTS with fallback chain
    const capability = await initializeTTSWithFallback((progress) => {
      // Send loading progress to background (0-50% range for loading)
      sendProgressMessage(Math.round(progress * 0.5));
    });

    console.log(`[SimpleReader] Using TTS engine: ${getActiveEngine()} (capability: ${capability})`);

    // Generate speech with fallback support
    const result = await generateSpeechWithFallback(
      message.text,
      message.voice,
      message.speed,
      // Chunk callback - send each chunk as it's generated (only for Kokoro)
      (chunk: GenerationChunk) => {
        // Only process chunks for Kokoro (Web Speech plays directly)
        if (getActiveEngine() !== 'webspeech') {
          // Queue audio for playback
          queueAudioChunk(chunk.audio);
          // Start playing on first chunk
          playAudio();
          // Send chunk info to background for timing coordination
          sendChunkMessage(chunk);
        }
      },
      // Progress callback (50-100% range for generation)
      (progress) => {
        sendProgressMessage(50 + Math.round(progress * 0.5));
      },
      // Word callback for real-time Web Speech highlighting
      (timing) => {
        if (getActiveEngine() === 'webspeech') {
          sendWordHighlightMessage(timing.index);
        }
      }
    );

    // Send completion message
    sendCompleteMessage();

    // Log completion info
    const sampleRate = result.sampleRate || 24000; // Fallback for Web Speech
    console.log('[SimpleReader] TTS complete:', {
      wordCount: result.wordTimings.length,
      durationSeconds: result.audio.length > 0 ? result.audio.length / sampleRate : 'N/A (Web Speech)',
      engine: getActiveEngine(),
      capability: getDeviceCapability(),
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

/**
 * Handle playback control messages.
 * Routes to appropriate engine (Kokoro audio player or Web Speech).
 */
function handlePlaybackMessage(
  message: PlaybackMessage,
  sendResponse: (response: MessageResponse) => void
): void {
  const engine = getActiveEngine();

  switch (message.type) {
    case 'PLAYBACK_PLAY':
      if (engine === 'webspeech') {
        resumeCurrentPlayback();
      } else {
        resumeAudio();
      }
      console.log('[SimpleReader] Playback resumed');
      break;

    case 'PLAYBACK_PAUSE':
      if (engine === 'webspeech') {
        pauseCurrentPlayback();
      } else {
        pauseAudio();
      }
      console.log('[SimpleReader] Playback paused');
      break;

    case 'PLAYBACK_STOP':
      if (engine === 'webspeech') {
        stopCurrentPlayback();
      } else {
        stopAudio();
        resetAudio();
      }
      console.log('[SimpleReader] Playback stopped');
      break;

    default:
      // PLAYBACK_STATE_CHANGED is informational, no action needed
      break;
  }

  sendResponse({ success: true });
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

/**
 * Send HIGHLIGHT_WORD message to background for Web Speech real-time highlighting.
 */
function sendWordHighlightMessage(wordIndex: number): void {
  try {
    chrome.runtime.sendMessage(Messages.highlightWord(wordIndex));
  } catch (e) {
    console.warn('[SimpleReader] Failed to send word highlight message:', e);
  }
}

// ============================================
// Lifecycle
// ============================================

// Cleanup on unload
globalThis.addEventListener('beforeunload', () => {
  stopKeepAlive();
  stopAudio();
  console.log('[SimpleReader] Offscreen document unloading');
});
