# Story 2.5: Word Tokenization and Timing Calculation

## Story Info

| Field | Value |
|-------|-------|
| Epic | 2 - First Play Experience (The Magic Moment) |
| Story ID | 2-5 |
| Story Key | 2-5-word-tokenization-and-timing-calculation |
| Status | ready-for-dev |
| Created | 2025-12-11 |

---

## User Story

As a developer,
I want accurate word timing from phoneme data,
So that highlighting can sync with audio playback.

---

## Context & Background

This is the **fifth story in Epic 2**, implementing phoneme-weighted word timing calculation to replace the basic equal-distribution approach. This provides the foundation for accurate word highlighting in Story 2-6.

### Current State (After Story 2-4)

The `tts-engine.ts` has a basic `calculateBasicWordTimings()` function that:
- Splits text on whitespace to get words
- Divides total audio duration equally across words
- Returns `WordTiming[]` with startTime, endTime, and index

**Problem with current approach:**
- "The" and "phenomenologically" get the same duration
- Timing drift accumulates over long sentences
- Highlighting feels "off" as words don't match spoken audio

### Target State

After this story:
1. Word durations estimated based on phoneme counts (longer words = longer duration)
2. Timing resets at sentence boundaries to prevent drift accumulation
3. Word-to-phoneme mapping enables accurate highlighting sync
4. ~90% timing accuracy (acceptable for MVP)

### Kokoro-js Phoneme Output

Kokoro-js returns phonemes as an IPA string for each text chunk:

```typescript
for await (const { text, phonemes, audio } of stream) {
  // text: "Hello world"
  // phonemes: "həˈloʊ wˈɜːld"  (IPA representation)
  // audio: RawAudio with .audio Float32Array
}
```

The phoneme string uses IPA (International Phonetic Alphabet) characters. Each word in the text corresponds to a space-separated phoneme sequence.

### Architecture Reference

From `docs/architecture.md`:
- **FR17**: Highlighting syncs with audio using phoneme-weighted timing
- **ARCH-16**: Phoneme-weighted duration estimation with sentence boundary reset
- **ARCH-17**: Use `requestAnimationFrame` for highlight updates (Story 2-6)

From `docs/project_context.md`:
- Performance target: Audio start < 2s, highlighting at 60fps
- Tests co-located: `foo.ts` -> `foo.test.ts`

---

## Acceptance Criteria

### AC1: Word Tokenization from Extracted Text

**Given** text has been extracted from the page
**When** preparing for TTS generation
**Then**:
- Text is tokenized into words preserving original order
- Punctuation attached to words is preserved (e.g., "world." stays together)
- Empty strings and whitespace-only entries are filtered
- Word indices map to their position in the original text
- Tokenization handles multi-space gaps correctly

### AC2: Phoneme-Weighted Duration Estimation

**Given** text has been processed by Kokoro TTS
**When** phoneme data is available
**Then**:
- Each word's duration is proportional to its phoneme count
- Longer words (more phonemes) get more time
- Short words ("a", "I", "the") get proportionally less time
- Total chunk duration is distributed by phoneme weight
- Formula: `wordDuration = (wordPhonemes / totalPhonemes) * chunkDuration`

### AC3: Sentence Boundary Reset

**Given** text contains multiple sentences
**When** calculating word timings
**Then**:
- Sentence boundaries detected at `.`, `!`, `?`
- Timing accumulation resets at each sentence boundary
- Prevents drift from compounding across long articles
- Each sentence's timing is self-contained
- Natural pauses at sentence breaks are accounted for

### AC4: Word-to-Phoneme Mapping

**Given** Kokoro-js returns a phoneme string
**When** mapping phonemes to words
**Then**:
- Space-separated phoneme groups align with words
- Each word has an estimated phoneme count
- Handles edge cases (contractions, hyphenated words)
- Fallback to character-count estimation if phoneme mapping fails
- Mapping is logged for debugging: `[SimpleReader] Word timing: "hello" = 5 phonemes`

### AC5: WordTiming Interface Compliance

