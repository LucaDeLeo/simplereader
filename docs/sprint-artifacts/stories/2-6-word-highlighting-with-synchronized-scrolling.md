# Story 2.6: Word Highlighting with Synchronized Scrolling

## Story Info

| Field | Value |
|-------|-------|
| Epic | 2 - First Play Experience (The Magic Moment) |
| Story ID | 2-6 |
| Story Key | 2-6-word-highlighting-with-synchronized-scrolling |
| Status | review |
| Created | 2025-12-11 |

---

## User Story

As a user,
I want to see words highlighted as they are spoken,
So that I can follow along visually with the audio.

---

## Context & Background

This is the **sixth story in Epic 2**, implementing the visual word highlighting that synchronizes with TTS audio playback. This completes the "magic moment" experience where users can hear and see content being read simultaneously.

### Current State (After Story 2-5)

The following infrastructure is in place:
- Content extraction via Readability (Story 2-1)
- Offscreen document with Kokoro TTS (Stories 2-2, 2-3, 2-4)
- Phoneme-weighted word timing calculation (Story 2-5)
- Message protocol includes `HIGHLIGHT_WORD`, `HIGHLIGHT_RESET`, `HIGHLIGHT_SCROLL_TO` types
- Content script has placeholder handlers for highlight messages (returns `{ success: true }` without implementation)

**What's missing:**
- Visual highlighting CSS styles
- Word wrapper element injection
- Highlight state management
- Scroll-to-word functionality
- Integration with user's highlight color preference

### Target State

After this story:
1. Words in extracted content are wrapped in highlight-able spans
2. Current word shows highlight color (default yellow, customizable)
3. Page auto-scrolls to keep current word visible
4. Highlighting uses requestAnimationFrame for 60fps smoothness
5. CSS classes follow `sr-` prefix convention
6. User's highlight color preference from storage is respected

### Message Types (from lib/messages.ts)

```typescript
export type HighlightMessage =
  | { type: 'HIGHLIGHT_WORD'; wordIndex: number }
  | { type: 'HIGHLIGHT_RESET' }
  | { type: 'HIGHLIGHT_SCROLL_TO'; wordIndex: number };
```

### Architecture Reference

From `docs/architecture.md`:
- **FR13**: System highlights the current word as audio plays
- **FR15**: System scrolls to keep the current word visible
- **FR17**: Highlighting syncs with audio using phoneme-weighted timing
- **ARCH-17**: Use `requestAnimationFrame` for highlight updates
- **ARCH-12**: CSS prefix with `sr-` to prevent conflicts with host page

From `docs/project_context.md`:
- Performance target: Highlighting at 60fps via requestAnimationFrame
- CSS in content script MUST prefix with `sr-`
- Shadow DOM NOT required for word highlighting (only for floating player)

From `lib/storage.ts`:
- `STORAGE_KEYS.highlightColor` - user's preferred highlight color
- `HighlightColor` type: `'yellow' | 'green' | 'blue' | 'pink' | string`
- Default: `'yellow'`

---

## Acceptance Criteria

### AC1: Word Wrapper Injection

**Given** content has been extracted from the page
**When** highlighting is initialized
**Then**:
- Each word in the extracted content is wrapped in a `<span>` element
- Spans have class `sr-word` and a `data-word-index` attribute
- Original text content and DOM structure are preserved
- Wrapper injection completes without visible layout shift
- Injection works on Readability-extracted article content

### AC2: Current Word Highlighting

**Given** TTS audio is playing
**When** `HIGHLIGHT_WORD` message is received with `wordIndex`
**Then**:
- The word at that index receives class `sr-word--current`
- Previous current word loses `sr-word--current` class
- Highlight color matches user preference from storage (default yellow)
- Highlighting updates use requestAnimationFrame for 60fps smoothness
- Visual update is immediate (< 16ms latency)

### AC3: Synchronized Scrolling

**Given** audio is playing and words are being highlighted
**When** the current word is not visible in the viewport
**Then**:
- Page smoothly scrolls to bring the current word into view
- Word is positioned roughly 1/3 from top of viewport (comfortable reading position)
- Scroll behavior respects `prefers-reduced-motion` (instant scroll if reduced motion)
- Scrolling doesn't interfere with user manual scrolling for 2 seconds after user scroll

