# Story 2.1: Content Extraction with Mozilla Readability

## Story Info

| Field | Value |
|-------|-------|
| Epic | 2 - First Play Experience (The Magic Moment) |
| Story ID | 2-1 |
| Story Key | 2-1-content-extraction-with-mozilla-readability |
| Status | ready-for-dev |
| Created | 2025-12-11 |

---

## User Story

As a user,
I want the extension to extract the main article content from a webpage,
So that only relevant text is read aloud (no ads, nav, sidebars).

---

## Context & Background

This is the **first story in Epic 2**, which delivers the "magic moment" - the core TTS experience. Content extraction is foundational because it provides the text that will be:
1. Sent to TTS for audio generation (Story 2.3)
2. Tokenized for word timing (Story 2.5)
3. Highlighted during playback (Story 2.6)

### Why Mozilla Readability?

Mozilla Readability is the same library powering Firefox's Reader View. It's battle-tested on millions of real-world pages and handles:
- Article detection and scoring
- Removal of ads, navigation, sidebars, footers
- Preservation of meaningful content structure
- Table and list handling

### Architecture Reference

From `docs/architecture.md`:
- **ARCH-14**: Use Mozilla Readability library - clone DOM before parsing
- **FR7**: User can read the main content of the current webpage
- **FR8**: System automatically identifies article/main content area
- **FR9**: System skips navigation, ads, sidebars, and footers

### Current State

The content script (`entrypoints/content.ts`) has a stub handler for `CONTENT_EXTRACT`:

```typescript
case 'CONTENT_EXTRACT':
  // TODO: Epic 2 - Extract with Readability
  console.log('[SimpleReader] Content extraction requested');
  sendResponse({ success: true });
  return false;
```

### Target State

The content script should:
1. Install and use `@mozilla/readability`
2. Clone the document before parsing (Readability mutates DOM)
3. Extract article content using Readability
4. Return extracted text via `CONTENT_READY` message
5. Handle extraction failures gracefully with `CONTENT_ERROR`

---

## Acceptance Criteria

### AC1: Readability Package Installation

**Given** the SimpleReader project
**When** the developer installs dependencies
**Then**:
- `@mozilla/readability` is added to `package.json`
- TypeScript types are available (package includes types)
- Package version is latest stable

### AC2: Content Extractor Module Creation

**Given** the project structure per architecture
**When** the extractor module is created
**Then**:
- File is created at `entrypoints/content/extractor.ts`
- Module exports an `extractContent()` function
- Function returns `{ text: string; title?: string; wordCount: number }` or throws
- Module is imported in `entrypoints/content.ts` (not cross-entrypoint)

### AC3: DOM Cloning Before Parse

**Given** a webpage with content
**When** content extraction is triggered
**Then**:
- The document is cloned before passing to Readability
- The original page DOM is **not** modified
- User can continue interacting with the page normally

### AC4: Successful Content Extraction

**Given** a webpage with article content (e.g., Medium, Substack, news site)
**When** `CONTENT_EXTRACT` message is received
**Then**:
- Readability parses the cloned document
- Article text content is extracted (textContent, not HTML)
- Article title is captured if available
- Word count is calculated from extracted text
- `CONTENT_READY` message is sent with `{ text, wordCount, title? }`
- Extraction completes in under 500ms for typical articles

### AC5: Extraction Failure Handling

**Given** a webpage where Readability cannot identify content
**When** extraction fails (Readability returns null or throws)
**Then**:
- `CONTENT_ERROR` message is sent with descriptive error
- Error uses `ExtensionError` pattern from `lib/errors.ts`
- Error is recoverable (user can try again)
- Console logs error for debugging with `[SimpleReader]` prefix

### AC6: isProbablyReaderable Pre-Check (Optional Enhancement)

**Given** a webpage that may not have readable content
**When** extraction is requested
**Then**:
- `isProbablyReaderable()` is called first as a quick check
- If false, extraction is skipped and appropriate error returned
- This prevents wasted processing on non-article pages

