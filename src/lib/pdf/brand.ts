import { rgb } from 'pdf-lib';
import logoUrl from '@/assets/al-hamra-logo.png';
import arabicFontUrl from '@/assets/fonts/NotoKufiArabic-Regular.ttf?url';

/**
 * Al Hamra identity for the generated PDFs, matching the tokens in index.css:
 *   Primary red  #CD1719   brand identifier — used sparingly, for accents
 *   Sub-grey     #B2B2B2   borders and dividers
 *   Charcoal     #1D1D1B   text (avoided in large fills)
 *   Light grey   #EDEDED   surfaces and muted backgrounds
 *
 * Per brand direction black is used sparingly and backgrounds stay white, so the
 * red reads as an accent rather than one of several competing heavy colours.
 */
export const BRAND = {
  RED: rgb(0xcd / 255, 0x17 / 255, 0x19 / 255),
  SUBGREY: rgb(0xb2 / 255, 0xb2 / 255, 0xb2 / 255),
  CHARCOAL: rgb(0x1d / 255, 0x1d / 255, 0x1b / 255),
  LIGHTGREY: rgb(0xed / 255, 0xed / 255, 0xed / 255),
  WHITE: rgb(1, 1, 1),
  // Status colours — kept outside the identity palette, they carry meaning.
  GREEN: rgb(0.09, 0.55, 0.24),
  AMBER: rgb(0.80, 0.56, 0.05),
} as const;

export interface PdfAssets {
  /** Al Hamra logo bytes (PNG) for the masthead. */
  logo?: Uint8Array;
  /** Noto Kufi Arabic — the brand's Arabic face, for the bilingual labels. */
  arabicFont?: Uint8Array;
}

let cached: Promise<PdfAssets> | null = null;

async function grab(url: string): Promise<Uint8Array | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return undefined;
  }
}

/**
 * Load the logo + Arabic font once per session. Both are optional: if either
 * fails the renderers degrade (no logo / English-only) rather than throwing,
 * because a missing decoration must never block a permit PDF.
 *
 * Kept out of the renderers themselves so those stay free of app imports and
 * can be lifted into the generate-permit-pdf edge function unchanged — there
 * the same bytes get supplied from the function's own bundle.
 */
export function loadPdfAssets(): Promise<PdfAssets> {
  if (!cached) {
    cached = (async () => {
      const [logo, arabicFont] = await Promise.all([grab(logoUrl), grab(arabicFontUrl)]);
      return { logo, arabicFont };
    })();
  }
  return cached;
}