### AC4: Highlight Reset

**Given** playback has stopped or content has changed
**When** `HIGHLIGHT_RESET` message is received
**Then**:
- All `sr-word--current` classes are removed
- Word wrapper spans remain in place (no DOM teardown)
- Page does not scroll on reset
- Ready for new highlighting session without re-initialization

### AC5: Highlight Color from Storage

**Given** user has set a highlight color preference
**When** highlighting is applied
**Then**:
- Highlight color loaded from `chrome.storage.sync` on initialization
- Color applied via CSS custom property `--sr-highlight-color`
- Supports preset colors: yellow (#ffeb3b), green (#a5d6a7), blue (#90caf9), pink (#f48fb1)
- Supports custom hex colors
- Changes to storage update highlight color in real-time

### AC6: CSS Isolation

**Given** the content script runs on arbitrary webpages
**When** highlight styles are applied
**Then**:
- All CSS classes prefixed with `sr-` (e.g., `sr-word`, `sr-word--current`)
- Styles don't leak to or from host page
- Highlighting works regardless of host page's CSS reset or framework
- Styles injected via `<style>` tag with unique ID to prevent duplicates

---

## Technical Implementation Notes

### Highlighter Module (`entrypoints/content/highlighter.ts`)

```typescript
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
  unsubscribeStorage: (() => void) | null;
}

const state: HighlighterState = {
  initialized: false,
  wordElements: [],
  currentWordIndex: null,
  highlightColor: COLOR_PRESETS.yellow,
  lastUserScrollTime: 0,
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

    // Add highlight to new word
    const wordElement = state.wordElements[wordIndex];
    wordElement.classList.add('sr-word--current');
    state.currentWordIndex = wordIndex;
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

  window.scrollTo({
    top: targetY,
    behavior: prefersReducedMotion ? 'instant' : 'smooth',
  });
}

/**
 * Reset all highlighting.
 */
export function resetHighlight(): void {
  if (!state.initialized) return;

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

    /* Respect reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      .sr-word {
        transition: none;
      }
    }
  `;

  document.head.appendChild(style);
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
```

### Updated Content Script (`entrypoints/content/index.ts`)

```typescript
// entrypoints/content/index.ts

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

// Track the article element for highlighting
let articleElement: Element | null = null;

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
    articleElement = findArticleElement();

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
```

### Test Cases (`entrypoints/content/highlighter.test.ts`)

```typescript
// entrypoints/content/highlighter.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock chrome.storage API
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: {
        get: vi.fn().mockResolvedValue({}),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  },
}));

