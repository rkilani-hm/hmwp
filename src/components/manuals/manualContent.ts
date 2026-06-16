/**
 * Bilingual user manual content.
 *
 * Structured as data so the page renders both EN and AR from a single source,
 * and so future edits don't require touching JSX.
 *
 * Arabic terminology is locked to match the PDF labels:
 *   تصريح عمل (Work Permit), العميل (Tenant), المقاول (Contractor),
 *   المعتمِد (Approver), المسؤول (Administrator), سلسلة الاعتماد (Approval Chain),
 *   تصريح دخول (Gate Pass), وصف العمل (Work Description), منطقة المبنى (Building Zone),
 *   قيد الانتظار (Pending), معتمد (Approved), مرفوض (Rejected), الإعدادات (Settings),
 *   ملاحظات (Notes).
 */

export type Lang = 'en' | 'ar';
export type Bi = { en: string; ar: string };

export interface ManualSection {
  /** Section heading */
  title: Bi;
  /** Optional intro paragraph */
  intro?: Bi;
  /** Ordered or unordered list of steps/points */
  steps?: Bi[];
  /** Optional callout note */
  note?: Bi;
}

export interface Manual {
  title: Bi;
  subtitle: Bi;
  sections: ManualSection[];
  faqs: { question: Bi; answer: Bi }[];
}

export type ManualKey = 'client' | 'approver' | 'admin' | 'internal';

