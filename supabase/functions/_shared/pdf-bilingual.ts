/**
 * Shared helpers for bilingual PDF rendering (Phase 4b).
 *
 * pdf-lib renders Latin text out of the box but cannot natively shape or
 * bidi-reorder Arabic. To produce legible Arabic in a PDF you need:
 *
 *   1. A font containing Arabic glyphs (StandardFonts.Helvetica does NOT)
 *   2. The text "shaped" — Arabic letters change form depending on
 *      neighbours (initial / medial / final / isolated). Without
 *      shaping, every word is a string of disconnected glyphs.
 *   3. Bidirectional reordering — Arabic reads right-to-left, but
 *      Latin numerals and words inside Arabic prose read left-to-right.
 *
 * This module provides:
 *   - loadArabicFont(pdfDoc): fetches Noto Kufi Arabic from a CDN and
 *     embeds it. Cold-start cost is one HTTP fetch (~400KB). Subsequent
 *     calls within the same function instance reuse the embedded font.
 *   - drawArabic(page, text, x, y, opts): shapes the text and draws it
 *     right-aligned at x (since Arabic anchors from the right edge).
 *
 * Failure mode: if font fetch or shaping fails, drawArabic logs the
 * error and silently skips the text rather than crashing the PDF
 * generation. An English-only PDF beats a missing PDF.
 */