describe('highlighter', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('word wrapping', () => {
    it('wraps words in spans with correct class', async () => {
      document.body.innerHTML = '<article><p>Hello world</p></article>';
      const article = document.querySelector('article')!;

      // Import after mocks are set up
      const { initializeHighlighter } = await import('./highlighter');
      const wordCount = await initializeHighlighter(article);

      expect(wordCount).toBe(2);
      expect(document.querySelectorAll('.sr-word')).toHaveLength(2);
      expect(document.querySelector('.sr-word')?.textContent).toBe('Hello');
    });

    it('preserves whitespace between words', async () => {
      document.body.innerHTML = '<article><p>Hello   world</p></article>';
      const article = document.querySelector('article')!;

      const { initializeHighlighter } = await import('./highlighter');
      await initializeHighlighter(article);

      // Check that spaces are preserved
      const paragraph = document.querySelector('p')!;
      expect(paragraph.textContent).toBe('Hello   world');
    });

    it('sets data-word-index attributes', async () => {
      document.body.innerHTML = '<article><p>One two three</p></article>';
      const article = document.querySelector('article')!;

      const { initializeHighlighter } = await import('./highlighter');
      await initializeHighlighter(article);

      const words = document.querySelectorAll('.sr-word');
      expect(words[0].getAttribute('data-word-index')).toBe('0');
      expect(words[1].getAttribute('data-word-index')).toBe('1');
      expect(words[2].getAttribute('data-word-index')).toBe('2');
    });
  });

  describe('highlighting', () => {
    it('adds sr-word--current class to highlighted word', async () => {
      document.body.innerHTML = '<article><p>Hello world</p></article>';
      const article = document.querySelector('article')!;

      const { initializeHighlighter, highlightWord } = await import('./highlighter');
      await initializeHighlighter(article);

      // Use fake RAF
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0);
        return 0;
      });

      highlightWord(1);

      const words = document.querySelectorAll('.sr-word');
      expect(words[1].classList.contains('sr-word--current')).toBe(true);
    });

    it('removes highlight from previous word', async () => {
      document.body.innerHTML = '<article><p>One two three</p></article>';
      const article = document.querySelector('article')!;

      const { initializeHighlighter, highlightWord } = await import('./highlighter');
      await initializeHighlighter(article);

      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0);
        return 0;
      });

      highlightWord(0);
      highlightWord(1);

      const words = document.querySelectorAll('.sr-word');
      expect(words[0].classList.contains('sr-word--current')).toBe(false);
      expect(words[1].classList.contains('sr-word--current')).toBe(true);
    });
  });

  describe('reset', () => {
    it('removes all highlighting on reset', async () => {
      document.body.innerHTML = '<article><p>Hello world</p></article>';
      const article = document.querySelector('article')!;

      const { initializeHighlighter, highlightWord, resetHighlight } = await import('./highlighter');
      await initializeHighlighter(article);

      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0);
        return 0;
      });

      highlightWord(0);
      resetHighlight();

      const currentWords = document.querySelectorAll('.sr-word--current');
      expect(currentWords).toHaveLength(0);
    });
  });

  describe('styles', () => {
    it('injects styles with sr-highlight-styles id', async () => {
      document.body.innerHTML = '<article><p>Test</p></article>';
      const article = document.querySelector('article')!;

      const { initializeHighlighter } = await import('./highlighter');
      await initializeHighlighter(article);

      const styleElement = document.getElementById('sr-highlight-styles');
      expect(styleElement).not.toBeNull();
      expect(styleElement?.tagName).toBe('STYLE');
    });

    it('does not inject duplicate styles', async () => {
      document.body.innerHTML = '<article><p>Test</p></article>';
      const article = document.querySelector('article')!;

      const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
      await initializeHighlighter(article);

      // Manually reset state for second init
      destroyHighlighter();

      document.body.innerHTML = '<article><p>Test again</p></article>';
      const article2 = document.querySelector('article')!;
      await initializeHighlighter(article2);

      const styleElements = document.querySelectorAll('#sr-highlight-styles');
      expect(styleElements).toHaveLength(1);
    });
  });
});
```

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| FR13: Highlight current word | `sr-word--current` class applied to active word |
| FR15: Auto-scroll to word | `scrollToWord()` positions word at 1/3 viewport height |
| FR17: Phoneme-weighted sync | Receives word index from timing calculation (Story 2-5) |
| ARCH-17: requestAnimationFrame | All DOM updates wrapped in RAF for 60fps |
| ARCH-12: sr- CSS prefix | All classes prefixed: `sr-word`, `sr-word--current` |
| Reduced motion | Respects `prefers-reduced-motion` for scroll behavior |
| Storage integration | Loads `highlightColor` from `chrome.storage.sync` |

### File Structure After Implementation

```
entrypoints/
  content/
    index.ts              # UPDATE: Wire up highlighter message handlers
    highlighter.ts        # NEW: Word highlighting module
    highlighter.test.ts   # NEW: Unit tests
    extractor.ts          # EXISTING: Content extraction

lib/
  messages.ts             # EXISTING: HighlightMessage types
  storage.ts              # EXISTING: highlightColor key
