# Story 5.1: Table Reading Row-by-Row

## Story Info

| Field | Value |
|-------|-------|
| Epic | 5 - Content Intelligence |
| Story ID | 5-1 |
| Story Key | 5-1-table-reading-row-by-row |
| Status | ready-for-dev |
| Created | 2025-12-12 |

---

## User Story

As a user,
I want tables to be read intelligently,
So that tabular data is comprehensible when spoken.

---

## Context & Background

This story addresses **FR10: System handles tables by reading row-by-row** and implements **ARCH-15: Post-process tables for row-by-row reading**.

### The Problem

Current implementation uses Mozilla Readability's `textContent` extraction, which flattens tables into a linear text stream. For example, a pricing comparison table:

| Feature | Free | Premium |
|---------|------|---------|
| TTS | Yes | Yes |
| Voices | 1 | 21 |

Currently reads as: "Feature Free Premium TTS Yes Yes Voices 1 21"

This is incomprehensible when spoken aloud.

### The Solution

Pre-process HTML tables **before** Readability extraction to convert them into a spoken-friendly format:

"Table: Feature comparison. Row 1: Feature, Free, Premium. Row 2: TTS, Yes, Yes. Row 3: Voices, 1, 21."

Or with header context for data cells:

"Table: Feature comparison. Headers: Feature, Free, Premium. Row 1: TTS: Free is Yes. Premium is Yes. Row 2: Voices: Free is 1. Premium is 21."

### Architecture Reference

From `docs/architecture.md`:
- **ARCH-15**: Post-process tables for row-by-row reading
- **ARCH-14**: Use Mozilla Readability - clone DOM before parsing

From `docs/prd.md`:
- **FR10**: System handles tables by reading row-by-row
- **NFR20**: Content extraction handles varied HTML structures without failing

### Current Implementation

The extractor (`entrypoints/content/extractor.ts`) currently:
1. Clones the document
2. Passes directly to Readability
3. Returns `textContent` which flattens tables

```typescript
// Current implementation
export function extractContent(): ExtractedContent {
  if (!isProbablyReaderable(document)) {
    throw createContentError(...);
  }

  const documentClone = document.cloneNode(true) as Document;
  const reader = new Readability(documentClone, { charThreshold: 500 });
  const article = reader.parse();

  // Tables are flattened into incomprehensible text here
  const text = cleanText(article.textContent);
  // ...
}
```

### Target Implementation

Pre-process tables in the cloned document **before** Readability parsing:

```typescript
export function extractContent(): ExtractedContent {
  if (!isProbablyReaderable(document)) {
    throw createContentError(...);
  }

  const documentClone = document.cloneNode(true) as Document;

  // NEW: Pre-process tables for TTS-friendly reading
  preprocessTablesForTTS(documentClone);

  const reader = new Readability(documentClone, { charThreshold: 500 });
  const article = reader.parse();

  const text = cleanText(article.textContent);
  // ...
}
```

---

## Acceptance Criteria

### AC1: Table Detection in Cloned Document

**Given** a webpage with one or more `<table>` elements
**When** content extraction is triggered
**Then**:
- All tables in the cloned document are detected
- Processing happens on the clone (original DOM untouched)
- Tables within `<nav>`, `<footer>`, `<aside>` may be skipped (likely navigation/layout)

### AC2: Header Row Detection

**Given** a table with a header row
**When** the table is processed
**Then**:
- `<thead>` rows are identified as headers
- First row with only `<th>` cells is identified as header
- Heuristic: first row if it looks like labels (short text, no numbers)
- Header row is announced once, not repeated for each data row

### AC3: Row-by-Row Readable Output

**Given** a table with headers and data
**When** the table is converted for TTS
**Then**:
- Output format: "Row N: Column1 Value, Column2 Value, Column3 Value."
- OR with context: "Row N: Header1 is Value1. Header2 is Value2."
- Row numbers start at 1 for data rows (after header)
- Clear row separators in output

### AC4: Cell Value Handling

**Given** table cells with various content
**When** cells are extracted
**Then**:
- Text content is extracted from each cell
- Empty cells become "empty" or are skipped gracefully
- Cells with complex content (images, links) extract text representation
- Excessive whitespace is normalized

### AC5: Column Context for Ambiguous Values

**Given** a data table with similar-looking values
**When** values could be ambiguous without context
**Then**:
- Column header is provided for context: "Price: $99" not just "$99"
- Implementation can choose between:
  - Always include column headers: "Name: John. Age: 25."
  - Or simple format: "Name, John. Age, 25."