import type { PDFDocument, PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { rgb } from "https://esm.sh/pdf-lib@1.17.1";

// Noto Kufi Arabic Regular TTF, served by jsdelivr from the @fontsource
// package (a canonical, mirrored source for Google Fonts as TTF).
const NOTO_KUFI_ARABIC_TTF_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-kufi-arabic@5.0.13/files/noto-kufi-arabic-arabic-400-normal.ttf";

const NOTO_KUFI_ARABIC_BOLD_TTF_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-kufi-arabic@5.0.13/files/noto-kufi-arabic-arabic-700-normal.ttf";

// Cache the fetched TTF bytes between cold starts within the same
// function instance. Saves ~400KB per invocation after the first.
let _cachedRegularTtf: Uint8Array | null = null;
let _cachedBoldTtf: Uint8Array | null = null;

export interface ArabicFontPair {
  regular: PDFFont;
  bold: PDFFont;
}

/**
 * Loads and embeds Noto Kufi Arabic (regular + bold) into the given
 * PDFDocument. Returns null on any failure — caller should fall back
 * to English-only rendering when null.
 */
export async function loadArabicFont(
  pdfDoc: PDFDocument,
): Promise<ArabicFontPair | null> {
  try {
    if (!_cachedRegularTtf) {
      const r = await fetch(NOTO_KUFI_ARABIC_TTF_URL);
      if (!r.ok) throw new Error(`font fetch ${r.status}`);
      _cachedRegularTtf = new Uint8Array(await r.arrayBuffer());
    }
    if (!_cachedBoldTtf) {
      const r = await fetch(NOTO_KUFI_ARABIC_BOLD_TTF_URL);
      if (!r.ok) throw new Error(`bold font fetch ${r.status}`);
      _cachedBoldTtf = new Uint8Array(await r.arrayBuffer());
    }

    // pdf-lib needs fontkit to embed custom TTFs; register it on the doc.
    // Lazily imported because not every PDF function will need it.
    const { default: fontkit } = await import("https://esm.sh/@pdf-lib/fontkit@1.1.1");
    pdfDoc.registerFontkit(fontkit);

    const regular = await pdfDoc.embedFont(_cachedRegularTtf, { subset: true });
    const bold    = await pdfDoc.embedFont(_cachedBoldTtf,    { subset: true });
    return { regular, bold };
  } catch (err) {
    console.error("loadArabicFont failed:", err);
    return null;
  }
}

/**
 * Lazily-imported shapers. Imports are cached per cold start.
 * arabic-reshaper handles contextual letterform substitution.
 * bidi-js handles right-to-left reordering and embedded LTR runs.
 */
let _reshaper: ((text: string) => string) | null = null;
let _bidiReorder: ((text: string) => string) | null = null;

async function getShapers(): Promise<void> {
  if (_reshaper && _bidiReorder) return;

  // arabic-reshaper exports a function that converts cluster Unicode
  // (e.g. U+0644 LAM + U+0627 ALEF) to presentation forms.
  // The package is CommonJS; esm.sh wraps it as ESM.
  try {
    const mod = await import("https://esm.sh/arabic-reshaper@1.1.0?target=deno");
    // Different esm.sh shims expose this either as default or named.
    // Tolerate both.
    const reshape = (mod as { default?: unknown; reshape?: unknown }).reshape ??
                    (mod as { default?: unknown }).default;
    if (typeof reshape === "function") {
      _reshaper = reshape as (text: string) => string;
    }
  } catch (err) {
    console.error("arabic-reshaper import failed:", err);
  }

  try {
    const bidiMod = await import("https://esm.sh/bidi-js@1.0.3");
    type BidiModule = {
      default?: () => { getReorderedString?: (text: string, e?: unknown) => string };
    };
    const factory = (bidiMod as BidiModule).default;
    if (typeof factory === "function") {
      const inst = factory();
      if (typeof inst.getReorderedString === "function") {
        const f = inst.getReorderedString.bind(inst);
        _bidiReorder = (text: string) => f(text);
      }
    }
  } catch (err) {
    console.error("bidi-js import failed:", err);
  }
}

/**
 * Shape an Arabic string for PDF rendering. Returns the input unchanged
 * if the shaper isn't available (graceful degradation).
 */
export async function shapeArabic(text: string): Promise<string> {
  await getShapers();
  let out = text;
  if (_reshaper) {
    try { out = _reshaper(out); } catch (err) { console.error("reshape err:", err); }
  }
  if (_bidiReorder) {
    try { out = _bidiReorder(out); } catch (err) { console.error("bidi err:", err); }
  }
  return out;
}

export interface DrawArabicOptions {
  font: PDFFont;
  size: number;
  color?: ReturnType<typeof rgb>;
  /**
   * X is interpreted as the RIGHT edge of the text by default (since
   * Arabic anchors right). Set leftAnchor=true to use x as the left edge
   * (rare; useful for inline mixed-content layouts).
   */
  leftAnchor?: boolean;
}

/**
 * Draw Arabic text on the given page. Async because shaping is async-loaded.
 * Returns the rendered width in points (so callers can lay out adjacent
 * elements). Returns 0 on any failure.
 */
export async function drawArabic(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: DrawArabicOptions,
): Promise<number> {
  if (!text || !text.trim()) return 0;
  try {
    const shaped = await shapeArabic(text);
    const width = opts.font.widthOfTextAtSize(shaped, opts.size);
    const drawX = opts.leftAnchor ? x : x - width;
    page.drawText(shaped, {
      x: drawX,
      y,
      size: opts.size,
      font: opts.font,
      color: opts.color ?? rgb(0, 0, 0),
    });
    return width;
  } catch (err) {
    console.error("drawArabic failed for text:", text.slice(0, 40), err);
    return 0;
  }
}

/**
 * Curated bilingual labels used across both PDFs. Keep this short —
 * free-text fields stay in whatever language the user typed; only the
 * "chrome" gets translated.
 *
 * Add a new key here when a label needs translation. Both PDFs source
 * from this single map so the translations stay consistent.
 */
export const BILINGUAL_LABELS: Record<string, { en: string; ar: string }> = {
  // Documents
  "WORK PERMIT":          { en: "WORK PERMIT",          ar: "تصريح عمل" },
  "MATERIAL GATE PASS":   { en: "MATERIAL GATE PASS",   ar: "تصريح خروج مواد" },
  "PERSONNEL GATE PASS":  { en: "PERSONNEL GATE PASS",  ar: "تصريح دخول/خروج أفراد" },
  "VENDOR GATE PASS":     { en: "VENDOR GATE PASS",     ar: "تصريح خروج للمورّدين" },

  // Status
  "Status":               { en: "Status",               ar: "الحالة" },
  "Work Type":            { en: "Work Type",            ar: "نوع العمل" },
  "Type":                 { en: "Type",                 ar: "النوع" },

  // Section headers
  "WORK DESCRIPTION":     { en: "WORK DESCRIPTION",     ar: "وصف العمل" },
  "REQUESTER INFORMATION":{ en: "REQUESTER INFORMATION",ar: "بيانات مقدم الطلب" },
  "REQUESTOR INFORMATION":{ en: "REQUESTOR INFORMATION",ar: "بيانات مقدم الطلب" },
  "CONTRACTOR INFORMATION": { en: "CONTRACTOR INFORMATION", ar: "بيانات المقاول" },
  "LOCATION":             { en: "LOCATION",             ar: "الموقع" },
  "LOCATION & DETAILS":   { en: "LOCATION & DETAILS",   ar: "الموقع والتفاصيل" },
  "SCHEDULE":             { en: "SCHEDULE",             ar: "الجدول الزمني" },
  "TRANSFER SCHEDULE":    { en: "TRANSFER SCHEDULE",    ar: "جدول النقل" },
  "ITEM DETAILS":         { en: "ITEM DETAILS",         ar: "تفاصيل المواد" },
  "PURPOSE OF MATERIAL SHIFTING": { en: "PURPOSE OF MATERIAL SHIFTING", ar: "الغرض من نقل المواد" },
  "APPROVALS & SIGNATURES": { en: "APPROVALS & SIGNATURES", ar: "الاعتمادات والتواقيع" },
  "ATTACHMENTS":          { en: "ATTACHMENTS",          ar: "المرفقات" },

  // Approvers
  "Customer Service":     { en: "Customer Service",     ar: "خدمة العملاء" },
  "CR Coordinator":       { en: "CR Coordinator",       ar: "منسّق علاقات العملاء" },
  "Head CR":              { en: "Head CR",              ar: "رئيس قسم علاقات العملاء" },
  "Helpdesk":             { en: "Helpdesk",             ar: "مكتب الدعم" },
  "PM":                   { en: "PM",                   ar: "مدير المشروع" },
  "PD":                   { en: "PD",                   ar: "مدير القسم" },
  "BDCR":                 { en: "BDCR",                 ar: "BDCR" },
  "MPR":                  { en: "MPR",                  ar: "MPR" },
  "IT":                   { en: "IT",                   ar: "تقنية المعلومات" },
  "Fit-Out":              { en: "Fit-Out",              ar: "التشطيبات" },
  "Ecovert Supervisor":   { en: "Ecovert Supervisor",   ar: "مشرف إيكوفرت" },
  "PMD Coordinator":      { en: "PMD Coordinator",      ar: "منسّق إدارة المشاريع" },
  "FMSP Approval":        { en: "FMSP Approval",        ar: "اعتماد FMSP" },
  "Store Manager":        { en: "Store Manager",        ar: "مدير المخزن" },
  "Finance":              { en: "Finance",              ar: "المالية" },
  "Security":             { en: "Security",             ar: "الأمن" },
  "Approved By (Store Manager)": { en: "Approved By (Store Manager)", ar: "اعتماد مدير المخزن" },
  "Department Verification (Finance)": { en: "Department Verification (Finance)", ar: "تدقيق المالية" },
  "Security Sign-off":    { en: "Security Sign-off",    ar: "اعتماد الأمن" },

  // Common field labels
  "Name":                 { en: "Name",                 ar: "الاسم" },
  "Email":                { en: "Email",                ar: "البريد الإلكتروني" },
  "Mobile":               { en: "Mobile",               ar: "الهاتف" },
  "Date":                 { en: "Date",                 ar: "التاريخ" },
  "From":                 { en: "From",                 ar: "من" },
  "To":                   { en: "To",                   ar: "إلى" },
  "Unit":                 { en: "Unit",                 ar: "الوحدة" },
  "Floor":                { en: "Floor",                ar: "الطابق" },
  "Generated on":         { en: "Generated on",         ar: "تاريخ الإصدار" },
  "This is an official work permit document.": {
    en: "This is an official work permit document.",
    ar: "هذه وثيقة تصريح عمل رسمية.",
  },

  // Statuses
  "approved":             { en: "approved",             ar: "معتمد" },
  "rejected":             { en: "rejected",             ar: "مرفوض" },
  "pending":              { en: "pending",              ar: "قيد الاعتماد" },
  "completed":            { en: "completed",            ar: "مكتمل" },
  "cancelled":            { en: "cancelled",            ar: "ملغى" },
  "draft":                { en: "draft",                ar: "مسودة" },
  "unknown":              { en: "unknown",              ar: "غير معروف" },

  // Footer / notes
  "NOTE: Materials shifting using forklift in Al Hamra premises shall obtain a valid Work Permit.": {
    en: "NOTE: Materials shifting using forklift in Al Hamra premises shall obtain a valid Work Permit.",
    ar: "ملاحظة: يجب الحصول على تصريح عمل ساري المفعول لأي نقل للمواد باستخدام الرافعة الشوكية في مرافق الحمراء.",
  },
};

/** Look up the AR translation for a key, or null if not in the table. */
export function arabicLabel(key: string): string | null {
  return BILINGUAL_LABELS[key]?.ar ?? null;
}