// ─── CLIENT / TENANT ─────────────────────────────────────────────────────────
const clientManual: Manual = {
  title: { en: 'Tenant User Manual', ar: 'دليل العميل' },
  subtitle: {
    en: 'How to request and track work permits as a tenant',
    ar: 'كيفية تقديم وتتبع تصاريح العمل كعميل',
  },
  sections: [
    {
      title: { en: '1. Sign Up as a Tenant', ar: '١. التسجيل كعميل' },
      intro: {
        en: 'New tenants register through the Tenant Sign Up tab on the login page. An administrator must approve the account before you can log in.',
        ar: 'يقوم العملاء الجدد بالتسجيل عبر تبويب "تسجيل عميل جديد" في صفحة الدخول. يجب أن يعتمد المسؤول الحساب قبل أن تتمكن من تسجيل الدخول.',
      },
      steps: [
        { en: 'Open the login page and switch to the Tenant Sign Up tab.', ar: 'افتح صفحة الدخول وانتقل إلى تبويب تسجيل عميل جديد.' },
        { en: 'Fill in: full name, email, phone, company name, unit and floor.', ar: 'املأ: الاسم الكامل، البريد الإلكتروني، الهاتف، اسم الشركة، الوحدة، والطابق.' },
        { en: 'Choose a strong password (min 8 chars, uppercase, lowercase, number, special character).', ar: 'اختر كلمة مرور قوية (٨ أحرف على الأقل، حرف كبير وصغير ورقم ورمز خاص).' },
        { en: 'Submit. Your account is now pending administrator approval.', ar: 'أرسل الطلب. حسابك الآن قيد الانتظار لاعتماد المسؤول.' },
        { en: 'You will receive an email once the administrator approves the account. Only then can you log in.', ar: 'ستصلك رسالة بريد إلكتروني فور اعتماد الحساب. عندها فقط يمكنك تسجيل الدخول.' },
      ],
      note: {
        en: 'If you try to log in before approval, you will see a "Pending Approval" screen.',
        ar: 'إذا حاولت الدخول قبل الاعتماد، ستظهر لك شاشة "بانتظار الاعتماد".',
      },
    },
    {
      title: { en: '2. The Dashboard', ar: '٢. لوحة التحكم' },
      intro: {
        en: 'After login your dashboard shows your work permits and their status.',
        ar: 'بعد الدخول، تعرض لوحة التحكم تصاريحك وحالتها.',
      },
      steps: [
        { en: 'Draft — saved but not submitted.', ar: 'مسودة — محفوظ ولم يُرسل بعد.' },
        { en: 'Pending — submitted and moving through the approval chain.', ar: 'قيد الانتظار — تم الإرسال وقيد سلسلة الاعتماد.' },
        { en: 'Approved — fully approved, PDF available for download.', ar: 'معتمد — تمت الموافقة بالكامل، وملف PDF متاح للتحميل.' },
        { en: 'Rejected — an approver rejected the request; see comments for the reason.', ar: 'مرفوض — رفض أحد المعتمدين الطلب؛ راجع الملاحظات لمعرفة السبب.' },
        { en: 'Cancelled — you (or admin) cancelled this permit.', ar: 'ملغى — تم إلغاء التصريح من قبلك أو من المسؤول.' },
      ],
    },
    {
      title: { en: '3. Raise a New Permit Request', ar: '٣. تقديم طلب تصريح جديد' },
      intro: {
        en: 'Use the multi-step wizard. Your information is pre-filled from your profile.',
        ar: 'استخدم المعالج متعدد الخطوات. يتم تعبئة بياناتك تلقائياً من ملفك الشخصي.',
      },
      steps: [
        { en: 'Step 1 — Client details: verify your pre-filled name, email, phone, company, unit, floor.', ar: 'الخطوة ١ — بيانات العميل: تحقق من الاسم والبريد والهاتف والشركة والوحدة والطابق.' },
        { en: 'Step 2 — Contractor details: company name, contact person, phone, email.', ar: 'الخطوة ٢ — بيانات المقاول: اسم الشركة، الشخص المختص، الهاتف، البريد الإلكتروني.' },
        { en: 'Step 3 — Work details: work type, Building Zone (Business Tower / Shopping Center / Carpark / Outdoor), location, unit, floor, and a clear Work Description. Mark Back of House if applicable.', ar: 'الخطوة ٣ — تفاصيل العمل: نوع العمل، منطقة المبنى (برج الأعمال / المركز التجاري / المواقف / الخارج)، الموقع، الوحدة، الطابق، ووصف عمل واضح. حدد "خلف الواجهة" إذا كان منطبقاً.' },
        { en: 'Step 4 — Schedule: start/end date and time.', ar: 'الخطوة ٤ — الجدول الزمني: تاريخ ووقت البداية والنهاية.' },
        { en: 'Step 5 — Documents: upload civil IDs of workers and any required attachments.', ar: 'الخطوة ٥ — المستندات: ارفع البطاقات المدنية للعمال وأي مرفقات مطلوبة.' },
        { en: 'Step 6 — Review and submit. The system generates a permit number and routes to the first approver.', ar: 'الخطوة ٦ — المراجعة والإرسال. يولّد النظام رقم التصريح ويوجهه إلى أول معتمِد.' },
      ],
    },
    {
      title: { en: '4. Track Your Permit', ar: '٤. تتبع تصريحك' },
      intro: {
        en: 'Open any permit to see its approval chain timeline.',
        ar: 'افتح أي تصريح لمشاهدة مخطط سلسلة الاعتماد.',
      },
      steps: [
        { en: 'Each step shows the role, the approver, status and timestamp.', ar: 'تعرض كل خطوة الدور، المعتمِد، الحالة، والوقت.' },
        { en: 'You receive notifications when status changes.', ar: 'تصلك إشعارات عند تغيّر الحالة.' },
        { en: 'If "Rework Needed", edit the permit and resubmit.', ar: 'إذا كانت الحالة "بحاجة لتعديل"، عدّل التصريح وأعد إرساله.' },
      ],
    },
    {
      title: { en: '5. Download the Permit PDF', ar: '٥. تحميل ملف التصريح PDF' },
      steps: [
        { en: 'Once Approved, open the permit detail page.', ar: 'بعد الاعتماد، افتح صفحة تفاصيل التصريح.' },
        { en: 'Click "Download PDF" or "Preview" to view it.', ar: 'اضغط "تحميل PDF" أو "معاينة" لعرضه.' },
        { en: 'The PDF includes a QR code that security can scan to verify validity.', ar: 'يتضمن الملف رمز QR يمكن للأمن مسحه للتحقق من الصلاحية.' },
      ],
    },
    {
      title: { en: '6. Your Settings', ar: '٦. الإعدادات الخاصة بك' },
      intro: {
        en: 'In Settings you can manage:',
        ar: 'في الإعدادات يمكنك إدارة:',
      },
      steps: [
        { en: 'Profile (name, phone, company, unit, floor).', ar: 'الملف الشخصي (الاسم، الهاتف، الشركة، الوحدة، الطابق).' },
        { en: 'Push notification preferences.', ar: 'تفضيلات الإشعارات.' },
        { en: 'Language (English / العربية).', ar: 'اللغة (الإنجليزية / العربية).' },
        { en: 'Change Password — same strength rules as sign-up.', ar: 'تغيير كلمة المرور — بنفس قواعد القوة عند التسجيل.' },
      ],
      note: {
        en: 'Tenants do not have signatures or biometric devices — those are for approvers only.',
        ar: 'لا يملك العملاء توقيعات أو أجهزة بيومترية — فهذه خاصة بالمعتمِدين فقط.',
      },
    },
  ],
  faqs: [
    {
      question: { en: 'Why can\'t I log in after signing up?', ar: 'لماذا لا أستطيع الدخول بعد التسجيل؟' },
      answer: { en: 'Your account is pending administrator approval. You will receive an email once approved.', ar: 'حسابك قيد اعتماد المسؤول. ستصلك رسالة فور الاعتماد.' },
    },
    {
      question: { en: 'How do I cancel a permit?', ar: 'كيف ألغي التصريح؟' },
      answer: { en: 'Open the permit and click Cancel Permit. You must provide a reason. Cancellation is allowed before final approval.', ar: 'افتح التصريح واضغط "إلغاء التصريح". يجب تقديم سبب. الإلغاء مسموح قبل الاعتماد النهائي.' },
    },
    {
      question: { en: 'What if my permit is rejected?', ar: 'ماذا لو رُفض تصريحي؟' },
      answer: { en: 'Rejection is final. Read the approver\'s comments, then submit a new permit addressing the issues.', ar: 'الرفض نهائي. اقرأ ملاحظات المعتمِد ثم قدّم تصريحاً جديداً يعالج المشاكل.' },
    },
  ],
};