---

## Technical Implementation Notes

### Package Installation

```bash
bun add @mozilla/readability
```

The package includes TypeScript definitions. No `@types/` package needed.

### Content Extractor Module (`entrypoints/content/extractor.ts`)

```typescript
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { createContentError, ERROR_CODES } from '@/lib/errors';

export interface ExtractedContent {
  text: string;
  title?: string;
  wordCount: number;
}

/**
 * Extract readable content from the current page using Mozilla Readability.
 *
 * IMPORTANT: Clones the document before parsing because Readability mutates the DOM.
 *
 * @throws ExtensionError if extraction fails
 */
export function extractContent(): ExtractedContent {
  // Quick readability check (optional but recommended)
  if (!isProbablyReaderable(document)) {
    throw createContentError(
      ERROR_CODES.CONTENT_NOT_READABLE,
      'This page does not appear to have readable article content',
      true  // recoverable
    );
  }

  // CRITICAL: Clone document before parsing - Readability mutates the DOM
  const documentClone = document.cloneNode(true) as Document;

  const reader = new Readability(documentClone, {
    // Options for better extraction
    charThreshold: 500,  // Minimum content length
  });

  const article = reader.parse();

  if (!article || !article.textContent) {
    throw createContentError(
      ERROR_CODES.CONTENT_EXTRACTION_FAILED,
      'Failed to extract article content from this page',
      true  // recoverable
    );
  }

  // Clean up the text content
  const text = cleanText(article.textContent);
  const wordCount = countWords(text);

  if (wordCount < 10) {
    throw createContentError(
      ERROR_CODES.CONTENT_TOO_SHORT,
      'Extracted content is too short to read',
      true  // recoverable
    );
  }

  return {
    text,
    title: article.title || undefined,
    wordCount,
  };
}

/**
 * Clean extracted text:
 * - Normalize whitespace
 * - Remove excessive newlines
 * - Trim
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')      // Collapse whitespace
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();
}

/**
 * Count words in text (simple split on whitespace)
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}
```

### Updated Content Script (`entrypoints/content.ts`)

```typescript
import { addMessageListener, isHighlightMessage, isContentMessage, Messages, MessageResponse } from '@/lib/messages';
import { extractContent } from './extractor';
import { isExtensionError } from '@/lib/errors';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[SimpleReader] Content script loaded');

    addMessageListener((message, sender, sendResponse) => {
      if (isContentMessage(message)) {
        switch (message.type) {
          case 'CONTENT_EXTRACT':
            handleContentExtract(sendResponse);
            return true; // Async response
        }
      }

      if (isHighlightMessage(message)) {
        // ... existing highlight handlers
      }

      return false;
    });
  },
});

function handleContentExtract(
  sendResponse: (response: MessageResponse) => void
): void {
  try {
    console.log('[SimpleReader] Starting content extraction...');
    const startTime = performance.now();

    const { text, title, wordCount } = extractContent();

    const duration = Math.round(performance.now() - startTime);
    console.log(`[SimpleReader] Extraction complete: ${wordCount} words in ${duration}ms`);

    // Send success response with extracted content
    sendResponse({
      success: true,
      data: { text, title, wordCount },
    });
  } catch (error) {
    const errorMessage = isExtensionError(error)
      ? error.message
      : error instanceof Error ? error.message : String(error);

    console.error('[SimpleReader] Content extraction failed:', errorMessage);

    sendResponse({
      success: false,
      error: errorMessage,
    });
  }
}
```

### Error Codes to Add (`lib/errors.ts`)

Add these error codes to the existing `ERROR_CODES` object. Note: `CONTENT_EXTRACTION_FAILED` already exists.

```typescript
export const ERROR_CODES = {
  // ... existing codes (TTS, STORAGE, NETWORK, etc.)

  // Content Extraction Errors (Content Script) - existing:
  CONTENT_EXTRACTION_FAILED: 'CONTENT_EXTRACTION_FAILED',
  CONTENT_EMPTY: 'CONTENT_EMPTY',

  // ADD THESE NEW CODES:
  CONTENT_NOT_READABLE: 'CONTENT_NOT_READABLE',
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',
} as const;
```