- Chosen format should be consistent throughout

### AC6: Complex Table Handling (Best Effort)

**Given** tables with merged cells (rowspan/colspan)
**When** the table is processed
**Then**:
- Processing doesn't crash or hang
- Best-effort extraction is attempted
- Merged cells are read once (not repeated)
- Output may be imperfect but intelligible
- Complex tables should not block other content

### AC7: Table Caption and Summary

**Given** a table with `<caption>` or `summary` attribute
**When** the table is processed
**Then**:
- Caption is announced before table content: "Table: Sales Report 2024."
- If no caption, table is introduced: "Table."
- Table end is indicated: "End of table."

### AC8: Original DOM Preservation

**Given** any webpage with tables
**When** extraction completes
**Then**:
- Original page tables are unmodified
- All processing happens on cloned document
- User can still interact with tables on page

---

## Technical Implementation Notes

### Table Preprocessor Module (`entrypoints/content/table-processor.ts`)

```typescript
/**
 * Process all tables in a document for TTS-friendly reading.
 * Call on cloned document BEFORE Readability parsing.
 */
export function preprocessTablesForTTS(doc: Document): void {
  const tables = doc.querySelectorAll('table');

  for (const table of tables) {
    // Skip tables that are likely layout/navigation
    if (shouldSkipTable(table)) {
      continue;
    }

    const readable = convertTableToReadableText(table);
    replaceTableWithText(table, readable);
  }
}

/**
 * Heuristic to skip non-content tables.
 */
function shouldSkipTable(table: Element): boolean {
  // Skip tables in navigation/layout areas
  const parent = table.closest('nav, footer, aside, header');
  if (parent) return true;

  // Skip tables with layout-related classes
  const classList = table.className.toLowerCase();
  if (classList.includes('layout') || classList.includes('nav')) return true;

  // Skip tables with too few cells (likely layout)
  const cells = table.querySelectorAll('td, th');
  if (cells.length < 4) return true;

  return false;
}

/**
 * Convert table to readable text format.
 */
function convertTableToReadableText(table: Element): string {
  const result: string[] = [];

  // Extract caption
  const caption = table.querySelector('caption');
  if (caption) {
    result.push(`Table: ${caption.textContent?.trim() || 'Data table'}.`);
  } else {
    result.push('Table.');
  }

  // Extract header row
  const headers = extractHeaders(table);
  if (headers.length > 0) {
    result.push(`Headers: ${headers.join(', ')}.`);
  }

  // Extract data rows
  const dataRows = extractDataRows(table);
  let rowNum = 1;

  for (const row of dataRows) {
    const cells = row.querySelectorAll('td');
    const values: string[] = [];

    cells.forEach((cell, index) => {
      const value = cleanCellText(cell.textContent || '');
      if (value) {
        // Include header context if available
        if (headers[index]) {
          values.push(`${headers[index]}: ${value}`);
        } else {
          values.push(value);
        }
      }
    });

    if (values.length > 0) {
      result.push(`Row ${rowNum}: ${values.join('. ')}.`);
      rowNum++;
    }
  }

  result.push('End of table.');

  return result.join(' ');
}

/**
 * Extract header text from table.
 */
function extractHeaders(table: Element): string[] {
  const headers: string[] = [];

  // Try thead first
  const thead = table.querySelector('thead');
  if (thead) {
    const ths = thead.querySelectorAll('th');
    ths.forEach(th => {
      headers.push(cleanCellText(th.textContent || ''));
    });
    return headers;
  }

  // Try first row with all th
  const firstRow = table.querySelector('tr');
  if (firstRow) {
    const ths = firstRow.querySelectorAll('th');
    if (ths.length > 0) {
      ths.forEach(th => {
        headers.push(cleanCellText(th.textContent || ''));
      });
      return headers;
    }
  }

  return headers;
}

/**
 * Extract data rows (excluding header rows).
 */
function extractDataRows(table: Element): Element[] {
  const rows: Element[] = [];

  // Get tbody rows
  const tbody = table.querySelector('tbody');
  if (tbody) {
    rows.push(...Array.from(tbody.querySelectorAll('tr')));
    return rows;
  }

  // Fallback: get all rows, skip first if it was headers
  const allRows = Array.from(table.querySelectorAll('tr'));
  const firstRow = allRows[0];

  // Skip first row if it's a header row
  if (firstRow && firstRow.querySelector('th')) {
    return allRows.slice(1);
  }

  return allRows;
}

/**
 * Clean cell text for TTS.
 */
function cleanCellText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Replace table element with a paragraph containing readable text.
 */
function replaceTableWithText(table: Element, text: string): void {
  const p = table.ownerDocument.createElement('p');
  p.className = 'sr-table-content';
  p.textContent = text;
  table.replaceWith(p);
}
```

