# Story 5.2: Code Block Handling

## Story Info

| Field | Value |
|-------|-------|
| Epic | 5 - Content Intelligence |
| Story ID | 5-2 |
| Story Key | 5-2-code-block-handling |
| Status | ready-for-dev |
| Created | 2025-12-12 |

---

## User Story

As a user,
I want code blocks to be handled appropriately,
So that articles with code don't sound awkward when read aloud.

---

## Context & Background

This story addresses **FR11: System handles code blocks appropriately (read or skip gracefully)** from the PRD.

### The Problem

Technical articles often contain code blocks - inline `code` snippets and larger `<pre><code>` blocks. When TTS reads these raw, the experience is painful:

1. **Inline code** like `useState()` gets read as "use state open parenthesis close parenthesis"
2. **Block code** becomes incomprehensible: "const result equals array dot map open parenthesis item arrow item dot value close parenthesis"
3. **No user control** - can't skip code if they just want the prose

From PRD User Journey 4 (Edge Case - Handling Messy Content):
> "The TTS reads the article prose naturally, pauses appropriately at code blocks (reading them slightly differently or skipping inline code gracefully)"

### The Solution

Pre-process HTML code blocks **before** Readability extraction, similar to the table processor pattern:

1. **Inline code** (`<code>` without `<pre>` parent): Keep as-is for natural reading
2. **Block code** (`<pre>` or `<pre><code>`): Transform based on user preference:
   - **"announce"** (default): "Code example: [first line preview]... end code."
   - **"skip"**: Remove entirely from TTS output
   - **"read"**: Read full code block with "Code block:" prefix

### Architecture Reference

From `docs/architecture.md`:
- **ARCH-14**: Use Mozilla Readability - clone DOM before parsing
- **ARCH-15**: Post-process tables for row-by-row reading (similar pattern)

From `docs/prd.md`:
- **FR11**: System handles code blocks appropriately (read or skip gracefully)
- **NFR20**: Content extraction handles varied HTML structures without failing

From `docs/project_context.md`:
- Pattern established by `table-processor.ts` for content preprocessing

### Current Implementation

The existing `table-processor.ts` provides the pattern. The extractor already calls preprocessors on the cloned document:

```typescript
// Current implementation in extractor.ts
export function extractContent(): ExtractedContent {
  // ...
  const documentClone = document.cloneNode(true) as Document;

  // Pre-process tables for TTS-friendly reading
  try {
    preprocessTablesForTTS(documentClone);
  } catch (error) {
    console.warn('[SimpleReader] Table preprocessing failed:', error);
  }

  // TODO: Add code block preprocessing here
  // ...
}
```

### Storage Already Prepared

The `lib/storage.ts` already defines the preference:

```typescript
export const STORAGE_KEYS = {
  // ...
  codeBlockHandling: 'codeBlockHandling',
  // ...
} as const;

export type CodeBlockHandling = 'skip' | 'read' | 'announce';

export const DEFAULT_STORAGE_VALUES: Partial<StorageValues> = {
  // ...
  codeBlockHandling: 'announce',
};
```

---

## Acceptance Criteria

### AC1: Code Block Detection

**Given** a webpage with code elements (`<pre>`, `<code>`, `<pre><code>`)
**When** content extraction is triggered
**Then**:
- All code blocks in the cloned document are detected
- Processing happens on the clone (original DOM untouched)
- Distinguishes between inline `<code>` and block `<pre>` elements
- Handles syntax-highlighted code (e.g., Prism, Highlight.js wrappers)

### AC2: Announce Mode (Default)

**Given** user preference is "announce" (default)
**When** a code block is processed
**Then**:
- Block code is replaced with: "Code example: [preview]. End of code."
- Preview is first meaningful line (skip empty lines, comments)
- Preview is truncated if longer than ~50 characters
- Language hint included if detectable: "JavaScript code example: ..."
- Multiple code blocks each get their own announcement

### AC3: Skip Mode

**Given** user preference is "skip"
**When** a code block is processed
**Then**:
- Block code elements are removed entirely from output
- Inline code elements are also removed or replaced with placeholder
- Surrounding prose flows naturally without gaps
- No "code block" announcements

