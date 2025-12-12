// lib/phoneme-timing.test.ts
// Unit tests for phoneme-weighted timing calculation

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  tokenizeText,
  splitPhonemesByWord,
  isSentenceEnd,
  countPhonemes,
  estimatePhonemeCount,
  calculatePhonemeWeightedTimings,
  calculateCharacterWeightedTimings,
  calculateWordTimings,
} from './phoneme-timing';

// Suppress console.log during tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('phoneme-timing', () => {
  // ============================================
  // tokenizeText
  // ============================================
  describe('tokenizeText', () => {
    it('splits on whitespace', () => {
      expect(tokenizeText('hello world')).toEqual(['hello', 'world']);
    });

    it('preserves punctuation attached to words', () => {
      expect(tokenizeText('Hello, world!')).toEqual(['Hello,', 'world!']);
    });

    it('handles multiple spaces', () => {
      expect(tokenizeText('hello   world')).toEqual(['hello', 'world']);
    });

    it('handles leading/trailing whitespace', () => {
      expect(tokenizeText('  hello world  ')).toEqual(['hello', 'world']);
    });

    it('handles tabs and newlines', () => {
      expect(tokenizeText('hello\tworld\nfoo')).toEqual(['hello', 'world', 'foo']);
    });

    it('returns empty array for empty string', () => {
      expect(tokenizeText('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(tokenizeText('   ')).toEqual([]);
    });

    it('handles single word', () => {
      expect(tokenizeText('hello')).toEqual(['hello']);
    });

    it('preserves contractions', () => {
      expect(tokenizeText("don't won't")).toEqual(["don't", "won't"]);
    });

    it('preserves hyphenated words', () => {
      expect(tokenizeText('well-known state-of-the-art')).toEqual(['well-known', 'state-of-the-art']);
    });
  });

  // ============================================
  // splitPhonemesByWord
  // ============================================
  describe('splitPhonemesByWord', () => {
    it('splits on spaces', () => {
      expect(splitPhonemesByWord('hello world')).toEqual(['hello', 'world']);
    });

    it('handles multiple spaces', () => {
      expect(splitPhonemesByWord('hello   world')).toEqual(['hello', 'world']);
    });

    it('handles empty string', () => {
      expect(splitPhonemesByWord('')).toEqual([]);
    });

    it('splits IPA phoneme string', () => {
      expect(splitPhonemesByWord("h\u0259\u02c8lo\u028a w\u02c8\u025c\u02d0ld")).toEqual([
        "h\u0259\u02c8lo\u028a",
        "w\u02c8\u025c\u02d0ld",
      ]);
    });
  });

  // ============================================
  // isSentenceEnd
  // ============================================
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

    it('detects multiple punctuation', () => {
      expect(isSentenceEnd('what?!')).toBe(true);
      expect(isSentenceEnd('wow...')).toBe(true);
    });

    it('rejects comma', () => {
      expect(isSentenceEnd('world,')).toBe(false);
    });

    it('rejects no punctuation', () => {
      expect(isSentenceEnd('world')).toBe(false);
    });

    it('rejects colon and semicolon', () => {
      expect(isSentenceEnd('word:')).toBe(false);
      expect(isSentenceEnd('word;')).toBe(false);
    });
  });

  // ============================================
  // countPhonemes
  // ============================================
  describe('countPhonemes', () => {
    it('counts basic phonemes', () => {
      // "hello" -> h, e, l, l, o = 5
      expect(countPhonemes('helo')).toBe(4);
    });

    it('ignores primary stress mark', () => {
      // With stress mark: should ignore it
      // Note: We count characters not true phonemes, so o and u are separate (5 chars)
      expect(countPhonemes("h\u0259\u02c8lo\u028a")).toBe(5); // h, schwa, l, o, u - stress mark ignored
    });

    it('ignores secondary stress mark', () => {
      // Note: We count characters not true phonemes
      expect(countPhonemes("\u02cch\u0259lo\u028a")).toBe(5); // h, schwa, l, o, u - stress mark ignored
    });

    it('ignores length marks', () => {
      // w, e:, l, d -> with : = 4 phonemes, : is ignored
      expect(countPhonemes("w\u025c\u02d0ld")).toBe(4); // w, e, l, d - length mark ignored
    });

    it('handles empty string', () => {
      expect(countPhonemes('')).toBe(0);
    });

    it('handles undefined/null', () => {
      expect(countPhonemes(null as unknown as string)).toBe(0);
      expect(countPhonemes(undefined as unknown as string)).toBe(0);
    });

    it('counts complex IPA correctly', () => {
      // Test with various IPA characters
      expect(countPhonemes("\u00f0\u0259")).toBe(2); // the -> 2 phonemes
    });
  });

  // ============================================
  // estimatePhonemeCount
  // ============================================
  describe('estimatePhonemeCount', () => {
    it('estimates based on character count', () => {
      // "hello" = 5 chars * 0.7 = 3.5 -> 4 (rounded)
      expect(estimatePhonemeCount('hello')).toBe(4);
    });

    it('strips punctuation before counting', () => {
      expect(estimatePhonemeCount('hello,')).toBe(4);
      expect(estimatePhonemeCount('world!')).toBe(4);
    });

    it('returns minimum 1 for short words', () => {
      expect(estimatePhonemeCount('a')).toBe(1);
      expect(estimatePhonemeCount('I')).toBe(1);
    });

    it('handles empty word', () => {
      expect(estimatePhonemeCount('')).toBe(1); // minimum is 1
    });
  });

  // ============================================
  // calculatePhonemeWeightedTimings
  // ============================================
  describe('calculatePhonemeWeightedTimings', () => {
    it('distributes time by phoneme count', () => {
      const words = ['I', 'love', 'programming'];
      const phonemes = "a\u026a l\u028cv \u02c8pro\u028a\u0261r\u00e6m\u026a\u014b"; // ai, lav, programming

      const timings = calculatePhonemeWeightedTimings(words, phonemes, 1000, 0);

      expect(timings).toHaveLength(3);
      expect(timings[0].word).toBe('I');
      expect(timings[1].word).toBe('love');
      expect(timings[2].word).toBe('programming');

      // "programming" should get more time than "I"
      const iDuration = timings[0].endTime - timings[0].startTime;
      const programmingDuration = timings[2].endTime - timings[2].startTime;
      expect(programmingDuration).toBeGreaterThan(iDuration);
    });

    it('returns WordTiming interface compliant objects', () => {
      const timings = calculatePhonemeWeightedTimings(['hello'], 'helo', 1000, 0);

      expect(timings[0]).toHaveProperty('word');
      expect(timings[0]).toHaveProperty('startTime');
      expect(timings[0]).toHaveProperty('endTime');
      expect(timings[0]).toHaveProperty('index');
      expect(typeof timings[0].startTime).toBe('number');
      expect(typeof timings[0].endTime).toBe('number');
    });

    it('handles empty words array', () => {
      const timings = calculatePhonemeWeightedTimings([], '', 1000, 0);
      expect(timings).toHaveLength(0);
    });

    it('applies sample offset correctly', () => {
      const timings = calculatePhonemeWeightedTimings(['hello'], 'helo', 1000, 500);

      expect(timings[0].startTime).toBe(500);
      expect(timings[0].endTime).toBe(1500);
    });

    it('handles sentence boundaries', () => {
      const words = ['Hello.', 'World.'];
      const phonemes = 'helo werld';

      const timings = calculatePhonemeWeightedTimings(words, phonemes, 2000, 0);

      expect(timings).toHaveLength(2);
      // Verify timing covers full duration
      expect(timings[0].startTime).toBe(0);
      expect(timings[1].endTime).toBeCloseTo(2000, 0);
    });

    it('falls back to character estimation when phonemes missing', () => {
      const words = ['hello', 'world', 'extra'];
      const phonemes = 'helo werld'; // Only 2 phoneme groups for 3 words

      const timings = calculatePhonemeWeightedTimings(words, phonemes, 1000, 0);

      expect(timings).toHaveLength(3);
      // Third word should still have timing (using fallback)
      expect(timings[2].word).toBe('extra');
      expect(timings[2].endTime - timings[2].startTime).toBeGreaterThan(0);
    });

    it('handles single word', () => {
      const timings = calculatePhonemeWeightedTimings(['hello'], 'helo', 1000, 0);

      expect(timings).toHaveLength(1);
      expect(timings[0].word).toBe('hello');
      expect(timings[0].startTime).toBe(0);
      expect(timings[0].endTime).toBe(1000);
      expect(timings[0].index).toBe(0);
    });
  });

  // ============================================
  // calculateCharacterWeightedTimings
  // ============================================
  describe('calculateCharacterWeightedTimings', () => {
    it('distributes time by character count', () => {
      const words = ['I', 'love', 'programming'];

      const timings = calculateCharacterWeightedTimings(words, 1000, 0);

      expect(timings).toHaveLength(3);

      // "programming" (11 chars) should get more time than "I" (1 char)
      const iDuration = timings[0].endTime - timings[0].startTime;
      const programmingDuration = timings[2].endTime - timings[2].startTime;
      expect(programmingDuration).toBeGreaterThan(iDuration);
    });

    it('returns empty array for empty words', () => {
      expect(calculateCharacterWeightedTimings([], 1000, 0)).toHaveLength(0);
    });

    it('applies start offset', () => {
      const timings = calculateCharacterWeightedTimings(['hello'], 1000, 500);

      expect(timings[0].startTime).toBe(500);
      expect(timings[0].endTime).toBe(1500);
    });

    it('strips punctuation for weight calculation', () => {
      const withPunctuation = calculateCharacterWeightedTimings(['hello,', 'world!'], 1000, 0);
      const withoutPunctuation = calculateCharacterWeightedTimings(['hello', 'world'], 1000, 0);

      // Durations should be equal since punctuation is stripped
      const duration1 = withPunctuation[0].endTime - withPunctuation[0].startTime;
      const duration2 = withoutPunctuation[0].endTime - withoutPunctuation[0].startTime;
      expect(duration1).toBe(duration2);
    });

    it('handles single character words', () => {
      const timings = calculateCharacterWeightedTimings(['a', 'I'], 1000, 0);

      expect(timings).toHaveLength(2);
      // Both words have 1 char, should get equal time
      const aDuration = timings[0].endTime - timings[0].startTime;
      const iDuration = timings[1].endTime - timings[1].startTime;
      expect(aDuration).toBe(iDuration);
    });
  });

  // ============================================
  // calculateWordTimings (combined function)
  // ============================================
  describe('calculateWordTimings', () => {
    it('uses phoneme-weighted when phonemes available', () => {
      const timings = calculateWordTimings('hello world', 'helo werld', 0, 24000, 24000);

      expect(timings).toHaveLength(2);
      expect(timings[0].word).toBe('hello');
      expect(timings[1].word).toBe('world');
    });

    it('falls back to character-weighted when no phonemes', () => {
      const timings = calculateWordTimings('hello world', '', 0, 24000, 24000);

      expect(timings).toHaveLength(2);
    });

    it('falls back for undefined phonemes', () => {
      const timings = calculateWordTimings('hello world', undefined, 0, 24000, 24000);

      expect(timings).toHaveLength(2);
    });

    it('calculates correct duration from samples', () => {
      // 24000 samples at 24000Hz = 1 second = 1000ms
      const timings = calculateWordTimings('hello', 'helo', 0, 24000, 24000);

      expect(timings[0].endTime - timings[0].startTime).toBeCloseTo(1000, 0);
    });

    it('applies sample offset correctly', () => {
      // 24000 samples offset at 24000Hz = 1000ms offset
      const timings = calculateWordTimings('hello', 'helo', 24000, 24000, 24000);

      expect(timings[0].startTime).toBeCloseTo(1000, 0);
      expect(timings[0].endTime).toBeCloseTo(2000, 0);
    });

    it('returns empty array for empty text', () => {
      expect(calculateWordTimings('', '', 0, 24000, 24000)).toHaveLength(0);
      expect(calculateWordTimings('   ', '', 0, 24000, 24000)).toHaveLength(0);
    });
  });

  // ============================================
  // Edge Cases & Integration
  // ============================================
  describe('edge cases', () => {
    it('handles very long words', () => {
      const words = ['pneumonoultramicroscopicsilicovolcanoconiosis'];
      const timings = calculateCharacterWeightedTimings(words, 5000, 0);

      expect(timings[0].endTime - timings[0].startTime).toBe(5000);
    });

    it('handles contractions in both functions', () => {
      const words = ["don't", "won't", "can't"];
      const phonemes = "do\u028ant wo\u028ant k\u00e6nt";

      const phonemeTimings = calculatePhonemeWeightedTimings(words, phonemes, 1000, 0);
      const charTimings = calculateCharacterWeightedTimings(words, 1000, 0);

      expect(phonemeTimings).toHaveLength(3);
      expect(charTimings).toHaveLength(3);
    });

    it('maintains sequential indices', () => {
      const words = ['a', 'b', 'c', 'd', 'e'];
      const timings = calculateCharacterWeightedTimings(words, 1000, 0);

      for (let i = 0; i < timings.length; i++) {
        expect(timings[i].index).toBe(i);
      }
    });

    it('endTime of one word equals startTime of next', () => {
      const words = ['hello', 'beautiful', 'world'];
      const timings = calculateCharacterWeightedTimings(words, 1000, 0);

      for (let i = 0; i < timings.length - 1; i++) {
        expect(timings[i].endTime).toBeCloseTo(timings[i + 1].startTime, 10);
      }
    });
  });
});
