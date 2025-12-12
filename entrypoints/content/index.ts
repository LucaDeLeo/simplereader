import { addMessageListener, isHighlightMessage, isContentMessage } from '@/lib/messages';
import { extractContent, ExtractedContent } from './extractor';
import {
  initializeHighlighter,
  highlightWord,
  scrollToWord,
  resetHighlight,
} from './highlighter';
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
            highlightWord(message.wordIndex);
            sendResponse({ success: true });
            return false;

          case 'HIGHLIGHT_RESET':
            resetHighlight();
            sendResponse({ success: true });
            return false;

          case 'HIGHLIGHT_SCROLL_TO':
            scrollToWord(message.wordIndex);
            sendResponse({ success: true });
            return false;
        }
      }

      return false;
    });
  },
});

async function handleContentExtract(sendResponse: (response: ContentExtractResponse) => void): Promise<void> {
  try {
    console.log('[SimpleReader] Starting content extraction...');
    const startTime = performance.now();

    const { text, title, wordCount } = extractContent();

    // Find the article element for highlighting
    // Readability clones the document, so we need to find the original article
    const articleElement = findArticleElement();

    if (articleElement) {
      // Initialize highlighter with the article element
      const highlightedWordCount = await initializeHighlighter(articleElement);
      console.log(`[SimpleReader] Highlighted ${highlightedWordCount} words`);
    } else {
      console.warn('[SimpleReader] Could not find article element for highlighting');
    }

    const duration = Math.round(performance.now() - startTime);
    console.log(`[SimpleReader] Extraction complete: ${wordCount} words in ${duration}ms`);

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

/**
 * Find the main article element in the page.
 * Uses common article selectors and heuristics.
 */
function findArticleElement(): Element | null {
  // Try common article selectors in order of preference
  const selectors = [
    'article',
    '[role="article"]',
    '[role="main"]',
    'main',
    '.article',
    '.post-content',
    '.entry-content',
    '.content',
    '#content',
    '.post',
    '.story',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent && element.textContent.trim().length > 500) {
      return element;
    }
  }

  // Fallback: find largest text container
  const candidates = document.querySelectorAll('div, section');
  let bestCandidate: Element | null = null;
  let maxTextLength = 0;

  for (const candidate of candidates) {
    const textLength = candidate.textContent?.trim().length || 0;
    if (textLength > maxTextLength && textLength > 500) {
      maxTextLength = textLength;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}