### AC4: Read Mode

**Given** user preference is "read"
**When** a code block is processed
**Then**:
- Block code is prefixed with "Code block:"
- Full code content is read
- Symbols are read naturally where possible (e.g., `=>` as "arrow")
- Preserves line structure with pauses
- Ends with "End of code block."

### AC5: Inline Code Handling

**Given** inline code elements (`<code>` without `<pre>` parent)
**When** processed in any mode
**Then**:
- In "announce" and "read" modes: kept as plain text for natural reading
- In "skip" mode: removed or replaced with generic placeholder
- Common patterns handled: `functionName()`, `variableName`, `ClassName`

### AC6: Language Detection

**Given** code blocks with language hints (class="language-js", data-lang="python", etc.)
**When** processing in "announce" mode
**Then**:
- Language is extracted from common class patterns
- Announcement includes language: "Python code example: ..."
- Falls back to "Code example: ..." if no language detected
- Handles common highlighter class patterns (highlight-js, prism, etc.)

### AC7: User Preference Integration

**Given** the code handling preference stored in chrome.storage.sync
**When** content extraction occurs
**Then**:
- Current preference is read from storage before processing
- Default to "announce" if no preference set
- Preference changes apply to next extraction (not mid-playback)

### AC8: Original DOM Preservation

**Given** any webpage with code blocks
**When** extraction completes
**Then**:
- Original page code blocks are unmodified
- All processing happens on cloned document
- User can still copy/interact with code on page

---

## Technical Implementation Notes

### Code Block Processor Module (`entrypoints/content/code-block-processor.ts`)

```typescript
/**
 * Code Block Processor for TTS-friendly reading
 *
 * Transforms code blocks based on user preference before Readability parsing.
 * Similar pattern to table-processor.ts.
 */

import { getSyncValue, STORAGE_KEYS, CodeBlockHandling } from '@/lib/storage';

/**
 * Process all code blocks in a document for TTS-friendly reading.
 * Call on cloned document BEFORE Readability parsing.
 */
export async function preprocessCodeBlocksForTTS(doc: Document): Promise<void> {
  const mode = await getSyncValue(STORAGE_KEYS.codeBlockHandling) ?? 'announce';

  // Process block code first (<pre> elements)
  const preElements = doc.querySelectorAll('pre');
  for (const pre of preElements) {
    processBlockCode(pre, mode);
  }

  // Process remaining inline code (not inside <pre>)
  if (mode === 'skip') {
    const inlineCode = doc.querySelectorAll('code:not(pre code)');
    for (const code of inlineCode) {
      processInlineCode(code, mode);
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
 * Process inline code element.
 */
function processInlineCode(code: Element, mode: CodeBlockHandling): void {
  if (mode === 'skip') {
    // Replace with empty or generic placeholder
    code.replaceWith(code.ownerDocument.createTextNode(''));
  }
  // In 'announce' and 'read' modes, inline code is kept as-is
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
function detectLanguage(pre: Element): string | null {
  const code = pre.querySelector('code');
  const elements = [pre, code].filter(Boolean) as Element[];

  for (const el of elements) {
    const className = el.className.toLowerCase();

    // Common patterns: language-js, lang-python, highlight-javascript
    const patterns = [
      /language-(\w+)/,
      /lang-(\w+)/,
      /highlight-(\w+)/,
      /\b(javascript|typescript|python|ruby|go|rust|java|cpp|c|bash|shell|sql|html|css|json|yaml|xml)\b/
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
function normalizeLanguageName(lang: string): string {
  const normalizations: Record<string, string> = {
    'js': 'JavaScript',
    'javascript': 'JavaScript',
    'ts': 'TypeScript',
    'typescript': 'TypeScript',
    'py': 'Python',
    'python': 'Python',
    'rb': 'Ruby',
    'ruby': 'Ruby',
    'go': 'Go',
    'rust': 'Rust',
    'java': 'Java',
    'cpp': 'C++',
    'c': 'C',
    'bash': 'Bash',
    'shell': 'Shell',
    'sh': 'Shell',
    'sql': 'SQL',
    'html': 'HTML',
    'css': 'CSS',
    'json': 'JSON',
    'yaml': 'YAML',
    'xml': 'XML',
  };

  return normalizations[lang.toLowerCase()] || lang;
}

/**
 * Create announcement for code block (announce mode).
 */
function createAnnouncement(content: string, language: string | null): string {
  const lines = content.split('\n').filter(line => {
    const trimmed = line.trim();
    // Skip empty lines and common comment patterns
    return trimmed.length > 0 &&
           !trimmed.startsWith('//') &&
           !trimmed.startsWith('#') &&
           !trimmed.startsWith('/*') &&
           !trimmed.startsWith('*');
  });

  const preview = lines[0]?.trim() || 'code';
  const truncatedPreview = preview.length > 50
    ? preview.substring(0, 47) + '...'
    : preview;

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
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('. ');

  return `${langPrefix}: ${readableContent}. End of code block.`;
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
```

