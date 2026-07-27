import { PDFDocument, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { GatePassData } from '@/components/forms/permit-steps/GatePassDetailsStep';
import type { PdfAssets } from './brand';
import {
  RED, CHARCOAL, SUBGREY, LIGHTGREY, WHITE, GREEN, AMBER, MUTED,
  drawText, drawTextRight, drawBilingual, sectionBar, widthOf, clipT, safe,
  fmtDate, drawApprovalChain, drawAttachmentPages, drawFooters, embedBytes,
  type ApprovalRow, type AttachmentItem, type Fonts,
} from './pdfCommon';

/**
 * MATERIAL GATE PASS — bilingual (English / العربية), Al Hamra identity.
 *
 * Deliberately NOT laid out like the work-permit or photo-shoot forms. Those are
 * documents read at a desk and filed; this one is read in a few seconds at a
 * gate, often on a phone screen or a creased printout. So the hierarchy is
 * inverted — the three things a guard must decide (which direction, is it valid
 * right now, which unit) are the largest things on the page, and everything else
 * is supporting detail.
 *
 * Per the Al Hamra identity guidelines the page stays white with charcoal text
 * and light-grey surfaces, so the brand red reads as an accent rather than one
 * of several competing heavy colours. Status colours (green/amber/red) are the
 * one exception — they carry meaning, not brand.
 *
 * Plain pdf-lib primitives only, so it ports into the generate-permit-pdf edge
 * function unchanged — the assets just come from that bundle instead.
 */

export interface GatePassPdfMeta {
  permitNo?: string;
  status?: string;
  requesterName?: string;
  tenantCompany?: string;
  submittedAt?: string;
  baseUrl?: string;
}

export interface GatePassPdfExtras {
  approvals?: ApprovalRow[];
  attachments?: AttachmentItem[];
  assets?: PdfAssets;
}

const DIRECTION_META: Record<GatePassData['direction'], {
  en: string; ar: string; hintEn: string; hintAr: string;
}> = {
  in: {
    en: 'MATERIAL IN', ar: 'إدخال مواد',
    hintEn: 'Items are being brought INTO the property',
    hintAr: 'يتم إدخال المواد إلى العقار',
  },
  out: {
    en: 'MATERIAL OUT', ar: 'إخراج مواد',
    hintEn: 'Items are being taken OUT of the property',
    hintAr: 'يتم إخراج المواد من العقار',
  },
  both: {
    en: 'IN & OUT', ar: 'إدخال وإخراج',
    hintEn: 'Items move both INTO and OUT of the property',
    hintAr: 'يتم إدخال وإخراج المواد من العقار',
  },
};

const STATUS_AR: Record<string, string> = {
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  PENDING: 'قيد الاعتماد',
};

const fmtTime = (t?: string) => (t ? t.slice(0, 5) : '—');

function dayCount(from?: string, to?: string) {
  if (!from) return '';
  const a = new Date(from);
  const b = new Date(to || from);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '';
  const d = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return d > 1 ? `${d} days` : '1 day';
}

export async function buildGatePassPdf(
  d: GatePassData,
  meta: GatePassPdfMeta = {},
  extras: GatePassPdfExtras = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Noto Kufi Arabic — the brand's Arabic face. Optional: if it fails to load
  // the page renders English-only rather than failing outright.
  let arabic;
  if (extras.assets?.arabicFont?.length) {
    try {
      arabic = await pdf.embedFont(extras.assets.arabicFont, { subset: true });
    } catch { arabic = undefined; }
  }
  const fonts: Fonts = { helv, bold, oblique, arabic };

  const W = 595.28, H = 841.89, M = 40;
  const R = W - M;                    // right edge of the content column
  const INNER = R - M;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  /* ---------- Masthead — white, logo, red rule ---------- */
  const headTop = y;
  let logoBottom = headTop;
  if (extras.assets?.logo?.length) {
    try {
      const img = await embedBytes(pdf, extras.assets.logo, 'image/png');
      if (img) {
        const h = 34, w = (img.width / img.height) * h;
        page.drawImage(img, { x: M, y: headTop - h, width: Math.min(w, 150), height: h });
        logoBottom = headTop - h;
      }
    } catch { /* wordmark below still identifies the document */ }
  }
  if (logoBottom === headTop) {
    drawText(page, 'AL HAMRA', M, headTop - 16, 15, fonts, { bold: true, color: CHARCOAL });
    drawText(page, 'REAL ESTATE COMPANY', M, headTop - 25, 6.5, fonts, { color: MUTED });
    logoBottom = headTop - 30;
  }

  if (meta.permitNo) {
    drawTextRight(page, meta.permitNo, R, headTop - 14, 13, fonts, { bold: true, color: CHARCOAL });
    drawTextRight(page, arabic ? 'رقم التصريح' : 'PASS NO.', R, headTop - 24, 6.5, fonts, { color: MUTED });
    if (arabic) drawTextRight(page, 'PASS NO.', R - widthOf('رقم التصريح', 6.5, fonts) - 8, headTop - 24, 6.5, fonts, { color: MUTED });
  }

  y = logoBottom - 14;
  drawText(page, 'MATERIAL GATE PASS', M, y, 13, fonts, { bold: true, color: CHARCOAL });
  // Arabic titling only when the Arabic face loaded — otherwise it would fall
  // back to the "(see system)" placeholder, which is meaningless in a heading.
  if (arabic) drawTextRight(page, 'تصريح إدخال وإخراج مواد', R, y, 12, fonts, { color: CHARCOAL });
  y -= 8;
  page.drawRectangle({ x: M, y: y - 2, width: INNER, height: 2, color: RED });
  y -= 16;

  /* ---------- 1. Direction — the first question at the gate ---------- */
  const dir = DIRECTION_META[d.direction] ?? DIRECTION_META.in;
  const bandH = 58;
  page.drawRectangle({ x: M, y: y - bandH, width: INNER, height: bandH, color: LIGHTGREY });
  page.drawRectangle({ x: M, y: y - bandH, width: 4, height: bandH, color: RED });

  drawText(page, dir.en, M + 18, y - 26, 21, fonts, { bold: true, color: CHARCOAL });
  drawText(page, dir.hintEn, M + 18, y - 40, 7.5, fonts, { color: MUTED });
  if (arabic) {
    drawTextRight(page, dir.ar, R - 14, y - 26, 17, fonts, { color: CHARCOAL });
    drawTextRight(page, dir.hintAr, R - 14, y - 42, 7.5, fonts, { color: MUTED });
  }

  const st = (meta.status || '').toUpperCase();
  if (st) {
    const stColor = st === 'APPROVED' ? GREEN : st === 'REJECTED' ? RED : AMBER;
    const stAr = arabic ? STATUS_AR[st] : '';
    // Drawn as two separate runs so neither script is laid out in the other's
    // direction; a single "EN · AR" string would mirror the Latin half.
    const wEn = widthOf(st, 9, fonts, true);
    const wAr = stAr ? widthOf(stAr, 9, fonts) : 0;
    const gap = stAr ? 10 : 0;
    const bw = wEn + gap + wAr + 20;
    const bx = M + (INNER - bw) / 2;
    page.drawRectangle({ x: bx, y: y - bandH - 9, width: bw, height: 18, color: stColor });
    drawText(page, st, bx + 10, y - bandH - 3, 9, fonts, { bold: true, color: WHITE });
    if (stAr) drawText(page, stAr, bx + 10 + wEn + gap, y - bandH - 3, 9, fonts, { color: WHITE });
  }
  y -= bandH + (st ? 22 : 12);

  /* ---------- 2. Validity window — the second question ---------- */
  const vH = 58;
  page.drawRectangle({ x: M, y: y - vH, width: INNER, height: vH, borderColor: CHARCOAL, borderWidth: 1 });
  page.drawRectangle({ x: M + 1, y: y - 16, width: INNER - 2, height: 15, color: LIGHTGREY });
  drawBilingual(page, 'VALID ONLY WITHIN THIS WINDOW', 'صالح فقط خلال هذه الفترة',
    M + 9, R - 9, y - 12, 7.5, fonts, { bold: true, color: CHARCOAL });

  const colW = INNER / 3;
  const cell = (i: number, en: string, arLbl: string, value: string) => {
    const cx = M + i * colW;
    if (i > 0) page.drawLine({ start: { x: cx, y: y - vH + 4 }, end: { x: cx, y: y - 20 }, thickness: 0.5, color: SUBGREY });
    drawText(page, en, cx + 10, y - 30, 6.5, fonts, { color: MUTED });
    if (arabic) drawTextRight(page, arLbl, cx + colW - 10, y - 30, 6.5, fonts, { color: MUTED });
    drawText(page, clipT(value, colW - 20, 12, fonts, true), cx + 10, y - 47, 12, fonts, { bold: true, color: CHARCOAL });
  };
  cell(0, 'FROM', 'من', fmtDate(d.dateFrom));
  cell(1, 'TO', 'إلى', fmtDate(d.dateTo || d.dateFrom));
  cell(2, 'DAILY BETWEEN', 'يومياً بين', `${fmtTime(d.timeFrom)} — ${fmtTime(d.timeTo)}`);

  const dc = dayCount(d.dateFrom, d.dateTo);
  if (dc) drawTextRight(page, dc, R - 10, y - 47, 7, fonts, { color: MUTED });
  y -= vH + 12;

  /* ---------- 3. Where + who ---------- */
  const kH = 56;
  page.drawRectangle({ x: M, y: y - kH, width: INNER, height: kH, color: LIGHTGREY });
  const k = (i: number, en: string, arLbl: string, value: string) => {
    const w = INNER / 3, cx = M + i * w;
    drawText(page, en, cx + 10, y - 16, 6.5, fonts, { color: MUTED });
    if (arabic) drawTextRight(page, arLbl, cx + w - 10, y - 16, 6.5, fonts, { color: MUTED });
    drawText(page, clipT(value || '—', w - 20, 10, fonts, true), cx + 10, y - 32, 10, fonts, { bold: true, color: CHARCOAL });
  };
  // Unit and floor stay separate: concatenating them makes a mixed-script string
  // when the unit is written in Arabic, which reads as jumbled on the page.
  k(0, 'UNIT', 'الوحدة', d.unit);
  k(1, 'COMPANY', 'الشركة', d.company);
  k(2, 'SITE CONTACT', 'مسؤول الموقع', d.contactPerson);
  if (d.floor) drawText(page, `Floor ${d.floor}`, M + 10, y - 44, 8, fonts, { color: MUTED });
  if (d.mobile) drawText(page, `Mobile: ${d.mobile}`, M + (INNER / 3) * 2 + 10, y - 44, 8, fonts, { color: MUTED });
  if (meta.tenantCompany && meta.tenantCompany !== d.company) {
    const tw = widthOf('Tenant: ', 7.5, fonts);
    drawText(page, 'Tenant: ', M + INNER / 3 + 10, y - 44, 7.5, fonts, { color: MUTED });
    drawText(page, clipT(meta.tenantCompany, INNER / 3 - 30 - tw, 7.5, fonts), M + INNER / 3 + 10 + tw, y - 44, 7.5, fonts, { color: MUTED });
  }
  y -= kH + 12;

  /* ---------- 4. What is moving ---------- */
  const mH = 66;
  page.drawRectangle({ x: M, y: y - mH, width: INNER, height: mH, borderColor: SUBGREY, borderWidth: 0.7 });
  page.drawRectangle({ x: M + 1, y: y - 16, width: INNER - 2, height: 15, color: LIGHTGREY });
  drawBilingual(page, 'MATERIALS', 'المواد', M + 9, R - 9, y - 12, 7.5, fonts, { bold: true, color: CHARCOAL });

  // NB: measured with widthOf and drawn with drawText — never passed through
  // safe(), which would strip Arabic materials text down to its digits.
  const what = (d.whatMoving || '').trim();
  if (what) {
    const maxW = INNER - 20;
    const rtl = /[؀-ۿ]/.test(what) && !!arabic;
    const words = what.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w2 of words) {
      const t = cur ? `${cur} ${w2}` : w2;
      if (widthOf(t, 9, fonts) > maxW) { if (cur) lines.push(cur); cur = w2; } else cur = t;
    }
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((ln, i) => {
      const ly = y - 32 - i * 12;
      // Arabic reads from the right edge of the box.
      if (rtl) drawTextRight(page, ln, R - 10, ly, 9, fonts);
      else drawText(page, ln, M + 10, ly, 9, fonts);
    });
  } else {
    drawText(page, 'To be confirmed on arrival — security to record items at the gate.',
      M + 10, y - 34, 9, fonts, { italic: true, color: MUTED });
    if (arabic) {
      drawText(page, 'يتم التأكيد عند الوصول — على الأمن تسجيل المواد على البوابة.',
        M + 10, y - 50, 8.5, fonts, { color: MUTED });
    }
  }
  y -= mH + 12;

  /* ---------- 5. Gate check — what security must do ---------- */
  const checks: [string, string][] = [
    ['Scan the QR code below and confirm this pass shows APPROVED.',
      'امسح رمز الاستجابة أدناه وتأكد أن التصريح معتمد.'],
    ['Confirm today\'s date and time fall inside the validity window above.',
      'تأكد أن التاريخ والوقت ضمن الفترة المذكورة أعلاه.'],
    ['Match the unit and the company named on this pass before allowing access.',
      'طابق الوحدة والشركة المذكورة قبل السماح بالدخول.'],
  ];
  const rowH = arabic ? 20 : 11;
  const gH = 26 + checks.length * rowH;
  page.drawRectangle({ x: M, y: y - gH, width: INNER, height: gH, borderColor: RED, borderWidth: 0.8 });
  drawText(page, 'SECURITY CHECK AT THE GATE', M + 10, y - 15, 7.5, fonts, { bold: true, color: RED });
  if (arabic) drawTextRight(page, 'تدقيق الأمن على البوابة', R - 10, y - 15, 7.5, fonts, { color: RED });

  checks.forEach(([en, arLine], i) => {
    const cy = y - 30 - i * rowH;
    page.drawRectangle({ x: M + 12, y: cy - 2, width: 7, height: 7, borderColor: RED, borderWidth: 0.7 });
    drawText(page, en, M + 25, cy, 7.5, fonts, { color: CHARCOAL });
    if (arabic) drawTextRight(page, arLine, R - 12, cy - 9, 7.5, fonts, { color: MUTED });
  });
  y -= gH + 14;

  /* ---------- 6. Approvals ---------- */
  const chain = await drawApprovalChain({
    pdf, page, y, W, H, M, fonts,
    approvals: extras.approvals ?? [],
  });
  page = chain.page;
  y = chain.y - 10;

  /* ---------- Requester footprint ---------- */
  if (meta.requesterName || meta.submittedAt) {
    const fy = Math.max(y, M + 50);
    let fx = M;
    if (meta.requesterName) {
      drawText(page, 'Requested by ', fx, fy, 7.5, fonts, { color: MUTED });
      fx += widthOf('Requested by ', 7.5, fonts);
      drawText(page, meta.requesterName, fx, fy, 7.5, fonts, { color: MUTED });
      fx += widthOf(meta.requesterName, 7.5, fonts);
    }
    if (meta.submittedAt) {
      drawText(page, `${meta.requesterName ? '  ·  ' : ''}${fmtDate(meta.submittedAt)}`, fx, fy, 7.5, fonts, { color: MUTED });
    }
  }

  /* ---------- 7. Attachments ---------- */
  await drawAttachmentPages({
    pdf, W, H, M, fonts,
    attachments: extras.attachments ?? [],
    captionEn: 'Documents submitted with this gate pass',
    captionAr: 'المستندات المرفقة مع هذا التصريح',
  });

  /* ---------- 8. Footer + QR on every page ---------- */
  drawFooters({
    pdf, W, M, fonts,
    permitNo: meta.permitNo,
    baseUrl: meta.baseUrl,
    formRef: ['AL HAMRA REAL ESTATE COMPANY', 'Material Gate Pass'],
    note: 'Not valid until approved',
  });

  return pdf.save();
}
