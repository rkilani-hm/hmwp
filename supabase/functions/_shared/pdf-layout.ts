/**
 * Shared PDF layout / design system (Phase 4 — Hot Works template look).
 *
 * Extracted VERBATIM from generate-permit-pdf so the Work Permit and the
 * Gate Pass PDFs share one source of truth for brand constants, section /
 * subsection banners, field grids, the doc-ID strip, and — most importantly —
 * the Approval Chain row renderer. Keeping these in one module means the two
 * documents cannot visually drift apart again.
 *
 * Design contract: the helper bodies here are byte-for-byte copies of what
 * generate-permit-pdf previously defined inline. The only refactor is that
 * the closed-over state (pdfDoc, page geometry, embedded fonts, the Arabic
 * font pair) is now passed in via `createPdfLayout(ctx)` instead of being
 * captured from the surrounding scope. WP destructures the returned helpers
 * and calls them with identical arguments, so its output is unchanged.
 */

import type { PDFDocument, PDFFont, PDFImage, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { drawArabic, arabicLabel, type ArabicFontPair } from "./pdf-bilingual.ts";

// ---- Phase 4a: Al Hamra brand constants -------------------------------
// Mirrors src/index.css tokens. Used by the brand-styled drawing
// helpers below so future palette changes are one-file edits here.
//   BRAND_RED   #CD1719 — primary identifier (titles, accents)
//   BRAND_GREY  #B2B2B2 — borders, dividers, subtle hairlines
//   BRAND_DARK  #1D1D1B — body text (used sparingly per identity guide)
//   BRAND_LIGHT #EDEDED — surface fills behind headers
export const BRAND_RED = rgb(0.804, 0.090, 0.098);
export const BRAND_GREY = rgb(0.698, 0.698, 0.698);
export const BRAND_DARK = rgb(0.114, 0.114, 0.106);
export const BRAND_LIGHT = rgb(0.929, 0.929, 0.929);

// Banner inks (Hot Works template):
export const SECTION_BAR_INK = rgb(0.102, 0.102, 0.102); // matches --section-bar #1a1a1a
export const SUBSECTION_BAR_INK = rgb(0.478, 0.082, 0.094); // matches --subsection-bar #7a1518
export const WHITE = rgb(1, 1, 1);

// Field-grid palette
export const FIELD_LABEL_GREY = rgb(0.541, 0.541, 0.541);
export const FIELD_UNDERLINE = rgb(0.847, 0.847, 0.847); // --line #d8d8d8
export const CELL_DIVIDER = rgb(0.925, 0.925, 0.925); // --line-soft #ececec

/**
 * Truncate a string so it fits inside `maxWidth` when rendered at
 * the given font + size, adding an ellipsis if anything was cut.
 * Used by the attachment grid for filename labels — file names
 * are often longer than a cell width, especially with mobile
 * camera generated names like 'IMG_20260513_104755_civil_id.jpg'.
 */
export const truncateForWidth = (text: string, maxWidth: number, font: PDFFont, size: number): string => {
  const safe = String(text || '').replace(/[^\x00-\x7F]/g, '');
  if (!safe) return '';
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  const ellipsis = '...';
  let lo = 0;
  let hi = safe.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const candidate = safe.slice(0, mid) + ellipsis;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return safe.slice(0, lo) + ellipsis;
};

// pdf-lib's standard Helvetica is WinAnsi-encoded — it cannot draw
// chars outside that codepage (→, em/en dashes, curly quotes, …).
// Sanitize every string we draw with the Latin font.
export const sanitizeWinAnsi = (text: string): string => {
  if (!text) return '';
  return String(text)
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    // Broad dash family: hyphen, non-breaking hyphen, figure dash,
    // en-dash, em-dash, horizontal bar, minus sign → ASCII '-'
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x00-\xFF]/g, '?');
};

