import { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { useFormDraft } from '@/hooks/useFormDraft';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  User,
  Building2,
  Calendar,
  FileText,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { useCreatePermit } from '@/hooks/useWorkPermits';
import { useScopedWorkTypes } from '@/hooks/useWorkTypeScope';
import { useRequestCategoryMap } from '@/hooks/useRequestCategoryMap';
import { useWorkLocations } from '@/hooks/useWorkLocations';
import { useTenantUnits } from '@/hooks/useTenantUnits';
import { useCanSubmitOnBehalf, useOnBehalfTenants } from '@/hooks/useOnBehalf';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { UserCog } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

import { RequesterStep } from './permit-steps/RequesterStep';
import { WorkDetailsStep } from './permit-steps/WorkDetailsStep';
import { PhotoshootDetailsStep, emptyPhotoshootData, type PhotoshootData } from './permit-steps/PhotoshootDetailsStep';
import { GatePassDetailsStep, emptyGatePassData, type GatePassData } from './permit-steps/GatePassDetailsStep';
import { PurposeSelection } from './PurposeSelection';
import { ScheduleStep } from './permit-steps/ScheduleStep';
import { DocumentsStep } from './permit-steps/DocumentsStep';
import { ReviewStep } from './permit-steps/ReviewStep';
import type { PermitFormData, UpdateField } from './permit-steps/types';
import { canProceedFromStep } from './permit-steps/types';

/**
 * PermitFormWizard (Phase 3c-2).
 *
 * Previously a 635-line monolith where all five steps, their validation,
 * animation, and submission lived in one file. Now a thin shell (~150
 * lines) that owns:
 *   - step state + navigation
 *   - formData state + updateField
 *   - data fetching (work types, locations)
 *   - submission
 * Each step component owns its own JSX and labels, and is individually
 * testable. Shared types + validation live in ./permit-steps/types.ts.
 *
 * Behavior unchanged — this is a refactor, not a feature change.
 */

type StepKey = 'requester' | 'details' | 'schedule' | 'documents' | 'review';

const STEP_DEFS: { key: StepKey; titleKey: string; descriptionKey: string; icon: typeof User }[] = [
  { key: 'requester', titleKey: 'permits.form.step1Title', descriptionKey: 'permits.form.step1Description', icon: User },
  { key: 'details',   titleKey: 'permits.form.step2Title', descriptionKey: 'permits.form.step2Description', icon: Building2 },
  { key: 'schedule',  titleKey: 'permits.form.step3Title', descriptionKey: 'permits.form.step3Description', icon: Calendar },
  { key: 'documents', titleKey: 'permits.form.step4Title', descriptionKey: 'permits.form.step4Description', icon: FileText },
  { key: 'review',    titleKey: 'permits.form.step5Title', descriptionKey: 'permits.form.step5Description', icon: Check },
];

/**
 * Gate pass and photoshoot capture their own dates/times inside their details
 * step, so the generic Schedule step is dropped for them — the customer is
 * never asked for the date/time twice.
 */
const stepsForCategory = (c: RequestCategory | null) =>
  STEP_DEFS
    .filter((s) => !(s.key === 'schedule' && (c === 'gate_pass' || c === 'photoshoot')))
    .map((s, i) => ({ ...s, id: i + 1 }));

/**
 * The request purpose. Each of these maps to a work type / approval workflow via
 * request_category_work_types (see useRequestCategoryMap). 'work_permit' and
 * 'other' are retained for back-compat (legacy deep links) but are no longer
 * offered as purpose cards; the three specific work purposes replace the old
 * single "contractor work" card so each routes to its own workflow.
 */
export type RequestCategory =
  | 'gate_pass'
  | 'maintenance'
  | 'unit_modification'
  | 'tenant_fitout'
  | 'photoshoot'
  | 'work_permit'
  | 'other';

/** Client (tenant-facing) vs internal (Al Hamra team) request. */
export type RequestScope = 'client' | 'internal';

interface PermitFormWizardProps {
  /**
   * Optionally pre-set the purpose (e.g. deep-linked). When omitted, the form's
   * FIRST step asks the purpose, then the flow (title + fields + eventually the
   * workflow) adapts — one single road map for all request types.
   */
  initialCategory?: RequestCategory;
  /**
   * Who is raising this. 'internal' is the Al Hamra team's own entry point — it
   * offers the internal work types (and therefore the internal approval
   * workflows) instead of the client-facing ones. Same three purposes either way.
   */
  scope?: RequestScope;
}

export function PermitFormWizard({ initialCategory, scope = 'client' }: PermitFormWizardProps = {}) {
  const { t } = useTranslation();
  // Purpose is the first step of the single road map. Null until the user picks.
  const [category, setCategory] = useState<RequestCategory | null>(initialCategory ?? null);
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  // Work type drives the approval workflow; the scope decides which half of the
  // list is on offer (internal work types carry the internal workflow templates).
  const { data: scopedWorkTypes, isLoading: workTypesLoading } = useScopedWorkTypes();
  const workTypes = useMemo(
    () => (scopedWorkTypes ?? []).filter((w) => w.is_internal === (scope === 'internal')),
    [scopedWorkTypes, scope],
  );

  // Automatic workflow selection: for client requests the purpose determines the
  // work type (and therefore the approval workflow), so the user never picks it.
  // Internal requests keep the manual scoped picker — their work types differ and
  // aren't in this map.
  const { data: categoryMap } = useRequestCategoryMap();
  const autoWorkType =
    scope === 'client' && category ? categoryMap?.[category] : undefined;
  const { data: workLocations, isLoading: workLocationsLoading } = useWorkLocations();
  const createPermit = useCreatePermit();

  // Submit-on-behalf: staff (Client Relations / Customer Service / admin) can
  // raise this permit for a chosen tenant (e.g. a VIP). The tenant is the owner;
  // the creator is recorded and CC'd on notifications.
  const { data: canOnBehalf } = useCanSubmitOnBehalf();
  const { data: onBehalfTenants } = useOnBehalfTenants(!!canOnBehalf);
  const [onBehalfId, setOnBehalfId] = useState<string>('');
  const onBehalfTenant = onBehalfTenants?.find((t) => t.id === onBehalfId) || null;
  // Units come from the on-behalf tenant when one is selected, else the user.
  const { data: tenantUnits } = useTenantUnits(onBehalfId || user?.id);

  // Photoshoot-specific fields (only used when purpose = photo shoot).
  const [photoshootData, setPhotoshootData] = useState<PhotoshootData>({
    ...emptyPhotoshootData,
    company: profile?.company_name || '',
    email: user?.email || '',
    tel: profile?.phone || '',
  });
  const updatePhotoshoot = <K extends keyof PhotoshootData>(k: K, v: PhotoshootData[K]) =>
    setPhotoshootData((d) => ({ ...d, [k]: v }));

  // Minimal gate-pass fields (only used when purpose = move items in/out).
  const [gatePassData, setGatePassData] = useState<GatePassData>({
    ...emptyGatePassData,
    company: profile?.company_name || '',
    mobile: profile?.phone || '',
    unit: profile?.unit || '',
    floor: profile?.floor || '',
  });
  const updateGatePass = <K extends keyof GatePassData>(k: K, v: GatePassData[K]) =>
    setGatePassData((d) => ({ ...d, [k]: v }));

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<PermitFormData>({
    requesterName: profile?.full_name || user?.email || '',
    requesterEmail: user?.email || '',
    // Pre-fill contractor + unit + floor from the tenant's profile.
    // These were captured at signup (or filled in by an admin via the
    // Pending Approvals page) and are reused as the default tenant
    // master data on every permit request. Tenant can still override
    // them per-permit — useful when one tenant manages multiple units
    // or works on behalf of a different company occasionally.
    contractorName: profile?.company_name || '',
    contactMobile: profile?.phone || '',
    backOfHouse: false,
    buildingZone: '',
    unit: profile?.unit || '',
    floor: profile?.floor || '',
    workLocationId: '',
    workLocationOther: '',
    workTypeId: '',
    workDescription: '',
    workDateFrom: '',
    workDateTo: '',
    workTimeFrom: '08:00',
    workTimeTo: '17:00',
    attachments: [],
    urgency: 'normal',
  });

  // Draft autosave (localStorage, debounced 500ms, per user x form).
  // Attachments (File objects) are stripped before save — they don't
  // survive JSON serialization.
  const draft = useFormDraft<Omit<PermitFormData, 'attachments'>>({
    formKey: 'permit-wizard',
    userId: user?.id,
    hasContent: (v) =>
      !!(
        v.contractorName?.trim() ||
        v.contactMobile?.trim() ||
        v.unit?.trim() ||
        v.floor?.trim() ||
        v.workLocationId ||
        v.workTypeId ||
        v.workDescription?.trim() ||
        v.workDateFrom ||
        v.workDateTo
      ),
  });

  // Restore once on mount, only if there's real content.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !draft.hydrated) return;
    restoredRef.current = true;
    const saved = draft.restore();
    if (saved) {
      setFormData((prev) => ({ ...prev, ...saved, attachments: prev.attachments }));
      toast.info('Draft restored from your last session');
    }
  }, [draft]);

  const updateField: UpdateField = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // Save snapshot without attachments.
      const { attachments: _att, ...persisted } = next;
      draft.save(persisted);
      return next;
    });
  };

  // Apply the auto-resolved work type whenever the purpose (and thus the mapped
  // work type) changes. This is what makes the workflow selection automatic —
  // the requester never touches a work-type picker on a client request.
  useEffect(() => {
    if (autoWorkType && formData.workTypeId !== autoWorkType.work_type_id) {
      updateField('workTypeId', autoWorkType.work_type_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoWorkType?.work_type_id]);

  // Photoshoot uses its own fields (and captures its own dates), so it has its
  // own light validation instead of the work-permit step rules.
  // Steps shown for the chosen purpose (schedule is folded into details for
  // gate pass + photoshoot, so dates are only ever asked once).
  const visibleSteps = stepsForCategory(category);
  const totalSteps = visibleSteps.length;
  const currentDef = visibleSteps[currentStep - 1] ?? visibleSteps[0];
  const stepKey: StepKey = currentDef.key;

  const canProceed = (() => {
    if (category === 'photoshoot') {
      if (stepKey === 'details') {
        // workTypeId is required — it selects the approval workflow (interim).
        // Dates are required here because the generic Schedule step is skipped.
        return !!(formData.workTypeId && photoshootData.company.trim()
          && photoshootData.purpose.trim() && photoshootData.location.trim()
          && photoshootData.dateFrom && photoshootData.dateTo);
      }
      if (stepKey === 'requester') return canProceedFromStep(1, formData);
      return true;
    }
    if (category === 'gate_pass') {
      if (stepKey === 'details') {
        return !!(formData.workTypeId && gatePassData.company.trim() && gatePassData.unit.trim()
          && gatePassData.dateFrom && gatePassData.dateTo);
      }
      if (stepKey === 'requester') return canProceedFromStep(1, formData);
      return true;
    }
    return canProceedFromStep(currentStep, formData);
  })();

  const goNext = () => {
    if (currentStep < totalSteps) setCurrentStep(currentStep + 1);
  };
  const goPrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  // Until the purpose-specific columns exist, the gate-pass / photoshoot details
  // are composed into work_description so they are stored AND rendered on the
  // PDF. Dates/times come from each purpose's own step (which is why the generic
  // Schedule step is skipped for them).
  const buildGatePassDescription = () => {
    const dir = gatePassData.direction === 'in' ? 'Bringing material IN'
      : gatePassData.direction === 'out' ? 'Taking material OUT'
      : 'Bringing IN and taking OUT';
    return [
      'MATERIAL GATE PASS',
      `Direction: ${dir}`,
      `Material: ${gatePassData.whatMoving.trim() || 'To be confirmed on arrival'}`,
      gatePassData.contactPerson.trim() || gatePassData.mobile.trim()
        ? `On-site contact: ${gatePassData.contactPerson.trim()}${gatePassData.mobile.trim() ? ` — ${gatePassData.mobile.trim()}` : ''}`
        : '',
    ].filter(Boolean).join('\n');
  };

  const buildPhotoshootDescription = () => {
    const p = photoshootData;
    const cameras = p.numCameras === 'more' ? (p.numCamerasOther || 'more') : p.numCameras;
    const people = p.numPeople === 'more' ? (p.numPeopleOther || 'more') : p.numPeople;
    const types = [p.typePhotography && 'Photography', p.typeVideography && 'Videography'].filter(Boolean).join(' + ');
    const equip = [
      p.equipDrones && 'Drones', p.equipCranes && 'Cranes', p.equipTripods && 'Tripods',
      p.equipOther && (p.equipOtherText.trim() || 'Other'),
    ].filter(Boolean).join(', ');
    const reason = p.reason === 'other' ? (p.reasonOther.trim() || 'Other') : p.reason;
    return [
      'PHOTO SHOOT REQUEST',
      `Purpose: ${p.purpose.trim()}`,
      `Company: ${p.company.trim()}${p.sector.trim() ? ` — ${p.sector.trim()}` : ''}`,
      p.address.trim() ? `Address: ${p.address.trim()}` : '',
      `Contact: ${p.contactPerson.trim()}${p.position.trim() ? ` (${p.position.trim()})` : ''}${p.email.trim() ? ` — ${p.email.trim()}` : ''}${p.tel.trim() ? ` — ${p.tel.trim()}` : ''}`,
      `Location: ${p.location.trim()}${p.locationMoreInfo.trim() ? ` (${p.locationMoreInfo.trim()})` : ''}`,
      `Cameras: ${cameras}   People: ${people}`,
      reason ? `Reason: ${reason}` : '',
      types ? `Type: ${types}` : '',
      equip ? `Equipment: ${equip}` : '',
      p.onLocName.trim() ? `On-location contact: ${p.onLocName.trim()}${p.onLocTel.trim() ? ` — ${p.onLocTel.trim()}` : ''}${p.onLocEmail.trim() ? ` — ${p.onLocEmail.trim()}` : ''}` : '',
      p.subjectName.trim() ? `Photographed: ${p.subjectName.trim()}${p.subjectTel.trim() ? ` — ${p.subjectTel.trim()}` : ''}${p.subjectEmail.trim() ? ` — ${p.subjectEmail.trim()}` : ''}` : '',
      p.publicationName.trim() ? `Publication / platform: ${p.publicationName.trim()}` : '',
      p.producingOrg.trim() ? `Producing organization: ${p.producingOrg.trim()}` : '',
      p.alhamraBenefit.trim() ? `Al Hamra benefit / credit: ${p.alhamraBenefit.trim()}` : '',
      p.commissionChannels.trim() ? `Channels to inform: ${p.commissionChannels.trim()}` : '',
    ].filter(Boolean).join('\n');
  };

  const buildPayload = () => {
    const selectedLocation = workLocations?.find(
      (loc) => loc.id === formData.workLocationId,
    );
    const workLocationText =
      formData.workLocationId === 'other'
        ? formData.workLocationOther.trim()
        : selectedLocation?.name || '';

    // Per-purpose payload. Gate pass / photoshoot carry their own contact,
    // location, dates and times — never the (skipped) generic schedule fields.
    const base = {
      files: formData.attachments,
      urgency: formData.urgency,
      work_type_id: formData.workTypeId,
      // Purpose + its own fields, so the PDF can render the matching form.
      request_category: category ?? 'work_permit',
      category_details:
        category === 'photoshoot' ? { ...photoshootData }
        : category === 'gate_pass' ? { ...gatePassData }
        : undefined,
      on_behalf_of: onBehalfTenant
        ? {
            tenantId: onBehalfTenant.id,
            tenantName: onBehalfTenant.full_name || onBehalfTenant.email || 'Tenant',
            tenantEmail: onBehalfTenant.email || '',
          }
        : undefined,
    };

    let payload;
    if (category === 'gate_pass') {
      payload = {
        ...base,
        contractor_name: gatePassData.company.trim(),
        contact_mobile: gatePassData.mobile.trim(),
        back_of_house: false,
        building_zone: null,
        unit: gatePassData.unit.trim(),
        floor: gatePassData.floor.trim(),
        work_location: gatePassData.unit.trim() ? `Unit ${gatePassData.unit.trim()}` : 'Tenant unit',
        work_location_id: null,
        work_location_other: null,
        work_description: buildGatePassDescription(),
        work_date_from: gatePassData.dateFrom,
        work_date_to: gatePassData.dateTo,
        work_time_from: gatePassData.timeFrom,
        work_time_to: gatePassData.timeTo,
      };
    } else if (category === 'photoshoot') {
      payload = {
        ...base,
        contractor_name: photoshootData.company.trim(),
        contact_mobile: photoshootData.tel.trim(),
        back_of_house: false,
        building_zone: null,
        unit: formData.unit.trim(),
        floor: formData.floor.trim(),
        work_location: photoshootData.location.trim(),
        work_location_id: null,
        work_location_other: null,
        work_description: buildPhotoshootDescription(),
        work_date_from: photoshootData.dateFrom,
        work_date_to: photoshootData.dateTo,
        work_time_from: photoshootData.timeFrom || '08:00',
        work_time_to: photoshootData.timeTo || '17:00',
      };
    } else {
      payload = {
        ...base,
        contractor_name: formData.contractorName.trim(),
        contact_mobile: formData.contactMobile.trim(),
        back_of_house: formData.backOfHouse,
        building_zone: formData.buildingZone || null,
        unit: formData.backOfHouse ? '' : formData.unit.trim(),
        floor: formData.floor.trim(),
        work_location: workLocationText,
        work_location_id:
          formData.workLocationId === 'other' ? null : formData.workLocationId || null,
        work_location_other:
          formData.workLocationId === 'other' ? formData.workLocationOther.trim() : null,
        work_description: formData.workDescription.trim(),
        work_date_from: formData.workDateFrom,
        work_date_to: formData.workDateTo,
        work_time_from: formData.workTimeFrom,
        work_time_to: formData.workTimeTo,
      };
    }

    return payload;
  };

  const handleSubmit = () => {
    createPermit.mutate(buildPayload(), {
      onSuccess: () => {
        draft.clear();
        navigate('/permits');
      },
    });
  };

  // What the Review step shows. For gate pass / photoshoot the permit fields are
  // derived from their own step, so mirror the submission payload back into the
  // review shape instead of showing the (unused) work-permit fields.
  const reviewData: PermitFormData = category === 'gate_pass' || category === 'photoshoot'
    ? (() => {
        const p = buildPayload();
        return {
          ...formData,
          contractorName: p.contractor_name,
          contactMobile: p.contact_mobile,
          unit: p.unit,
          floor: p.floor,
          workDescription: p.work_description,
          workDateFrom: p.work_date_from,
          workDateTo: p.work_date_to,
          workTimeFrom: p.work_time_from,
          workTimeTo: p.work_time_to,
        };
      })()
    : formData;


  // ── Step 1 of the single road map: choose the purpose. Nothing else shows
  //    until it's picked; then the whole flow adapts to it.
  if (!category) {
    return <PurposeSelection onSelect={setCategory} />;
  }

  const purposeLabel =
    category === 'gate_pass' ? 'Material Gate Pass — move material in & out'
    : category === 'photoshoot' ? 'Photo shoot session'
    : category === 'other' ? 'Other request'
    : 'Contractor work in the unit';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Chosen purpose — can be changed (restarts the flow). */}
      <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
        <span className="text-sm">
          <span className="text-muted-foreground">Purpose:</span>{' '}
          <span className="font-medium">{purposeLabel}</span>
        </span>
        <button
          type="button"
          onClick={() => { setCategory(null); setCurrentStep(1); }}
          className="text-xs text-primary hover:underline"
        >
          Change
        </button>
      </div>

      {/* Submit on behalf of a tenant (staff only) */}
      {canOnBehalf && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-2">
              <UserCog className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Raise on behalf of a tenant</span>
              <span className="text-xs text-muted-foreground">(optional)</span>
            </div>
            <Select value={onBehalfId || 'self'} onValueChange={(v) => setOnBehalfId(v === 'self' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a tenant…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">— Myself (not on behalf) —</SelectItem>
                {(onBehalfTenants ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {(t.full_name || t.email || 'Tenant')}{t.company_name ? ` · ${t.company_name}` : ''}
                    {t.is_vip ? '  ★ VIP' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onBehalfTenant && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                {onBehalfTenant.is_vip && <Badge className="bg-amber-500 text-white h-4 px-1.5 text-[10px]">VIP</Badge>}
                Owner: <b>{onBehalfTenant.full_name || onBehalfTenant.email}</b> · you'll be recorded as the
                creator and CC'd on all notifications.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Progress */}
      <div className="mb-8" aria-label={t('permits.form.progress') ?? 'Progress'}>
        <div className="flex items-center justify-between">
          {visibleSteps.map((step, index) => (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
                    currentStep > step.id
                      ? 'bg-success border-success text-success-foreground'
                      : currentStep === step.id
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-muted border-border text-muted-foreground',
                  )}
                  aria-current={currentStep === step.id ? 'step' : undefined}
                >
                  {currentStep > step.id ? (
                    <Check className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    <step.icon className="w-5 h-5" aria-hidden="true" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs mt-2 font-medium hidden sm:block',
                    currentStep === step.id ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {t(step.titleKey)}
                </span>
              </div>
              {index < visibleSteps.length - 1 && (
                <div
                  className={cn(
                    'w-12 sm:w-20 h-0.5 mx-2',
                    currentStep > step.id ? 'bg-success' : 'bg-border',
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step body */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-display">
                {stepKey === 'details' && category === 'photoshoot' ? 'Photo Shoot Details'
                  : stepKey === 'details' && category === 'gate_pass' ? 'Material Gate Pass Details'
                  : stepKey === 'details' && category === 'tenant_fitout' ? 'New Tenant Fitout Details'
                  : stepKey === 'details' && category === 'maintenance' ? 'Maintenance & Repairs Details'
                  : stepKey === 'details' && category === 'unit_modification' ? 'Unit Modification Details'
                  : t(currentDef.titleKey)}
              </CardTitle>
              <CardDescription>
                {stepKey === 'details' && category === 'photoshoot'
                  ? 'Fill in the photo shoot form details · تفاصيل نموذج التصوير'
                  : stepKey === 'details' && category === 'gate_pass'
                    ? 'Just the essentials to move material in / out · الأساسيات لإدخال وإخراج المواد'
                    : t(currentDef.descriptionKey)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {stepKey === 'requester' && (
                <RequesterStep data={formData} updateField={updateField} />
              )}
              {stepKey === 'details' && category === 'photoshoot' && (
                <PhotoshootDetailsStep
                  data={photoshootData}
                  update={updatePhotoshoot}
                  workTypes={workTypes}
                  workTypesLoading={workTypesLoading}
                  workTypeId={formData.workTypeId}
                  onWorkTypeChange={(v) => updateField('workTypeId', v)}
                  autoWorkTypeName={autoWorkType?.work_type_name}
                />
              )}
              {stepKey === 'details' && category === 'gate_pass' && (
                <GatePassDetailsStep
                  data={gatePassData}
                  update={updateGatePass}
                  workTypes={workTypes}
                  workTypesLoading={workTypesLoading}
                  workTypeId={formData.workTypeId}
                  onWorkTypeChange={(v) => updateField('workTypeId', v)}
                  autoWorkTypeName={autoWorkType?.work_type_name}
                />
              )}
              {stepKey === 'details' && category !== 'photoshoot' && category !== 'gate_pass' && (
                <WorkDetailsStep
                  data={formData}
                  updateField={updateField}
                  workTypes={workTypes}
                  workTypesLoading={workTypesLoading}
                  workLocations={workLocations}
                  workLocationsLoading={workLocationsLoading}
                  tenantUnits={tenantUnits}
                  autoWorkTypeName={autoWorkType?.work_type_name}
                />
              )}
              {stepKey === 'schedule' && (
                <ScheduleStep data={formData} updateField={updateField} />
              )}
              {stepKey === 'documents' && (
                <DocumentsStep data={formData} updateField={updateField} />
              )}
              {stepKey === 'review' && (
                <ReviewStep
                  data={reviewData}
                  workTypes={workTypes}
                  workLocations={workLocations}
                />
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Footer navigation — stacks on mobile for full-width tap targets */}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 mt-6">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={currentStep === 1}
          className="w-full sm:w-auto"
        >
          <ChevronLeft className="w-4 h-4 me-2" />
          {t('common.previous')}
        </Button>
        {currentStep < totalSteps ? (
          <Button
            onClick={goNext}
            disabled={!canProceed}
            className="w-full sm:w-auto"
          >
            {t('common.next')}
            <ChevronRight className="w-4 h-4 ms-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={createPermit.isPending}
            className="w-full sm:w-auto"
          >
            {createPermit.isPending ? (
              <>
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
                {t('common.submitting')}
              </>
            ) : (
              <>
                <Check className="w-4 h-4 me-2" />
                {t('permits.form.submitButton')}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
