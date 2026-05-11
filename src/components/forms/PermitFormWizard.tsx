import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useFormDraft } from '@/hooks/useFormDraft';
import { toast } from 'sonner';
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

import { useWorkTypes, useCreatePermit } from '@/hooks/useWorkPermits';
import { useWorkLocations } from '@/hooks/useWorkLocations';
import { useAuth } from '@/contexts/AuthContext';

import { RequesterStep } from './permit-steps/RequesterStep';
import { WorkDetailsStep } from './permit-steps/WorkDetailsStep';
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

const STEP_DEFS = [
  { id: 1, titleKey: 'permits.form.step1Title', descriptionKey: 'permits.form.step1Description', icon: User },
  { id: 2, titleKey: 'permits.form.step2Title', descriptionKey: 'permits.form.step2Description', icon: Building2 },
  { id: 3, titleKey: 'permits.form.step3Title', descriptionKey: 'permits.form.step3Description', icon: Calendar },
  { id: 4, titleKey: 'permits.form.step4Title', descriptionKey: 'permits.form.step4Description', icon: FileText },
  { id: 5, titleKey: 'permits.form.step5Title', descriptionKey: 'permits.form.step5Description', icon: Check },
];

const TOTAL_STEPS = STEP_DEFS.length;

export function PermitFormWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: workTypes, isLoading: workTypesLoading } = useWorkTypes();
  const { data: workLocations, isLoading: workLocationsLoading } = useWorkLocations();
  const createPermit = useCreatePermit();

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<PermitFormData>({
    requesterName: profile?.full_name || user?.email || '',
    requesterEmail: user?.email || '',
    contractorName: '',
    contactMobile: '',
    unit: '',
    floor: '',
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

  // Draft autosave — persists formData to localStorage so the user
  // doesn't lose work if they navigate away mid-fill. File
  // attachments are NOT persisted (File objects can't survive
  // serialization); we clear them from the restored draft so the
  // user knows to re-upload.
  const { restored, clearDraft } = useFormDraft({
    formKey: 'new-permit-wizard',
    userId: user?.id,
    value: formData,
  });

  // Restore once on mount. Skip the restore for completely empty
  // drafts (when 'restored' is the same shape as the initial form,
  // there's nothing to recover).
  useEffect(() => {
    if (!restored) return;
    // Only restore if the draft has content beyond the auto-filled
    // requesterName/requesterEmail. Heuristic: at least one of the
    // user-typed fields is non-empty.
    const hasUserContent =
      restored.contractorName?.trim() ||
      restored.contactMobile?.trim() ||
      restored.workDescription?.trim() ||
      restored.workTypeId ||
      restored.workLocationId;

    if (!hasUserContent) return;

    setFormData({
      ...restored,
      // Strip attachments — File objects don't survive JSON.
      attachments: [],
    });
    toast.info(
      'Restored your unsaved permit draft. Re-attach any files before submitting.',
    );
  }, [restored]);

  const updateField: UpdateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = canProceedFromStep(currentStep, formData);

  const goNext = () => {
    if (currentStep < TOTAL_STEPS) setCurrentStep(currentStep + 1);
  };
  const goPrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = () => {
    const selectedLocation = workLocations?.find(
      (loc) => loc.id === formData.workLocationId,
    );
    const workLocationText =
      formData.workLocationId === 'other'
        ? formData.workLocationOther.trim()
        : selectedLocation?.name || '';

    createPermit.mutate(
      {
        contractor_name: formData.contractorName.trim(),
        contact_mobile: formData.contactMobile.trim(),
        unit: formData.unit.trim(),
        floor: formData.floor.trim(),
        work_location: workLocationText,
        work_location_id:
          formData.workLocationId === 'other' ? null : formData.workLocationId || null,
        work_location_other:
          formData.workLocationId === 'other'
            ? formData.workLocationOther.trim()
            : null,
        work_type_id: formData.workTypeId,
        work_description: formData.workDescription.trim(),
        work_date_from: formData.workDateFrom,
        work_date_to: formData.workDateTo,
        work_time_from: formData.workTimeFrom,
        work_time_to: formData.workTimeTo,
        files: formData.attachments,
        urgency: formData.urgency,
      },
      {
        onSuccess: () => {
          clearDraft();
          navigate('/permits');
        },
      },
    );
  };

  const currentDef = STEP_DEFS[currentStep - 1];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress */}
      <div className="mb-8" aria-label={t('permits.form.progress') ?? 'Progress'}>
        <div className="flex items-center justify-between">
          {STEP_DEFS.map((step, index) => (
            <div key={step.id} className="flex items-center">
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
              {index < STEP_DEFS.length - 1 && (
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
              <CardTitle className="font-display">{t(currentDef.titleKey)}</CardTitle>
              <CardDescription>{t(currentDef.descriptionKey)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {currentStep === 1 && (
                <RequesterStep data={formData} updateField={updateField} />
              )}
              {currentStep === 2 && (
                <WorkDetailsStep
                  data={formData}
                  updateField={updateField}
                  workTypes={workTypes}
                  workTypesLoading={workTypesLoading}
                  workLocations={workLocations}
                  workLocationsLoading={workLocationsLoading}
                />
              )}
              {currentStep === 3 && (
                <ScheduleStep data={formData} updateField={updateField} />
              )}
              {currentStep === 4 && (
                <DocumentsStep data={formData} updateField={updateField} />
              )}
              {currentStep === 5 && (
                <ReviewStep
                  data={formData}
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
        {currentStep < TOTAL_STEPS ? (
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