```

---

## Tasks

### Task 1: Create Highlighter Module Structure
**AC: 1, 6**
- [x] Create `entrypoints/content/highlighter.ts`
- [x] Define `HighlighterState` interface for state management
- [x] Implement color presets mapping (yellow, green, blue, pink)
- [x] Export main functions: `initializeHighlighter`, `highlightWord`, `scrollToWord`, `resetHighlight`, `destroyHighlighter`

### Task 2: Implement Word Wrapper Injection
**AC: 1, 6**
- [x] Implement `wrapWordsInElement()` using TreeWalker
- [x] Wrap each word in `<span class="sr-word" data-word-index="N">`
- [x] Preserve whitespace between words
- [x] Skip script and style elements
- [x] Store word elements array for quick access by index
- [x] Log word count: `[SimpleReader] Highlighter initialized: N words`

### Task 3: Implement Highlight Styles Injection
**AC: 6**
- [x] Implement `injectStyles()` function
- [x] Create style element with id `sr-highlight-styles`
- [x] Define CSS custom property `--sr-highlight-color`
- [x] Style `.sr-word` (base) and `.sr-word--current` (highlighted)
- [x] Add `prefers-reduced-motion` media query
- [x] Prevent duplicate style injection

### Task 4: Implement Word Highlighting
**AC: 2**
- [x] Implement `highlightWord(wordIndex)` function
- [x] Use requestAnimationFrame for DOM updates
- [x] Add `sr-word--current` class to target word
- [x] Remove class from previously highlighted word
- [x] Validate word index bounds
- [x] Log warnings for invalid indices

### Task 5: Implement Synchronized Scrolling
**AC: 3**
- [x] Implement `scrollToWord(wordIndex)` function
- [x] Calculate target scroll position (word at 1/3 viewport height)
- [x] Check if word is already visible (skip scroll if so)
- [x] Track user scroll events to pause auto-scroll for 2 seconds
- [x] Respect `prefers-reduced-motion` (instant vs smooth scroll)
- [x] Use `window.scrollTo()` with appropriate behavior

### Task 6: Implement Highlight Reset
**AC: 4**
- [x] Implement `resetHighlight()` function
- [x] Remove `sr-word--current` from all words
- [x] Clear current word index tracking
- [x] Don't remove word wrapper spans (keep DOM intact)
- [x] Log reset action

### Task 7: Implement Storage Integration
**AC: 5**
- [x] Implement `loadHighlightColor()` from storage
- [x] Implement `setHighlightColor()` to update CSS property
- [x] Subscribe to storage changes via `onStorageChange()`
- [x] Update highlight color in real-time when preference changes
- [x] Clean up storage listener on destroy

### Task 8: Update Content Script Message Handlers
**AC: 2, 3, 4**
- [x] Update `HIGHLIGHT_WORD` handler to call `highlightWord()`
- [x] Update `HIGHLIGHT_RESET` handler to call `resetHighlight()`
- [x] Add `HIGHLIGHT_SCROLL_TO` handler to call `scrollToWord()`
- [x] Implement `findArticleElement()` to locate article for highlighting
- [x] Call `initializeHighlighter()` after content extraction

### Task 9: Write Unit Tests
**AC: 1, 2, 4, 6**
- [x] Create `entrypoints/content/highlighter.test.ts`
- [x] Test word wrapping (correct class, data attributes)
- [x] Test whitespace preservation
- [x] Test highlighting (adds/removes current class)
- [x] Test reset (clears all highlighting)
- [x] Test style injection (no duplicates)
- [x] Mock chrome.storage API
- [x] Run tests: `bun test`

### Task 10: Manual Testing
**AC: 1, 2, 3, 4, 5**
- [ ] Test on Medium article - verify highlighting works
- [ ] Test on Substack newsletter - verify highlighting works
- [ ] Test on Hacker News comments - verify highlighting works
- [ ] Test scroll behavior with long article
- [ ] Test reduced motion preference (disable smooth scroll)
- [ ] Test manual scroll interruption (auto-scroll pauses)
- [ ] Test highlight color change in settings (real-time update)
- [ ] Verify no console errors or warnings
- [ ] Verify 60fps highlighting (DevTools Performance panel)

---

## Definition of Done

- [x] `entrypoints/content/highlighter.ts` module created
- [x] Words wrapped in spans with `sr-word` class and data attributes
- [x] Current word highlighted with `sr-word--current` class
- [x] Highlighting uses requestAnimationFrame for 60fps
- [x] Auto-scroll keeps current word visible
- [x] Scroll respects reduced motion preference
- [x] User scroll pauses auto-scroll for 2 seconds
- [x] Highlight color loaded from storage
- [x] Storage changes update color in real-time
- [x] All CSS classes prefixed with `sr-`
- [x] Content script message handlers wired up
- [x] Unit tests pass
- [ ] Manual testing on 3+ sites successful
- [x] No TypeScript errors
- [x] Console logs show highlighter initialization

---

## Dependencies

### Depends On
- Story 2-1: Content extraction (article element to highlight)
- Story 2-5: Word tokenization and timing (provides word indices)
- Story 1-3: Message protocol (HighlightMessage types)
- Story 1-4: Storage helpers (highlightColor preference)

### Enables
- Story 2-7: Basic Playback Controls (visual feedback during playback)
- Story 4-4: Highlight Color Customization (uses storage integration)
- Story 5-4: Visual Distinction for Spoken Words (extends highlighting)

---

## Test Scenarios

### Manual Testing Checklist

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| Basic highlighting | Play TTS on article | Words highlight one by one as spoken |
| Scroll to word | Play until word scrolls off screen | Page scrolls to show current word |
| User scroll interruption | Manually scroll during playback | Auto-scroll pauses for 2 seconds |
| Reset highlighting | Stop playback | All highlights removed |
| Color preference | Change highlight color in settings | Color updates immediately |
| Reduced motion | Enable reduced motion in OS | Scroll is instant, not smooth |
| Long article | Play article with 1000+ words | Highlighting remains smooth |
| Code blocks | Article with code snippets | Code text wrapped and highlighted |

### Console Log Expectations

```
[SimpleReader] Content script loaded
[SimpleReader] Starting content extraction...
[SimpleReader] Extraction complete: 523 words in 45ms
[SimpleReader] Highlight color set: #ffeb3b
[SimpleReader] Highlighter initialized: 523 words
[SimpleReader] Highlighted 523 words
```

### Performance Validation

Use Chrome DevTools Performance panel to verify:
- Highlighting updates at 60fps (no frame drops)
- No layout thrashing during word transitions
- Scroll events don't cause jank

---

## References

- [Source: docs/architecture.md#Word Highlighting] - FR13, FR15, FR17, ARCH-12, ARCH-17
- [Source: docs/epics.md#Story 2.6] - Original story definition
- [Source: lib/messages.ts] - HighlightMessage types
- [Source: lib/storage.ts] - STORAGE_KEYS.highlightColor, HighlightColor type
- [Source: entrypoints/content/index.ts] - Current message handlers
- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame) - RAF API
- [MDN TreeWalker](https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker) - DOM traversal
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) - Accessibility

---

## Dev Notes

### Word Wrapping Strategy

Using TreeWalker to traverse text nodes because:
1. Preserves existing DOM structure
2. Handles nested elements correctly
3. Efficient for large documents
4. Skips script/style elements automatically

Wrapping creates spans around each word:
```html
<!-- Before -->
<p>Hello world</p>

