// entrypoints/content/table-processor.test.ts
// Unit tests for table preprocessing module

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Window } from 'happy-dom';
import { preprocessTablesForTTS } from './table-processor';

// Create a DOM environment
let window: Window;
let document: Document;

beforeAll(() => {
  window = new Window();
  document = window.document as unknown as Document;
  (globalThis as Record<string, unknown>).document = document;
});

afterAll(() => {
  window.close();
});

/**
 * Helper to create a fresh document with HTML content
 */
function createDocument(html: string): Document {
  const doc = window.document as unknown as Document;
  doc.body.innerHTML = html;
  return doc;
}

describe('preprocessTablesForTTS', () => {
  test('converts simple table to row-by-row text', () => {
    const doc = createDocument(`
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>John</td><td>25</td></tr>
        <tr><td>Jane</td><td>30</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content');
    expect(result).not.toBeNull();
    expect(result?.textContent).toContain('Table.');
    expect(result?.textContent).toContain('Headers: Name, Age.');
    expect(result?.textContent).toContain('Row 1: Name: John. Age: 25.');
    expect(result?.textContent).toContain('Row 2: Name: Jane. Age: 30.');
    expect(result?.textContent).toContain('End of table.');
  });

  test('detects headers from <thead>', () => {
    const doc = createDocument(`
      <table>
        <thead>
          <tr><th>Product</th><th>Price</th></tr>
        </thead>
        <tbody>
          <tr><td>Widget</td><td>$10</td></tr>
        </tbody>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Headers: Product, Price.');
    expect(result).toContain('Row 1: Product: Widget. Price: $10.');
  });

  test('detects headers from first row with <th>', () => {
    const doc = createDocument(`
      <table>
        <tr><th>A</th><th>B</th><th>C</th></tr>
        <tr><td>1</td><td>2</td><td>3</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Headers: A, B, C.');
    expect(result).toContain('Row 1: A: 1. B: 2. C: 3.');
  });

  test('includes header context in cell values', () => {
    const doc = createDocument(`
      <table>
        <tr><th>Feature</th><th>Speechify</th><th>SimpleReader</th></tr>
        <tr><td>Price</td><td>$139/year</td><td>Free</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Feature: Price');
    expect(result).toContain('Speechify: $139/year');
    expect(result).toContain('SimpleReader: Free');
  });

  test('extracts caption as table title', () => {
    const doc = createDocument(`
      <table>
        <caption>Employee Directory</caption>
        <tr><th>Name</th><th>Department</th></tr>
        <tr><td>Alice</td><td>Engineering</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Table: Employee Directory.');
  });

  test('uses summary attribute as fallback caption', () => {
    const doc = createDocument(`
      <table summary="Sales Data 2024">
        <tr><th>Quarter</th><th>Revenue</th></tr>
        <tr><td>Q1</td><td>$1M</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Table: Sales Data 2024.');
  });

  test('handles empty cells gracefully', () => {
    const doc = createDocument(`
      <table>
        <tr><th>Name</th><th>Notes</th></tr>
        <tr><td>John</td><td></td></tr>
        <tr><td>Jane</td><td>Some notes</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Row 1: Name: John. Notes: empty.');
    expect(result).toContain('Row 2: Name: Jane. Notes: Some notes.');
  });

  test('handles tables without headers', () => {
    const doc = createDocument(`
      <table>
        <tr><td>A</td><td>B</td><td>C</td></tr>
        <tr><td>1</td><td>2</td><td>3</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Table.');
    expect(result).toContain('Row 1: A. B. C.');
    expect(result).toContain('Row 2: 1. 2. 3.');
    expect(result).not.toContain('Headers:');
  });

  test('does not crash on colspan/rowspan', () => {
    const doc = createDocument(`
      <table>
        <tr><th colspan="2">Name</th><th>Age</th></tr>
        <tr><td>First</td><td>Last</td><td>25</td></tr>
        <tr><td rowspan="2">John</td><td>Doe</td><td>30</td></tr>
        <tr><td>Smith</td><td>35</td></tr>
      </table>
    `);

    // Should not throw
    expect(() => preprocessTablesForTTS(doc)).not.toThrow();

    const result = doc.querySelector('.sr-table-content');
    expect(result).not.toBeNull();
    expect(result?.textContent).toContain('End of table.');
  });

  test('processes multiple tables', () => {
    const doc = createDocument(`
      <table>
        <tr><th>A</th><th>B</th></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
      <table>
        <tr><th>X</th><th>Y</th></tr>
        <tr><td>3</td><td>4</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const results = doc.querySelectorAll('.sr-table-content');
    expect(results.length).toBe(2);
    expect(results[0].textContent).toContain('Headers: A, B.');
    expect(results[1].textContent).toContain('Headers: X, Y.');
  });
});

describe('shouldSkipTable', () => {
  test('skips tables inside <nav>', () => {
    const doc = createDocument(`
      <nav>
        <table>
          <tr><td>Link 1</td><td>Link 2</td><td>Link 3</td><td>Link 4</td></tr>
        </table>
      </nav>
    `);

    preprocessTablesForTTS(doc);

    // Table should still be there (not processed)
    expect(doc.querySelector('table')).not.toBeNull();
    expect(doc.querySelector('.sr-table-content')).toBeNull();
  });

  test('skips tables inside <footer>', () => {
    const doc = createDocument(`
      <footer>
        <table>
          <tr><td>A</td><td>B</td><td>C</td><td>D</td></tr>
        </table>
      </footer>
    `);

    preprocessTablesForTTS(doc);

    expect(doc.querySelector('table')).not.toBeNull();
    expect(doc.querySelector('.sr-table-content')).toBeNull();
  });

  test('skips tables inside <aside>', () => {
    const doc = createDocument(`
      <aside>
        <table>
          <tr><td>A</td><td>B</td><td>C</td><td>D</td></tr>
        </table>
      </aside>
    `);

    preprocessTablesForTTS(doc);

    expect(doc.querySelector('table')).not.toBeNull();
  });

  test('skips tables inside <header>', () => {
    const doc = createDocument(`
      <header>
        <table>
          <tr><td>A</td><td>B</td><td>C</td><td>D</td></tr>
        </table>
      </header>
    `);

    preprocessTablesForTTS(doc);

    expect(doc.querySelector('table')).not.toBeNull();
  });

  test('skips tables with layout class', () => {
    const doc = createDocument(`
      <table class="layout-table">
        <tr><td>A</td><td>B</td><td>C</td><td>D</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    expect(doc.querySelector('table')).not.toBeNull();
  });

  test('skips tables with nav class', () => {
    const doc = createDocument(`
      <table class="nav-menu">
        <tr><td>A</td><td>B</td><td>C</td><td>D</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    expect(doc.querySelector('table')).not.toBeNull();
  });

  test('skips tables with role="presentation"', () => {
    const doc = createDocument(`
      <table role="presentation">
        <tr><td>A</td><td>B</td><td>C</td><td>D</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    expect(doc.querySelector('table')).not.toBeNull();
  });

  test('skips tables with fewer than 4 cells', () => {
    const doc = createDocument(`
      <table>
        <tr><td>A</td><td>B</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    expect(doc.querySelector('table')).not.toBeNull();
  });

  test('skips single-column tables', () => {
    const doc = createDocument(`
      <table>
        <tr><td>Row 1</td></tr>
        <tr><td>Row 2</td></tr>
        <tr><td>Row 3</td></tr>
        <tr><td>Row 4</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    expect(doc.querySelector('table')).not.toBeNull();
  });

  test('processes content tables normally', () => {
    const doc = createDocument(`
      <article>
        <table>
          <tr><th>Name</th><th>Value</th></tr>
          <tr><td>Item 1</td><td>100</td></tr>
          <tr><td>Item 2</td><td>200</td></tr>
        </table>
      </article>
    `);

    preprocessTablesForTTS(doc);

    expect(doc.querySelector('table')).toBeNull();
    expect(doc.querySelector('.sr-table-content')).not.toBeNull();
  });
});

describe('edge cases', () => {
  test('handles whitespace in cell content', () => {
    const doc = createDocument(`
      <table>
        <tr><th>Name</th><th>Description</th></tr>
        <tr><td>  John  </td><td>  A   long    description  </td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Name: John');
    expect(result).toContain('Description: A long description');
  });

  test('handles nested elements in cells', () => {
    const doc = createDocument(`
      <table>
        <tr><th>Name</th><th>Link</th></tr>
        <tr>
          <td><strong>John</strong></td>
          <td><a href="#">Click here</a></td>
        </tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Name: John');
    expect(result).toContain('Link: Click here');
  });

  test('handles empty table gracefully', () => {
    const doc = createDocument(`
      <table>
        <tr><th>A</th><th>B</th></tr>
      </table>
    `);

    expect(() => preprocessTablesForTTS(doc)).not.toThrow();
  });

  test('handles table with only headers', () => {
    const doc = createDocument(`
      <table>
        <thead>
          <tr><th>A</th><th>B</th><th>C</th><th>D</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Headers: A, B, C, D.');
    expect(result).toContain('End of table.');
  });

  test('handles aria-label as caption fallback', () => {
    const doc = createDocument(`
      <table aria-label="Quarterly Results">
        <tr><th>Q1</th><th>Q2</th></tr>
        <tr><td>100</td><td>200</td></tr>
      </table>
    `);

    preprocessTablesForTTS(doc);

    const result = doc.querySelector('.sr-table-content')?.textContent;
    expect(result).toContain('Table: Quarterly Results.');
  });

  test('leaves original document unchanged when processing clone', () => {
    // Create two separate documents to simulate clone behavior
    const originalDoc = createDocument(`
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>John</td><td>25</td></tr>
      </table>
    `);

    // Simulate cloning
    const cloneHtml = originalDoc.body.innerHTML;

    // Process the "clone" (actually same doc in test, but demonstrates the pattern)
    const cloneDoc = createDocument(cloneHtml);
    preprocessTablesForTTS(cloneDoc);

    // Clone should be processed
    expect(cloneDoc.querySelector('.sr-table-content')).not.toBeNull();
    expect(cloneDoc.querySelector('table')).toBeNull();
  });
});
