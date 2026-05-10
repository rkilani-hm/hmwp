import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateGatePass } from '@/hooks/useGatePasses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  GatePassFormData,
  UpdateField,
  initialGatePassFormData,
} from './gate-pass-steps/types';
import { CategoryStep } from './gate-pass-steps/CategoryStep';
import { EntityStep } from './gate-pass-steps/EntityStep';
import { ScheduleStep } from './gate-pass-steps/ScheduleStep';
import { ItemsStep } from './gate-pass-steps/ItemsStep';
import { PurposeStep } from './gate-pass-steps/PurposeStep';
import { GenericDeliveryStep } from './gate-pass-steps/GenericDeliveryStep';
import { GenericReviewStep } from './gate-pass-steps/GenericReviewStep';

const STEPS_DETAILED = [
  'Category & Type',
  'Entity & Location',
  'Schedule & Logistics',
  'Item Details',
  'Purpose & Review',
];
const STEPS_GENERIC = [
  'Category & Type',
  'Delivery Details',
  'Material Details',
  'Review',
];

/**
 * GatePassFormWizard
 *
 * Orchestrator — owns wizard state, step indicator, and navigation.
 * Each step's UI lives in its own file under ./gate-pass-steps/, takes
 * `{ data, updateField }` and renders the relevant slice of the form.
 *
 * Two flows live in parallel here:
 *   - Detailed material pass: 5 steps (Category → Entity → Schedule
 *     → Items → Purpose+Review)
 *   - Generic delivery permit: 4 steps (Category → Delivery →
 *     Items → Review). Compressed because generic permits don't
 *     need entity-vs-schedule separation.
 *
 * Mirrors the PR #6 PermitFormWizard refactor pattern.
 */
export default function GatePassFormWizard() {
  const navigate = useNavigate();
  const createGatePass = useCreateGatePass();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<GatePassFormData>(initialGatePassFormData);

  // Generic field updater — replaces the 17 individual useState/setX
  // hooks the previous version had. Each step calls this with the
  // key + new value.
  const updateField = useCallback<UpdateField>((key, value) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const isGeneric = data.category === 'generic_delivery_permit';
  const steps = isGeneric ? STEPS_GENERIC : STEPS_DETAILED;
  const isLastStep = step === steps.length - 1;

  const canNext = () => {
    if (step === 0) return !!data.category && !!data.passType;
    return true;
  };

  const handleSubmit = async () => {
    if (!data.category || !data.passType) return;
    try {
      await createGatePass.mutateAsync({
        pass_category: data.category,
        pass_type: data.passType,
        client_contractor_name: data.clientContractorName || undefined,
        client_rep_name: data.clientRepName || undefined,
        client_rep_email: data.clientRepEmail || undefined,
        client_rep_contact: data.clientRepContact || undefined,
        unit_floor: data.unitFloor || undefined,
        delivery_area: data.deliveryArea || undefined,
        valid_from: data.validFrom || undefined,
        valid_to: data.validTo || undefined,
        time_from: data.timeFrom || undefined,
        time_to: data.timeTo || undefined,
        vehicle_make_model: data.vehicleMakeModel || undefined,
        vehicle_license_plate: data.vehicleLicensePlate || undefined,
        shifting_method: data.shiftingMethod || undefined,
        purpose: data.purpose || undefined,
        delivery_type: data.deliveryType || undefined,
        items: data.items.filter((i) => i.item_details.trim()),
      });
      navigate('/gate-passes');
    } catch {
      // The mutation hook surfaces errors via toast; nothing to do here.
    }
  };

  const renderCurrentStep = () => {
    if (isGeneric) {
      if (step === 0) return <CategoryStep data={data} updateField={updateField} />;
      if (step === 1) return <GenericDeliveryStep data={data} updateField={updateField} />;
      if (step === 2) return <ItemsStep data={data} updateField={updateField} />;
      return <GenericReviewStep data={data} />;
    }
    if (step === 0) return <CategoryStep data={data} updateField={updateField} />;
    if (step === 1) return <EntityStep data={data} updateField={updateField} />;
    if (step === 2) return <ScheduleStep data={data} updateField={updateField} />;
    if (step === 3) return <ItemsStep data={data} updateField={updateField} />;
    return <PurposeStep data={data} updateField={updateField} />;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">New Gate Pass</h1>
        <p className="text-muted-foreground">
          Fill in the details to create a new gate pass
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                i <= step
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </div>
            <span className="text-sm hidden md:inline">{s}</span>
            {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{steps[step]}</CardTitle>
          <CardDescription>
            Step {step + 1} of {steps.length}
          </CardDescription>
        </CardHeader>
        <CardContent>{renderCurrentStep()}</CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => (step > 0 ? setStep(step - 1) : navigate('/gate-passes'))}
          disabled={createGatePass.isPending}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {isLastStep ? (
          <Button
            onClick={handleSubmit}
            disabled={!canNext() || createGatePass.isPending}
          >
            {createGatePass.isPending ? 'Submitting...' : 'Submit Gate Pass'}
          </Button>
        ) : (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
