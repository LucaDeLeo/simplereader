// entrypoints/content/code-processor.test.ts
// Unit tests for code block preprocessing module

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Window } from 'happy-dom';
import {
  preprocessCodeBlocksForTTS,
  detectLanguage,
  normalizeLanguageName,
} from './code-processor';

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

describe('preprocessCodeBlocksForTTS', () => {
  describe('block code detection', () => {
    test('detects <pre> elements', async () => {
      const doc = createDocument(`
        <pre>const x = 1;</pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      expect(doc.querySelector('pre')).toBeNull();
      expect(doc.querySelector('.sr-code-content')).not.toBeNull();
    });

    test('detects <pre><code> elements', async () => {
      const doc = createDocument(`
        <pre><code>const x = 1;</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      expect(doc.querySelector('pre')).toBeNull();
      expect(doc.querySelector('.sr-code-content')).not.toBeNull();
    });

    test('skips code in navigation areas', async () => {
      const doc = createDocument(`
        <nav>
          <pre>const x = 1;</pre>
        </nav>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      // Code should still be there (not processed)
      expect(doc.querySelector('pre')).not.toBeNull();
      expect(doc.querySelector('.sr-code-content')).toBeNull();
    });

    test('skips code in footer', async () => {
      const doc = createDocument(`
        <footer>
          <pre>const x = 1;</pre>
        </footer>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      expect(doc.querySelector('pre')).not.toBeNull();
    });

    test('skips code in aside', async () => {
      const doc = createDocument(`
        <aside>
          <pre>const x = 1;</pre>
        </aside>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      expect(doc.querySelector('pre')).not.toBeNull();
    });

    test('skips code in header', async () => {
      const doc = createDocument(`
        <header>
          <pre>const x = 1;</pre>
        </header>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      expect(doc.querySelector('pre')).not.toBeNull();
    });

    test('skips very short code blocks', async () => {
      const doc = createDocument(`
        <pre>x</pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      // Very short code (< 5 chars) should be skipped
      expect(doc.querySelector('pre')).not.toBeNull();
    });

    test('processes multiple code blocks', async () => {
      const doc = createDocument(`
        <pre><code>const a = 1;</code></pre>
        <pre><code>const b = 2;</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      const results = doc.querySelectorAll('.sr-code-content');
      expect(results.length).toBe(2);
    });
  });

  describe('announce mode', () => {
    test('creates announcement with first line preview', async () => {
      const doc = createDocument(`
        <pre><code>const greeting = "Hello";
console.log(greeting);</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      const result = doc.querySelector('.sr-code-content')?.textContent;
      expect(result).toContain('const greeting = "Hello"');
      expect(result).toContain('End of code.');
    });

    test('truncates long preview at 50 chars', async () => {
      const doc = createDocument(`
        <pre><code>const veryLongVariableName = "This is a very long string that exceeds fifty characters";</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      const result = doc.querySelector('.sr-code-content')?.textContent || '';
      // Should be truncated with ...
      expect(result).toContain('...');
      // Preview should not be the full line
      expect(result.length).toBeLessThan(150);
    });

    test('includes language when detected', async () => {
      const doc = createDocument(`
        <pre><code class="language-javascript">const x = 1;</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      const result = doc.querySelector('.sr-code-content')?.textContent;
      expect(result).toContain('JavaScript code example:');
    });

    test('skips empty lines and comments in preview', async () => {
      const doc = createDocument(`
        <pre><code>
// This is a comment
# Another comment

const realCode = true;</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      const result = doc.querySelector('.sr-code-content')?.textContent;
      expect(result).toContain('const realCode = true');
      expect(result).not.toContain('This is a comment');
    });

    test('ends with "End of code."', async () => {
      const doc = createDocument(`
        <pre><code>const x = 1;</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      const result = doc.querySelector('.sr-code-content')?.textContent;
      expect(result).toContain('End of code.');
    });

    test('falls back to "Code example:" without language', async () => {
      const doc = createDocument(`
        <pre><code>some code here</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      const result = doc.querySelector('.sr-code-content')?.textContent;
      expect(result).toContain('Code example:');
    });
  });

  describe('skip mode', () => {
    test('removes block code elements', async () => {
      const doc = createDocument(`
        <p>Before code</p>
        <pre><code>const x = 1;</code></pre>
        <p>After code</p>
      `);

      await preprocessCodeBlocksForTTS(doc, 'skip');

      expect(doc.querySelector('pre')).toBeNull();
      expect(doc.querySelector('.sr-code-content')).toBeNull();
      expect(doc.body.textContent).toContain('Before code');
      expect(doc.body.textContent).toContain('After code');
    });

    test('removes inline code elements', async () => {
      const doc = createDocument(`
        <p>Use the <code>useState</code> hook to manage state.</p>
      `);

      await preprocessCodeBlocksForTTS(doc, 'skip');

      expect(doc.querySelector('code')).toBeNull();
      const text = doc.body.textContent || '';
      expect(text).toContain('Use the');
      expect(text).toContain('hook to manage state');
    });

    test('preserves surrounding text', async () => {
      const doc = createDocument(`
        <p>First paragraph.</p>
        <pre><code>const x = 1;</code></pre>
        <p>Second paragraph.</p>
      `);

      await preprocessCodeBlocksForTTS(doc, 'skip');

      const text = doc.body.textContent || '';
      expect(text).toContain('First paragraph.');
      expect(text).toContain('Second paragraph.');
    });
  });

  describe('read mode', () => {
    test('prefixes with "Code block start."', async () => {
      const doc = createDocument(`
        <pre><code>const x = 1;</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'read');

      const result = doc.querySelector('.sr-code-content')?.textContent;
      expect(result).toContain('Code block start.');
    });

    test('includes language in prefix', async () => {
      const doc = createDocument(`
        <pre><code class="language-python">x = 1</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'read');

      const result = doc.querySelector('.sr-code-content')?.textContent;
      expect(result).toContain('Python code block start.');
    });

    test('adds pauses between lines', async () => {
      const doc = createDocument(`
        <pre><code>const a = 1;
const b = 2;
const c = 3;</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'read');

      const result = doc.querySelector('.sr-code-content')?.textContent || '';
      // Lines should be separated by periods for TTS pausing
      expect(result).toContain('const a = 1;.');
      expect(result).toContain('const b = 2;.');
    });

    test('ends with "Code block end."', async () => {
      const doc = createDocument(`
        <pre><code>const x = 1;</code></pre>
      `);

      await preprocessCodeBlocksForTTS(doc, 'read');

      const result = doc.querySelector('.sr-code-content')?.textContent;
      expect(result).toContain('Code block end.');
    });
  });

  describe('inline code handling', () => {
    test('keeps inline code in announce mode', async () => {
      const doc = createDocument(`
        <p>Use the <code>useState</code> hook.</p>
      `);

      await preprocessCodeBlocksForTTS(doc, 'announce');

      // Inline code should remain (only block code is processed)
      expect(doc.querySelector('code')).not.toBeNull();
      expect(doc.body.textContent).toContain('useState');
    });

    test('keeps inline code in read mode', async () => {
      const doc = createDocument(`
        <p>Use the <code>useState</code> hook.</p>
      `);

      await preprocessCodeBlocksForTTS(doc, 'read');

      expect(doc.querySelector('code')).not.toBeNull();
      expect(doc.body.textContent).toContain('useState');
    });

    test('removes inline code in skip mode', async () => {
      const doc = createDocument(`
        <p>Use the <code>useState</code> hook.</p>
      `);

      await preprocessCodeBlocksForTTS(doc, 'skip');

      expect(doc.querySelector('code')).toBeNull();
    });

    test('does not process code inside pre as inline', async () => {
      const doc = createDocument(`
        <pre><code>const x = 1;</code></pre>
        <p>Inline <code>example</code> here.</p>
      `);

      await preprocessCodeBlocksForTTS(doc, 'skip');

      // Both should be removed in skip mode
      expect(doc.querySelector('pre')).toBeNull();
      expect(doc.querySelector('code')).toBeNull();
    });
  });

  describe('DOM preservation', () => {
    test('does not modify original document when processing clone', async () => {
      // Create original content
      const originalDoc = createDocument(`
        <pre><code>const x = 1;</code></pre>
      `);

      // Save original HTML
      const originalHtml = originalDoc.body.innerHTML;

      // Create a "clone" for processing
      const cloneDoc = createDocument(originalHtml);
      await preprocessCodeBlocksForTTS(cloneDoc, 'announce');

      // Clone should be processed
      expect(cloneDoc.querySelector('.sr-code-content')).not.toBeNull();
      expect(cloneDoc.querySelector('pre')).toBeNull();

      // Create fresh doc to verify original structure works
      const freshDoc = createDocument(originalHtml);
      expect(freshDoc.querySelector('pre')).not.toBeNull();
    });
  });
});

describe('detectLanguage', () => {
  function createPreElement(html: string): Element {
    const doc = createDocument(html);
    return doc.querySelector('pre')!;
  }

  test('detects language-* class', () => {
    const pre = createPreElement(`<pre><code class="language-javascript">x</code></pre>`);
    expect(detectLanguage(pre)).toBe('JavaScript');
  });

  test('detects lang-* class', () => {
    const pre = createPreElement(`<pre><code class="lang-python">x</code></pre>`);
    expect(detectLanguage(pre)).toBe('Python');
  });

  test('detects highlight-* class', () => {
    const pre = createPreElement(`<pre class="highlight-ruby"><code>x</code></pre>`);
    expect(detectLanguage(pre)).toBe('Ruby');
  });

  test('detects data-lang attribute', () => {
    const pre = createPreElement(`<pre><code data-lang="go">x</code></pre>`);
    expect(detectLanguage(pre)).toBe('Go');
  });

  test('detects data-language attribute', () => {
    const pre = createPreElement(`<pre><code data-language="rust">x</code></pre>`);
    expect(detectLanguage(pre)).toBe('Rust');
  });

  test('prefers code element class over pre', () => {
    const pre = createPreElement(
      `<pre class="language-html"><code class="language-css">x</code></pre>`
    );
    expect(detectLanguage(pre)).toBe('CSS');
  });

  test('falls back to pre class when code has none', () => {
    const pre = createPreElement(`<pre class="language-java"><code>x</code></pre>`);
    expect(detectLanguage(pre)).toBe('Java');
  });

  test('returns null for unknown language', () => {
    const pre = createPreElement(`<pre><code>x</code></pre>`);
    expect(detectLanguage(pre)).toBeNull();
  });

  test('handles Prism.js classes', () => {
    const pre = createPreElement(`<pre class="language-typescript"><code>x</code></pre>`);
    expect(detectLanguage(pre)).toBe('TypeScript');
  });

  test('handles Highlight.js classes', () => {
    const pre = createPreElement(`<pre><code class="hljs language-bash">x</code></pre>`);
    expect(detectLanguage(pre)).toBe('Bash');
  });

  test('detects bare language names in class', () => {
    const pre = createPreElement(`<pre><code class="python">x</code></pre>`);
    expect(detectLanguage(pre)).toBe('Python');
  });
});

describe('normalizeLanguageName', () => {
  test('normalizes js to JavaScript', () => {
    expect(normalizeLanguageName('js')).toBe('JavaScript');
  });

  test('normalizes py to Python', () => {
    expect(normalizeLanguageName('py')).toBe('Python');
  });

  test('normalizes ts to TypeScript', () => {
    expect(normalizeLanguageName('ts')).toBe('TypeScript');
  });

  test('normalizes cpp to C++', () => {
    expect(normalizeLanguageName('cpp')).toBe('C++');
  });

  test('normalizes sh to Shell', () => {
    expect(normalizeLanguageName('sh')).toBe('Shell');
  });

  test('normalizes yml to YAML', () => {
    expect(normalizeLanguageName('yml')).toBe('YAML');
  });

  test('returns original for unknown language', () => {
    expect(normalizeLanguageName('obscure')).toBe('obscure');
  });

  test('is case insensitive', () => {
    expect(normalizeLanguageName('JAVASCRIPT')).toBe('JavaScript');
    expect(normalizeLanguageName('Python')).toBe('Python');
  });
});

describe('edge cases', () => {
  test('handles empty pre element', async () => {
    const doc = createDocument(`<pre></pre>`);

    // Should not throw
    await expect(preprocessCodeBlocksForTTS(doc, 'announce')).resolves.toBeUndefined();
  });

  test('handles whitespace-only code', async () => {
    const doc = createDocument(`<pre>   </pre>`);

    await preprocessCodeBlocksForTTS(doc, 'announce');

    // Should be skipped (< 5 chars after trim)
    expect(doc.querySelector('pre')).not.toBeNull();
  });

  test('handles code with special characters', async () => {
    const doc = createDocument(`
      <pre><code>const arr = [1, 2, 3].map(x => x * 2);</code></pre>
    `);

    await preprocessCodeBlocksForTTS(doc, 'announce');

    const result = doc.querySelector('.sr-code-content')?.textContent;
    expect(result).toContain('const arr = [1, 2, 3].map(x => x * 2);');
  });

  test('handles nested elements in code block', async () => {
    const doc = createDocument(`
      <pre><code><span class="keyword">const</span> <span class="variable">x</span> = 1;</code></pre>
    `);

    await preprocessCodeBlocksForTTS(doc, 'announce');

    const result = doc.querySelector('.sr-code-content')?.textContent;
    expect(result).toContain('const x = 1');
  });

  test('handles code block with only comments', async () => {
    const doc = createDocument(`
      <pre><code>// This is a comment
# Another comment
/* Block comment */</code></pre>
    `);

    await preprocessCodeBlocksForTTS(doc, 'announce');

    const result = doc.querySelector('.sr-code-content')?.textContent;
    // Should fall back to "code" when all lines are comments
    expect(result).toContain('Code example: code. End of code.');
  });

  test('processes content tables then code in same document', async () => {
    // This simulates the full preprocessing pipeline
    const doc = createDocument(`
      <article>
        <p>Some text</p>
        <pre><code class="language-js">const x = 1;</code></pre>
        <p>More text</p>
      </article>
    `);

    await preprocessCodeBlocksForTTS(doc, 'announce');

    expect(doc.querySelector('.sr-code-content')).not.toBeNull();
    expect(doc.body.textContent).toContain('JavaScript code example');
  });
});
