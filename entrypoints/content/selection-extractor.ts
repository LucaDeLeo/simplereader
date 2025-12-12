// entrypoints/content/selection-extractor.ts
// Extract user-selected text for TTS reading

const MIN_SELECTION_LENGTH = 10;

export interface SelectionResult {
  text: string;
  wordCount: number;
  range: Range;
}

/**
 * Extract currently selected text from the page.
 * Returns null if no valid selection exists.
 */
export function extractSelection(): SelectionResult | null {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const text = selection.toString().trim();

  if (text.length < MIN_SELECTION_LENGTH) {
    return null;
  }

  // Clean the text (normalize whitespace)
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;

  // Get the range for highlighting scope
  const range = selection.getRangeAt(0).cloneRange();

  return {
    text: cleanedText,
    wordCount,
    range,
  };
}

/**
 * Get the common ancestor element containing the selection.
 * Used for scoped highlighting.
 */
export function getSelectionContainer(range: Range): Element | null {
  const container = range.commonAncestorContainer;

  if (container.nodeType === Node.ELEMENT_NODE) {
    return container as Element;
  }

  return container.parentElement;
}