// ─── APPROVER ───────────────────────────────────────────────────────────────
const approverManual: Manual = {
  title: { en: 'Approver User Manual', ar: 'دليل المعتمِد' },
  subtitle: {
    en: 'How to review, approve, and reject work permits',
    ar: 'كيفية مراجعة واعتماد ورفض تصاريح العمل',
  },
  sections: [
    {
      title: { en: '1. Log In and Open the Approver Inbox', ar: '١. تسجيل الدخول وفتح صندوق المعتمِد' },
      steps: [
        { en: 'Log in with your credentials.', ar: 'سجّل الدخول ببياناتك.' },
        { en: 'Open "Approver Inbox" from the sidebar — it lists permits currently waiting on YOU.', ar: 'افتح "صندوق المعتمِد" من الشريط الجانبي — يعرض التصاريح بانتظارك أنت.' },
        { en: 'Urgent items and SLA-breached items are flagged at the top.', ar: 'تظهر البنود العاجلة والمتجاوزة لمدة الاستجابة في الأعلى.' },
      ],
    },
    {
      title: { en: '2. Review a Permit', ar: '٢. مراجعة التصريح' },
      steps: [
        { en: 'Click a permit to open its full detail page.', ar: 'اضغط على تصريح لفتح صفحة تفاصيله الكاملة.' },
        { en: 'Review Work Description, location, schedule, contractor info, and all attachments.', ar: 'راجع وصف العمل، الموقع، الجدول الزمني، بيانات المقاول، وجميع المرفقات.' },
        { en: 'Check the approval chain to see who approved before you and who is next.', ar: 'راجع سلسلة الاعتماد لمعرفة من اعتمد قبلك ومن سيأتي بعدك.' },
      ],
      note: {
        en: '"First pending" means: only the approver whose step is currently active can act. Later approvers cannot pre-approve.',
        ar: '"الأول قيد الانتظار" يعني: فقط المعتمِد الذي خطوته نشطة حالياً يمكنه التصرف. لا يمكن للمعتمدين اللاحقين الاعتماد مسبقاً.',
      },
    },
    {
      title: { en: '3. Approve or Reject', ar: '٣. الاعتماد أو الرفض' },
      steps: [
        { en: 'Click Approve or Reject. Both open a secure dialog.', ar: 'اضغط اعتماد أو رفض. يفتح كلاهما نافذة آمنة.' },
        { en: 'Re-authenticate with your chosen method: Password OR Biometric (fingerprint / Face ID via WebAuthn).', ar: 'أعد التحقق بطريقتك المختارة: كلمة المرور أو البصمة/الوجه (WebAuthn).' },
        { en: 'Add comments (mandatory for rejection).', ar: 'أضف ملاحظات (إلزامية عند الرفض).' },
        { en: 'Confirm. Your saved signature & initials are embedded in the permit PDF.', ar: 'أكد. يتم تضمين توقيعك وأحرفك الأولى المحفوظة في ملف التصريح.' },
        { en: 'The permit automatically moves to the next approver, or to Approved/Rejected if you are the last.', ar: 'ينتقل التصريح تلقائياً للمعتمِد التالي، أو إلى "معتمد/مرفوض" إذا كنت الأخير.' },
      ],
    },
    {
      title: { en: '4. Your Settings', ar: '٤. إعداداتك' },
      intro: {
        en: 'In Settings, approvers configure:',
        ar: 'في الإعدادات، يقوم المعتمِدون بضبط:',
      },
      steps: [
        { en: 'Profile and Change Password.', ar: 'الملف الشخصي وتغيير كلمة المرور.' },
        { en: 'Push notification preferences.', ar: 'تفضيلات الإشعارات.' },
        { en: 'Approval Authentication method (password or biometric).', ar: 'طريقة المصادقة على الاعتماد (كلمة مرور أو بيومترية).' },
        { en: 'Saved Signature and Initials — these are stamped into PDFs you approve.', ar: 'التوقيع والأحرف الأولى المحفوظة — تُختم على ملفات PDF التي تعتمدها.' },
        { en: 'Biometric Devices — register a fingerprint or Face ID device for fast sign-off.', ar: 'الأجهزة البيومترية — سجّل جهازاً ببصمة أو Face ID للاعتماد السريع.' },
      ],
    },
  ],
  faqs: [
    {
      question: { en: 'Can I delegate my approvals?', ar: 'هل يمكنني تفويض اعتماداتي؟' },
      answer: { en: 'Yes — use My Delegations to assign a substitute for a date range.', ar: 'نعم — استخدم "تفويضاتي" لتعيين بديل لفترة محددة.' },
    },
    {
      question: { en: 'Why can\'t I approve this permit?', ar: 'لماذا لا أستطيع اعتماد هذا التصريح؟' },
      answer: { en: 'Either it is not your turn in the chain yet, or another approver in your role already actioned it.', ar: 'إما أن دورك لم يحن بعد في السلسلة، أو أن معتمداً آخر في نفس الدور قد تصرّف فيه.' },
    },
    {
      question: { en: 'I forgot my approval password.', ar: 'نسيت كلمة مرور الاعتماد.' },
      answer: { en: 'The approval password is your login password. Reset it from the login page or Settings → Change Password.', ar: 'كلمة مرور الاعتماد هي نفسها كلمة مرور الدخول. أعد ضبطها من صفحة الدخول أو الإعدادات ← تغيير كلمة المرور.' },
    },
  ],
};