### Integration with Extractor (`entrypoints/content/extractor.ts`)

```typescript
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { createContentError, ERROR_CODES } from '@/lib/errors';
import { preprocessTablesForTTS } from './table-processor';
import { preprocessCodeBlocksForTTS } from './code-block-processor';

export async function extractContent(): Promise<ExtractedContent> {
  if (!isProbablyReaderable(document)) {
    throw createContentError(
      ERROR_CODES.CONTENT_NOT_READABLE,
      'This page does not appear to have readable article content',
      true
    );
  }

  // CRITICAL: Clone document before ANY processing
  const documentClone = document.cloneNode(true) as Document;

  // Pre-process tables for TTS-friendly reading
  try {
    preprocessTablesForTTS(documentClone);
  } catch (error) {
    console.warn('[SimpleReader] Table preprocessing failed:', error);
  }

  // NEW: Pre-process code blocks for TTS-friendly reading
  try {
    await preprocessCodeBlocksForTTS(documentClone);
  } catch (error) {
    console.warn('[SimpleReader] Code block preprocessing failed:', error);
  }

  const reader = new Readability(documentClone, {
    charThreshold: 500,
  });

  const article = reader.parse();
  // ... rest unchanged
}
```

**Note:** The extractor function signature changes from sync to async to support reading user preferences. This is a minor breaking change that needs to be handled in callers.

### Output Format Examples

**Announce Mode (Default):**

Input:
```html
<pre><code class="language-javascript">
const greeting = "Hello";
console.log(greeting);
</code></pre>
```

Output:
```
JavaScript code example: const greeting = "Hello";. End of code.
```

**Skip Mode:**

Input: (same as above)

Output:
```
(code block removed entirely)
```

**Read Mode:**

Input: (same as above)

Output:
```
JavaScript code block: const greeting = "Hello";. console.log(greeting);. End of code block.
```

**Inline Code (any mode except skip):**

Input:
```html
<p>Use the <code>useState</code> hook to manage state.</p>
```

Output:
```
Use the useState hook to manage state.
```

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| ARCH-14: Clone DOM before parsing | All processing on cloned document |
| ARCH-15: Post-process content | Code blocks converted before Readability |
| ARCH-6: Only import from lib/ | Imports storage types from lib/storage.ts |
| ARCH-11: Storage keys from lib/ | Uses STORAGE_KEYS.codeBlockHandling |
| ARCH-13: Co-located tests | Tests in `code-block-processor.test.ts` |
| FR11: Code block handling | Three modes: skip, announce, read |

### File Structure After Implementation

```
entrypoints/
  content/
    index.ts                    # Existing content script
    extractor.ts                # Updated - add code preprocessor call, make async
    table-processor.ts          # Existing table preprocessing
    table-processor.test.ts     # Existing tests
    code-block-processor.ts     # NEW: Code block preprocessing
    code-block-processor.test.ts # NEW: Unit tests
    highlighter.ts              # Unchanged
```

---

## Tasks

