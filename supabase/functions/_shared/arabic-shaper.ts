/**
 * Inline Arabic shaper + simple bidi reverser. Zero runtime deps.
 *
 * Why this exists: the previous implementation relied on
 *   - arabic-reshaper@1.1.0 (esm.sh)
 *   - bidi-js@1.0.3 (esm.sh)
 * Both consistently fail to import in the Supabase Edge (Deno) runtime,
 * which produced PDFs with disconnected Arabic letters in logical
 * (LTR) order — exactly the failure mode the user reported.
 *
 * What this module does:
 *   1. shapeArabicInline(text): walks the codepoints, picks the
 *      Arabic Presentation Form (FE70–FEFF) for each letter based on
 *      its joining type and the joining behaviour of its neighbours,
 *      collapses LAM+ALEF into the proper ligature, then reverses the
 *      result so it draws visually right-to-left while keeping any
 *      embedded Latin/European-digit runs in their original internal
 *      order (simplified UAX#9 bidi for a single base-RTL line).
 *
 * Covers the common modern Arabic letter range used in the bilingual
 * labels. Tashkeel/marks (U+064B–065F, U+0670) are treated as
 * transparent (do not break joining, drawn at original position before
 * the consonant they decorate after reversal).
 */

type JoinType = "R" | "L" | "D" | "U" | "T"; // Right, Left, Dual, non-join, Transparent

// Joining type table for U+0600–06FF (only entries we care about).
// All other codepoints default to "U" (non-joining) handled by the lookup miss.
const JOIN_TYPE: Record<number, JoinType> = {
  0x0621: "U", // HAMZA
  0x0622: "R", // ALEF WITH MADDA ABOVE
  0x0623: "R", // ALEF WITH HAMZA ABOVE
  0x0624: "R", // WAW WITH HAMZA
  0x0625: "R", // ALEF WITH HAMZA BELOW
  0x0626: "D", // YEH WITH HAMZA
  0x0627: "R", // ALEF
  0x0628: "D", // BEH
  0x0629: "R", // TEH MARBUTA
  0x062A: "D", // TEH
  0x062B: "D", // THEH
  0x062C: "D", // JEEM
  0x062D: "D", // HAH
  0x062E: "D", // KHAH
  0x062F: "R", // DAL
  0x0630: "R", // THAL
  0x0631: "R", // REH
  0x0632: "R", // ZAIN
  0x0633: "D", // SEEN
  0x0634: "D", // SHEEN
  0x0635: "D", // SAD
  0x0636: "D", // DAD
  0x0637: "D", // TAH
  0x0638: "D", // ZAH
  0x0639: "D", // AIN
  0x063A: "D", // GHAIN
  0x0640: "D", // TATWEEL
  0x0641: "D", // FEH
  0x0642: "D", // QAF
  0x0643: "D", // KAF
  0x0644: "D", // LAM
  0x0645: "D", // MEEM
  0x0646: "D", // NOON
  0x0647: "D", // HEH
  0x0648: "R", // WAW
  0x0649: "D", // ALEF MAKSURA
  0x064A: "D", // YEH
};

// Tashkeel / harakat are transparent (don't break joining).
function isTransparent(cp: number): boolean {
  return (cp >= 0x064B && cp <= 0x065F) || cp === 0x0670 ||
         (cp >= 0x06D6 && cp <= 0x06ED);
}

// Presentation forms: [isolated, final, initial, medial]
// `0` means "form does not exist" — fall back to isolated/final.
const FORMS: Record<number, [number, number, number, number]> = {
  0x0621: [0xFE80, 0, 0, 0],
  0x0622: [0xFE81, 0xFE82, 0, 0],
  0x0623: [0xFE83, 0xFE84, 0, 0],
  0x0624: [0xFE85, 0xFE86, 0, 0],
  0x0625: [0xFE87, 0xFE88, 0, 0],
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C],
  0x0627: [0xFE8D, 0xFE8E, 0, 0],
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92],
  0x0629: [0xFE93, 0xFE94, 0, 0],
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98],
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C],
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8],
  0x062F: [0xFEA9, 0xFEAA, 0, 0],
  0x0630: [0xFEAB, 0xFEAC, 0, 0],
  0x0631: [0xFEAD, 0xFEAE, 0, 0],
  0x0632: [0xFEAF, 0xFEB0, 0, 0],
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8],
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0],
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4],
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8],
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0],
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC],
  0x0648: [0xFEED, 0xFEEE, 0, 0],
  0x0649: [0xFEEF, 0xFEF0, 0, 0],
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
};

// LAM (0644) + ALEF-variant → ligature [isolated, final]
const LAM_ALEF_LIG: Record<number, [number, number]> = {
  0x0622: [0xFEF5, 0xFEF6], // LAM + ALEF MADDA
  0x0623: [0xFEF7, 0xFEF8], // LAM + ALEF HAMZA-ABOVE
  0x0625: [0xFEF9, 0xFEFA], // LAM + ALEF HAMZA-BELOW
  0x0627: [0xFEFB, 0xFEFC], // LAM + ALEF
};

function joinType(cp: number): JoinType {
  return JOIN_TYPE[cp] ?? "U";
}