// ─── ADMIN ──────────────────────────────────────────────────────────────────
const adminManual: Manual = {
  title: { en: 'Administrator User Manual', ar: 'دليل المسؤول' },
  subtitle: {
    en: 'System administration: users, workflows, reports',
    ar: 'إدارة النظام: المستخدمون، سير العمل، التقارير',
  },
  sections: [
    {
      title: { en: '1. User Management', ar: '١. إدارة المستخدمين' },
      steps: [
        { en: 'Pending Tenants — review new tenant sign-ups. Approving a tenant grants the "tenant" role and sends them an approval email so they can log in.', ar: 'العملاء قيد الانتظار — راجع التسجيلات الجديدة. اعتماد العميل يمنحه دور "tenant" ويُرسل بريد اعتماد ليتمكن من الدخول.' },
        { en: 'Create staff/approver users via the Create User dialog (name, email, phone, role).', ar: 'أنشئ مستخدمي موظفين/معتمدين عبر نافذة "إنشاء مستخدم" (الاسم، البريد، الهاتف، الدور).' },
        { en: 'Edit a user to update profile, enable/disable, or assign additional roles.', ar: 'عدّل المستخدم لتحديث الملف الشخصي، أو التفعيل/التعطيل، أو تعيين أدوار إضافية.' },
        { en: 'Reset Password — sends a reset link to the user\'s email.', ar: 'إعادة تعيين كلمة المرور — يُرسل رابط إعادة التعيين إلى بريد المستخدم.' },
        { en: 'Sync Users — reconciles Auth metadata into the public profiles table.', ar: 'مزامنة المستخدمين — تطابق بيانات المصادقة مع جدول الملفات العامة.' },
      ],
    },
    {
      title: { en: '2. Roles & Permissions', ar: '٢. الأدوار والصلاحيات' },
      steps: [
        { en: 'Manage roles and which permissions each role grants.', ar: 'إدارة الأدوار والصلاحيات التي يمنحها كل دور.' },
        { en: 'Roles drive both UI visibility and what each user is allowed to do.', ar: 'تتحكم الأدوار في ظهور الواجهات وفي ما يحق لكل مستخدم فعله.' },
      ],
    },
    {
      title: { en: '3. Workflows, Work Types, Work Locations', ar: '٣. سير العمل، أنواع العمل، مواقع العمل' },
      steps: [
        { en: 'Workflow Builder — define approval chains as templates (steps, roles, order).', ar: 'منشئ سير العمل — عرّف سلاسل الاعتماد كقوالب (خطوات، أدوار، ترتيب).' },
        { en: 'Work Types — each type maps to a workflow template and required fields.', ar: 'أنواع العمل — يرتبط كل نوع بقالب سير عمل وحقول مطلوبة.' },
        { en: 'Work Locations — managed list of locations selectable in the permit form.', ar: 'مواقع العمل — قائمة مُدارة من المواقع القابلة للاختيار في نموذج التصريح.' },
      ],
    },
    {
      title: { en: '4. Reports & Performance', ar: '٤. التقارير والأداء' },
      steps: [
        { en: 'Reports — counts, status breakdowns, exports to CSV.', ar: 'التقارير — أعداد، تحليلات الحالة، تصدير إلى CSV.' },
        { en: 'Approver Performance — average approval times, SLA breach rates per approver.', ar: 'أداء المعتمِدين — متوسطات أوقات الاعتماد، نسب تجاوز مدة الاستجابة لكل معتمِد.' },
        { en: 'SLA Dashboard — live view of permits at risk of breaching SLA.', ar: 'لوحة الاستجابة — عرض مباشر للتصاريح المعرضة لتجاوز المدة.' },
      ],
    },
    {
      title: { en: '5. Public / Anonymous Permit Intake', ar: '٥. استقبال التصاريح العامة/المجهولة' },
      intro: {
        en: 'The /request-permit endpoint allows walk-up internal requests without login.',
        ar: 'يتيح مسار /request-permit إرسال طلبات داخلية دون تسجيل دخول.',
      },
      steps: [
        { en: 'The form is CAPTCHA-protected (Cloudflare Turnstile).', ar: 'النموذج محمي بـ CAPTCHA (Cloudflare Turnstile).' },
        { en: 'Submissions are rate-limited per IP on the server side.', ar: 'تُحدد الإرسالات بمعدل لكل IP على جانب الخادم.' },
        { en: 'Submitted permits enter the standard internal workflow and appear in admin lists with the INT- prefix.', ar: 'تدخل التصاريح المُرسلة سير العمل الداخلي وتظهر في قوائم المسؤول بالبادئة -INT.' },
      ],
    },
  ],
  faqs: [
    {
      question: { en: 'A tenant says they didn\'t get the approval email.', ar: 'يقول العميل إنه لم يستلم بريد الاعتماد.' },
      answer: { en: 'Check spam, then use Reset Password to resend a link, or verify the email address in their profile.', ar: 'تحقق من البريد المهمل، ثم استخدم إعادة تعيين كلمة المرور لإعادة الإرسال، أو تأكد من البريد في ملفه.' },
    },
    {
      question: { en: 'How do I change an approval chain for one specific permit?', ar: 'كيف أغير سلسلة الاعتماد لتصريح واحد بعينه؟' },
      answer: { en: 'Open the permit and use Modify Workflow — overrides are logged in the audit trail.', ar: 'افتح التصريح واستخدم "تعديل سير العمل" — تُسجّل التعديلات في سجل التدقيق.' },
    },
  ],
};