**Given** timing data is calculated
**When** returning results
**Then**:
- Returns `WordTiming[]` matching interface from `lib/messages.ts`
- Each timing has: `{ word, startTime, endTime, index }`
- Times in milliseconds from audio start
- Index is sequential position in full text
- Achieves ~90% accuracy compared to actual spoken timing

### AC6: Integration with Existing TTS Engine

**Given** the new timing calculation is implemented
**When** `generateSpeech()` is called
**Then**:
- Replaces `calculateBasicWordTimings()` with new phoneme-weighted function
- Backward compatible with existing chunk streaming
- No changes required to message protocol
- Works with both Kokoro (WebGPU/WASM) and falls back gracefully for Web Speech

---

## Technical Implementation Notes

### Phoneme Counting Strategy

IPA phonemes from Kokoro-js can be counted by:
1. Splitting phoneme string on spaces (one group per word)
2. Counting non-space, non-stress-mark characters
3. Stress marks (ˈ ˌ) and length marks (:) don't add duration

```typescript
// Example phoneme string: "həˈloʊ wˈɜːld"
// Word 1: "həˈloʊ" -> h, ə, l, oʊ = 4 phonemes (ˈ ignored)
// Word 2: "wˈɜːld" -> w, ɜː, l, d = 4 phonemes (ˈ and : ignored)
```

### Phoneme Weighting Module (`lib/phoneme-timing.ts`)

```typescript
// lib/phoneme-timing.ts
// Phoneme-weighted word timing calculation

import type { WordTiming } from './messages';

// IPA characters that don't contribute to duration
const NON_PHONEME_CHARS = /[ˈˌːˑ.ʰʷʲ̃ˑ̥̊̚˺˹\s]/g;

// Sentence boundary characters
const SENTENCE_ENDINGS = /[.!?]+/;

/**
 * Count phonemes in an IPA string, excluding stress/length marks.
 */
export function countPhonemes(ipaString: string): number {
  // Remove non-phoneme characters
  const cleaned = ipaString.replace(NON_PHONEME_CHARS, '');

  // Count remaining characters (digraphs like 'oʊ' count as their constituent chars)
  // This is a simplification - proper IPA parsing would be more complex
  return cleaned.length;
}

/**
 * Split phoneme string into word groups.
 * Kokoro-js separates words with spaces in phoneme output.
 */
export function splitPhonemesByWord(phonemes: string): string[] {
  return phonemes.trim().split(/\s+/).filter(Boolean);
}

/**
 * Tokenize text into words, preserving punctuation attachment.
 */
export function tokenizeWords(text: string): string[] {
  // Split on whitespace, preserve punctuation with words
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Detect if a word ends a sentence.
 */
export function isSentenceEnd(word: string): boolean {
  return SENTENCE_ENDINGS.test(word);
}

/**
 * Calculate phoneme-weighted word timings.
 *
 * @param text - Original text that was synthesized
 * @param phonemes - IPA phoneme string from Kokoro-js
 * @param sampleOffset - Sample offset from start of full audio
 * @param sampleCount - Number of samples in this chunk
 * @param sampleRate - Audio sample rate (typically 24000)
 */
export function calculatePhonemeWeightedTimings(
  text: string,
  phonemes: string,
  sampleOffset: number,
  sampleCount: number,
  sampleRate: number
): WordTiming[] {
  const words = tokenizeWords(text);
  const phonemeGroups = splitPhonemesByWord(phonemes);

  if (words.length === 0) return [];

  // Calculate total duration for this chunk
  const chunkDurationMs = (sampleCount / sampleRate) * 1000;
  const chunkStartMs = (sampleOffset / sampleRate) * 1000;

  // Count phonemes per word
  const wordPhonemes: number[] = [];
  for (let i = 0; i < words.length; i++) {
    // Use phoneme count if available, fallback to character-based estimate
    if (i < phonemeGroups.length) {
      wordPhonemes.push(countPhonemes(phonemeGroups[i]));
    } else {
      // Fallback: estimate ~0.7 phonemes per character for English
      wordPhonemes.push(Math.max(1, Math.round(words[i].replace(/[^\w]/g, '').length * 0.7)));
    }
  }

  // Process sentences separately to prevent drift accumulation
  const timings: WordTiming[] = [];
  let currentOffset = chunkStartMs;
  let sentenceStartIndex = 0;

  for (let i = 0; i < words.length; i++) {
    const isSentenceEnd = SENTENCE_ENDINGS.test(words[i]);

    if (isSentenceEnd || i === words.length - 1) {
      // Calculate timings for this sentence
      const sentenceWords = words.slice(sentenceStartIndex, i + 1);
      const sentencePhonemes = wordPhonemes.slice(sentenceStartIndex, i + 1);
      const totalSentencePhonemes = sentencePhonemes.reduce((sum, p) => sum + p, 0);

      // Distribute remaining chunk duration proportionally
      const remainingDuration = chunkDurationMs - (currentOffset - chunkStartMs);
      const sentenceDuration = isSentenceEnd
        ? remainingDuration * ((i + 1 - sentenceStartIndex) / words.length)
        : remainingDuration;

      // Calculate timing for each word in sentence
      let sentenceOffset = currentOffset;
      for (let j = 0; j < sentenceWords.length; j++) {
        const wordIndex = sentenceStartIndex + j;
        const phonemeCount = sentencePhonemes[j];
        const wordDuration = totalSentencePhonemes > 0
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

      currentOffset = sentenceOffset;
      sentenceStartIndex = i + 1;
    }
  }

  return timings;
}

/**
 * Fallback timing calculation when phoneme data is unavailable.
 * Uses character count as proxy for duration.
 */
export function calculateCharacterWeightedTimings(
  text: string,
  sampleOffset: number,
  sampleCount: number,
  sampleRate: number
): WordTiming[] {
  const words = tokenizeWords(text);
  if (words.length === 0) return [];

  const chunkDurationMs = (sampleCount / sampleRate) * 1000;
  const chunkStartMs = (sampleOffset / sampleRate) * 1000;

  // Use character count as weight (longer words = longer duration)
  const wordWeights = words.map(w => Math.max(1, w.replace(/[^\w]/g, '').length));
  const totalWeight = wordWeights.reduce((sum, w) => sum + w, 0);

  const timings: WordTiming[] = [];
  let currentTime = chunkStartMs;

  for (let i = 0; i < words.length; i++) {
    const wordDuration = (wordWeights[i] / totalWeight) * chunkDurationMs;

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
```