### Integration with Extractor (`entrypoints/content/extractor.ts`)

```typescript
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { createContentError, ERROR_CODES } from '@/lib/errors';
import { preprocessTablesForTTS } from './table-processor';

export function extractContent(): ExtractedContent {
  if (!isProbablyReaderable(document)) {
    throw createContentError(
      ERROR_CODES.CONTENT_NOT_READABLE,
      'This page does not appear to have readable article content',
      true
    );
  }

  // CRITICAL: Clone document before ANY processing
  const documentClone = document.cloneNode(true) as Document;

  // NEW: Pre-process tables for TTS-friendly reading
  try {
    preprocessTablesForTTS(documentClone);
  } catch (error) {
    // Log but don't fail - tables are enhancement, not critical
    console.warn('[SimpleReader] Table preprocessing failed:', error);
  }

  const reader = new Readability(documentClone, {
    charThreshold: 500,
  });

  const article = reader.parse();
  // ... rest unchanged
}
```

### Output Format Examples

**Simple table:**

Input:
```html
<table>
  <tr><th>Name</th><th>Age</th></tr>
  <tr><td>John</td><td>25</td></tr>
  <tr><td>Jane</td><td>30</td></tr>
</table>
```

Output:
```
Table. Headers: Name, Age. Row 1: Name: John. Age: 25. Row 2: Name: Jane. Age: 30. End of table.
```

**With caption:**

Input:
```html
<table>
  <caption>Employee Directory</caption>
  <thead><tr><th>Name</th><th>Department</th></tr></thead>
  <tbody>
    <tr><td>Alice</td><td>Engineering</td></tr>
  </tbody>
</table>
```

Output:
```
Table: Employee Directory. Headers: Name, Department. Row 1: Name: Alice. Department: Engineering. End of table.
```

**PRD Example (Feature Comparison):**

Input:
```html
<table>
  <tr><th>Feature</th><th>Speechify</th><th>SimpleReader</th></tr>
  <tr><td>Price</td><td>$139/year</td><td>Free</td></tr>
</table>
```

Output:
```
Table. Headers: Feature, Speechify, SimpleReader. Row 1: Feature: Price. Speechify: $139/year. SimpleReader: Free. End of table.
```

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| ARCH-15: Post-process tables | Tables converted before Readability |
| ARCH-14: Clone DOM before parsing | All processing on cloned document |
| ARCH-6: Only import from lib/ | Table processor imports only types/errors from lib/ |
| ARCH-13: Co-located tests | Tests in `table-processor.test.ts` |
| FR10: Tables read row-by-row | Output uses "Row N:" format |

### File Structure After Implementation

```
entrypoints/
  content/
    index.ts              # Existing content script
    extractor.ts          # Updated to call preprocessor
    table-processor.ts    # NEW: Table preprocessing logic
    table-processor.test.ts # NEW: Unit tests
    highlighter.ts        # Unchanged
```

---

## Tasks

### Task 1: Create Table Processor Module
**AC: 1, 2, 3, 4, 8**
- [ ] Create `entrypoints/content/table-processor.ts`
- [ ] Implement `preprocessTablesForTTS(doc: Document)` function
- [ ] Implement `shouldSkipTable()` heuristic
- [ ] Implement `convertTableToReadableText()`
- [ ] Implement `extractHeaders()` with `<thead>` and `<th>` detection
- [ ] Implement `extractDataRows()` excluding header rows
- [ ] Implement `cleanCellText()` helper
- [ ] Implement `replaceTableWithText()` to swap table with paragraph

### Task 2: Add Header Context to Cell Values
**AC: 5**
- [ ] Modify row output to include column header context
- [ ] Format: "Header: Value" or "Header is Value"
- [ ] Handle missing headers gracefully (fall back to value only)
- [ ] Ensure consistent format throughout output

### Task 3: Handle Captions and Table Introduction
**AC: 7**
- [ ] Extract `<caption>` element text
- [ ] Check `summary` attribute as fallback
- [ ] Output "Table: Caption." or "Table." prefix
- [ ] Output "End of table." suffix

### Task 4: Handle Complex Tables
**AC: 6**
- [ ] Test with `rowspan` and `colspan` attributes
- [ ] Ensure no crashes or infinite loops
- [ ] Best-effort extraction (may not be perfect)
- [ ] Log warnings for complex tables in debug

