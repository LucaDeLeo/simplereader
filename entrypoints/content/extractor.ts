import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { createContentError, ERROR_CODES } from '@/lib/errors';

export interface ExtractedContent {
  text: string;
  title?: string;
  wordCount: number;
}

const MIN_WORD_COUNT = 50;

/**
 * Extract readable content from the current page using Mozilla Readability.
 *
 * IMPORTANT: Clones the document before parsing because Readability mutates the DOM.
 *
 * @throws ExtensionError if extraction fails
 */
export function extractContent(): ExtractedContent {
  // Quick readability check
  if (!isProbablyReaderable(document)) {
    throw createContentError(
      ERROR_CODES.CONTENT_NOT_READABLE,
      'This page does not appear to have readable article content',
      true // recoverable
    );
  }

  // CRITICAL: Clone document before parsing - Readability mutates the DOM
  const documentClone = document.cloneNode(true) as Document;

  const reader = new Readability(documentClone, {
    charThreshold: 500, // Minimum content length
  });

  const article = reader.parse();

  if (!article || !article.textContent) {
    throw createContentError(
      ERROR_CODES.CONTENT_EXTRACTION_FAILED,
      'Failed to extract article content from this page',
      true // recoverable
    );
  }

  // Clean up the text content
  const text = cleanText(article.textContent);
  const wordCount = countWords(text);

  if (wordCount < MIN_WORD_COUNT) {
    throw createContentError(
      ERROR_CODES.CONTENT_TOO_SHORT,
      `Extracted content is too short to read (${wordCount} words, minimum ${MIN_WORD_COUNT})`,
      true // recoverable
    );
  }

  return {
    text,
    title: article.title || undefined,
    wordCount,
  };
}

/**
 * Clean extracted text for TTS:
 * - Collapse all whitespace (including newlines) to single spaces
 * - Trim leading/trailing whitespace
 */
function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Count words in text (simple split on whitespace)
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}
