import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  isValidLanguageCode,
  getClarificationQuestion,
  FALLBACK_QUESTIONS,
} from '../../src/classifier/localization.js';

describe('detectLanguage', () => {
  it('returns "en" for English text', () => {
    expect(detectLanguage('The quick brown fox jumps over the lazy dog')).toBe('en');
  });

  it('returns "es" for Spanish text', () => {
    expect(detectLanguage('El perro está en la casa con los gatos')).toBe('es');
  });

  it('returns "fr" for French text with accented characters', () => {
    expect(detectLanguage('Le château est très beau avec les élèves français')).toBe('fr');
  });

  it('returns "de" for German text', () => {
    expect(detectLanguage('Der Hund ist in der Küche und ist sehr groß')).toBe('de');
  });

  it('returns "ja" for Japanese text', () => {
    expect(detectLanguage('こんにちは世界')).toBe('ja');
  });

  it('detects CJK characters (ja/zh shared range)', () => {
    const lang = detectLanguage('你好世界');
    expect(['ja', 'zh']).toContain(lang);
  });

  it('returns "ko" for Korean text', () => {
    expect(detectLanguage('안녕하세요 세계')).toBe('ko');
  });

  it('returns "ar" for Arabic text', () => {
    expect(detectLanguage('مرحبا بالعالم')).toBe('ar');
  });

  it('returns "ru" for Russian text', () => {
    expect(detectLanguage('Привет мир')).toBe('ru');
  });

  it('returns default for empty string', () => {
    expect(detectLanguage('')).toBe('en');
  });

  it('returns default for whitespace-only string', () => {
    expect(detectLanguage('   ')).toBe('en');
  });
});

describe('isValidLanguageCode', () => {
  it('returns true for supported language codes', () => {
    expect(isValidLanguageCode('en')).toBe(true);
    expect(isValidLanguageCode('es')).toBe(true);
    expect(isValidLanguageCode('ja')).toBe(true);
  });

  it('returns false for unsupported language codes', () => {
    expect(isValidLanguageCode('xx')).toBe(false);
    expect(isValidLanguageCode('')).toBe(false);
    expect(isValidLanguageCode('EN')).toBe(false);
  });
});

describe('getClarificationQuestion', () => {
  it('returns question for supported language', () => {
    const q = getClarificationQuestion('en');
    expect(q).toContain('more details');
  });

  it('returns question for Spanish', () => {
    const q = getClarificationQuestion('es');
    expect(q).toContain('detalles');
  });

  it('falls back to English for unsupported language', () => {
    const q = getClarificationQuestion('xx');
    expect(q).toBe(FALLBACK_QUESTIONS.en);
  });
});

describe('FALLBACK_QUESTIONS', () => {
  it('has entries for all supported languages', () => {
    const keys = Object.keys(FALLBACK_QUESTIONS);
    expect(keys.length).toBeGreaterThan(10);
    for (const [, value] of Object.entries(FALLBACK_QUESTIONS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
