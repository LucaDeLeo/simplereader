// Pattern: Import from lib/ only
import { addMessageListener } from '@/lib/messages';
import { initializeDefaults } from '@/lib/storage';

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

    // Route messages based on type prefix
    // TTS messages -> forward to offscreen (Epic 2)
    // Playback messages -> handle state (Epic 2)
    // Settings messages -> handle (Epic 4)

    sendResponse({ success: true });
    return false; // Sync response for now
  });
});
