import { PDFDocument, StandardFonts, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PhotoshootData } from '@/components/forms/permit-steps/PhotoshootDetailsStep';
import type { PdfAssets } from './brand';
import {
  RED, CHARCOAL, SUBGREY, LIGHTGREY, WHITE, MUTED,
  drawText, drawTextRight, sectionBar, widthOf, clipT,
  drawApprovalChain, drawAttachmentPages, drawFooters, embedBytes,
  type ApprovalRow, type AttachmentItem, type Fonts,
} from './pdfCommon';

/**
 * Al Hamra "PHOTO SHOOT FORM" (MPR 13/03/F/I/01 v1.1) — bilingual
 * (English / العربية), rendered in the Al Hamra identity.
 *
 * Keeps the official form's section order and field list so it stays the same
 * document the team signs off on, but the page is white with charcoal text and
 * light-grey surfaces, brand red used only as an accent, and the real logo in
 * the masthead — per the identity guidelines (the earlier draft used a blue
 * borrowed from the scanned paper form, which is not a brand colour).
 *
 * Plain pdf-lib primitives only, so it ports into the generate-permit-pdf edge
 * function unchanged — the assets just come from that bundle instead.
 */

export interface PhotoshootPdfMeta {
  permitNo?: string;
  status?: string;
  requesterName?: string;
  /** Base URL for the public verification page the QR points at. */
  baseUrl?: string;
}

export type PhotoshootApproval = ApprovalRow;
export type PhotoshootAttachment = AttachmentItem;

export interface PhotoshootPdfExtras {
  approvals?: PhotoshootApproval[];
  attachments?: PhotoshootAttachment[];
  assets?: PdfAssets;
}

/** Uppercase for the form's "CAPITAL letters only" rule — a no-op on Arabic. */
function up(v?: string) {
  return (v ?? '').trim().toUpperCase();
}