export interface ApprovalRow {
  name: string;
  nameAr: string | null;
  roleKey: string;
  status: string | null;
  approver: string | null;
  date: string | null;
  signature: string | null;
  comments: string | null;
  stepOrder: number;
  /**
   * Displayed approve verb for this row, derived from the acting user's
   * actor_type (spec: departments-and-reviewer-flag.md R5):
   *   'approver' → "APPROVED"  (default when unresolved — fail safe)
   *   'reviewer' → "REVIEWED"
   * Only affects the APPROVED status pill / label; status string itself
   * stays 'approved'. Reject pill is unaffected.
   */
  actorType?: 'approver' | 'reviewer' | null;
}

export interface PdfLayoutContext {
  pdfDoc: PDFDocument;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  helvetica: PDFFont;
  helveticaBold: PDFFont;
  arabicFonts: ArabicFontPair | null;
}

/**
 * Builds the brand-styled drawing helpers bound to a single PDF document /
 * page geometry / font set. The bodies are verbatim copies of the helpers
 * that generate-permit-pdf used to define inline — only their captured
 * dependencies are now supplied via `ctx`.
 */
export function createPdfLayout(ctx: PdfLayoutContext) {
  const { pdfDoc, pageWidth, pageHeight, margin, helvetica, helveticaBold, arabicFonts } = ctx;

  const drawText = (
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont = helvetica,
    color = rgb(0, 0, 0),
  ) => {
    const safeText = sanitizeWinAnsi(String(text || ''));
    if (safeText && y > 30) {
      page.drawText(safeText, { x, y, size, font, color });
    }
  };

  const drawLine = (page: PDFPage, y: number) => {
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
  };

  /** Major section divider — thicker, brand red. For top-of-section breaks. */
  const drawBrandLine = (page: PDFPage, y: number) => {
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1.5,
      color: BRAND_RED,
    });
  };

  /** Section header — top-level black banner with white text.
   *  Replaces the legacy red-text-on-grey-underline style.
   *  Bilingual: English left, Arabic right inside the same bar. */
  const drawSectionHeader = async (page: PDFPage, text: string, y: number, size = 11) => {
    const barHeight = size + 8;
    // Filled black banner spanning the content width
    page.drawRectangle({
      x: margin, y: y - barHeight + size + 2,
      width: pageWidth - margin * 2, height: barHeight,
      color: SECTION_BAR_INK,
    });
    drawText(page, text, margin + 8, y, size, helveticaBold, WHITE);
    const ar = arabicLabel(text);
    if (arabicFonts && ar) {
      await drawArabic(page, ar, pageWidth - margin - 8, y, {
        font: arabicFonts.bold,
        size,
        color: WHITE,
      });
    }
  };

  /** Subsection header — numbered burgundy banner. Use for the
   *  numbered subsections within each top-level section
   *  (1. CLIENT/CONTRACTOR DETAILS, 2. WORK DESCRIPTION, etc.). */
  const drawSubsectionHeader = async (page: PDFPage, text: string, y: number, size = 10) => {
    const barHeight = size + 6;
    page.drawRectangle({
      x: margin, y: y - barHeight + size + 1,
      width: pageWidth - margin * 2, height: barHeight,
      color: SUBSECTION_BAR_INK,
    });
    drawText(page, text, margin + 8, y, size, helveticaBold, WHITE);
    const ar = arabicLabel(text);
    if (arabicFonts && ar) {
      await drawArabic(page, ar, pageWidth - margin - 8, y, {
        font: arabicFonts.bold,
        size,
        color: WHITE,
      });
    }
  };

  /** Underlined field — small grey EN label (+ optional AR) above a
   *  value with a thin underline. Mirrors `.field-grid` in the
   *  reference template. */
  const drawField = async (
    page: PDFPage,
    opts: {
      labelEn: string; labelAr?: string | null; value: string;
      x: number; y: number; width: number; valueBold?: boolean;
    },
  ) => {
    // EN label (uppercase tracked feel via plain helveticaBold @ 7pt)
    drawText(page, opts.labelEn.toUpperCase(), opts.x, opts.y, 7, helveticaBold, FIELD_LABEL_GREY);
    // AR label right-aligned on the same line, if available
    const ar = opts.labelAr ?? arabicLabel(opts.labelEn);
    if (arabicFonts && ar) {
      await drawArabic(page, ar, opts.x + opts.width, opts.y, {
        font: arabicFonts.regular, size: 7, color: FIELD_LABEL_GREY,
      });
    }
    // Value below
    const valueY = opts.y - 12;
    drawText(
      page, opts.value || '—', opts.x, valueY, 10,
      opts.valueBold ? helveticaBold : helvetica, BRAND_DARK,
    );
    // Underline
    page.drawLine({
      start: { x: opts.x, y: valueY - 3 },
      end: { x: opts.x + opts.width, y: valueY - 3 },
      thickness: 0.5, color: FIELD_UNDERLINE,
    });
  };

  /** Doc-ID strip — four equal cells with EN/AR label + value. */
  const drawDocIdStrip = async (
    page: PDFPage,
    y: number,
    cells: Array<{ labelEn: string; value: string; mono?: boolean }>,
  ) => {
    const stripH = 44;
    const stripW = pageWidth - margin * 2;
    const cellW = stripW / cells.length;
    // Outer border
    page.drawRectangle({
      x: margin, y: y - stripH, width: stripW, height: stripH,
      borderColor: FIELD_UNDERLINE, borderWidth: 0.6,
    });
    for (let i = 0; i < cells.length; i++) {
      const cx = margin + i * cellW;
      // Vertical divider between cells (not after last)
      if (i > 0) {
        page.drawLine({
          start: { x: cx, y: y - stripH + 4 },
          end: { x: cx, y: y - 4 },
          thickness: 0.4, color: CELL_DIVIDER,
        });
      }
      // EN label
      drawText(page, cells[i].labelEn.toUpperCase(), cx + 6, y - 11, 7, helveticaBold, FIELD_LABEL_GREY);
      // AR label right-aligned
      const ar = arabicLabel(cells[i].labelEn);
      if (arabicFonts && ar) {
        await drawArabic(page, ar, cx + cellW - 6, y - 11, {
          font: arabicFonts.regular, size: 7, color: FIELD_LABEL_GREY,
        });
      }
      // Value (bold dark)
      drawText(page, cells[i].value || '—', cx + 6, y - 30, 11, helveticaBold, BRAND_DARK);
    }
  };

  return {
    drawText,
    drawLine,
    drawBrandLine,
    drawSectionHeader,
    drawSubsectionHeader,
    drawField,
    drawDocIdStrip,
  };
}