### Task 5: Integrate with Extractor
**AC: 1, 8**
- [ ] Import `preprocessTablesForTTS` in `extractor.ts`
- [ ] Call before Readability parsing
- [ ] Wrap in try-catch (table failure shouldn't block extraction)
- [ ] Verify original document unchanged

### Task 6: Manual Testing
**AC: All**
- [ ] Test on Wikipedia article with data tables
- [ ] Test on comparison table (feature comparison)
- [ ] Test on financial data table (numbers)
- [ ] Test on page with layout tables (should skip)
- [ ] Test complex table with merged cells
- [ ] Test table with caption
- [ ] Verify TTS output is comprehensible when spoken

---

## Definition of Done

- [ ] `table-processor.ts` module created and exported
- [ ] Tables in articles converted to row-by-row text format
- [ ] Header row detected and used for context
- [ ] Caption/summary extracted when available
- [ ] Complex tables handled gracefully (no crashes)
- [ ] Original page DOM unchanged
- [ ] Table preprocessing doesn't block content extraction on failure
- [ ] Console logs use `[SimpleReader]` prefix
- [ ] Output is comprehensible when read aloud by TTS

---

## Dependencies

### Depends On
- Story 2-1: Content Extraction with Mozilla Readability (implemented)
- `entrypoints/content/extractor.ts` exists and works

### Enables
- Story 5-2: Code Block Handling (similar preprocessing pattern)
- Improved TTS experience for data-heavy articles (tables are common in research, comparisons)

---

## Test Scenarios

### Manual Testing Checklist

| Test Case | Expected Behavior |
|-----------|-------------------|
| Wikipedia info table | Extracts as row-by-row with headers |
| Product comparison table | Each row shows "Header: Value" pairs |
| Layout table (old site) | Skipped (not treated as content) |
| Table in navigation | Skipped |
| Table with `<caption>` | "Table: Caption Name." prefix |
| Empty cells | Handled gracefully (skip or "empty") |
| Table with rowspan | Best-effort, doesn't crash |
| No tables on page | No change to extraction |

### Unit Test Cases

```typescript
// table-processor.test.ts
describe('preprocessTablesForTTS', () => {
  it('converts simple table to row-by-row text');
  it('detects headers from <thead>');
  it('detects headers from first row with <th>');
  it('includes header context in cell values');
  it('extracts caption as table title');
  it('handles empty cells gracefully');
  it('skips tables in navigation areas');
  it('handles tables without headers');
  it('does not crash on colspan/rowspan');
  it('leaves original document unchanged');
});

describe('shouldSkipTable', () => {
  it('skips tables inside <nav>');
  it('skips tables inside <footer>');
  it('skips tables with layout class');
  it('skips tables with fewer than 4 cells');
  it('processes content tables normally');
});
```

---

## References

- [Source: docs/prd.md#FR10] - Tables read row-by-row requirement
- [Source: docs/architecture.md#ARCH-15] - Post-process tables pattern
- [Source: docs/epics.md#Story 5.1] - Original story definition
- [Source: entrypoints/content/extractor.ts] - Current extraction implementation
- [User Journey 4 in PRD] - Edge case handling for messy content

---

## Dev Notes

### Why Pre-process Before Readability?

Readability extracts `textContent` which loses all table structure. By converting tables to readable paragraphs **before** Readability runs, we:
1. Preserve the semantic meaning of tabular data
2. Let Readability handle article/noise detection as usual
3. Get tables in natural reading order

### Performance Considerations

- Table processing is O(rows * columns) - typically fast
- Large tables (100+ rows) might need chunking consideration
- Processing happens on clone, so no DOM reflows on live page

### Alternative Approaches Considered

1. **Post-process Readability output**: Impossible - structure is lost
2. **Custom extraction bypassing Readability**: Too complex, Readability is battle-tested
3. **Separate table extraction pass**: More complex, ordering issues

Pre-processing the clone before Readability is the simplest approach that works.

### Edge Cases to Watch

- **Nested tables**: Process outer table, inner tables become text within cells
- **Tables in tables**: Rare, handle gracefully
- **Very wide tables (20+ columns)**: Output gets long, acceptable for MVP
- **Single-column tables**: Might be styling, not data - consider skipping

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

### File List

- `entrypoints/content/table-processor.ts` (new)
- `entrypoints/content/table-processor.test.ts` (new)
- `entrypoints/content/extractor.ts` (modified - add preprocessor call)