// ─── INTERNAL / CONTRACTOR (public intake) ──────────────────────────────────
const internalManual: Manual = {
  title: { en: 'Contractor / Public Intake Manual', ar: 'دليل المقاول / الإرسال العام' },
  subtitle: {
    en: 'Submitting a permit without an account via /request-permit',
    ar: 'إرسال تصريح دون حساب عبر /request-permit',
  },
  sections: [
    {
      title: { en: '1. Open the Public Request Page', ar: '١. افتح صفحة الطلب العام' },
      steps: [
        { en: 'Go to /request-permit (or scan the QR poster).', ar: 'انتقل إلى /request-permit (أو امسح ملصق الـ QR).' },
        { en: 'No login is required.', ar: 'لا يلزم تسجيل دخول.' },
      ],
    },
    {
      title: { en: '2. Fill in the Form', ar: '٢. املأ النموذج' },
      steps: [
        { en: 'Your contact details (name, email, phone, company).', ar: 'بيانات الاتصال الخاصة بك (الاسم، البريد، الهاتف، الشركة).' },
        { en: 'Work details: type, building zone, location, Work Description.', ar: 'تفاصيل العمل: النوع، منطقة المبنى، الموقع، وصف العمل.' },
        { en: 'Schedule and any attachments (civil IDs, method statements).', ar: 'الجدول الزمني وأي مرفقات (البطاقات المدنية، بيانات الأسلوب).' },
      ],
    },
    {
      title: { en: '3. Complete CAPTCHA and Submit', ar: '٣. أكمل CAPTCHA وأرسل' },
      steps: [
        { en: 'Solve the Cloudflare Turnstile challenge.', ar: 'حل تحدي Cloudflare Turnstile.' },
        { en: 'Submit. You will receive a confirmation email with your permit reference.', ar: 'أرسل. ستصلك رسالة تأكيد تحتوي على رقم تصريحك.' },
      ],
    },
    {
      title: { en: '4. Track Status', ar: '٤. تتبع الحالة' },
      steps: [
        { en: 'Use the link in the confirmation email, or the public status page, to track your permit through the approval chain.', ar: 'استخدم الرابط في رسالة التأكيد، أو صفحة الحالة العامة، لتتبع تصريحك عبر سلسلة الاعتماد.' },
      ],
    },
  ],
  faqs: [
    {
      question: { en: 'I never got the confirmation email.', ar: 'لم تصلني رسالة التأكيد.' },
      answer: { en: 'Check spam. If still missing, resubmit — make sure the email you typed is correct.', ar: 'تحقق من البريد المهمل. إذا لم تجدها، أعد الإرسال وتأكد من صحة البريد الإلكتروني.' },
    },
  ],
};

export const MANUALS: Record<ManualKey, Manual> = {
  client: clientManual,
  approver: approverManual,
  admin: adminManual,
  internal: internalManual,
};

export const MANUAL_TAB_LABELS: Record<ManualKey, Bi> = {
  client: { en: 'Tenant', ar: 'العميل' },
  approver: { en: 'Approver', ar: 'المعتمِد' },
  admin: { en: 'Administrator', ar: 'المسؤول' },
  internal: { en: 'Contractor', ar: 'المقاول' },
};
