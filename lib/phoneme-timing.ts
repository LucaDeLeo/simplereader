// lib/phoneme-timing.ts
// Phoneme-weighted word timing calculation for accurate TTS highlighting

import type { WordTiming } from './messages';

// ============================================
// Constants
// ============================================

// IPA characters that don't contribute to duration (stress marks, length marks, diacritics)
const NON_PHONEME_CHARS = /['\u02c8\u02cc\u02d0\u02d1.\u02b0\u02b7\u02b2\u0303\u02d1\u0325\u030a\u031a\u02ba\u02b9\s]/g;

// Sentence boundary characters
const SENTENCE_ENDINGS = /[.!?]+$/;

// ============================================
// Tokenization Functions
// ============================================

/**
 * Tokenize text into words, preserving punctuation attachment.
 * Filters empty strings and handles multiple whitespace.
 *
 * @param text - Text to tokenize
 * @returns Array of words with attached punctuation
 */
export function tokenizeText(text: string): string[] {
  if (!text || !text.trim()) return [];
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Split phoneme string into word groups.
 * Kokoro-js separates words with spaces in phoneme output.
 *
 * @param phonemes - IPA phoneme string from Kokoro-js
 * @returns Array of phoneme groups, one per word
 */
export function splitPhonemesByWord(phonemes: string): string[] {
  if (!phonemes || !phonemes.trim()) return [];
  return phonemes.trim().split(/\s+/).filter(Boolean);
}

/**
 * Detect if a word ends a sentence.
 *
 * @param word - Word to check
 * @returns True if word ends with sentence-ending punctuation
 */
export function isSentenceEnd(word: string): boolean {
  return SENTENCE_ENDINGS.test(word);
}

// ============================================
// Phoneme Counting
// ============================================

/**
 * Count phonemes in an IPA string, excluding stress/length marks.
 *
 * IPA marks that are excluded (don't contribute to duration):
 * - Primary stress (')
 * - Secondary stress (,)
 * - Long vowel (:)
 * - Half-long (.)
 * - Various diacritics
 *
 * @param ipaString - IPA representation of a word
 * @returns Number of phoneme characters
 */
export function countPhonemes(ipaString: string): number {
  if (!ipaString) return 0;
  // Remove non-phoneme characters and count remaining
  const cleaned = ipaString.replace(NON_PHONEME_CHARS, '');
  return cleaned.length;
}

/**
 * Estimate phoneme count from character count when IPA data unavailable.
 * Uses ~0.7 phonemes per letter as rough English approximation.
 *
 * @param word - Word to estimate phonemes for
 * @returns Estimated phoneme count (minimum 1)
 */
export function estimatePhonemeCount(word: string): number {
  // Strip punctuation for character count
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '');
  // English averages ~0.7 phonemes per character
  return Math.max(1, Math.round(letters.length * 0.7));
}

// ============================================
// Timing Calculation
// ============================================

/**
 * Calculate phoneme-weighted word timings.
 *
 * Distributes audio duration across words proportionally to their phoneme counts.
 * Resets timing accumulation at sentence boundaries to prevent drift.
 *
 * @param words - Array of words to calculate timings for
 * @param phonemeData - IPA phoneme string from Kokoro-js (space-separated per word)
 * @param totalDurationMs - Total duration of audio in milliseconds
 * @param startOffsetMs - Start time offset in milliseconds (default 0)
 * @returns Array of WordTiming objects
 */
export function calculatePhonemeWeightedTimings(
  words: string[],
  phonemeData: string,
  totalDurationMs: number,
  startOffsetMs: number = 0
): WordTiming[] {
  if (!words || words.length === 0) return [];

  const phonemeGroups = splitPhonemesByWord(phonemeData);

  // Count phonemes per word
  const wordPhonemes: number[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i < phonemeGroups.length && phonemeGroups[i]) {
      const count = countPhonemes(phonemeGroups[i]);
      wordPhonemes.push(count > 0 ? count : estimatePhonemeCount(words[i]));
      console.log(`[SimpleReader] Word timing: "${words[i]}" = ${wordPhonemes[i]} phonemes`);
    } else {
      // Fallback to character-based estimate
      wordPhonemes.push(estimatePhonemeCount(words[i]));
      console.log(`[SimpleReader] Word timing (fallback): "${words[i]}" = ${wordPhonemes[i]} phonemes`);
    }
  }

  // Process sentences separately to prevent drift accumulation
  const timings: WordTiming[] = [];
  let currentOffset = startOffsetMs;
  let sentenceStartIndex = 0;
  let remainingDuration = totalDurationMs;

  for (let i = 0; i < words.length; i++) {
    const isSentEnd = isSentenceEnd(words[i]);
    const isLastWord = i === words.length - 1;

    if (isSentEnd || isLastWord) {
      // Calculate timings for this sentence segment
      const sentenceWords = words.slice(sentenceStartIndex, i + 1);
      const sentencePhonemes = wordPhonemes.slice(sentenceStartIndex, i + 1);
      const totalSentencePhonemes = sentencePhonemes.reduce((sum, p) => sum + p, 0);

      // Calculate sentence duration proportionally
      const wordsRemaining = words.length - sentenceStartIndex;
      const sentenceWordCount = i + 1 - sentenceStartIndex;
      const sentenceDuration = isLastWord
        ? remainingDuration
        : (sentenceWordCount / wordsRemaining) * remainingDuration;

      // Distribute duration by phoneme weight within sentence
      let sentenceOffset = currentOffset;
      for (let j = 0; j < sentenceWords.length; j++) {
        const wordIndex = sentenceStartIndex + j;
        const phonemeCount = sentencePhonemes[j];
        const wordDuration =
          totalSentencePhonemes > 0
            ? (phonemeCount / totalSentencePhonemes) * sentenceDuration
            : sentenceDuration / sentenceWords.length;

        timings.push({
          word: sentenceWords[j],
          startTime: sentenceOffset,
          endTime: sentenceOffset + wordDuration,
          index: wordIndex,
        });

        sentenceOffset += wordDuration;
      }

      if (isSentEnd && !isLastWord) {
        console.log(`[SimpleReader] Sentence boundary at word ${i}, resetting accumulation`);
      }

      currentOffset = sentenceOffset;
      remainingDuration -= sentenceDuration;
      sentenceStartIndex = i + 1;
    }
  }

  return timings;
}