### Updated TTS Engine Integration (`entrypoints/offscreen/tts-engine.ts`)

Replace `calculateBasicWordTimings()` with the new phoneme-weighted function:

```typescript
// In entrypoints/offscreen/tts-engine.ts

import {
  calculatePhonemeWeightedTimings,
  calculateCharacterWeightedTimings,
} from '@/lib/phoneme-timing';

// Replace the existing calculateBasicWordTimings function call in generateSpeech()
// with:

// In the streaming loop:
for await (const result of stream) {
  const { text: chunkText, phonemes, audio } = result;
  const audioData = (audio as RawAudio).audio;

  // Use phoneme-weighted timing if phonemes available, else fallback
  const wordTimings = phonemes && phonemes.trim()
    ? calculatePhonemeWeightedTimings(
        chunkText,
        phonemes,
        totalSamplesProcessed,
        audioData.length,
        TTS_SAMPLE_RATE
      )
    : calculateCharacterWeightedTimings(
        chunkText,
        totalSamplesProcessed,
        audioData.length,
        TTS_SAMPLE_RATE
      );

  // ... rest of chunk processing
}
```

### Web Speech API Compatibility

For Web Speech API fallback (no phoneme data available):
- Use `calculateCharacterWeightedTimings()` as fallback
- Still better than equal distribution
- Boundary events from Web Speech can supplement timing

```typescript
// In generateWithWebSpeech():
// Web Speech provides boundary events, use them directly for timing
// The existing web-speech.ts implementation handles this via onboundary events
```

### Test Cases (`lib/phoneme-timing.test.ts`)

