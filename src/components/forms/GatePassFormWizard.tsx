import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateGatePass } from '@/hooks/useGatePasses';
import type { GatePassItem, GatePassCategory, GatePassType, ShiftingMethod, DeliveryType } from '@/types/gatePass';
import { gatePassTypeLabels, shiftingMethodLabels, deliveryTypeLabels } from '@/types/gatePass';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

const STEPS_DETAILED = ['Category & Type', 'Entity & Location', 'Schedule & Logistics', 'Item Details', 'Purpose & Review'];
const STEPS_GENERIC = ['Category & Type', 'Delivery Details', 'Review'];

export default function GatePassFormWizard() {
  const navigate = useNavigate();
  const createGatePass = useCreateGatePass();
  const [step, setStep] = useState(0);

  // Form state
  const [category, setCategory] = useState<GatePassCategory | ''>('');
  const [passType, setPassType] = useState<GatePassType | ''>('');
  const [clientContractorName, setClientContractorName] = useState('');
  const [clientRepName, setClientRepName] = useState('');
  const [clientRepEmail, setClientRepEmail] = useState('');
  const [clientRepContact, setClientRepContact] = useState('');
  const [unitFloor, setUnitFloor] = useState('');
  const [deliveryArea, setDeliveryArea] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [vehicleMakeModel, setVehicleMakeModel] = useState('');
  const [vehicleLicensePlate, setVehicleLicensePlate] = useState('');
  const [shiftingMethod, setShiftingMethod] = useState<ShiftingMethod | ''>('');
  const [purpose, setPurpose] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType | ''>('');
  const [items, setItems] = useState<GatePassItem[]>([
    { serial_number: 1, item_details: '', quantity: '1', remarks: '', is_high_value: false },
  ]);

  const isGeneric = category === 'generic_delivery_permit';
  const steps = isGeneric ? STEPS_GENERIC : STEPS_DETAILED;

  const addItem = () => {
    setItems(prev => [...prev, { serial_number: prev.length + 1, item_details: '', quantity: '1', remarks: '', is_high_value: false }]);
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, serial_number: i + 1 })));
  };

  const updateItem = (idx: number, field: keyof GatePassItem, value: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async () => {
    if (!category || !passType) return;
    try {
      await createGatePass.mutateAsync({
        pass_category: category,
        pass_type: passType,
        client_contractor_name: clientContractorName || undefined,
        client_rep_name: clientRepName || undefined,
        client_rep_email: clientRepEmail || undefined,
        client_rep_contact: clientRepContact || undefined,
        unit_floor: unitFloor || undefined,
        delivery_area: deliveryArea || undefined,
        valid_from: validFrom || undefined,
        valid_to: validTo || undefined,
        time_from: timeFrom || undefined,
        time_to: timeTo || undefined,
        vehicle_make_model: vehicleMakeModel || undefined,
        vehicle_license_plate: vehicleLicensePlate || undefined,
        shifting_method: shiftingMethod || undefined,
        purpose: purpose || undefined,
        delivery_type: deliveryType || undefined,
        items: isGeneric ? [] : items.filter(i => i.item_details.trim()),
      });
      navigate('/gate-passes');
    } catch {}
  };

  const renderCategoryStep = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Pass Category *</Label>
        <Select value={category} onValueChange={(v) => { setCategory(v as GatePassCategory); setStep(0); }}>
          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="detailed_material_pass">Detailed Material Pass</SelectItem>
            <SelectItem value="generic_delivery_permit">Generic Delivery Permit</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Pass Type *</Label>
        <Select value={passType} onValueChange={(v) => setPassType(v as GatePassType)}>
          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            {Object.entries(gatePassTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderEntityStep = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Client / Contractor Name</Label>
        <Input value={clientContractorName} onChange={e => setClientContractorName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Client Rep / Permit Holder</Label>
        <Input value={clientRepName} onChange={e => setClientRepName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input type="email" value={clientRepEmail} onChange={e => setClientRepEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Contact Number</Label>
        <Input value={clientRepContact} onChange={e => setClientRepContact(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Unit / Floor</Label>
        <Input value={unitFloor} onChange={e => setUnitFloor(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Authorized Delivery Area</Label>
        <Input value={deliveryArea} onChange={e => setDeliveryArea(e.target.value)} />
      </div>
    </div>
  );

  const renderScheduleStep = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Valid From</Label><Input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} /></div>
        <div className="space-y-2"><Label>Valid To</Label><Input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} /></div>
        <div className="space-y-2"><Label>Time From</Label><Input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} /></div>
        <div className="space-y-2"><Label>Time To</Label><Input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Vehicle Make/Model</Label><Input value={vehicleMakeModel} onChange={e => setVehicleMakeModel(e.target.value)} /></div>
        <div className="space-y-2"><Label>License Plate</Label><Input value={vehicleLicensePlate} onChange={e => setVehicleLicensePlate(e.target.value)} /></div>
      </div>
      <div className="space-y-2">
        <Label>Shifting Method</Label>
        <Select value={shiftingMethod} onValueChange={v => setShiftingMethod(v as ShiftingMethod)}>
          <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
          <SelectContent>
            {Object.entries(shiftingMethodLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {shiftingMethod === 'forklift' && (
          <Alert variant="destructive" className="mt-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Valid Work Permit required for forklift operation.</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );

  const renderItemsStep = () => (
    <div className="space-y-4">
      {items.map((item, idx) => (
        <Card key={idx}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Item #{item.serial_number}</span>
              {items.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Item Details *</Label>
                <Input value={item.item_details} onChange={e => updateItem(idx, 'item_details', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Remarks</Label>
                <Input value={item.remarks} onChange={e => updateItem(idx, 'remarks', e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Switch checked={item.is_high_value} onCheckedChange={v => updateItem(idx, 'is_high_value', v)} />
              <Label className="text-sm">High-Value Asset</Label>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" onClick={addItem}><Plus className="mr-2 h-4 w-4" /> Add Item</Button>
    </div>
  );

  const renderPurposeStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Purpose of Material Shifting / Delivery</Label>
        <Textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={4} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Review Summary</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Category:</strong> {category === 'detailed_material_pass' ? 'Detailed Material Pass' : 'Generic Delivery Permit'}</p>
          <p><strong>Type:</strong> {passType ? gatePassTypeLabels[passType] : '-'}</p>
          <p><strong>Client:</strong> {clientContractorName || '-'}</p>
          <p><strong>Location:</strong> {unitFloor || '-'} / {deliveryArea || '-'}</p>
          <p><strong>Validity:</strong> {validFrom || '-'} to {validTo || '-'}</p>
          {!isGeneric && <p><strong>Items:</strong> {items.filter(i => i.item_details).length} item(s), {items.some(i => i.is_high_value) ? '⚠️ Contains high-value assets' : 'No high-value assets'}</p>}
        </CardContent>
      </Card>
    </div>
  );

  const renderGenericDeliveryStep = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Delivery Type</Label>
        <Select value={deliveryType} onValueChange={v => setDeliveryType(v as DeliveryType)}>
          <SelectTrigger><SelectValue placeholder="Select delivery type" /></SelectTrigger>
          <SelectContent>
            {Object.entries(deliveryTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Vehicle Make/Model</Label><Input value={vehicleMakeModel} onChange={e => setVehicleMakeModel(e.target.value)} /></div>
        <div className="space-y-2"><Label>License Plate</Label><Input value={vehicleLicensePlate} onChange={e => setVehicleLicensePlate(e.target.value)} /></div>
        <div className="space-y-2"><Label>Valid From</Label><Input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} /></div>
        <div className="space-y-2"><Label>Valid To</Label><Input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} /></div>
      </div>
      <div className="space-y-2">
        <Label>Purpose</Label>
        <Textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={3} />
      </div>
    </div>
  );

  const renderGenericReviewStep = () => (
    <Card>
      <CardHeader><CardTitle className="text-lg">Review</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p><strong>Category:</strong> Generic Delivery Permit</p>
        <p><strong>Type:</strong> {passType ? gatePassTypeLabels[passType] : '-'}</p>
        <p><strong>Delivery Type:</strong> {deliveryType ? deliveryTypeLabels[deliveryType] : '-'}</p>
        <p><strong>Vehicle:</strong> {vehicleMakeModel || '-'} ({vehicleLicensePlate || '-'})</p>
        <p><strong>Validity:</strong> {validFrom || '-'} to {validTo || '-'}</p>
      </CardContent>
    </Card>
  );

  const renderCurrentStep = () => {
    if (isGeneric) {
      if (step === 0) return renderCategoryStep();
      if (step === 1) return renderGenericDeliveryStep();
      return renderGenericReviewStep();
    }
    if (step === 0) return renderCategoryStep();
    if (step === 1) return renderEntityStep();
    if (step === 2) return renderScheduleStep();
    if (step === 3) return renderItemsStep();
    return renderPurposeStep();
  };

  const canNext = () => {
    if (step === 0) return !!category && !!passType;
    return true;
  };

  const isLastStep = step === steps.length - 1;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">New Gate Pass</h1>
        <p className="text-muted-foreground">Fill in the details to create a new gate pass</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
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
          <CardDescription>Step {step + 1} of {steps.length}</CardDescription>
        </CardHeader>
        <CardContent>{renderCurrentStep()}</CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : navigate('/gate-passes')} disabled={createGatePass.isPending}>
          <ChevronLeft className="mr-1 h-4 w-4" /> {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {isLastStep ? (
          <Button onClick={handleSubmit} disabled={!canNext() || createGatePass.isPending}>
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