**API Reference**: Use context-specific factory functions with positional parameters:
```typescript
// createContentError(code, message, recoverable, originalError?)
import { createContentError, ERROR_CODES } from '@/lib/errors';

throw createContentError(
  ERROR_CODES.CONTENT_NOT_READABLE,
  'This page does not appear to have readable article content',
  true  // recoverable
);
```

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| ARCH-14: Use Readability, clone DOM | Clones document before `new Readability()` |
| ARCH-5: Cross-context via typed messages | Uses `CONTENT_EXTRACT`, `CONTENT_READY` from `lib/messages.ts` |
| ARCH-6: Only import from lib/ | Extractor imports only from `@/lib/errors` |
| ARCH-13: Co-located tests | Test will be `extractor.test.ts` |

### File Structure After Implementation

**Migration Note**: The current `entrypoints/content.ts` becomes `entrypoints/content/index.ts` to support the module structure. WXT handles this automatically - a folder with `index.ts` works the same as a single file.

```
entrypoints/
  content/              # Was: entrypoints/content.ts
    index.ts            # Main content script (renamed from content.ts)
    extractor.ts        # NEW: Readability wrapper
    extractor.test.ts   # NEW: Unit tests (Epic 8)
```

**Steps**:
1. Create `entrypoints/content/` directory
2. Move `entrypoints/content.ts` to `entrypoints/content/index.ts`
3. Create `entrypoints/content/extractor.ts`
4. Import extractor with relative path: `import { extractContent } from './extractor'`

---

## Tasks

### Task 1: Install @mozilla/readability Package
**AC: 1**
- [ ] Run `bun add @mozilla/readability`
- [ ] Verify package appears in `package.json`
- [ ] Verify TypeScript can import `{ Readability, isProbablyReaderable }`

### Task 2: Add Content Error Codes
**AC: 5**
- [ ] Add `CONTENT_NOT_READABLE` to `ERROR_CODES` in `lib/errors.ts`
- [ ] `CONTENT_EXTRACTION_FAILED` already exists - no action needed
- [ ] Add `CONTENT_TOO_SHORT` to `ERROR_CODES`

### Task 3: Create Content Extractor Module
**AC: 2, 3**
- [ ] Create `entrypoints/content/` directory
- [ ] Move `entrypoints/content.ts` to `entrypoints/content/index.ts`
- [ ] Create `entrypoints/content/extractor.ts`
- [ ] Implement `extractContent()` function
- [ ] Clone document before passing to Readability (CRITICAL)
- [ ] Return `{ text, title?, wordCount }` shape
- [ ] Implement `cleanText()` helper
- [ ] Implement `countWords()` helper

### Task 4: Add isProbablyReaderable Check
**AC: 6**
- [ ] Import `isProbablyReaderable` from `@mozilla/readability`
- [ ] Check before attempting full parse
- [ ] Throw appropriate error if not readable

### Task 5: Update Content Script Message Handler
**AC: 4, 5**
- [ ] Import `extractContent` from `./extractor`
- [ ] Update `CONTENT_EXTRACT` handler to call `extractContent()`
- [ ] Send `CONTENT_READY` on success with extracted data
- [ ] Send error response on failure
- [ ] Add performance logging
- [ ] Change to async response (`return true`)

### Task 6: Manual Testing
**AC: 4**
- [ ] Load extension in dev mode (`bun run dev`)
- [ ] Navigate to a Medium article
- [ ] Open DevTools console on the page
- [ ] Send test message: `chrome.runtime.sendMessage({ type: 'CONTENT_EXTRACT' })`
- [ ] Verify response contains extracted text
- [ ] Verify original page DOM is unchanged
- [ ] Test on Substack, Hacker News, and a news site
- [ ] Test on a non-article page (e.g., Google homepage) - should error gracefully