```typescript
// lib/phoneme-timing.test.ts

import { describe, it, expect } from 'vitest';
import {
  countPhonemes,
  splitPhonemesByWord,
  tokenizeWords,
  isSentenceEnd,
  calculatePhonemeWeightedTimings,
  calculateCharacterWeightedTimings,
} from './phoneme-timing';

describe('phoneme-timing', () => {
  describe('countPhonemes', () => {
    it('counts basic phonemes', () => {
      expect(countPhonemes('həloʊ')).toBe(4); // h, ə, l, oʊ -> 4 chars
    });

    it('ignores stress marks', () => {
      expect(countPhonemes('ˈhəˌloʊ')).toBe(4); // stress marks removed
    });

    it('ignores length marks', () => {
      expect(countPhonemes('wɜːld')).toBe(4); // : removed
    });

    it('handles empty string', () => {
      expect(countPhonemes('')).toBe(0);
    });
  });

  describe('splitPhonemesByWord', () => {
    it('splits on spaces', () => {
      expect(splitPhonemesByWord('həˈloʊ wˈɜːld')).toEqual(['həˈloʊ', 'wˈɜːld']);
    });

    it('handles multiple spaces', () => {
      expect(splitPhonemesByWord('həˈloʊ   wˈɜːld')).toEqual(['həˈloʊ', 'wˈɜːld']);
    });

    it('handles empty string', () => {
      expect(splitPhonemesByWord('')).toEqual([]);
    });
  });

  describe('tokenizeWords', () => {
    it('splits on whitespace', () => {
      expect(tokenizeWords('hello world')).toEqual(['hello', 'world']);
    });

    it('preserves punctuation', () => {
      expect(tokenizeWords('Hello, world!')).toEqual(['Hello,', 'world!']);
    });

    it('handles multiple spaces', () => {
      expect(tokenizeWords('hello   world')).toEqual(['hello', 'world']);
    });
  });

  describe('isSentenceEnd', () => {
    it('detects period', () => {
      expect(isSentenceEnd('world.')).toBe(true);
    });

    it('detects exclamation', () => {
      expect(isSentenceEnd('world!')).toBe(true);
    });

    it('detects question mark', () => {
      expect(isSentenceEnd('world?')).toBe(true);
    });

    it('rejects comma', () => {
      expect(isSentenceEnd('world,')).toBe(false);
    });

    it('rejects no punctuation', () => {
      expect(isSentenceEnd('world')).toBe(false);
    });
  });

  describe('calculatePhonemeWeightedTimings', () => {
    it('distributes time by phoneme count', () => {
      const timings = calculatePhonemeWeightedTimings(
        'I love programming',
        'aɪ lʌv ˈproʊɡræmɪŋ',
        0,
        24000, // 1 second of audio
        24000
      );

      expect(timings).toHaveLength(3);
      expect(timings[0].word).toBe('I');
      expect(timings[1].word).toBe('love');
      expect(timings[2].word).toBe('programming');

      // "programming" should get more time than "I"
      const iDuration = timings[0].endTime - timings[0].startTime;
      const programmingDuration = timings[2].endTime - timings[2].startTime;
      expect(programmingDuration).toBeGreaterThan(iDuration);
    });

    it('handles empty text', () => {
      const timings = calculatePhonemeWeightedTimings('', '', 0, 24000, 24000);
      expect(timings).toHaveLength(0);
    });

    it('handles sample offset', () => {
      const timings = calculatePhonemeWeightedTimings(
        'hello',
        'həˈloʊ',
        24000, // 1 second offset
        24000,
        24000
      );

      expect(timings[0].startTime).toBe(1000); // Starts at 1000ms
    });
  });

  describe('calculateCharacterWeightedTimings', () => {
    it('distributes time by character count', () => {
      const timings = calculateCharacterWeightedTimings(
        'I love programming',
        0,
        24000,
        24000
      );

      expect(timings).toHaveLength(3);

      // "programming" should get more time than "I"
      const iDuration = timings[0].endTime - timings[0].startTime;
      const programmingDuration = timings[2].endTime - timings[2].startTime;
      expect(programmingDuration).toBeGreaterThan(iDuration);
    });
  });
});
```

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| FR17: Phoneme-weighted sync | Word durations estimated from phoneme counts |
| ARCH-16: Sentence boundary reset | Timing resets at `.`, `!`, `?` to prevent drift |
| ARCH-13: Co-located tests | `lib/phoneme-timing.test.ts` with module |
| ARCH-6: Shared code in lib/ | New module at `lib/phoneme-timing.ts` |

