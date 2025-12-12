// entrypoints/content/highlighter.test.ts
// Unit tests for word highlighting module

import { describe, test, expect, mock, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { Window } from 'happy-dom';

// Create a DOM environment
let window: Window;
let document: Document;

// Mock chrome.storage API
const mockStorageGet = mock(() => Promise.resolve({}));
const mockStorageAddListener = mock(() => {});
const mockStorageRemoveListener = mock(() => {});

beforeAll(() => {
  // Set up happy-dom window
  window = new Window();
  // Cast to Document - happy-dom types are incomplete but functionally compatible
  document = window.document as unknown as Document;

  // Attach to global
  (globalThis as Record<string, unknown>).window = window;
  (globalThis as Record<string, unknown>).document = document;
  (globalThis as Record<string, unknown>).HTMLElement = window.HTMLElement;
  (globalThis as Record<string, unknown>).NodeFilter = window.NodeFilter;
  (globalThis as Record<string, unknown>).Text = window.Text;

  // Mock chrome API
  (globalThis as Record<string, unknown>).chrome = {
    storage: {
      sync: {
        get: mockStorageGet,
        set: mock(() => Promise.resolve()),
      },
      local: {
        get: mock(() => Promise.resolve({})),
        set: mock(() => Promise.resolve()),
      },
      onChanged: {
        addListener: mockStorageAddListener,
        removeListener: mockStorageRemoveListener,
      },
    },
  };

  // Mock matchMedia
  (globalThis as Record<string, unknown>).matchMedia = mock(() => ({
    matches: false,
    addEventListener: mock(() => {}),
    removeEventListener: mock(() => {}),
  }));

  // Mock requestAnimationFrame - execute synchronously
  (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
});

afterAll(() => {
  window.close();
});

beforeEach(() => {
  // Reset DOM
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  // Reset mock calls
  mockStorageGet.mockClear();
  mockStorageAddListener.mockClear();
  mockStorageRemoveListener.mockClear();
  mockStorageGet.mockImplementation(() => Promise.resolve({}));
});

describe('COLOR_PRESETS', () => {
  test('exports correct color presets', async () => {
    const { COLOR_PRESETS } = await import('./highlighter');

    expect(COLOR_PRESETS.yellow).toBe('#ffeb3b');
    expect(COLOR_PRESETS.green).toBe('#a5d6a7');
    expect(COLOR_PRESETS.blue).toBe('#90caf9');
    expect(COLOR_PRESETS.pink).toBe('#f48fb1');
  });
});

describe('highlighter exports', () => {
  test('exports required functions', async () => {
    const highlighter = await import('./highlighter');

    expect(typeof highlighter.initializeHighlighter).toBe('function');
    expect(typeof highlighter.highlightWord).toBe('function');
    expect(typeof highlighter.scrollToWord).toBe('function');
    expect(typeof highlighter.resetHighlight).toBe('function');
    expect(typeof highlighter.destroyHighlighter).toBe('function');
    expect(typeof highlighter.isHighlighterInitialized).toBe('function');
    expect(typeof highlighter.getWordCount).toBe('function');
  });
});

describe('word wrapping', () => {
  afterEach(async () => {
    const { destroyHighlighter } = await import('./highlighter');
    destroyHighlighter();
  });

  test('wraps words in spans with correct class', async () => {
    document.body.innerHTML = '<article><p>Hello world</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
    const wordCount = await initializeHighlighter(article);

    expect(wordCount).toBe(2);
    expect(document.querySelectorAll('.sr-word').length).toBe(2);
    expect(document.querySelector('.sr-word')?.textContent).toBe('Hello');

    destroyHighlighter();
  });

  test('preserves whitespace between words', async () => {
    document.body.innerHTML = '<article><p>Hello   world</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    // Check that text content is preserved
    const paragraph = document.querySelector('p')!;
    expect(paragraph.textContent).toBe('Hello   world');

    destroyHighlighter();
  });

  test('sets data-word-index attributes', async () => {
    document.body.innerHTML = '<article><p>One two three</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    const words = document.querySelectorAll('.sr-word');
    expect(words[0].getAttribute('data-word-index')).toBe('0');
    expect(words[1].getAttribute('data-word-index')).toBe('1');
    expect(words[2].getAttribute('data-word-index')).toBe('2');

    destroyHighlighter();
  });

  test('handles multiple paragraphs', async () => {
    document.body.innerHTML = '<article><p>First paragraph.</p><p>Second paragraph.</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
    const wordCount = await initializeHighlighter(article);

    expect(wordCount).toBe(4);
    const words = document.querySelectorAll('.sr-word');
    expect(words[0].textContent).toBe('First');
    expect(words[2].textContent).toBe('Second');

    destroyHighlighter();
  });

  test('handles nested elements', async () => {
    document.body.innerHTML = '<article><p>Hello <strong>bold</strong> world</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
    const wordCount = await initializeHighlighter(article);

    expect(wordCount).toBe(3);
    // Verify structure is preserved
    expect(document.querySelector('strong')).not.toBeNull();

    destroyHighlighter();
  });
});

describe('highlighting', () => {
  afterEach(async () => {
    const { destroyHighlighter } = await import('./highlighter');
    destroyHighlighter();
  });

  test('adds sr-word--current class to highlighted word', async () => {
    document.body.innerHTML = '<article><p>Hello world</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, highlightWord, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    highlightWord(1);

    const words = document.querySelectorAll('.sr-word');
    expect(words[1].classList.contains('sr-word--current')).toBe(true);

    destroyHighlighter();
  });

  test('removes highlight from previous word', async () => {
    document.body.innerHTML = '<article><p>One two three</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, highlightWord, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    highlightWord(0);
    highlightWord(1);

    const words = document.querySelectorAll('.sr-word');
    expect(words[0].classList.contains('sr-word--current')).toBe(false);
    expect(words[1].classList.contains('sr-word--current')).toBe(true);

    destroyHighlighter();
  });
});

describe('reset', () => {
  afterEach(async () => {
    const { destroyHighlighter } = await import('./highlighter');
    destroyHighlighter();
  });

  test('removes all highlighting on reset', async () => {
    document.body.innerHTML = '<article><p>Hello world</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, highlightWord, resetHighlight, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    highlightWord(0);
    resetHighlight();

    const currentWords = document.querySelectorAll('.sr-word--current');
    expect(currentWords.length).toBe(0);

    destroyHighlighter();
  });

  test('preserves word wrapper spans on reset', async () => {
    document.body.innerHTML = '<article><p>Hello world</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, highlightWord, resetHighlight, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    highlightWord(0);
    resetHighlight();

    // Word spans should still exist
    const words = document.querySelectorAll('.sr-word');
    expect(words.length).toBe(2);

    destroyHighlighter();
  });
});

describe('styles', () => {
  afterEach(async () => {
    const { destroyHighlighter } = await import('./highlighter');
    destroyHighlighter();
  });

  test('injects styles with sr-highlight-styles id', async () => {
    document.body.innerHTML = '<article><p>Test</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    const styleElement = document.getElementById('sr-highlight-styles');
    expect(styleElement).not.toBeNull();
    expect(styleElement?.tagName).toBe('STYLE');

    destroyHighlighter();
  });

  test('styles contain required CSS classes', async () => {
    document.body.innerHTML = '<article><p>Test</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    const styleElement = document.getElementById('sr-highlight-styles');
    const styleContent = styleElement?.textContent || '';

    expect(styleContent).toContain('.sr-word');
    expect(styleContent).toContain('.sr-word--current');
    expect(styleContent).toContain('--sr-highlight-color');
    expect(styleContent).toContain('prefers-reduced-motion');

    destroyHighlighter();
  });
});

describe('storage integration', () => {
  afterEach(async () => {
    const { destroyHighlighter } = await import('./highlighter');
    destroyHighlighter();
  });

  test('sets up storage change listener', async () => {
    document.body.innerHTML = '<article><p>Test</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    expect(mockStorageAddListener).toHaveBeenCalled();

    destroyHighlighter();
  });

  test('removes storage listener on destroy', async () => {
    document.body.innerHTML = '<article><p>Test</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    destroyHighlighter();

    expect(mockStorageRemoveListener).toHaveBeenCalled();
  });
});

describe('destroy', () => {
  test('removes style element on destroy', async () => {
    document.body.innerHTML = '<article><p>Test</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');
    await initializeHighlighter(article);

    expect(document.getElementById('sr-highlight-styles')).not.toBeNull();

    destroyHighlighter();

    expect(document.getElementById('sr-highlight-styles')).toBeNull();
  });

  test('resets initialized state', async () => {
    document.body.innerHTML = '<article><p>Test</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter, isHighlighterInitialized } = await import('./highlighter');
    await initializeHighlighter(article);

    expect(isHighlighterInitialized()).toBe(true);

    destroyHighlighter();

    expect(isHighlighterInitialized()).toBe(false);
  });
});

describe('re-initialization guard', () => {
  afterEach(async () => {
    const { destroyHighlighter } = await import('./highlighter');
    destroyHighlighter();
  });

  test('returns existing word count when already initialized', async () => {
    document.body.innerHTML = '<article><p>Hello world</p></article>';
    const article = document.querySelector('article')!;

    const { initializeHighlighter, destroyHighlighter } = await import('./highlighter');

    const firstCount = await initializeHighlighter(article);
    const secondCount = await initializeHighlighter(article);

    expect(firstCount).toBe(2);
    expect(secondCount).toBe(2);

    destroyHighlighter();
  });
});
