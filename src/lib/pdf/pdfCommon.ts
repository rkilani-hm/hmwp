import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import qrcode from 'qrcode-generator';
import { ar, hasArabic } from './arabic';
import { BRAND } from './brand';

/**
 * Shared building blocks for the request PDFs (bilingual text, approval chain,
 * attachment pages, QR footer). Plain pdf-lib primitives and no app imports, so
 * the same code can be lifted into the Supabase edge functions.
 */

// Al Hamra identity palette — see brand.ts.
export const RED = BRAND.RED;
export const CHARCOAL = BRAND.CHARCOAL;
export const SUBGREY = BRAND.SUBGREY;
export const LIGHTGREY = BRAND.LIGHTGREY;
export const WHITE = BRAND.WHITE;
export const GREEN = BRAND.GREEN;
export const AMBER = BRAND.AMBER;
/** Muted text — charcoal lightened, not a new brand colour. */
export const MUTED = rgb(0.42, 0.42, 0.41);

// Back-compat aliases for the earlier draft.
export const DARK = CHARCOAL;
export const LINE = SUBGREY;
export const GREY = MUTED;

export interface Fonts {
  helv: PDFFont;
  bold: PDFFont;
  oblique: PDFFont;
  /** Noto Kufi Arabic. Absent when the font could not be loaded. */
  arabic?: PDFFont;
}

export interface ApprovalRow {
  role: string;
  status: string;
  approver?: string | null;
  date?: string | null;
  signature?: string | null;
}

export interface AttachmentItem {
  name: string;
  documentType?: string | null;
  mime?: string | null;
  bytes?: Uint8Array | null;
}

/**
 * pdf-lib's 14 standard fonts encode WinAnsi only and throw on anything else.
 * When the Arabic font is embedded we draw Arabic properly (see drawText); this
 * is the fallback for when it is missing, so a font-loading failure degrades to
 * Latin-only instead of killing the render.
 */
const NON_WINANSI = /[^\x20-\x7E\xA0-\xFF–—''""•…€™]/g;

export function safe(s: string): string {
  if (!s) return '';
  // Collapse runs but do NOT trim: callers use leading/trailing spaces as
  // deliberate padding between separately drawn runs (e.g. "name  ·  date"),
  // and trimming them ran the two together.
  const cleaned = s.replace(NON_WINANSI, ' ').replace(/[ \t]+/g, ' ');
  if (!cleaned.trim() && s.trim()) return '(see system)';
  return cleaned;
}

/**
 * Split a string into Arabic and non-Arabic segments.
 *
 * A mixed string like "PASS NO.  ·  رقم التصريح" cannot be drawn in one call:
 * handed whole to the Arabic face, fontkit lays the entire run out RTL and the
 * Latin part comes out mirrored ("ON SSAP."). Each segment is therefore drawn
 * with its own font, left to right, in logical order.
 */
function segments(s: string): { text: string; rtl: boolean }[] {
  const parts: { text: string; rtl: boolean }[] = [];
  // Arabic letters plus the punctuation/space that sits between them.
  const re = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿][؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿\s\d.,:/()-]*/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) parts.push({ text: s.slice(last, m.index), rtl: false });
    parts.push({ text: m[0], rtl: true });
    last = m.index! + m[0].length;
  }
  if (last < s.length) parts.push({ text: s.slice(last), rtl: false });
  return parts.filter((p) => p.text.length);
}

/** Width of a string as it will actually be drawn. */
export function widthOf(s: string, size: number, fonts: Fonts, bold = false) {
  if (!s) return 0;
  if (hasArabic(s) && fonts.arabic) {
    return segments(s).reduce(
      (w, seg) =>
        w + (seg.rtl
          ? fonts.arabic!.widthOfTextAtSize(ar(seg.text), size)
          : (bold ? fonts.bold : fonts.helv).widthOfTextAtSize(safe(seg.text), size)),
      0,
    );
  }
  const f = bold ? fonts.bold : fonts.helv;
  return f.widthOfTextAtSize(safe(s), size);
}

/**
 * Draw a string, routing Arabic segments to the embedded Arabic face. fontkit
 * shapes and lays out each RTL run itself — `ar()` only fixes the digit/Latin
 * runs embedded inside it.
 */