### File Structure After Implementation

```
lib/
  messages.ts         # EXISTING: WordTiming interface
  phoneme-timing.ts   # NEW: Phoneme-weighted timing calculation
  phoneme-timing.test.ts # NEW: Unit tests

entrypoints/
  offscreen/
    tts-engine.ts     # UPDATE: Use new timing functions
```

---

## Tasks

### Task 1: Create Phoneme Timing Module
**AC: 1, 2, 3, 4**
- [ ] Create `lib/phoneme-timing.ts`
- [ ] Implement `countPhonemes()` to count IPA phonemes excluding stress marks
- [ ] Implement `splitPhonemesByWord()` for phoneme string parsing
- [ ] Implement `tokenizeWords()` for text tokenization
- [ ] Implement `isSentenceEnd()` for sentence boundary detection
- [ ] Export all functions for use in TTS engine

### Task 2: Implement Phoneme-Weighted Timing Calculation
**AC: 2, 3, 5**
- [ ] Implement `calculatePhonemeWeightedTimings()` function
- [ ] Distribute chunk duration by phoneme weight per word
- [ ] Reset timing accumulation at sentence boundaries
- [ ] Return `WordTiming[]` matching interface from `lib/messages.ts`
- [ ] Add debug logging: `[SimpleReader] Word timing: "word" = N phonemes`

### Task 3: Implement Character-Weighted Fallback
**AC: 5, 6**
- [ ] Implement `calculateCharacterWeightedTimings()` as fallback
- [ ] Use character count when phoneme data unavailable
- [ ] Ensure fallback returns same `WordTiming[]` format
- [ ] Better than equal distribution for Web Speech API

### Task 4: Integrate with TTS Engine
**AC: 6**
- [ ] Update `tts-engine.ts` to import new timing functions
- [ ] Replace `calculateBasicWordTimings()` usage with phoneme-weighted version
- [ ] Add fallback to character-weighted when no phonemes
- [ ] Ensure backward compatibility with existing chunk streaming
- [ ] Test with both Kokoro and Web Speech fallback

### Task 5: Write Unit Tests
**AC: 1, 2, 3, 4, 5**
- [ ] Create `lib/phoneme-timing.test.ts`
- [ ] Test `countPhonemes()` with various IPA strings
- [ ] Test `splitPhonemesByWord()` edge cases
- [ ] Test `tokenizeWords()` with punctuation
- [ ] Test `isSentenceEnd()` detection
- [ ] Test `calculatePhonemeWeightedTimings()` distribution
- [ ] Test `calculateCharacterWeightedTimings()` fallback
- [ ] Run tests: `bun test`

### Task 6: Manual Testing
**AC: 2, 3, 5**
- [ ] Test with short sentence (1-5 words)
- [ ] Test with long paragraph (multiple sentences)
- [ ] Verify timing resets at sentence boundaries
- [ ] Compare timing accuracy vs spoken audio (subjective ~90% accuracy)
- [ ] Test with Web Speech fallback

---

## Definition of Done

- [ ] `lib/phoneme-timing.ts` module created with all timing functions
- [ ] Phoneme counting excludes stress/length marks correctly
- [ ] Sentence boundary reset prevents timing drift
- [ ] Character-weighted fallback works when phonemes unavailable
- [ ] `tts-engine.ts` uses new timing functions
- [ ] Unit tests pass for all timing functions
- [ ] Timing achieves ~90% subjective accuracy
- [ ] No TypeScript errors
- [ ] Console logs show phoneme counts for debugging

---

## Dependencies

