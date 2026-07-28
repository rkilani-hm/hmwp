import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { WorkflowTypeSelect } from './WorkflowTypeSelect';
import { AutoWorkflowChip } from './AutoWorkflowChip';

/**
 * Photoshoot request details — mirrors Al Hamra's "Photo Shoot Form"
 * (MPR 13/03/F/I/01). Shown as the details step when the request purpose is a
 * photo shoot. Bilingual labels (English · Arabic).
 */
export interface PhotoshootData {
  company: string; sector: string; address: string;
  contactPerson: string; position: string; email: string; tel: string;
  purpose: string; alhamraBenefit: string; commissionChannels: string;
  location: string; locationMoreInfo: string;
  dateFrom: string; dateTo: string; timeFrom: string; timeTo: string;
  numCameras: string; numCamerasOther: string;
  numPeople: string; numPeopleOther: string;
  reason: string; reasonOther: string;
  typeVideography: boolean; typePhotography: boolean;
  equipDrones: boolean; equipCranes: boolean; equipTripods: boolean; equipOther: boolean; equipOtherText: string;
  onLocName: string; onLocEmail: string; onLocTel: string;
  subjectName: string; subjectEmail: string; subjectTel: string;
  publicationName: string; producingOrg: string;
}

export const emptyPhotoshootData: PhotoshootData = {
  company: '', sector: '', address: '', contactPerson: '', position: '', email: '', tel: '',
  purpose: '', alhamraBenefit: '', commissionChannels: '', location: '', locationMoreInfo: '',
  dateFrom: '', dateTo: '', timeFrom: '', timeTo: '',
  numCameras: '1', numCamerasOther: '', numPeople: '1', numPeopleOther: '',
  reason: '', reasonOther: '', typeVideography: false, typePhotography: false,
  equipDrones: false, equipCranes: false, equipTripods: false, equipOther: false, equipOtherText: '',
  onLocName: '', onLocEmail: '', onLocTel: '', subjectName: '', subjectEmail: '', subjectTel: '',
  publicationName: '', producingOrg: '',
};

type Update = <K extends keyof PhotoshootData>(k: K, v: PhotoshootData[K]) => void;

// Bilingual label helper.
function L({ en, ar, required }: { en: string; ar: string; required?: boolean }) {
  return (
    <Label className="flex flex-wrap items-baseline gap-x-2">
      <span>{en}{required && <span className="text-destructive"> *</span>}</span>
      <span className="text-xs text-muted-foreground font-normal" dir="rtl">{ar}</span>
    </Label>
  );
}

function Section({ en, ar, children }: { en: string; ar: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between border-b pb-1.5">
        <h3 className="text-sm font-semibold">{en}</h3>
        <span className="text-sm font-semibold text-primary" dir="rtl">{ar}</span>
      </div>
      {children}
    </div>
  );
}