export function drawText(
  p: PDFPage, s: string, x: number, y: number, size: number,
  fonts: Fonts, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; italic?: boolean } = {},
) {
  if (!s) return;
  const color = opts.color ?? CHARCOAL;
  const latin = opts.bold ? fonts.bold : opts.italic ? fonts.oblique : fonts.helv;

  if (hasArabic(s) && fonts.arabic) {
    let cx = x;
    for (const seg of segments(s)) {
      if (seg.rtl) {
        const t = ar(seg.text);
        p.drawText(t, { x: cx, y, size, font: fonts.arabic, color });
        cx += fonts.arabic.widthOfTextAtSize(t, size);
      } else {
        const t = safe(seg.text);
        p.drawText(t, { x: cx, y, size, font: latin, color });
        cx += latin.widthOfTextAtSize(t, size);
      }
    }
    return;
  }
  p.drawText(safe(s), { x, y, size, font: latin, color });
}

/** Right-aligned draw — the natural alignment for Arabic. */
export function drawTextRight(
  p: PDFPage, s: string, right: number, y: number, size: number,
  fonts: Fonts, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {},
) {
  drawText(p, s, right - widthOf(s, size, fonts, opts.bold), y, size, fonts, opts);
}

/**
 * A bilingual label: English at `x`, Arabic right-aligned at `right`. Each
 * language reads from its own edge, which is how the paper forms are laid out.
 */
export function drawBilingual(
  p: PDFPage, en: string, arabic: string, x: number, right: number, y: number,
  size: number, fonts: Fonts, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {},
) {
  drawText(p, en, x, y, size, fonts, opts);
  if (arabic && fonts.arabic) drawTextRight(p, arabic, right, y, size, fonts, opts);
}

export const txt = (
  p: PDFPage, s: string, x: number, y: number, size: number,
  font: PDFFont, color = CHARCOAL,
) => p.drawText(safe(s ?? ''), { x, y, size, font, color });

export function clip(s: string, maxW: number, font: PDFFont, size: number) {
  const t = safe(s);
  if (!t) return '';
  if (font.widthOfTextAtSize(t, size) <= maxW) return t;
  let out = t;
  while (out.length > 1 && font.widthOfTextAtSize(out + '…', size) > maxW) out = out.slice(0, -1);
  return out + '…';
}

/** Clip against however the string will really be drawn (Arabic included). */
export function clipT(s: string, maxW: number, size: number, fonts: Fonts, bold = false) {
  if (!s) return '';
  if (hasArabic(s) && fonts.arabic) {
    let out = s;
    while (out.length > 1 && widthOf(out, size, fonts, bold) > maxW) out = out.slice(0, -1);
    return out;
  }
  return clip(s, maxW, bold ? fonts.bold : fonts.helv, size);
}

