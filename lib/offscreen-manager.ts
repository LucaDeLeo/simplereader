// lib/offscreen-manager.ts
// Offscreen document lifecycle management for TTS processing

import { createOffscreenError, ERROR_CODES } from './errors';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

/**
 * State tracking for offscreen document creation.
 * Prevents concurrent creation attempts.
 */
let isCreating = false;

/**
 * Ensures an offscreen document exists, creating one if needed.
 *
 * CRITICAL: Chrome only allows ONE offscreen document per extension.
 * Always check existence before creating.
 *
 * @throws ExtensionError if creation fails
 */
export async function ensureOffscreenDocument(): Promise<void> {
  // Check if already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    // Document already exists
    return;
  }

  // Prevent concurrent creation attempts
  if (isCreating) {
    // Wait for ongoing creation to complete
    await waitForCreation();
    return;
  }

  isCreating = true;

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'TTS audio generation and playback via Kokoro',
    });
    console.log('[SimpleReader] Offscreen document created');
  } catch (error) {
    // Handle "Only a single offscreen" race condition
    if (
      error instanceof Error &&
      error.message.includes('Only a single offscreen')
    ) {
      console.log(
        '[SimpleReader] Offscreen document already exists (race condition)'
      );
      return;
    }

    throw createOffscreenError(
      ERROR_CODES.OFFSCREEN_CREATION_FAILED,
      `Failed to create offscreen document: ${error instanceof Error ? error.message : String(error)}`,
      true, // recoverable
      error
    );
  } finally {
    isCreating = false;
  }
}

/**
 * Wait for ongoing creation to complete.
 * Polls until isCreating becomes false or timeout.
 */
async function waitForCreation(maxWaitMs = 5000): Promise<void> {
  const startTime = Date.now();
  while (isCreating && Date.now() - startTime < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Check if offscreen document currently exists.
 * Use this to verify document state before operations.
 */
export async function isOffscreenDocumentReady(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  return contexts.length > 0;
}

/**
 * Close the offscreen document if it exists.
 * Call this for cleanup or to force recreation.
 */
export async function closeOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (contexts.length > 0) {
    await chrome.offscreen.closeDocument();
    console.log('[SimpleReader] Offscreen document closed');
  }
}