### Task 1: Create Code Block Processor Module
**AC: 1, 8**
- [ ] Create `entrypoints/content/code-block-processor.ts`
- [ ] Implement `preprocessCodeBlocksForTTS(doc: Document)` function
- [ ] Implement `shouldSkipCodeBlock()` heuristic
- [ ] Implement `extractCodeContent()` helper
- [ ] Implement `processBlockCode()` for `<pre>` elements
- [ ] Implement `processInlineCode()` for standalone `<code>`
- [ ] Implement `replaceCodeWithText()` to swap code with paragraph

### Task 2: Implement Language Detection
**AC: 6**
- [ ] Implement `detectLanguage()` function
- [ ] Support common class patterns: `language-*`, `lang-*`, `highlight-*`
- [ ] Support `data-lang` and `data-language` attributes
- [ ] Implement `normalizeLanguageName()` for TTS-friendly names
- [ ] Handle Prism.js and Highlight.js class patterns

### Task 3: Implement Announce Mode
**AC: 2**
- [ ] Implement `createAnnouncement()` function
- [ ] Extract first meaningful line (skip empty, comments)
- [ ] Truncate preview at ~50 characters
- [ ] Include language prefix when detected
- [ ] Format: "[Language] code example: [preview]. End of code."

### Task 4: Implement Skip Mode
**AC: 3**
- [ ] Remove block code elements entirely
- [ ] Remove inline code elements in skip mode
- [ ] Ensure surrounding text flows naturally

### Task 5: Implement Read Mode
**AC: 4**
- [ ] Implement `createFullReadout()` function
- [ ] Prefix with "Code block:" or "[Language] code block:"
- [ ] Add pauses between lines (periods)
- [ ] End with "End of code block."

### Task 6: Integrate User Preference
**AC: 7**
- [ ] Read `codeBlockHandling` from chrome.storage.sync
- [ ] Default to 'announce' if not set
- [ ] Apply preference during preprocessing

