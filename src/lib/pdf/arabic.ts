import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

/**
 * Prepare an Arabic (or mixed) string for pdf-lib + fontkit.
 *
 * fontkit already does the hard parts inside `drawText`: it applies the
 * OpenType Arabic shaper (contextual initial/medial/final forms, lam-alef
 * ligature) and lays the run out right-to-left. Pre-shaping into legacy
 * Presentation Forms-B, or reordering the string first, fights that and comes
 * out wrong — verified against both.
 *
 * The one thing fontkit gets wrong is embedded left-to-right runs: it reverses
 * digits and Latin words along with everything else, so "2210" prints as "0122"
 * and a date as "6202/70/72". We find those runs with the Unicode bidi
 * algorithm and pre-reverse them, so fontkit's flip restores the correct order.
 *
 * Latin-only strings are returned untouched.
 */
export function ar(text: string): string {
  if (!text || !/[؀-ۿ]/.test(text)) return text ?? '';

  const { levels } = bidi.getEmbeddingLevels(text, 'rtl');

  // Group into runs of equal embedding level; even = LTR (digits/Latin).
  const runs: { level: number; text: string }[] = [];
  for (let i = 0; i < text.length; i++) {
    const level = levels[i];
    const last = runs[runs.length - 1];
    if (last && last.level === level) last.text += text[i];
    else runs.push({ level, text: text[i] });
  }

  // Keep logical run order — fontkit reorders — but flip each LTR run's chars.
  return runs
    .map((r) => (r.level % 2 === 0 ? [...r.text].reverse().join('') : r.text))
    .join('');
}

/** True when the string contains Arabic and must be drawn with the Arabic font. */
export const hasArabic = (s?: string) => !!s && /[؀-ۿ]/.test(s);