<!-- After -->
<p><span class="sr-word" data-word-index="0">Hello</span> <span class="sr-word" data-word-index="1">world</span></p>
```

### Scroll Positioning

Word positioned at 1/3 viewport height (not center) because:
1. Comfortable reading position for Western languages (top-down)
2. Shows upcoming context below current word
3. Matches common reading app patterns (Kindle, iBooks)

### User Scroll Detection

Pausing auto-scroll when user scrolls manually because:
1. User may want to look ahead or back
2. Fighting user scroll feels janky
3. 2-second timeout is long enough to finish manual scrolling
4. Auto-scroll resumes naturally without user action

### CSS Custom Property Approach

Using `--sr-highlight-color` custom property because:
1. Easy to update from JavaScript
2. Single source of truth for color
3. Works with all browsers
4. Can be used in future for theming

### Known Limitations (MVP Acceptable)

1. Word wrapping may break on very unusual DOM structures
2. Highlighting doesn't account for already-spoken words (Story 5-4)
3. No support for RTL languages (post-MVP)
4. No visual feedback during TTS loading (Story 6-1)

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

### File List

- `entrypoints/content/highlighter.ts` (new: word highlighting module)
- `entrypoints/content/highlighter.test.ts` (new: unit tests)
- `entrypoints/content/index.ts` (update: wire up message handlers and initialize highlighter)
