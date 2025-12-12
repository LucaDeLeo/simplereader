// entrypoints/content/selection-extractor.test.ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';

// Create a DOM environment
let window: Window;
let document: Document;

beforeAll(() => {
  // Set up happy-dom window
  window = new Window();
  document = window.document as unknown as Document;

  // Attach to global
  (globalThis as Record<string, unknown>).window = window;
  (globalThis as Record<string, unknown>).document = document;
  (globalThis as Record<string, unknown>).Node = window.Node;
  (globalThis as Record<string, unknown>).Range = window.Range;
  (globalThis as Record<string, unknown>).NodeFilter = window.NodeFilter;
});

afterAll(() => {
  // Clean up
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).Node;
  delete (globalThis as Record<string, unknown>).Range;
  delete (globalThis as Record<string, unknown>).NodeFilter;
});

// Import after DOM setup
let extractSelection: typeof import('./selection-extractor').extractSelection;
let getSelectionContainer: typeof import('./selection-extractor').getSelectionContainer;

beforeAll(async () => {
  const module = await import('./selection-extractor');
  extractSelection = module.extractSelection;
  getSelectionContainer = module.getSelectionContainer;
});

describe('extractSelection', () => {
  beforeEach(() => {
    // Clear any existing selection
    window.getSelection()?.removeAllRanges();
    // Reset document body
    document.body.innerHTML = '';
  });

  test('returns null when no selection exists', () => {
    const result = extractSelection();
    expect(result).toBeNull();
  });

  test('returns null when selection is collapsed', () => {
    document.body.innerHTML = '<p>Test text</p>';
    const selection = window.getSelection();
    const range = document.createRange();
    const p = document.querySelector('p')!;
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.firstChild!, 0); // Collapsed
    selection?.addRange(range);

    const result = extractSelection();
    expect(result).toBeNull();
  });

  test('returns null when selection is too short', () => {
    document.body.innerHTML = '<p>Hi</p>';
    const selection = window.getSelection();
    const range = document.createRange();
    const p = document.querySelector('p')!;
    range.selectNodeContents(p);
    selection?.addRange(range);

    const result = extractSelection();
    expect(result).toBeNull();
  });

  test('extracts text from simple selection', () => {
    document.body.innerHTML = '<p>This is a simple test paragraph.</p>';
    const selection = window.getSelection();
    const range = document.createRange();
    const p = document.querySelector('p')!;
    range.selectNodeContents(p);
    selection?.addRange(range);

    const result = extractSelection();
    expect(result).not.toBeNull();
    expect(result!.text).toBe('This is a simple test paragraph.');
    expect(result!.wordCount).toBe(6);
  });

  test('normalizes whitespace in extracted text', () => {
    document.body.innerHTML = '<p>Text   with   multiple    spaces</p>';
    const selection = window.getSelection();
    const range = document.createRange();
    const p = document.querySelector('p')!;
    range.selectNodeContents(p);
    selection?.addRange(range);

    const result = extractSelection();
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Text with multiple spaces');
  });

  test('calculates correct word count', () => {
    document.body.innerHTML = '<p>One two three four five</p>';
    const selection = window.getSelection();
    const range = document.createRange();
    const p = document.querySelector('p')!;
    range.selectNodeContents(p);
    selection?.addRange(range);

    const result = extractSelection();
    expect(result).not.toBeNull();
    expect(result!.wordCount).toBe(5);
  });
});

describe('getSelectionContainer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('returns element node directly', () => {
    document.body.innerHTML = '<div id="container"><p>Text</p></div>';
    const range = document.createRange();
    const container = document.querySelector('#container')!;
    range.selectNodeContents(container);

    const result = getSelectionContainer(range);
    expect(result).toBe(container);
  });

  test('returns parent element for text nodes', () => {
    document.body.innerHTML = '<p id="para">Some text content</p>';
    const range = document.createRange();
    const p = document.querySelector('#para')!;
    const textNode = p.firstChild!;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);

    const result = getSelectionContainer(range);
    expect(result).toBe(p);
  });

  test('handles selection spanning multiple elements', () => {
    document.body.innerHTML = '<div id="wrapper"><p>First para</p><p>Second para</p></div>';
    const range = document.createRange();
    const wrapper = document.querySelector('#wrapper')!;
    const firstP = wrapper.querySelector('p')!;
    const lastP = wrapper.querySelectorAll('p')[1]!;
    range.setStart(firstP.firstChild!, 0);
    range.setEnd(lastP.firstChild!, 6);

    const result = getSelectionContainer(range);
    expect(result).toBe(wrapper);
  });
});
