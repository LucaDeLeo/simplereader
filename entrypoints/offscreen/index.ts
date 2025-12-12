import { addMessageListener, isTTSMessage } from '@/lib/messages';

console.log('[SimpleReader] Offscreen document loaded');

// Listen for TTS messages from background
addMessageListener((message, sender, sendResponse) => {
  if (isTTSMessage(message)) {
    switch (message.type) {
      case 'TTS_GENERATE':
        // TODO: Epic 2 - Kokoro TTS integration
        console.log('[SimpleReader] TTS generate requested:', {
          textLength: message.text.length,
          voice: message.voice,
          speed: message.speed,
        });
        sendResponse({ success: true });
        return false;
    }
  }
  return false;
});
