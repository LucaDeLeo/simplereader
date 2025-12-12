import { addMessageListener, isHighlightMessage, isContentMessage } from '@/lib/messages';
import { extractContent, ExtractedContent } from './extractor';
import { isExtensionError } from '@/lib/errors';

interface ContentExtractResponse {
  success: boolean;
  data?: ExtractedContent;
  error?: string;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[SimpleReader] Content script loaded');

    // Listen for messages from background
    addMessageListener((message, _sender, sendResponse) => {
      if (isContentMessage(message)) {
        switch (message.type) {
          case 'CONTENT_EXTRACT':
            handleContentExtract((response) => sendResponse(response as { success: boolean }));
            return true; // Async response
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

function handleContentExtract(sendResponse: (response: ContentExtractResponse) => void): void {
  try {
    console.log('[SimpleReader] Starting content extraction...');
    const startTime = performance.now();

    const { text, title, wordCount } = extractContent();

    const duration = Math.round(performance.now() - startTime);
    console.log(`[SimpleReader] Extraction complete: ${wordCount} words in ${duration}ms`);

    // Send success response with extracted content
    sendResponse({
      success: true,
      data: { text, title, wordCount },
    });
  } catch (error) {
    const errorMessage = isExtensionError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);

    console.error('[SimpleReader] Content extraction failed:', errorMessage);

    sendResponse({
      success: false,
      error: errorMessage,
    });
  }
}
