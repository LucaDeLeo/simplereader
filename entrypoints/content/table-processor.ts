/**
 * Table Processor for TTS-friendly reading
 *
 * Converts HTML tables to readable text format before Readability parsing.
 * This preserves the semantic meaning of tabular data which would otherwise
 * be flattened into incomprehensible text.
 *
 * Output format example:
 * "Table: Employee Directory. Headers: Name, Age. Row 1: Name: John. Age: 25. End of table."
 */

/**
 * Process all tables in a document for TTS-friendly reading.
 * Call on cloned document BEFORE Readability parsing.
 *
 * @param doc - The document (clone) to process
 */
export function preprocessTablesForTTS(doc: Document): void {
  const tables = doc.querySelectorAll('table');

  for (const table of tables) {
    // Skip tables that are likely layout/navigation
    if (shouldSkipTable(table)) {
      continue;
    }

    try {
      const readable = convertTableToReadableText(table);
      replaceTableWithText(table, readable);
    } catch (error) {
      // Log but don't fail - individual table failure shouldn't block others
      console.warn('[SimpleReader] Failed to process table:', error);
    }
  }
}

/**
 * Heuristic to skip non-content tables (layout, navigation, etc).
 */
function shouldSkipTable(table: Element): boolean {
  // Skip tables in navigation/layout areas
  const parent = table.closest('nav, footer, aside, header');
  if (parent) return true;

  // Skip tables with layout-related classes or roles
  const classList = table.className.toLowerCase();
  if (classList.includes('layout') || classList.includes('nav')) return true;

  // Skip tables with presentation role
  if (table.getAttribute('role') === 'presentation') return true;

  // Skip tables with too few cells (likely layout)
  const cells = table.querySelectorAll('td, th');
  if (cells.length < 4) return true;

  // Skip single-column tables (often layout)
  const rows = table.querySelectorAll('tr');
  if (rows.length > 0) {
    const firstRowCells = rows[0].querySelectorAll('td, th');
    if (firstRowCells.length === 1 && rows.length > 1) return true;
  }

  return false;
}

/**
 * Convert table to readable text format.
 */
function convertTableToReadableText(table: Element): string {
  const result: string[] = [];

  // Extract caption or summary
  const caption = extractCaption(table);
  if (caption) {
    result.push(`Table: ${caption}.`);
  } else {
    result.push('Table.');
  }

  // Extract header row
  const headers = extractHeaders(table);
  if (headers.length > 0) {
    result.push(`Headers: ${headers.join(', ')}.`);
  }

  // Extract data rows
  const dataRows = extractDataRows(table, headers.length > 0);
  let rowNum = 1;

  for (const row of dataRows) {
    const cells = row.querySelectorAll('td');
    const values: string[] = [];

    cells.forEach((cell, index) => {
      const value = cleanCellText(cell.textContent || '');
      if (value) {
        // Include header context if available
        const header = headers[index];
        if (header) {
          values.push(`${header}: ${value}`);
        } else if (headers.length === 0) {
          // No headers at all, just use value
          values.push(value);
        } else {
          // Have headers but missing for this column, use generic
          values.push(`Column ${index + 1}: ${value}`);
        }
      } else {
        // Handle empty cells
        const header = headers[index];
        if (header) {
          values.push(`${header}: empty`);
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
 * Extract caption from table.
 */
function extractCaption(table: Element): string | null {
  // Try <caption> element first
  const caption = table.querySelector('caption');
  if (caption) {
    const text = cleanCellText(caption.textContent || '');
    if (text) return text;
  }

  // Try summary attribute (deprecated but still used)
  const summary = table.getAttribute('summary');
  if (summary) {
    const text = cleanCellText(summary);
    if (text) return text;
  }

  // Try aria-label
  const ariaLabel = table.getAttribute('aria-label');
  if (ariaLabel) {
    const text = cleanCellText(ariaLabel);
    if (text) return text;
  }

  return null;
}

/**
 * Extract header text from table.
 */
function extractHeaders(table: Element): string[] {
  const headers: string[] = [];

  // Try thead first
  const thead = table.querySelector('thead');
  if (thead) {
    const headerRow = thead.querySelector('tr');
    if (headerRow) {
      const ths = headerRow.querySelectorAll('th');
      if (ths.length > 0) {
        ths.forEach((th) => {
          headers.push(cleanCellText(th.textContent || '') || 'Column');
        });
        return headers;
      }
      // Sometimes headers use td in thead
      const tds = headerRow.querySelectorAll('td');
      if (tds.length > 0) {
        tds.forEach((td) => {
          headers.push(cleanCellText(td.textContent || '') || 'Column');
        });
        return headers;
      }
    }
  }

  // Try first row with all th elements
  const firstRow = table.querySelector('tr');
  if (firstRow) {
    const ths = firstRow.querySelectorAll('th');
    const tds = firstRow.querySelectorAll('td');

    // First row is headers if it has th elements and no td elements
    if (ths.length > 0 && tds.length === 0) {
      ths.forEach((th) => {
        headers.push(cleanCellText(th.textContent || '') || 'Column');
      });
      return headers;
    }
  }

  // No clear headers found
  return headers;
}

/**
 * Extract data rows (excluding header rows).
 */
function extractDataRows(table: Element, hasHeaders: boolean): Element[] {
  const rows: Element[] = [];

  // Get tbody rows if available
  const tbody = table.querySelector('tbody');
  if (tbody) {
    const tbodyRows = tbody.querySelectorAll(':scope > tr');
    rows.push(...Array.from(tbodyRows));
    return rows;
  }

  // Fallback: get all rows
  const allRows = Array.from(table.querySelectorAll('tr'));

  // Skip thead rows
  const thead = table.querySelector('thead');
  const filteredRows = allRows.filter((row) => !thead?.contains(row));

  // Skip first row if we detected it as header row
  if (hasHeaders && filteredRows.length > 0) {
    const firstRow = filteredRows[0];
    const ths = firstRow.querySelectorAll('th');
    const tds = firstRow.querySelectorAll('td');
    // If first row is all th (no td), skip it
    if (ths.length > 0 && tds.length === 0) {
      return filteredRows.slice(1);
    }
  }

  return filteredRows;
}

/**
 * Clean cell text for TTS.
 */
function cleanCellText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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