### Depends On
- Story 2-3: Kokoro TTS integration (provides phoneme output)
- Story 2-4: TTS fallback chain (Web Speech API compatibility)
- Story 1-3: Message protocol (`WordTiming` interface)

### Enables
- Story 2-6: Word Highlighting with Synchronized Scrolling
- Story 2-7: Basic Playback Controls (timing data for position display)

---

## Test Scenarios

### Manual Testing Checklist

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| Short sentence | Generate TTS for "Hello world" | Both words timed, "Hello" ~= "world" duration |
| Long word | Generate TTS for "I love phenomenologically" | "phenomenologically" gets significantly more time |
| Multiple sentences | Generate TTS for "Hello. World." | Timing resets at period, no drift |
| Punctuation | Generate TTS for "Hello, world!" | Punctuation attached to words correctly |
| Web Speech | Trigger Web Speech fallback | Character-weighted timing used |

### Console Log Expectations

```
[SimpleReader] Generating speech: { textLength: 50, voice: 'af_heart', speed: 1 }
[SimpleReader] Generated chunk 1: 48000 samples (2.00s)
[SimpleReader] Word timing: "Hello" = 4 phonemes
[SimpleReader] Word timing: "world" = 4 phonemes
[SimpleReader] Sentence boundary at word 1, resetting accumulation
```

### Unit Test Cases Summary

| Test Case | Description |
|-----------|-------------|
| countPhonemes basic | Counts h, ə, l, oʊ correctly |
| countPhonemes stress | Ignores ˈ and ˌ marks |
| countPhonemes length | Ignores : mark |
| splitPhonemesByWord | Splits "a b c" to ["a", "b", "c"] |
| tokenizeWords punctuation | "Hello, world!" -> ["Hello,", "world!"] |
| isSentenceEnd detection | Detects `.`, `!`, `?` only |
| phoneme-weighted distribution | Longer words get more time |
| sentence boundary reset | Timing resets at sentence end |
| character-weighted fallback | Works without phoneme data |

---

## References

- [Source: docs/architecture.md#Word Timing Strategy] - FR17, ARCH-16
- [Source: docs/epics.md#Story 2.5] - Original story definition
- [Source: lib/messages.ts] - WordTiming interface
- [Source: entrypoints/offscreen/tts-engine.ts] - Current basic timing implementation
- [kokoro-js documentation](https://npm.io/package/kokoro-js) - Phoneme output format
- [IPA symbols reference](https://en.wikipedia.org/wiki/International_Phonetic_Alphabet) - Phoneme characters

---

## Dev Notes

### Phoneme Output Format

Kokoro-js returns phonemes as IPA strings. Example outputs:
- "Hello world" -> "həˈloʊ wˈɜːld"
- "The quick brown fox" -> "ðə kwɪk braʊn fɑks"

Key observations:
1. Words separated by spaces
2. Stress marks (ˈ ˌ) indicate syllable stress, not duration
3. Length marks (:) indicate long vowels
4. Digraphs (oʊ, aɪ) are two characters but one phoneme sound

### IPA Characters to Ignore

These marks affect pronunciation quality but not duration:
- ˈ (primary stress)
- ˌ (secondary stress)
- : or ː (long vowel)
- ˑ (half-long)
- Various diacritics (̃ ̥ ̊ etc.)

### Sentence Boundary Strategy

Resetting at sentence boundaries:
1. Prevents small timing errors from accumulating
2. Natural pause at sentence end absorbs any drift
3. Each sentence is independently timed

Trade-off: May cause slight discontinuity at sentence boundaries, but this is acceptable for MVP and matches natural speech pauses.

### Future Improvements (Post-MVP)

- True forced alignment using audio features
- Learn average phoneme durations from corpus data
- Account for speaking rate variations within sentences
- Handle code blocks and numbers specially

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

### File List

- `lib/phoneme-timing.ts` (new: phoneme-weighted timing calculation)
- `lib/phoneme-timing.test.ts` (new: unit tests)
- `entrypoints/offscreen/tts-engine.ts` (update: use new timing functions)
