// entrypoints/content/highlighter.ts
// Word highlighting with synchronized scrolling

import { getSyncValue, onStorageChange, STORAGE_KEYS, type HighlightColor } from '@/lib/storage';

// Color presets mapping
const COLOR_PRESETS: Record<string, string> = {
  yellow: '#ffeb3b',
  green: '#a5d6a7',
  blue: '#90caf9',
  pink: '#f48fb1',
};

// Scroll behavior
const SCROLL_OFFSET_RATIO = 0.33; // Position word 1/3 from top
const USER_SCROLL_DEBOUNCE_MS = 2000; // Pause auto-scroll after user scrolls

interface HighlighterState {
  initialized: boolean;
  wordElements: HTMLSpanElement[];
  currentWordIndex: number | null;
  highlightColor: string;
  lastUserScrollTime: number;
  isProgrammaticScroll: boolean;
  unsubscribeStorage: (() => void) | null;
}

const state: HighlighterState = {
  initialized: false,
  wordElements: [],
  currentWordIndex: null,
  highlightColor: COLOR_PRESETS.yellow,
  lastUserScrollTime: 0,
  isProgrammaticScroll: false,
  unsubscribeStorage: null,
};

/**
 * Initialize the highlighter by wrapping words in the article content.
 * Call this after content extraction is complete.
 */
export async function initializeHighlighter(articleElement: Element): Promise<number> {
  if (state.initialized) {
    console.log('[SimpleReader] Highlighter already initialized');
    return state.wordElements.length;
  }

  // Load highlight color from storage
  await loadHighlightColor();

  // Inject styles
  injectStyles();

  // Set up storage listener for color changes
  state.unsubscribeStorage = onStorageChange(
    STORAGE_KEYS.highlightColor,
    (newColor) => {
      if (newColor) {
        setHighlightColor(newColor);
      }
    },
    'sync'
  );

  // Track user scrolling to pause auto-scroll
  window.addEventListener('scroll', handleUserScroll, { passive: true });

  // Wrap words in spans
  state.wordElements = wrapWordsInElement(articleElement);
  state.initialized = true;

  console.log(`[SimpleReader] Highlighter initialized: ${state.wordElements.length} words`);
  return state.wordElements.length;
}

/**
 * Highlight a specific word by index.
 * Uses requestAnimationFrame for smooth 60fps updates.
 */
export function highlightWord(wordIndex: number): void {
  if (!state.initialized) {
    console.warn('[SimpleReader] Highlighter not initialized');
    return;
  }

  if (wordIndex < 0 || wordIndex >= state.wordElements.length) {
    console.warn(`[SimpleReader] Invalid word index: ${wordIndex}`);
    return;
  }

  requestAnimationFrame(() => {
    // Remove highlight from previous word
    if (state.currentWordIndex !== null && state.wordElements[state.currentWordIndex]) {
      state.wordElements[state.currentWordIndex].classList.remove('sr-word--current');
    }

    // Add highlight to new word (guard against DOM mutations)
    const wordElement = state.wordElements[wordIndex];
    if (wordElement) {
      wordElement.classList.add('sr-word--current');
      state.currentWordIndex = wordIndex;
    }
  });
}

/**
 * Scroll to bring a word into view.
 * Respects user scroll and reduced motion preferences.
 */
export function scrollToWord(wordIndex: number): void {
  if (!state.initialized) return;

  if (wordIndex < 0 || wordIndex >= state.wordElements.length) return;

  // Don't auto-scroll if user recently scrolled
  if (Date.now() - state.lastUserScrollTime < USER_SCROLL_DEBOUNCE_MS) {
    return;
  }

  const wordElement = state.wordElements[wordIndex];
  const rect = wordElement.getBoundingClientRect();
  const viewportHeight = window.innerHeight;

  // Check if word is already visible (with some margin)
  const margin = viewportHeight * 0.1;
  if (rect.top >= margin && rect.bottom <= viewportHeight - margin) {
    return; // Word is visible, no need to scroll
  }

  // Calculate target scroll position (word at 1/3 from top)
  const targetY = window.scrollY + rect.top - (viewportHeight * SCROLL_OFFSET_RATIO);

  // Check reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Mark as programmatic scroll to avoid resetting user scroll debounce
  state.isProgrammaticScroll = true;
  window.scrollTo({
    top: targetY,
    behavior: prefersReducedMotion ? 'instant' : 'smooth',
  });
  // Reset flag after scroll completes (use setTimeout for smooth scroll)
  setTimeout(() => {
    state.isProgrammaticScroll = false;
  }, prefersReducedMotion ? 0 : 500);
}

/**
 * Reset all highlighting.
 */
export function resetHighlight(): void {
  if (!state.initialized) return;

  // Also clear paused state
  clearPausedState();

  requestAnimationFrame(() => {
    // Remove current highlight
    if (state.currentWordIndex !== null && state.wordElements[state.currentWordIndex]) {
      state.wordElements[state.currentWordIndex].classList.remove('sr-word--current');
    }
    state.currentWordIndex = null;
  });

  console.log('[SimpleReader] Highlight reset');
}

/**
 * Set paused state on current word (adds pulsing animation).
 */
