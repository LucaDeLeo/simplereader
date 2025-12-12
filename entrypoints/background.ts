// Pattern: Import from lib/ only
import { addMessageListener, isTTSMessage, type TTSMessage, type MessageResponse } from '@/lib/messages';
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

    // Playback messages -> handle state (Epic 2)
    // Settings messages -> handle (Epic 4)

    sendResponse({ success: true });
    return false; // Sync response for now
  });
});

/**
 * Handle TTS messages by routing to offscreen document.
 * Ensures offscreen document exists before forwarding.
 */
async function handleTTSMessage(
  message: TTSMessage,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  try {
    // Ensure offscreen document exists (creates if needed)
    await ensureOffscreenDocument();

    // Forward message to offscreen document
    // The offscreen document listens via chrome.runtime.onMessage
    // and filters by message type prefix (TTS_*)
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