### Task 7: Integrate with Extractor
**AC: 1, 8**
- [ ] Import `preprocessCodeBlocksForTTS` in `extractor.ts`
- [ ] Make `extractContent()` async (breaking change)
- [ ] Call after table preprocessing, before Readability
- [ ] Wrap in try-catch (code failure shouldn't block extraction)
- [ ] Update callers to handle async

### Task 8: Unit Tests
**AC: All**
- [ ] Create `code-block-processor.test.ts`
- [ ] Test block code detection
- [ ] Test inline code detection
- [ ] Test language detection patterns
- [ ] Test announce mode output format
- [ ] Test skip mode removes elements
- [ ] Test read mode output format
- [ ] Test original document unchanged

### Task 9: Manual Testing
**AC: All**
- [ ] Test on GitHub README with code blocks
- [ ] Test on Stack Overflow answer with code
- [ ] Test on MDN documentation
- [ ] Test on Medium technical article
- [ ] Test inline code in regular paragraphs
- [ ] Test syntax-highlighted code (Prism, Highlight.js)
- [ ] Verify TTS output is comprehensible when spoken

---

## Definition of Done

- [ ] `code-block-processor.ts` module created and exported
- [ ] Three handling modes implemented: skip, announce, read
- [ ] Language detection working for common patterns
- [ ] User preference read from storage
- [ ] Block code transformed per preference
- [ ] Inline code handled appropriately per mode
- [ ] Original page DOM unchanged
- [ ] Code preprocessing doesn't block content extraction on failure
- [ ] Console logs use `[SimpleReader]` prefix
- [ ] Extractor updated to call code preprocessor
- [ ] Unit tests passing
- [ ] Output is comprehensible when read aloud by TTS

---

## Dependencies

### Depends On
- Story 2-1: Content Extraction with Mozilla Readability (implemented)
- Story 5-1: Table Reading Row-by-Row (implemented - pattern reference)
- `lib/storage.ts` with `codeBlockHandling` key (already present)

### Enables
- Story 4-1: Settings Popup UI (can add code handling toggle)
- Improved TTS experience for technical articles

---

## Test Scenarios

### Manual Testing Checklist

| Test Case | Expected Behavior |
|-----------|-------------------|
| GitHub README with code | Code blocks announced with language |
| Stack Overflow answer | Multiple code blocks each announced |
| MDN with inline code | Inline code read naturally in prose |
| Medium tech article | Mix of prose and code sounds natural |
| Skip mode enabled | No code in TTS output |
| Read mode enabled | Full code read with prefix/suffix |
| No language class | "Code example:" without language |
| Prism.js highlighted code | Language detected from class |
| Code in navigation | Skipped (not content) |

### Unit Test Cases

```typescript
// code-block-processor.test.ts
describe('preprocessCodeBlocksForTTS', () => {
  describe('block code detection', () => {
    it('detects <pre> elements');
    it('detects <pre><code> elements');
    it('skips code in navigation areas');
    it('skips very short code blocks');
  });

  describe('announce mode', () => {
    it('creates announcement with first line preview');
    it('truncates long preview at 50 chars');
    it('includes language when detected');
    it('skips empty lines and comments in preview');
    it('ends with "End of code."');
  });

  describe('skip mode', () => {
    it('removes block code elements');
    it('removes inline code elements');
    it('preserves surrounding text');
  });

  describe('read mode', () => {
    it('prefixes with "Code block:"');
    it('includes language in prefix');
    it('adds pauses between lines');
    it('ends with "End of code block."');
  });

  describe('language detection', () => {
    it('detects language-* class');
    it('detects lang-* class');
    it('detects data-lang attribute');
    it('normalizes js to JavaScript');
    it('normalizes py to Python');
    it('returns null for unknown language');
  });

  describe('inline code', () => {
    it('keeps inline code in announce mode');
    it('keeps inline code in read mode');
    it('removes inline code in skip mode');
  });

  describe('DOM preservation', () => {
    it('does not modify original document');
  });
});

describe('detectLanguage', () => {
  it('handles Prism.js classes');
  it('handles Highlight.js classes');
  it('handles multiple languages in class');
  it('prefers code element class over pre');
});
```

---

## References

- [Source: docs/prd.md#FR11] - Code block handling requirement
- [Source: docs/architecture.md#ARCH-14] - Clone DOM before parsing
- [Source: docs/epics.md#Story 5.2] - Original story definition
- [Source: entrypoints/content/table-processor.ts] - Pattern reference
- [Source: lib/storage.ts] - Storage keys including codeBlockHandling
- [User Journey 4 in PRD] - Edge case handling for messy content

---

## Dev Notes

### Why Pre-process Before Readability?

Same rationale as table processing: Readability extracts `textContent` which loses all structure. By converting code blocks to readable text **before** Readability runs, we:
1. Control how code is represented in TTS
2. Let Readability handle article/noise detection as usual
3. Get code announcements in natural reading order

### Async Change to Extractor

The `extractContent()` function needs to become async to read user preferences. This is a small breaking change:

```typescript
// Before
const content = extractContent();

// After
const content = await extractContent();
```

All callers need to be updated. This should be minimal since extraction typically happens at user action (click play).

### Performance Considerations

- Code block processing is O(n) for n code elements - typically fast
- Storage read is async but cached by Chrome - negligible latency
- Processing happens on clone, so no DOM reflows on live page

### Edge Cases to Watch

- **Nested code blocks**: Rare but possible, handle outer first
- **Code without `<pre>`**: Some sites use `<div class="code">`, may need expansion
- **Very long code blocks**: In read mode, could be verbose - acceptable for MVP
- **Mixed language code**: Take first detected language
- **Code in comments sections**: Readability should exclude, but verify

### Future Enhancements (Post-MVP)

- Symbol pronunciation improvements (`=>` as "arrow", `===` as "triple equals")
- Code block summarization using AI (describe what code does)
- Per-language reading rules (e.g., read Python differently than JSON)
- Ability to skip individual code blocks via UI

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

### File List

- `entrypoints/content/code-block-processor.ts` (new)
- `entrypoints/content/code-block-processor.test.ts` (new)
- `entrypoints/content/extractor.ts` (modified - add preprocessor call, make async)