---

## Definition of Done

- [ ] `@mozilla/readability` package installed
- [ ] `extractor.ts` module created with `extractContent()` function
- [ ] Document is cloned before Readability parsing
- [ ] Content extraction works on real article pages
- [ ] Appropriate errors returned for non-readable pages
- [ ] Performance under 500ms for typical articles
- [ ] All console logs use `[SimpleReader]` prefix
- [ ] No changes to original page DOM during extraction

---

## Dependencies

### Depends On
- Story 1-5: Error handling foundation (`lib/errors.ts`)
- Story 1-6: Content script skeleton with message handling

### Enables
- Story 2.3: Kokoro TTS Integration (needs text to speak)
- Story 2.5: Word Tokenization (needs text to tokenize)
- Story 2.6: Word Highlighting (needs text to highlight)
- Story 5.1-5.4: Content Intelligence stories build on this

---

## Test Scenarios

### Manual Testing Checklist

| Site Type | Example URL | Expected Behavior |
|-----------|-------------|-------------------|
| Medium article | Any medium.com/@author/article | Extracts article body, excludes header/footer |
| Substack | Any substack newsletter | Extracts newsletter content |
| News site | nytimes.com, bbc.com article | Extracts article, excludes ads |
| HN comments | news.ycombinator.com/item?id=xxx | May fail - comments are not articles |
| Google homepage | google.com | Should return `CONTENT_NOT_READABLE` error |
| Wikipedia | Any wikipedia article | Extracts article content |

### Unit Test Cases (Epic 8)

```typescript
// extractor.test.ts (to be implemented in Epic 8)
describe('extractContent', () => {
  it('extracts text from valid article HTML');
  it('returns title when available');
  it('calculates correct word count');
  it('throws CONTENT_NOT_READABLE for non-article pages');
  it('throws CONTENT_TOO_SHORT for minimal content');
  it('does not modify original document');
  it('cleans whitespace in extracted text');
});
```

---

## References

- [Source: docs/architecture.md#Content Extraction] - ARCH-14, FR7-9
- [Source: docs/epics.md#Story 2.1] - Original story definition
- [Source: lib/messages.ts] - `CONTENT_EXTRACT`, `CONTENT_READY`, `CONTENT_ERROR` message types
- [Source: lib/errors.ts] - `ExtensionError` pattern
- [Mozilla Readability GitHub](https://github.com/mozilla/readability) - Library documentation
- [Mozilla Readability npm](https://www.npmjs.com/package/@mozilla/readability) - Package info

---

## Dev Notes

### Why Clone the Document?

Mozilla Readability **mutates** the DOM it parses. It removes elements, modifies attributes, and restructures content. If we pass `document` directly, the user's page would be destroyed. Always clone first:

```typescript
// WRONG - destroys the page
const article = new Readability(document).parse();

// CORRECT - safe
const clone = document.cloneNode(true) as Document;
const article = new Readability(clone).parse();
```

### Performance Considerations

- `document.cloneNode(true)` is fast (~1-10ms for typical pages)
- Readability parsing is the main cost (~50-200ms)
- Total should stay under 500ms for NFR compliance

### Readability Options

The Readability constructor accepts options:

```typescript
new Readability(doc, {
  charThreshold: 500,        // Min chars for a valid article
  classesToPreserve: [],     // CSS classes to keep
  keepClasses: false,        // Strip all classes by default
  disableJSONLD: false,      // Try to extract metadata from JSON-LD
  nbTopCandidates: 5,        // Number of top candidates to consider
});
```

We use `charThreshold: 500` to filter out very short content.

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

### File List

- `entrypoints/content/index.ts` (migrate from `entrypoints/content.ts`)
- `entrypoints/content/extractor.ts` (new)
- `lib/errors.ts` (add `CONTENT_NOT_READABLE`, `CONTENT_TOO_SHORT` error codes)
- `package.json` (add @mozilla/readability)