export function fmtDate(v?: string) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fmtDT(v?: string) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function roleLabel(r: string) {
  return (r || '').replace(/[_‑]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function embedBytes(pdf: PDFDocument, bytes: Uint8Array, mime?: string | null) {
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (isPng || mime === 'image/png') return pdf.embedPng(bytes);
  if (isJpg || mime === 'image/jpeg' || mime === 'image/jpg') return pdf.embedJpg(bytes);
  return null;
}

export async function embedDataUrl(pdf: PDFDocument, dataUrl: string) {
  const m = /^data:(image\/\w+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return embedBytes(pdf, bytes, m[1]);
}

/** Section heading: light brand bar with a red rule, bilingual. */
export function sectionBar(
  p: PDFPage, en: string, arabic: string, x: number, right: number, y: number, fonts: Fonts,
) {
  const h = 16;
  p.drawRectangle({ x, y: y - h, width: right - x, height: h, color: LIGHTGREY });
  p.drawRectangle({ x, y: y - h, width: 3, height: h, color: RED });
  drawText(p, en, x + 9, y - h + 5, 8, fonts, { bold: true, color: CHARCOAL });
  if (arabic && fonts.arabic) drawTextRight(p, arabic, right - 8, y - h + 5, 8, fonts, { color: CHARCOAL });
  return y - h;
}

/** Numbered approval rows with signature images. Adds pages as needed. */
export async function drawApprovalChain(opts: {
  pdf: PDFDocument; page: PDFPage; y: number; W: number; H: number; M: number;
  fonts: Fonts; approvals: ApprovalRow[];
}): Promise<{ page: PDFPage; y: number }> {
  const { pdf, W, H, M, fonts, approvals } = opts;
  const ROW_H = 26, FOOTER_SAFE = M + 46;

  let page = opts.page;
  let y = opts.y;
  if (y - (16 + Math.max(approvals.length, 1) * ROW_H + 10) < FOOTER_SAFE) {
    page = pdf.addPage([W, H]);
    y = H - M;
  }

  y = sectionBar(page, 'AL HAMRA APPROVALS', 'اعتمادات الحمراء', M, W - M, y, fonts) - 8;

  if (approvals.length === 0) {
    drawText(page, 'Awaiting approval — no approvals recorded yet.', M + 4, y - 8, 8.5, fonts, { italic: true, color: MUTED });
    if (fonts.arabic) drawTextRight(page, 'بانتظار الاعتماد', W - M - 4, y - 8, 8.5, fonts, { color: MUTED });
    return { page, y: y - ROW_H };
  }

  for (let i = 0; i < approvals.length; i++) {
    if (y - ROW_H < FOOTER_SAFE) { page = pdf.addPage([W, H]); y = H - M; }
    const a = approvals[i];
    const st = (a.status || '').toLowerCase();
    const stColor = st === 'approved' ? GREEN : st === 'rejected' ? RED : AMBER;

    page.drawRectangle({ x: M, y: y - ROW_H + 6, width: 20, height: 20, color: LIGHTGREY });
    drawText(page, String(i + 1).padStart(2, '0'), M + 5, y - ROW_H + 12, 8, fonts, { bold: true, color: CHARCOAL });

    drawText(page, roleLabel(a.role), M + 27, y - 6, 8.5, fonts, { bold: true });
    // Name and date drawn as separate runs: an Arabic approver name concatenated
    // with a Latin date is a mixed string, and clipT would strip the Arabic.
    let wx = M + 27;
    if (a.approver) {
      const nm = clipT(a.approver, 150, 7.5, fonts);
      drawText(page, nm, wx, y - 16, 7.5, fonts, { color: MUTED });
      wx += widthOf(nm, 7.5, fonts);
    }
    if (a.date) {
      drawText(page, `${a.approver ? '  ·  ' : ''}${fmtDT(a.date)}`, wx, y - 16, 7.5, fonts, { color: MUTED });
    }
    drawText(page, (a.status || '').toUpperCase(), M + 250, y - 10, 8, fonts, { bold: true, color: stColor });

    if (a.signature) {
      try {
        const img = await embedDataUrl(pdf, a.signature);
        if (img) {
          const s = Math.min(96 / img.width, 20 / img.height, 1);
          page.drawImage(img, {
            x: W - M - img.width * s - 4, y: y - ROW_H + 8,
            width: img.width * s, height: img.height * s,
          });
        }
      } catch { /* decorative */ }
    }

    page.drawLine({ start: { x: M, y: y - ROW_H + 3 }, end: { x: W - M, y: y - ROW_H + 3 }, thickness: 0.4, color: SUBGREY });
    y -= ROW_H;
  }
  return { page, y };
}

/** 3×3 grid of attachments on their own page(s). */
export async function drawAttachmentPages(opts: {
  pdf: PDFDocument; W: number; H: number; M: number; fonts: Fonts;
  attachments: AttachmentItem[]; captionEn?: string; captionAr?: string;
}) {
  const { pdf, W, H, M, fonts, attachments } = opts;
  if (!attachments.length) return;

  const COLS = 3, ROWS = 3, CW = 165, CH = 190, GAP = 10;
  const perPage = COLS * ROWS;
  const pages = Math.ceil(attachments.length / perPage);

  for (let p = 0; p < pages; p++) {
    const ap = pdf.addPage([W, H]);
    let ay = H - M;
    ay = sectionBar(ap, 'ATTACHMENTS', 'المرفقات', M, W - M, ay, fonts) - 14;

    const cap = opts.captionEn ?? 'Supporting documents';
    drawText(ap, pages > 1 ? `${cap}  (${p + 1} of ${pages})` : cap, M, ay, 8, fonts, { bold: true });
    if (opts.captionAr && fonts.arabic) drawTextRight(ap, opts.captionAr, W - M, ay, 8, fonts, { color: MUTED });
    ay -= 12;

    const left = (W - (COLS * CW + (COLS - 1) * GAP)) / 2;
    for (let i = p * perPage; i < Math.min((p + 1) * perPage, attachments.length); i++) {
      const idx = i - p * perPage;
      const col = idx % COLS, row = Math.floor(idx / COLS);
      const cx = left + col * (CW + GAP);
      const cy = ay - (row + 1) * CH - row * GAP;
      const labelH = 26;

      ap.drawRectangle({ x: cx, y: cy, width: CW, height: CH, borderColor: SUBGREY, borderWidth: 0.7 });

      const a = attachments[i];
      let drew = false;
      if (a.bytes && a.bytes.length) {
        try {
          const img = await embedBytes(pdf, a.bytes, a.mime);
          if (img) {
            const areaW = CW - 10, areaH = CH - labelH - 10;
            const s = Math.min(areaW / img.width, areaH / img.height);
            const dw = img.width * s, dh = img.height * s;
            ap.drawImage(img, { x: cx + (CW - dw) / 2, y: cy + labelH + (areaH - dh) / 2, width: dw, height: dh });
            drew = true;
          }
        } catch { /* placeholder below */ }
      }
      if (!drew) {
        const ph = (a.mime || '').includes('pdf') ? '[PDF attachment]' : '[File attached]';
        drawText(ap, ph, cx + (CW - widthOf(ph, 8, fonts)) / 2, cy + CH / 2, 8, fonts, { color: MUTED });
      }
      const nm = clipT(a.name || 'attachment', CW - 10, 7.5, fonts, true);
      drawText(ap, nm, cx + (CW - widthOf(nm, 7.5, fonts, true)) / 2, cy + labelH - 10, 7.5, fonts, { bold: true });
      if (a.documentType) {
        const dt = a.documentType.replace(/_/g, ' ');
        drawText(ap, dt, cx + (CW - widthOf(dt, 7, fonts)) / 2, cy + labelH - 20, 7, fonts, { color: MUTED });
      }
    }
  }
}

/** Footer on every page: form reference, page numbers and the verification QR. */
export function drawFooters(opts: {
  pdf: PDFDocument; W: number; M: number; fonts: Fonts;
  permitNo?: string; baseUrl?: string; formRef?: string[]; note?: string;
}) {
  const { pdf, W, M, fonts, permitNo } = opts;

  let qr: ReturnType<typeof qrcode> | null = null;
  if (permitNo) {
    try {
      const base = (opts.baseUrl || 'https://www.hmwp.alhamra.com.kw').replace(/\/$/, '');
      qr = qrcode(0, 'M');
      qr.addData(`${base}/status?permit=${encodeURIComponent(permitNo)}`);
      qr.make();
    } catch { qr = null; }
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 34 }, end: { x: W - M, y: M + 34 }, thickness: 0.5, color: SUBGREY });
    (opts.formRef ?? []).forEach((line, li) => {
      drawText(p, line, M, M + 20 - li * 9, 7.5, fonts, { bold: li === 0, color: li === 0 ? CHARCOAL : MUTED });
    });
    const pn = `Page ${i + 1} of ${pages.length}`;
    drawText(p, pn, (W - widthOf(pn, 7.5, fonts)) / 2, M + 2, 7.5, fonts, { color: MUTED });

    if (qr && permitNo) {
      const size = 46, qx = W - M - size, qy = M + 16;
      const count = qr.getModuleCount(), cell = size / count;
      p.drawRectangle({ x: qx - 4, y: qy - 4, width: size + 8, height: size + 8, color: WHITE });
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            p.drawRectangle({
              x: qx + c * cell, y: qy + (count - 1 - r) * cell,
              width: cell, height: cell, color: rgb(0, 0, 0),
            });
          }
        }
      }
      const lbl = 'Scan to verify';
      drawText(p, lbl, qx + (size - widthOf(lbl, 6, fonts)) / 2, qy - 11, 6, fonts, { color: MUTED });
      drawText(p, permitNo, qx + (size - widthOf(permitNo, 5.5, fonts)) / 2, qy - 18, 5.5, fonts, { color: MUTED });
    } else if (opts.note) {
      drawText(p, opts.note, W - M - widthOf(opts.note, 7, fonts), M + 2, 7, fonts, { italic: true, color: MUTED });
    }
  });
}
