/**
 * Code Block Processor for TTS-friendly reading
 *
 * Transforms code blocks based on user preference before Readability parsing.
 * Similar pattern to table-processor.ts.
 *
 * Output formats:
 * - announce (default): "JavaScript code example: const greeting = hello world. End of code."
 * - skip: Remove block entirely
 * - read: "Code block start. const greeting equals hello world. Code block end."
 */

import { getSyncValue, STORAGE_KEYS, CodeBlockHandling } from '@/lib/storage';

/**
 * Process all code blocks in a document for TTS-friendly reading.
 * Call on cloned document BEFORE Readability parsing.
 *
 * @param doc - The document (clone) to process
 * @param mode - Override mode (if not provided, reads from storage)
 */
export async function preprocessCodeBlocksForTTS(
  doc: Document,
  mode?: CodeBlockHandling
): Promise<void> {
  const effectiveMode = mode ?? (await getSyncValue(STORAGE_KEYS.codeBlockHandling)) ?? 'announce';

  // Process block code first (<pre> elements)
  const preElements = doc.querySelectorAll('pre');
  for (const pre of preElements) {
    processBlockCode(pre, effectiveMode);
  }

  // Process remaining inline code (not inside <pre>) only in skip mode
  if (effectiveMode === 'skip') {
    const inlineCode = doc.querySelectorAll('code:not(pre code)');
    for (const code of inlineCode) {
      processInlineCode(code);
    }
  }
}

/**
 * Process a block code element (<pre> or <pre><code>).
 */
function processBlockCode(pre: Element, mode: CodeBlockHandling): void {
  if (shouldSkipCodeBlock(pre)) {
    return;
  }

  const codeContent = extractCodeContent(pre);
  const language = detectLanguage(pre);

  let replacement: string;

  switch (mode) {
    case 'skip':
      replacement = ''; // Remove entirely
      break;

    case 'announce':
      replacement = createAnnouncement(codeContent, language);
      break;

    case 'read':
      replacement = createFullReadout(codeContent, language);
      break;
  }

  replaceCodeWithText(pre, replacement);
}

/**
 * Process inline code element (skip mode only).
 */
function processInlineCode(code: Element): void {
  // Replace with empty text node
  code.replaceWith(code.ownerDocument.createTextNode(''));
}

/**
 * Heuristic to skip non-content code blocks.
 */
function shouldSkipCodeBlock(pre: Element): boolean {
  // Skip code in navigation/layout areas
  const parent = pre.closest('nav, footer, aside, header');
  if (parent) return true;

  // Skip very short code (likely styling/formatting artifacts)
  const text = pre.textContent?.trim() || '';
  if (text.length < 5) return true;

  return false;
}

/**
 * Extract text content from code block.
 */
function extractCodeContent(pre: Element): string {
  // Get text from <code> child if present, otherwise from <pre> directly
  const code = pre.querySelector('code');
  const text = (code || pre).textContent || '';
  return text.trim();
}

/**
 * Detect programming language from class attributes.
 */
export function detectLanguage(pre: Element): string | null {
  const code = pre.querySelector('code');
  const elements = [code, pre].filter(Boolean) as Element[];

  for (const el of elements) {
    const className = el.className.toLowerCase();

    // Common patterns: language-js, lang-python, highlight-javascript
    const patterns = [
      /language-(\w+)/,
      /lang-(\w+)/,
      /highlight-(\w+)/,
      /\b(javascript|typescript|python|ruby|go|rust|java|cpp|c|csharp|bash|shell|sql|html|css|json|yaml|xml|php|swift|kotlin|scala)\b/,
    ];

    for (const pattern of patterns) {
      const match = className.match(pattern);
      if (match) {
        return normalizeLanguageName(match[1]);
      }
    }

    // Check data-lang attribute
    const dataLang = el.getAttribute('data-lang') || el.getAttribute('data-language');
    if (dataLang) {
      return normalizeLanguageName(dataLang);
    }
  }

  return null;
}

/**
 * Normalize language name for TTS.
 */
export function normalizeLanguageName(lang: string): string {
  const normalizations: Record<string, string> = {
    js: 'JavaScript',
    javascript: 'JavaScript',
    ts: 'TypeScript',
    typescript: 'TypeScript',
    py: 'Python',
    python: 'Python',
    rb: 'Ruby',
    ruby: 'Ruby',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    cpp: 'C++',
    'c++': 'C++',
    c: 'C',
    csharp: 'C#',
    'c#': 'C#',
    cs: 'C#',
    bash: 'Bash',
    shell: 'Shell',
    sh: 'Shell',
    sql: 'SQL',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    xml: 'XML',
    php: 'PHP',
    swift: 'Swift',
    kotlin: 'Kotlin',
    scala: 'Scala',
  };

  return normalizations[lang.toLowerCase()] || lang;
}

/**
 * Create announcement for code block (announce mode).
 */
function createAnnouncement(content: string, language: string | null): string {
  const lines = content.split('\n').filter((line) => {
    const trimmed = line.trim();
    // Skip empty lines and common comment patterns
    return (
      trimmed.length > 0 &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('/*') &&
      !trimmed.startsWith('*')
    );
  });

  const preview = lines[0]?.trim() || 'code';
  const truncatedPreview = preview.length > 50 ? preview.substring(0, 47) + '...' : preview;

  const langPrefix = language ? `${language} code` : 'Code';

  return `${langPrefix} example: ${truncatedPreview}. End of code.`;
}

/**
 * Create full readout for code block (read mode).
 */
function createFullReadout(content: string, language: string | null): string {
  const langPrefix = language ? `${language} code block` : 'Code block';

  // Add pauses between lines for better TTS pacing
  const readableContent = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('. ');

  return `${langPrefix} start. ${readableContent}. Code block end.`;
}

/**
 * Replace code element with text paragraph.
 */
function replaceCodeWithText(element: Element, text: string): void {
  if (text === '') {
    element.remove();
    return;
  }

  const p = element.ownerDocument.createElement('p');
  p.className = 'sr-code-content';
  p.textContent = text;
  element.replaceWith(p);
}