/** Can this letter join to the letter on its LEFT in logical order (i.e. next char)? */
function joinsLeft(jt: JoinType): boolean {
  return jt === "D" || jt === "L";
}
/** Can this letter join to the letter on its RIGHT in logical order (i.e. previous char)? */
function joinsRight(jt: JoinType): boolean {
  return jt === "D" || jt === "R";
}

/**
 * Shape an Arabic string and return it in VISUAL order (right-to-left
 * letters are reversed so pdf-lib draws them correctly left-to-right).
 * Latin / European-digit runs embedded in the string keep their
 * internal order (simple base-RTL bidi).
 */
export function shapeArabicInline(input: string): string {
  if (!input) return input;

  // Step 1: codepoint array
  const cps: number[] = [];
  for (const ch of input) cps.push(ch.codePointAt(0)!);

  // Step 2: collapse LAM (0644) + ALEF-variant into ligature placeholders.
  // We use negative sentinels to mark ligatures so they survive shape lookup.
  // Placeholder cp = 0xF000 + alefVariantIndex (0..3) — purely internal.
  const LIG_BASE = 0xF000;
  const LIG_VARIANTS = [0x0622, 0x0623, 0x0625, 0x0627];
  const merged: number[] = [];
  for (let i = 0; i < cps.length; i++) {
    const cur = cps[i];
    const next = cps[i + 1];
    if (cur === 0x0644 && next !== undefined && LIG_VARIANTS.includes(next)) {
      merged.push(LIG_BASE + LIG_VARIANTS.indexOf(next));
      i++; // consume alef
    } else {
      merged.push(cur);
    }
  }

  // Step 3: for each Arabic codepoint, pick its presentation form.
  // Transparent marks (tashkeel) are passed through and do not affect joining.
  const shaped: number[] = [];
  for (let i = 0; i < merged.length; i++) {
    const cp = merged[i];

    // Ligature placeholder
    if (cp >= LIG_BASE && cp < LIG_BASE + 4) {
      // LAM+ALEF: behaves like ALEF (R) — joins previous only.
      // Find prev non-transparent.
      let prev = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (!isTransparent(merged[j])) { prev = merged[j]; break; }
      }
      const prevJoinsLeft = prev > 0 && prev < LIG_BASE && joinsLeft(joinType(prev));
      const [iso, fin] = [
        [0xFEF5, 0xFEF6],
        [0xFEF7, 0xFEF8],
        [0xFEF9, 0xFEFA],
        [0xFEFB, 0xFEFC],
      ][cp - LIG_BASE];
      shaped.push(prevJoinsLeft ? fin : iso);
      continue;
    }

    if (isTransparent(cp)) {
      shaped.push(cp);
      continue;
    }

    const forms = FORMS[cp];
    if (!forms) {
      // Non-Arabic char (Latin, digit, space, punctuation, Arabic-Indic digit, etc.) — keep as-is.
      shaped.push(cp);
      continue;
    }

    // Find prev / next NON-TRANSPARENT codepoints.
    let prev = -1, next = -1;
    for (let j = i - 1; j >= 0; j--) {
      const c = merged[j];
      if (!isTransparent(c)) { prev = c; break; }
    }
    for (let j = i + 1; j < merged.length; j++) {
      const c = merged[j];
      if (!isTransparent(c)) { next = c; break; }
    }

    const jt = joinType(cp);
    const canJoinPrev = joinsRight(jt) && prev > 0 &&
      (prev >= LIG_BASE ? false : joinsLeft(joinType(prev)));
    const canJoinNext = joinsLeft(jt) && next > 0 &&
      (next >= LIG_BASE ? joinsRight("R") /* alef-like */ : joinsRight(joinType(next)));

    // forms = [isolated, final, initial, medial]
    let chosen: number;
    if (canJoinPrev && canJoinNext && forms[3]) chosen = forms[3];      // medial
    else if (canJoinPrev && forms[1]) chosen = forms[1];                 // final
    else if (canJoinNext && forms[2]) chosen = forms[2];                 // initial
    else chosen = forms[0];                                              // isolated

    shaped.push(chosen);
  }

  // Step 4: simple base-RTL bidi reversal.
  // Reverse the whole sequence, but within each run of Latin letters /
  // European digits / common neutrals between Latin chars, re-reverse so
  // those substrings stay readable.
  const isLatinish = (cp: number) =>
    (cp >= 0x0030 && cp <= 0x0039) || // 0-9
    (cp >= 0x0041 && cp <= 0x005A) || // A-Z
    (cp >= 0x0061 && cp <= 0x007A);   // a-z

  const reversed = shaped.slice().reverse();
  // Re-reverse Latin runs in place.
  let i = 0;
  while (i < reversed.length) {
    if (isLatinish(reversed[i])) {
      let j = i;
      while (j < reversed.length && isLatinish(reversed[j])) j++;
      // reverse reversed[i..j)
      const sub = reversed.slice(i, j).reverse();
      for (let k = 0; k < sub.length; k++) reversed[i + k] = sub[k];
      i = j;
    } else {
      i++;
    }
  }

  // Step 5: codepoints → string
  return String.fromCodePoint(...reversed);
}