function fmt(v?: string) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export async function buildPhotoshootPdf(
  d: PhotoshootData,
  meta: PhotoshootPdfMeta = {},
  extras: PhotoshootPdfExtras = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Noto Kufi Arabic — the brand Arabic face. Optional: without it the form
  // renders English-only rather than failing.
  let arabic;
  if (extras.assets?.arabicFont?.length) {
    try {
      arabic = await pdf.embedFont(extras.assets.arabicFont, { subset: true });
    } catch { arabic = undefined; }
  }
  const fonts: Fonts = { helv, bold, oblique, arabic };

  const W = 595.28, H = 841.89, M = 34;
  const R = W - M;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  /** Start a new page when `h` points won't fit above the footer. */
  const ensure = (h: number) => {
    if (y - h < M + 44) { page = pdf.addPage([W, H]); y = H - M; }
  };

  /** Bilingual label — English at x, Arabic right-aligned — over a ruled value. */
  const labelRow = (en: string, arLbl: string, size = 8) => {
    drawText(page, en, M, y, size, fonts, { bold: true, color: CHARCOAL });
    if (arLbl && arabic) drawTextRight(page, arLbl, R, y, size, fonts, { color: MUTED });
  };

  /** A labelled field with the value sitting on an underline. */
  const field = (
    en: string, arLbl: string, value: string,
    x: number, width: number, labelW?: number, size = 8,
  ) => {
    drawText(page, en, x, y, size, fonts, { color: CHARCOAL });
    let lw = labelW ?? widthOf(en, size, fonts) + 6;
    if (arLbl && arabic) {
      // Arabic sits under the English label, so the value line stays on one row.
      drawText(page, arLbl, x, y - 8, 6.5, fonts, { color: MUTED });
      lw = Math.max(lw, widthOf(arLbl, 6.5, fonts) + 6);
    }
    const lineX = x + lw;
    const lineW = width - lw;
    page.drawLine({
      start: { x: lineX, y: y - 2.5 }, end: { x: lineX + lineW, y: y - 2.5 },
      thickness: 0.6, color: SUBGREY,
    });
    if (value) drawText(page, clipT(value, lineW - 6, size, fonts), lineX + 3, y, size, fonts, { bold: true });
  };

  /** Full-width label with the answer on the line beneath it. */
  const fieldBelow = (en: string, arLbl: string, value: string, size = 8) => {
    labelRow(en, arLbl, size);
    page.drawLine({
      start: { x: M, y: y - 13 }, end: { x: R, y: y - 13 },
      thickness: 0.6, color: SUBGREY,
    });
    if (value) drawText(page, clipT(value, R - M - 6, size, fonts), M + 3, y - 10.5, size, fonts, { bold: true });
  };

  const checkbox = (x: number, yy: number, checked: boolean, label: string, size = 8) => {
    const s = 7.5;
    page.drawRectangle({
      x, y: yy - 1, width: s, height: s,
      borderColor: checked ? RED : SUBGREY, borderWidth: 0.7,
      color: checked ? RED : undefined,
    });
    if (checked) {
      page.drawLine({ start: { x: x + 1.5, y: yy + 2.5 }, end: { x: x + 3, y: yy + 0.6 }, thickness: 1.1, color: WHITE });
      page.drawLine({ start: { x: x + 3, y: yy + 0.6 }, end: { x: x + 6.2, y: yy + 5.2 }, thickness: 1.1, color: WHITE });
    }
    drawText(page, label, x + s + 3.5, yy, size, fonts, { color: CHARCOAL });
    return x + s + 6 + widthOf(label, size, fonts);
  };

  /** Bilingual question line, with the checkbox row drawn beneath it. */
  const question = (en: string, arQ: string) => {
    drawText(page, en, M, y, 8, fonts, { bold: true, color: CHARCOAL });
    if (arQ && arabic) drawTextRight(page, arQ, R, y, 8, fonts, { color: MUTED });
    y -= 13;
  };

  /* ---------- Masthead ---------- */
  const headTop = y;
  let logoBottom = headTop;
  if (extras.assets?.logo?.length) {
    try {
      const img = await embedBytes(pdf, extras.assets.logo, 'image/png');
      if (img) {
        const h = 32, w = (img.width / img.height) * h;
        page.drawImage(img, { x: M, y: headTop - h, width: Math.min(w, 140), height: h });
        logoBottom = headTop - h;
      }
    } catch { /* wordmark below still identifies the document */ }
  }
  if (logoBottom === headTop) {
    drawText(page, 'AL HAMRA', M, headTop - 15, 14, fonts, { bold: true, color: CHARCOAL });
    drawText(page, 'REAL ESTATE COMPANY', M, headTop - 24, 6, fonts, { color: MUTED });
    logoBottom = headTop - 29;
  }

  if (meta.permitNo) {
    drawTextRight(page, meta.permitNo, R, headTop - 13, 12, fonts, { bold: true, color: CHARCOAL });
    if (meta.status) {
      drawTextRight(page, meta.status.toUpperCase(), R, headTop - 24, 8, fonts, { bold: true, color: RED });
    }
  }

  y = logoBottom - 14;
  drawText(page, 'PHOTO SHOOT FORM', M, y, 15, fonts, { bold: true, color: CHARCOAL });
  if (arabic) drawTextRight(page, 'استمارة جلسة تصوير', R, y, 13, fonts, { color: CHARCOAL });
  y -= 8;
  page.drawRectangle({ x: M, y: y - 2, width: R - M, height: 2, color: RED });
  y -= 14;

  /* ---------- Intro ---------- */
  [
    'In an attempt to enhance the services we provide your esteemed company, and in order to develop and',
    'enhance our communication channels, you are kindly requested to fill the below and submit this form to',
    'Al Hamra Real Estate Co., as soon as possible.',
  ].forEach((line) => { drawText(page, line, M, y, 7.5, fonts, { color: MUTED }); y -= 9.5; });
  if (arabic) {
    y -= 2;
    drawTextRight(page, 'نرجو منكم تعبئة النموذج أدناه وإرساله إلى شركة الحمراء العقارية في أقرب وقت ممكن.', R, y, 7.5, fonts, { color: MUTED });
    y -= 11;
  }
  drawText(page, '*Please type in CAPITAL letters only.', M, y, 7, fonts, { italic: true, color: RED });
  if (arabic) drawTextRight(page, 'يرجى الكتابة بأحرف كبيرة فقط', R, y, 7, fonts, { color: RED });
  y -= 14;

  /* ---------- Requester ---------- */
  y = sectionBar(page, 'REQUESTER', 'مقدم الطلب', M, R, y, fonts) - 16;
  const half = (R - M) / 2;

  field('Company', 'الشركة', up(d.company), M, half + 30, 52);
  field('Sector', 'القطاع', up(d.sector), M + half + 50, R - (M + half + 50), 34);
  y -= 20;
  field('Address', 'العنوان', up(d.address), M, R - M, 52);
  y -= 20;
  field('Official Contact Person', 'مسؤول التواصل', up(d.contactPerson), M, R - M, 108);
  y -= 20;
  field('Position', 'المنصب', up(d.position), M, half, 52);
  field('Email', 'البريد الإلكتروني', up(d.email), M + half + 20, R - (M + half + 20), 60);
  y -= 20;
  field('Tel.', 'الهاتف', up(d.tel), M, half, 52);
  y -= 22;

  /* ---------- About the shoot ---------- */
  ensure(120);
  y = sectionBar(page, 'ABOUT THE PHOTO SHOOT', 'عن جلسة التصوير', M, R, y, fonts) - 16;

  fieldBelow('The Purpose of the Photo Shoot', 'الغرض من جلسة التصوير', up(d.purpose)); y -= 30;
  fieldBelow('Al Hamra benefits or credit from this photo shoot', 'استفادة الحمراء من جلسة التصوير', up(d.alhamraBenefit)); y -= 30;
  fieldBelow('The commission channels we should inform within Al Hamra', 'الجهات التي يجب إبلاغها في الحمراء', up(d.commissionChannels)); y -= 32;

  /* ---------- Location & schedule ---------- */
  ensure(90);
  y = sectionBar(page, 'LOCATION & SCHEDULE', 'الموقع والجدول الزمني', M, R, y, fonts) - 16;

  field('Photo shoot location', 'موقع التصوير', up(d.location), M, half + 30, 96);
  field('More Info', 'معلومات إضافية', up(d.locationMoreInfo), M + half + 50, R - (M + half + 50), 52);
  y -= 22;
  field('Date / From', 'التاريخ من', fmt(d.dateFrom), M, 175, 60);
  field('To', 'إلى', fmt(d.dateTo), M + 185, 90, 18);
  field('Time / From', 'الوقت من', d.timeFrom || '', M + 290, 120, 60);
  field('To', 'إلى', d.timeTo || '', M + 420, R - (M + 420), 18);
  y -= 24;

  /* ---------- Scale ---------- */
  ensure(90);
  y = sectionBar(page, 'SCALE OF THE SHOOT', 'حجم جلسة التصوير', M, R, y, fonts) - 16;

  question('Number of cameras', 'عدد الكاميرات');
  let cx = M + 4;
  ['1', '2', '3'].forEach((n) => { cx = checkbox(cx, y, d.numCameras === n, n) + 10; });
  cx = checkbox(cx, y, d.numCameras === 'more', 'More') + 4;
  if (d.numCameras === 'more' && d.numCamerasOther) drawText(page, d.numCamerasOther, cx, y, 8, fonts, { bold: true });
  y -= 18;

  question('Number of people', 'عدد الأشخاص');
  cx = M + 4;
  ['1', '2', '3', '4'].forEach((n) => { cx = checkbox(cx, y, d.numPeople === n, n) + 10; });
  cx = checkbox(cx, y, d.numPeople === 'more', 'More') + 4;
  if (d.numPeople === 'more' && d.numPeopleOther) drawText(page, d.numPeopleOther, cx, y, 8, fonts, { bold: true });
  y -= 20;

  /* ---------- Nature of the shoot ---------- */
  ensure(110);
  y = sectionBar(page, 'NATURE OF THE SHOOT', 'طبيعة التصوير', M, R, y, fonts) - 16;

  question('Reason of photo shoot', 'سبب التصوير');
  cx = M + 4;
  ([['editorial', 'Editorial'], ['fashion', 'Fashion'], ['online', 'Online'],
    ['magazine', 'Magazine'], ['personal', 'Personal'], ['other', 'Other']] as const)
    .forEach(([k, l]) => { cx = checkbox(cx, y, d.reason === k, l) + 8; });
  if (d.reason === 'other' && d.reasonOther) {
    page.drawLine({ start: { x: cx, y: y - 2.5 }, end: { x: R, y: y - 2.5 }, thickness: 0.6, color: SUBGREY });
    drawText(page, clipT(up(d.reasonOther), R - cx - 4, 8, fonts), cx + 3, y, 8, fonts, { bold: true });
  }
  y -= 18;

  question('Type of photo shoot', 'نوع التصوير');
  cx = M + 4;
  cx = checkbox(cx, y, d.typeVideography, 'Videography') + 12;
  checkbox(cx, y, d.typePhotography, 'Photography');
  y -= 18;

  question('Equipment to be used', 'المعدات المستخدمة');
  cx = M + 4;
  cx = checkbox(cx, y, d.equipDrones, 'Drones') + 10;
  cx = checkbox(cx, y, d.equipCranes, 'Cranes') + 10;
  cx = checkbox(cx, y, d.equipTripods, 'Tripods') + 10;
  cx = checkbox(cx, y, d.equipOther, 'Other') + 4;
  if (d.equipOther && d.equipOtherText) {
    page.drawLine({ start: { x: cx, y: y - 2.5 }, end: { x: R, y: y - 2.5 }, thickness: 0.6, color: SUBGREY });
    drawText(page, clipT(up(d.equipOtherText), R - cx - 4, 8, fonts), cx + 3, y, 8, fonts, { bold: true });
  }
  y -= 22;

  /* ---------- People ---------- */
  ensure(110);
  y = sectionBar(page, 'PEOPLE', 'الأشخاص', M, R, y, fonts) - 16;

  const contactRow = (name: string, email: string, tel: string) => {
    field('Name', 'الاسم', up(name), M, 175, 34);
    field('Email', 'البريد', up(email), M + 185, 200, 34);
    field('Tel.', 'الهاتف', up(tel), M + 395, R - (M + 395), 26);
  };

  drawText(page, 'On-location contact', M, y, 8, fonts, { bold: true, color: CHARCOAL });
  if (arabic) drawTextRight(page, 'مسؤول التواصل في الموقع', R, y, 8, fonts, { color: MUTED });
  y -= 15;
  contactRow(d.onLocName, d.onLocEmail, d.onLocTel);
  y -= 24;

  drawText(page, 'Who will be photographed in the session?', M, y, 8, fonts, { bold: true, color: CHARCOAL });
  if (arabic) drawTextRight(page, 'من سيتم تصويره في الجلسة', R, y, 8, fonts, { color: MUTED });
  y -= 15;
  contactRow(d.subjectName, d.subjectEmail, d.subjectTel);
  y -= 24;

  /* ---------- Publication ---------- */
  ensure(80);
  y = sectionBar(page, 'PUBLICATION', 'النشر', M, R, y, fonts) - 16;

  fieldBelow('Name of publication / Platform the photo shoot will appear in (If Applicable)',
    'اسم النشرة أو المنصة', up(d.publicationName));
  y -= 30;
  fieldBelow('Name of organization producing / managing the publication / platform (If Applicable)',
    'الجهة المنتجة أو المديرة للنشرة', up(d.producingOrg));
  y -= 30;

  /* ---------- Guidelines ---------- */
  const guidelines: [string, string][] = [
    ['Reply will be provided within 3 working days for the photo shoot form approval.',
      'سيتم الرد خلال 3 أيام عمل لاعتماد الاستمارة.'],
    ['Damage of any items during the session is the responsibility of the company/personnel requesting the shoot.',
      'الشركة أو الأشخاص مقدمو الطلب مسؤولون عن أي أضرار أثناء الجلسة.'],
    ['Security will be provided from Al Hamra to attend each photo shoot session mandatorily.',
      'يرافق أمن الحمراء كل جلسة تصوير إلزامياً.'],
    ['Al Hamra name is to be mentioned as the venue and should be part of the promotion/usage of the photos.',
      'يجب ذكر اسم الحمراء كموقع التصوير عند استخدام أو نشر الصور.'],
    ['Civil ID should be attached for each individual part of the photo shoot.',
      'يجب إرفاق البطاقة المدنية لكل شخص مشارك في التصوير.'],
  ];
  ensure(30 + guidelines.length * (arabic ? 19 : 11));
  y = sectionBar(page, 'STANDARD GUIDELINES', 'الإرشادات العامة', M, R, y, fonts) - 14;

  guidelines.forEach(([en, arLine]) => {
    page.drawCircle({ x: M + 3, y: y + 2.5, size: 1.2, color: RED });
    drawText(page, en, M + 10, y, 7.5, fonts, { color: CHARCOAL });
    y -= 10;
    if (arabic) { drawTextRight(page, arLine, R, y, 7.5, fonts, { color: MUTED }); y -= 11; }
  });
  y -= 10;

  /* ---------- Approvals (replaces the paper "Al Hamra approval only" block) ---------- */
  const chain = await drawApprovalChain({
    pdf, page, y, W, H, M, fonts,
    approvals: extras.approvals ?? [],
  });
  page = chain.page;

  /* ---------- Attachments ---------- */
  await drawAttachmentPages({
    pdf, W, H, M, fonts,
    attachments: extras.attachments ?? [],
    captionEn: 'Civil IDs & supporting documents',
    captionAr: 'البطاقات المدنية والمستندات المرفقة',
  });

  /* ---------- Footer + QR on every page ---------- */
  drawFooters({
    pdf, W, M, fonts,
    permitNo: meta.permitNo,
    baseUrl: meta.baseUrl,
    formRef: ['MPR 13/03/F/I/01', 'Version 1.1  ·  For Internal & External Use'],
    note: meta.requesterName ? `Submitted by: ${meta.requesterName}` : undefined,
  });

  return pdf.save();
}
