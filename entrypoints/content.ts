import { addMessageListener, isHighlightMessage, isContentMessage } from '@/lib/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[SimpleReader] Content script loaded');

    // Listen for messages from background
    addMessageListener((message, sender, sendResponse) => {
      if (isContentMessage(message)) {
        switch (message.type) {
          case 'CONTENT_EXTRACT':
            // TODO: Epic 2 - Extract with Readability
            console.log('[SimpleReader] Content extraction requested');
            sendResponse({ success: true });
            return false;
        }
      }

      if (isHighlightMessage(message)) {
        switch (message.type) {
          case 'HIGHLIGHT_WORD':
            // TODO: Epic 2 - Highlight word
            console.log('[SimpleReader] Highlight word:', message.wordIndex);
            sendResponse({ success: true });
            return false;
          case 'HIGHLIGHT_RESET':
            // TODO: Epic 2 - Reset highlighting
            console.log('[SimpleReader] Reset highlighting');
            sendResponse({ success: true });
            return false;
        }
      }

      return false;
    });
  },
});
