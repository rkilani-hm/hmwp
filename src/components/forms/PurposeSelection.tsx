import { Card, CardContent } from '@/components/ui/card';
import { PackageOpen, Wrench, PencilRuler, HardHat, Camera, ChevronRight } from 'lucide-react';
import type { RequestCategory } from './PermitFormWizard';

/**
 * Step 1 of the single request road map. Users don't classify permits — they
 * just pick the PURPOSE, and the system decides the type, form fields and
 * workflow. Bilingual (English + Arabic) so it's clear to every tenant.
 */
const OPTIONS: {
  key: RequestCategory;
  icon: typeof PackageOpen;
  titleEn: string;
  titleAr: string;
  blurbEn: string;
  blurbAr: string;
}[] = [
  {
    key: 'gate_pass',
    icon: PackageOpen,
    titleEn: 'Move material in and out',
    titleAr: 'إدخال وإخراج مواد',
    blurbEn: 'Material Gate Pass — deliveries, supplies, furniture, equipment or personal items. Nothing is fixed or installed.',
    blurbAr: 'تصريح إدخال وإخراج مواد — بضائع، مستلزمات، أثاث، معدات أو أغراض شخصية، بدون أي أعمال تركيب أو إصلاح.',
  },
  {
    key: 'maintenance',
    icon: Wrench,
    titleEn: 'Maintenance & repairs',
    titleAr: 'صيانة وإصلاحات',
    blurbEn: 'Fixing or servicing something in the unit — electrical, plumbing, A/C, painting or general repairs.',
    blurbAr: 'إصلاح أو صيانة داخل الوحدة — كهرباء، سباكة، تكييف، دهان أو إصلاحات عامة.',
  },
  {
    key: 'unit_modification',
    icon: PencilRuler,
    titleEn: 'Unit modifications',
    titleAr: 'تعديلات على الوحدة',
    blurbEn: 'Changing or altering the existing unit — partitions, joinery, flooring or other alterations.',
    blurbAr: 'تغيير أو تعديل الوحدة القائمة — قواطع، نجارة، أرضيات أو تعديلات أخرى.',
  },
  {
    key: 'tenant_fitout',
    icon: HardHat,
    titleEn: 'New tenant fit-out',
    titleAr: 'تجهيز وحدة لمستأجر جديد',
    blurbEn: 'Fitting out a new unit for the first time before opening — full contractor fit-out works.',
    blurbAr: 'تجهيز وحدة جديدة لأول مرة قبل الافتتاح — أعمال تجهيز كاملة عبر مقاول.',
  },
  {
    key: 'photoshoot',
    icon: Camera,
    titleEn: 'Photo shoot session',
    titleAr: 'جلسة تصوير',
    blurbEn: 'Photography, filming, video crew or event coverage at Al Hamra.',
    blurbAr: 'تصوير فوتوغرافي أو فيديو أو تغطية فعالية في الحمراء.',
  },
];

export function PurposeSelection({ onSelect }: { onSelect: (c: RequestCategory) => void }) {
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* mini road map */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-primary">1. Purpose</span>
        <ChevronRight className="h-3 w-3" />
        <span>2. Details</span>
        <ChevronRight className="h-3 w-3" />
        <span>3. Review &amp; submit</span>
      </div>

      <div>
        <h2 className="text-lg font-semibold">What is the purpose of this request?</h2>
        <p className="text-base font-semibold text-muted-foreground" dir="rtl">ما هو الغرض من هذا الطلب؟</p>
        <p className="text-sm text-muted-foreground mt-1">
          Pick one — we'll set up the right form for you.
          <span dir="rtl" className="block">اختر واحداً وسنجهّز لك النموذج المناسب.</span>
        </p>
      </div>

      <div className="space-y-3">
        {OPTIONS.map(({ key, icon: Icon, titleEn, titleAr, blurbEn, blurbAr }) => (
          <Card
            key={key}
            className="cursor-pointer transition-all hover:border-primary/60 hover:shadow-md active:scale-[0.99]"
            onClick={() => onSelect(key)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(key)}
          >
            <CardContent className="flex items-center gap-4 p-4 sm:p-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold text-base">{titleEn}</p>
                  <p className="font-semibold text-base text-primary shrink-0" dir="rtl">{titleAr}</p>
                </div>
                <p className="text-sm text-muted-foreground">{blurbEn}</p>
                <p className="text-sm text-muted-foreground" dir="rtl">{blurbAr}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