/**
 * Fallback timing calculation when phoneme data is unavailable.
 * Uses character count as proxy for word duration (better than equal distribution).
 *
 * @param words - Array of words to calculate timings for
 * @param totalDurationMs - Total duration of audio in milliseconds
 * @param startOffsetMs - Start time offset in milliseconds (default 0)
 * @returns Array of WordTiming objects
 */
export function calculateCharacterWeightedTimings(
  words: string[],
  totalDurationMs: number,
  startOffsetMs: number = 0
): WordTiming[] {
  if (!words || words.length === 0) return [];

  // Use character count as weight
  const wordWeights = words.map((w) => {
    const letters = w.replace(/[^\p{L}\p{N}]/gu, '');
    return Math.max(1, letters.length);
  });
  const totalWeight = wordWeights.reduce((sum, w) => sum + w, 0);

  const timings: WordTiming[] = [];
  let currentTime = startOffsetMs;

  for (let i = 0; i < words.length; i++) {
    const wordDuration = (wordWeights[i] / totalWeight) * totalDurationMs;

    timings.push({
      word: words[i],
      startTime: currentTime,
      endTime: currentTime + wordDuration,
      index: i,
    });

    currentTime += wordDuration;
  }

  return timings;
}

// ============================================
// Combined Timing Functions
// ============================================

/**
 * Calculate word timings from audio chunk data.
 *
 * Automatically selects between phoneme-weighted and character-weighted
 * based on availability of phoneme data.
 *
 * @param text - Original text that was synthesized
 * @param phonemes - IPA phoneme string from Kokoro-js (may be empty)
 * @param sampleOffset - Sample offset from start of full audio
 * @param sampleCount - Number of samples in this chunk
 * @param sampleRate - Audio sample rate (typically 24000)
 * @returns Array of WordTiming objects
 */
export function calculateWordTimings(
  text: string,
  phonemes: string | undefined,
  sampleOffset: number,
  sampleCount: number,
  sampleRate: number
): WordTiming[] {
  const words = tokenizeText(text);
  if (words.length === 0) return [];

  // Calculate durations
  const chunkDurationMs = (sampleCount / sampleRate) * 1000;
  const startOffsetMs = (sampleOffset / sampleRate) * 1000;

  // Use phoneme-weighted if phonemes available, else fallback to character-weighted
  if (phonemes && phonemes.trim()) {
    return calculatePhonemeWeightedTimings(words, phonemes, chunkDurationMs, startOffsetMs);
  } else {
    console.log('[SimpleReader] No phoneme data, using character-weighted timing');
    return calculateCharacterWeightedTimings(words, chunkDurationMs, startOffsetMs);
  }
}
