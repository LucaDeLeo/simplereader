// entrypoints/offscreen/index.ts
// Offscreen document for TTS processing (WebGPU/WASM)

import { addMessageListener, isTTSMessage, type TTSMessage, type MessageResponse } from '@/lib/messages';

console.log('[SimpleReader] Offscreen document loaded');

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

// Listen for TTS messages from background
addMessageListener((message, sender, sendResponse) => {
  if (isTTSMessage(message)) {
    handleTTSMessage(message, sendResponse);
    return true; // Async response
  }
  return false;
});

/**
 * Handle TTS messages from background script.
 * Start keep-alive during processing, stop on completion.
 */
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

    case 'TTS_ERROR':
      stopKeepAlive();
      console.error('[SimpleReader] TTS error:', message.error);
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