export function PhotoshootDetailsStep({
  data, update, workTypes, workTypesLoading, workTypeId, onWorkTypeChange,
  autoWorkTypeName,
}: {
  data: PhotoshootData;
  update: Update;
  workTypes?: { id: string; name: string }[];
  workTypesLoading?: boolean;
  workTypeId: string;
  onWorkTypeChange: (v: string) => void;
  /** When set, the workflow is resolved automatically and the manual picker is hidden. */
  autoWorkTypeName?: string | null;
}) {
  const grid2 = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
  return (
    <div className="space-y-6">
      {autoWorkTypeName ? (
        <AutoWorkflowChip workTypeName={autoWorkTypeName} />
      ) : (
        // Fallback (e.g. internal scope): pick the workflow manually.
        <WorkflowTypeSelect
          workTypes={workTypes}
          loading={workTypesLoading}
          value={workTypeId}
          onChange={onWorkTypeChange}
        />
      )}

      {/* Company & contact */}
      <Section en="Company & contact" ar="الشركة وجهة الاتصال">
        <div className={grid2}>
          <div className="space-y-1.5"><L en="Company" ar="الشركة" required /><Input value={data.company} onChange={(e) => update('company', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Sector" ar="القطاع" /><Input value={data.sector} onChange={(e) => update('sector', e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><L en="Address" ar="العنوان" /><Input value={data.address} onChange={(e) => update('address', e.target.value)} /></div>
        <div className={grid2}>
          <div className="space-y-1.5"><L en="Official contact person" ar="مسؤول التواصل" required /><Input value={data.contactPerson} onChange={(e) => update('contactPerson', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Position" ar="المنصب" /><Input value={data.position} onChange={(e) => update('position', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Email" ar="البريد الإلكتروني" /><Input type="email" value={data.email} onChange={(e) => update('email', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Tel." ar="الهاتف" /><Input type="tel" value={data.tel} onChange={(e) => update('tel', e.target.value)} /></div>
        </div>
      </Section>

      {/* About the shoot */}
      <Section en="About the shoot" ar="عن التصوير">
        <div className="space-y-1.5"><L en="The purpose of the photo shoot" ar="الغرض من التصوير" required /><Textarea rows={2} value={data.purpose} onChange={(e) => update('purpose', e.target.value)} /></div>
        <div className="space-y-1.5"><L en="Al Hamra benefit or credit from this photo shoot" ar="استفادة أو ذكر الحمرا من هذا التصوير" /><Textarea rows={2} value={data.alhamraBenefit} onChange={(e) => update('alhamraBenefit', e.target.value)} /></div>
        <div className="space-y-1.5"><L en="Commission channels to inform within Al Hamra" ar="الجهات التي يجب إبلاغها داخل الحمرا" /><Input value={data.commissionChannels} onChange={(e) => update('commissionChannels', e.target.value)} /></div>
      </Section>

      {/* Location & schedule */}
      <Section en="Location & schedule" ar="الموقع والموعد">
        <div className={grid2}>
          <div className="space-y-1.5"><L en="Photo shoot location" ar="موقع التصوير" required /><Input value={data.location} onChange={(e) => update('location', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="More info" ar="معلومات إضافية" /><Input value={data.locationMoreInfo} onChange={(e) => update('locationMoreInfo', e.target.value)} /></div>
        </div>
        <div className={grid2}>
          <div className="space-y-1.5"><L en="Date from" ar="التاريخ من" required /><Input type="date" value={data.dateFrom} onChange={(e) => update('dateFrom', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Date to" ar="التاريخ إلى" required /><Input type="date" value={data.dateTo} onChange={(e) => update('dateTo', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Time from" ar="الوقت من" /><Input type="time" value={data.timeFrom} onChange={(e) => update('timeFrom', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Time to" ar="الوقت إلى" /><Input type="time" value={data.timeTo} onChange={(e) => update('timeTo', e.target.value)} /></div>
        </div>
      </Section>

      {/* Scale */}
      <Section en="Scale" ar="الحجم">
        <div className={grid2}>
          <div className="space-y-1.5">
            <L en="Number of cameras" ar="عدد الكاميرات" />
            <div className="flex items-center gap-3 flex-wrap">
              <RadioGroup className="flex gap-3" value={data.numCameras} onValueChange={(v) => update('numCameras', v)}>
                {['1', '2', '3', 'more'].map((n) => (
                  <label key={n} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <RadioGroupItem value={n} /> {n === 'more' ? 'More' : n}
                  </label>
                ))}
              </RadioGroup>
              {data.numCameras === 'more' && <Input className="w-20 h-9" type="number" min={4} value={data.numCamerasOther} onChange={(e) => update('numCamerasOther', e.target.value)} />}
            </div>
          </div>
          <div className="space-y-1.5">
            <L en="Number of people" ar="عدد الأشخاص" />
            <div className="flex items-center gap-3 flex-wrap">
              <RadioGroup className="flex gap-3" value={data.numPeople} onValueChange={(v) => update('numPeople', v)}>
                {['1', '2', '3', '4', 'more'].map((n) => (
                  <label key={n} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <RadioGroupItem value={n} /> {n === 'more' ? 'More' : n}
                  </label>
                ))}
              </RadioGroup>
              {data.numPeople === 'more' && <Input className="w-20 h-9" type="number" min={5} value={data.numPeopleOther} onChange={(e) => update('numPeopleOther', e.target.value)} />}
            </div>
          </div>
        </div>
      </Section>

      {/* Reason, type & equipment */}
      <Section en="Reason, type & equipment" ar="السبب والنوع والمعدات">
        <div className="space-y-1.5">
          <L en="Reason of photo shoot" ar="سبب التصوير" />
          <RadioGroup className="flex flex-wrap gap-x-4 gap-y-2" value={data.reason} onValueChange={(v) => update('reason', v)}>
            {[['editorial', 'Editorial'], ['fashion', 'Fashion'], ['online', 'Online'], ['magazine', 'Magazine'], ['personal', 'Personal'], ['other', 'Other']].map(([v, l]) => (
              <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer"><RadioGroupItem value={v} /> {l}</label>
            ))}
          </RadioGroup>
          {data.reason === 'other' && <Input className="mt-2" placeholder="Please specify…" value={data.reasonOther} onChange={(e) => update('reasonOther', e.target.value)} />}
        </div>

        <div className="space-y-1.5">
          <L en="Type of photo shoot" ar="نوع التصوير" />
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><Checkbox checked={data.typeVideography} onCheckedChange={(c) => update('typeVideography', c === true)} /> Videography</label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><Checkbox checked={data.typePhotography} onCheckedChange={(c) => update('typePhotography', c === true)} /> Photography</label>
          </div>
        </div>

        <div className="space-y-1.5">
          <L en="Equipment to be used" ar="المعدات المستخدمة" />
          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><Checkbox checked={data.equipDrones} onCheckedChange={(c) => update('equipDrones', c === true)} /> Drones</label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><Checkbox checked={data.equipCranes} onCheckedChange={(c) => update('equipCranes', c === true)} /> Cranes</label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><Checkbox checked={data.equipTripods} onCheckedChange={(c) => update('equipTripods', c === true)} /> Tripods</label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><Checkbox checked={data.equipOther} onCheckedChange={(c) => update('equipOther', c === true)} /> Other</label>
            {data.equipOther && <Input className="w-40 h-9" placeholder="Specify…" value={data.equipOtherText} onChange={(e) => update('equipOtherText', e.target.value)} />}
          </div>
        </div>
      </Section>

      {/* Contacts */}
      <Section en="On-location contact" ar="جهة الاتصال في الموقع">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5"><L en="Name" ar="الاسم" /><Input value={data.onLocName} onChange={(e) => update('onLocName', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Email" ar="البريد" /><Input type="email" value={data.onLocEmail} onChange={(e) => update('onLocEmail', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Tel." ar="الهاتف" /><Input type="tel" value={data.onLocTel} onChange={(e) => update('onLocTel', e.target.value)} /></div>
        </div>
      </Section>

      <Section en="Who will be photographed" ar="من سيتم تصويره">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5"><L en="Name" ar="الاسم" /><Input value={data.subjectName} onChange={(e) => update('subjectName', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Email" ar="البريد" /><Input type="email" value={data.subjectEmail} onChange={(e) => update('subjectEmail', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Tel." ar="الهاتف" /><Input type="tel" value={data.subjectTel} onChange={(e) => update('subjectTel', e.target.value)} /></div>
        </div>
      </Section>

      {/* Publication */}
      <Section en="Publication (if applicable)" ar="النشر (إن وُجد)">
        <div className="space-y-1.5"><L en="Publication / platform the photo shoot will appear in" ar="اسم النشرة / المنصة التي سيظهر بها التصوير" /><Input value={data.publicationName} onChange={(e) => update('publicationName', e.target.value)} /></div>
        <div className="space-y-1.5"><L en="Organization producing / managing the publication" ar="الجهة المنتجة / المديرة للنشرة" /><Input value={data.producingOrg} onChange={(e) => update('producingOrg', e.target.value)} /></div>
      </Section>

      {/* Live preview of the official Photo Shoot Form PDF */}
      <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Preview how this will print on the official <b>Photo Shoot Form</b>.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={async () => {
            const { buildPhotoshootPdf } = await import('@/lib/pdf/photoshootPdf');
            const bytes = await buildPhotoshootPdf(data, {});
            const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }}
        >
          <FileText className="h-4 w-4" />
          Preview PDF
        </Button>
      </div>

      {/* Standard guidelines */}
      <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground space-y-1.5">
        <p className="font-semibold text-foreground">Standard guidelines · الإرشادات</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>A reply will be provided within 3 working days for approval.</li>
          <li>Damage of any items during the session is the responsibility of the requesting company/personnel.</li>
          <li>Al Hamra security will attend each session (mandatory).</li>
          <li>Al Hamra must be credited as the venue in the promotion/usage of the photos.</li>
          <li>A Civil ID must be attached for each individual (add in the next step).</li>
        </ul>
      </div>
    </div>
  );
}