export interface DrawApprovalChainArgs {
  ctx: PdfLayoutContext;
  layout: ReturnType<typeof createPdfLayout>;
  approvals: ApprovalRow[];
  page: PDFPage;
  yPos: number;
  /** Allocates a fresh page and returns its top yPos. */
  createPage: () => { page: PDFPage; yPos: number };
  /** Subsection bar label for the first page of the chain. */
  subsectionTitle?: string;
  /** Subsection bar label after a page break. */
  subsectionTitleContinued?: string;
  formatDateTime: (date: string | null | undefined) => string;
}

/**
 * Approval Chain — full-width row layout (v3 design).
 *
 * VERBATIM extraction of the WP approval-chain row loop. Renders a single
 * column of full-width rows, one per approval step, with:
 *   [01]  Role Name (EN bold / AR)   Signer · datetime   STATUS   [signature]
 *
 * Generalized only so the role display-name maps live in the CALLER — the
 * `approvals` array already carries the resolved EN/AR names per row, so the
 * renderer is workflow-agnostic and shared by WP and GP identically.
 *
 * Returns the page + yPos cursor after the chain so the caller can continue.
 */
export async function drawApprovalChain(args: DrawApprovalChainArgs): Promise<{ page: PDFPage; yPos: number }> {
  const {
    ctx, layout, approvals, createPage, formatDateTime,
    subsectionTitle = '1. Approval Chain',
    subsectionTitleContinued = '1. Approval Chain (continued)',
  } = args;
  const { pdfDoc, pageWidth, margin, helvetica, helveticaBold, arabicFonts } = ctx;
  const { drawText, drawSubsectionHeader } = layout;

  let page = args.page;
  let yPos = args.yPos;

  await drawSubsectionHeader(page, subsectionTitle, yPos, 10);
  yPos -= 18;

  // Status colors. APPROVED = success green, REJECTED = brand red,
  // PENDING (the first not-yet-acted-upon row) = burgundy with halo,
  // AWAITING (subsequent rows) = neutral gray.
  const STATUS_OK = rgb(0.086, 0.396, 0.204); // #166534
  const STATUS_REJECTED = BRAND_RED;
  const STATUS_PENDING = SUBSECTION_BAR_INK; // burgundy
  const STATUS_AWAITING = rgb(0.541, 0.541, 0.541); // gray
  const ROW_STROKE = rgb(0.92, 0.92, 0.92);

  // Identify the FIRST pending row — it gets the active-pending
  // styling (filled burgundy dot + halo + PENDING label). Any
  // subsequent pending rows are shown as AWAITING (muted).
  let firstPendingIdx = -1;
  for (let i = 0; i < approvals.length; i++) {
    if (approvals[i].status === 'pending') { firstPendingIdx = i; break; }
  }

  const ROW_HEIGHT = 22;
  const CONTENT_RIGHT = pageWidth - margin;

  for (let i = 0; i < approvals.length; i++) {
    const approval = approvals[i];

    // Page-break check — if this row + footer wouldn't fit, start a
    // new page and re-render the subsection header so the chain is
    // legible if it spans pages.
    if (yPos < 90) {
      const np = createPage();
      page = np.page;
      yPos = np.yPos;
      await drawSubsectionHeader(page, subsectionTitleContinued, yPos, 10);
      yPos -= 18;
    }

    const rowTop = yPos;
    const rowMid = rowTop - ROW_HEIGHT / 2;

    // Categorize status for this specific row.
    let dotColor: ReturnType<typeof rgb>;
    let pillColor: ReturnType<typeof rgb>;
    let pillLabel: string;
    let drawHalo = false;
    const isApproved = approval.status === 'approved';
    const isRejected = approval.status === 'rejected';
    const isFirstPending = i === firstPendingIdx;

    if (isApproved) {
      dotColor = STATUS_OK;
      pillColor = STATUS_OK;
      // Reviewer-flagged actors show REVIEWED; default APPROVED (R5).
      pillLabel = approval.actorType === 'reviewer' ? 'REVIEWED' : 'APPROVED';
    } else if (isRejected) {
      dotColor = STATUS_REJECTED;
      pillColor = STATUS_REJECTED;
      pillLabel = 'REJECTED';
    } else if (isFirstPending) {
      dotColor = STATUS_PENDING;
      pillColor = STATUS_PENDING;
      pillLabel = 'PENDING';
      drawHalo = true;
    } else {
      dotColor = STATUS_AWAITING;
      pillColor = STATUS_AWAITING;
      pillLabel = 'PENDING';
    }

    // ---- Cell 1: number badge (colored dot + step number) ----
    const dotX = margin + 8;
    const dotY = rowMid;
    if (drawHalo) {
      page.drawCircle({ x: dotX, y: dotY, size: 6, color: rgb(0.95, 0.85, 0.85) });
    }
    page.drawCircle({ x: dotX, y: dotY, size: 3, color: dotColor });
    drawText(
      page,
      String(i + 1).padStart(2, '0'),
      dotX + 7, dotY - 2, 7, helveticaBold, BRAND_DARK,
    );

    // ---- Cell 2: role name (English bold + Arabic below) + signer/date ----
    const roleX = margin + 36;
    const signerX = margin + 200;

    // English role name (top, bold). Pre-normalize dash characters so
    // names like "Coordinator – Client Relations" render as
    // "Coordinator - Client Relations" (sanitizeWinAnsi covers this,
    // but the explicit pass keeps the intent obvious).
    const englishRoleName = String(approval.name || '')
      .replace(/[‐-―−]/g, '-');
    drawText(page, englishRoleName, roleX, rowMid + 2.5, 7, helveticaBold, BRAND_DARK);

    // Arabic role name (below, smaller, RTL anchored)
    if (approval.nameAr && arabicFonts) {
      await drawArabic(page, approval.nameAr, roleX + 155, rowMid - 5, {
        font: arabicFonts.regular,
        size: 6,
        color: rgb(0.302, 0.302, 0.302),
      });
    }

    // Signer name (top)
    const signerName = (isApproved || isRejected) ? (approval.approver || '—') : '—';
    drawText(page, signerName, signerX, rowMid + 2.5, 6.5, helvetica, BRAND_DARK);

    // Date or Pending
    const dateLabel = (isApproved || isRejected) && approval.date
      ? formatDateTime(approval.date)
      : 'Pending';
    drawText(page, dateLabel, signerX, rowMid - 4.5, 6, helvetica, rgb(0.541, 0.541, 0.541));

    // ---- Cell 3: status pill (colored text — plain word, no glyphs) ----
    const pillX = pageWidth * 0.62;
    drawText(page, pillLabel, pillX, rowMid - 1, 6.5, helveticaBold, pillColor);

    // ---- Cell 4: signature (image or "AWAITING SIGNATURE" placeholder) ----
    const sigX = pageWidth * 0.78;
    const sigW = CONTENT_RIGHT - sigX - 4;

    if ((isApproved || isRejected) && approval.signature && approval.signature.startsWith('data:image')) {
      try {
        const base64Data = approval.signature.split(',')[1];
        if (base64Data) {
          const sigBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const sigImg: PDFImage = approval.signature.includes('image/png')
            ? await pdfDoc.embedPng(sigBytes)
            : await pdfDoc.embedJpg(sigBytes);

          const maxW = sigW;
          const maxH = ROW_HEIGHT - 8;
          const scale = Math.min(maxW / sigImg.width, maxH / sigImg.height, 1);
          const drawW = sigImg.width * scale;
          const drawH = sigImg.height * scale;

          page.drawImage(sigImg, {
            x: sigX + (maxW - drawW) / 2,
            y: rowMid - drawH / 2,
            width: drawW,
            height: drawH,
          });
        }
      } catch (sigError) {
        console.error('Error embedding signature for', approval.name, sigError);
      }

      // Signature underline (continuous line)
      page.drawLine({
        start: { x: sigX, y: rowMid - ROW_HEIGHT / 2 + 4 },
        end: { x: sigX + sigW, y: rowMid - ROW_HEIGHT / 2 + 4 },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });
    } else {
      // Pending — dashed underline + "PENDING SIGNATURE" placeholder
      drawText(
        page,
        'PENDING SIGNATURE',
        sigX + 4, rowMid - 1, 6, helvetica, STATUS_AWAITING,
      );
      // Dashed line (pdf-lib doesn't natively support dashes here;
      // draw a sequence of short segments).
      const dashY = rowMid - ROW_HEIGHT / 2 + 4;
      const dashLen = 3; const gap = 2;
      for (let x = sigX; x < sigX + sigW; x += dashLen + gap) {
        page.drawLine({
          start: { x, y: dashY },
          end: { x: Math.min(x + dashLen, sigX + sigW), y: dashY },
          thickness: 0.4,
          color: rgb(0.7, 0.7, 0.7),
        });
      }
    }

    // ---- Row separator ----
    page.drawLine({
      start: { x: margin, y: rowTop - ROW_HEIGHT },
      end: { x: CONTENT_RIGHT, y: rowTop - ROW_HEIGHT },
      thickness: 0.4,
      color: ROW_STROKE,
    });

    yPos -= ROW_HEIGHT;
  }

  return { page, yPos };
}