export function setPausedState(paused: boolean): void {
  if (!state.initialized || state.currentWordIndex === null) return;

  const wordElement = state.wordElements[state.currentWordIndex];
  if (!wordElement) return;

  if (paused) {
    wordElement.classList.add('sr-word--paused');
    console.log(`[SimpleReader] Set paused state on word ${state.currentWordIndex}`);
  } else {
    wordElement.classList.remove('sr-word--paused');
    console.log('[SimpleReader] Cleared paused state');
  }
}

/**
 * Clear paused state from all words.
 */
export function clearPausedState(): void {
  if (!state.initialized) return;

  for (const element of state.wordElements) {
    element.classList.remove('sr-word--paused');
  }
}

/**
 * Clean up the highlighter (call on extension unload or page navigation).
 */
export function destroyHighlighter(): void {
  if (state.unsubscribeStorage) {
    state.unsubscribeStorage();
    state.unsubscribeStorage = null;
  }

  window.removeEventListener('scroll', handleUserScroll);

  // Remove injected styles
  const styleElement = document.getElementById('sr-highlight-styles');
  if (styleElement) {
    styleElement.remove();
  }

  // Note: We don't remove word wrappers as it would cause DOM mutation
  // They're harmless spans and removing them would be expensive

  state.initialized = false;
  state.wordElements = [];
  state.currentWordIndex = null;

  console.log('[SimpleReader] Highlighter destroyed');
}

/**
 * Check if highlighter is initialized.
 */
export function isHighlighterInitialized(): boolean {
  return state.initialized;
}

/**
 * Get the total number of words wrapped.
 */
export function getWordCount(): number {
  return state.wordElements.length;
}

// ============================================
// Internal Functions
// ============================================

async function loadHighlightColor(): Promise<void> {
  const color = await getSyncValue(STORAGE_KEYS.highlightColor);
  if (color) {
    setHighlightColor(color);
  }
}

function setHighlightColor(color: HighlightColor): void {
  // Convert preset name to hex if needed
  const hexColor = COLOR_PRESETS[color] || color;
  state.highlightColor = hexColor;

  // Update CSS custom property
  document.documentElement.style.setProperty('--sr-highlight-color', hexColor);
  console.log(`[SimpleReader] Highlight color set: ${hexColor}`);
}

function handleUserScroll(): void {
  // Ignore programmatic scrolls from scrollToWord
  if (state.isProgrammaticScroll) return;
  state.lastUserScrollTime = Date.now();
}

function injectStyles(): void {
  // Prevent duplicate injection
  if (document.getElementById('sr-highlight-styles')) return;

  const style = document.createElement('style');
  style.id = 'sr-highlight-styles';
  style.textContent = `
    :root {
      --sr-highlight-color: ${state.highlightColor};
    }

    .sr-word {
      /* Base word style - no visual change from normal text */
      transition: background-color 0.1s ease-out;
    }

    .sr-word--current {
      background-color: var(--sr-highlight-color);
      border-radius: 2px;
      box-shadow: 0 0 0 1px var(--sr-highlight-color);
    }

    /* Paused state - pulsing animation */
    .sr-word--paused.sr-word--current {
      animation: sr-pulse 1.5s ease-in-out infinite;
    }

    @keyframes sr-pulse {
      0%, 100% {
        transform: scale(1);
        box-shadow: 0 0 0 1px var(--sr-highlight-color);
      }
      50% {
        transform: scale(1.02);
        box-shadow: 0 0 0 3px var(--sr-highlight-color);
      }
    }

    /* Respect reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      .sr-word {
        transition: none;
      }
      .sr-word--paused.sr-word--current {
        animation: none;
        border-bottom: 2px solid var(--sr-highlight-color);
        box-shadow: 0 0 0 2px var(--sr-highlight-color);
      }
    }
  `;

  // Append to head, or fallback to documentElement for malformed pages
  const target = document.head || document.documentElement;
  target.appendChild(style);
}

/**
 * Wrap each word in the element with a span.
 * Returns array of word elements in order.
 */
function wrapWordsInElement(element: Element): HTMLSpanElement[] {
  const wordElements: HTMLSpanElement[] = [];
  let wordIndex = 0;

  // Walk text nodes and wrap words
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip empty or whitespace-only text nodes
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip script and style elements
        const parent = node.parentElement;
        if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  // Process each text node
  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    const parent = textNode.parentNode;
    if (!parent) continue;

    // Split into words and whitespace
    const fragments = text.split(/(\s+)/);
    const fragment = document.createDocumentFragment();

    for (const part of fragments) {
      if (/^\s+$/.test(part)) {
        // Preserve whitespace as-is
        fragment.appendChild(document.createTextNode(part));
      } else if (part) {
        // Wrap word in span
        const span = document.createElement('span');
        span.className = 'sr-word';
        span.dataset.wordIndex = String(wordIndex);
        span.textContent = part;
        fragment.appendChild(span);
        wordElements.push(span);
        wordIndex++;
      }
    }

    parent.replaceChild(fragment, textNode);
  }

  return wordElements;
}

// Export types
export type { HighlighterState };

// Export for testing
export { COLOR_PRESETS, setHighlightColor as _setHighlightColor };
