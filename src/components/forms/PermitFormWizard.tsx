import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkTypes, useCreatePermit } from '@/hooks/useWorkPermits';
import { useWorkLocations, WorkLocation } from '@/hooks/useWorkLocations';
import { useAuth } from '@/contexts/AuthContext';
import { WorkflowPreview } from '@/components/ui/WorkflowPreview';
import { 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Upload, 
  User, 
  Building2, 
  Calendar, 
  FileText,
  Paperclip,
  X,
  Loader2,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const steps = [
  { id: 1, title: 'Requester Info', icon: User },
  { id: 2, title: 'Work Details', icon: Building2 },
  { id: 3, title: 'Schedule', icon: Calendar },
  { id: 4, title: 'Documents', icon: FileText },
  { id: 5, title: 'Review', icon: Check },
];

interface FormData {
  requesterName: string;
  requesterEmail: string;
  contractorName: string;
  contactMobile: string;
  unit: string;
  floor: string;
  workLocationId: string;
  workLocationOther: string;
  workTypeId: string;
  workDescription: string;
  workDateFrom: string;
  workDateTo: string;
  workTimeFrom: string;
  workTimeTo: string;
  attachments: File[];
  urgency: 'normal' | 'urgent';
}

export function PermitFormWizard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: workTypes, isLoading: workTypesLoading } = useWorkTypes();
  const { data: workLocations, isLoading: workLocationsLoading } = useWorkLocations();
  const createPermit = useCreatePermit();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
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

  const updateField = (field: keyof FormData, value: string | File[] | 'normal' | 'urgent') => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      updateField('attachments', [...formData.attachments, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    updateField(
      'attachments',
      formData.attachments.filter((_, i) => i !== index)
    );
  };

  const handleSubmit = async () => {
    // Determine work location text
    const selectedLocation = workLocations?.find(loc => loc.id === formData.workLocationId);
    const workLocationText = formData.workLocationId === 'other' 
      ? formData.workLocationOther.trim()
      : selectedLocation?.name || '';

    createPermit.mutate({
      contractor_name: formData.contractorName.trim(),
      contact_mobile: formData.contactMobile.trim(),
      unit: formData.unit.trim(),
      floor: formData.floor.trim(),
      work_location: workLocationText,
      work_location_id: formData.workLocationId === 'other' ? null : formData.workLocationId || null,
      work_location_other: formData.workLocationId === 'other' ? formData.workLocationOther.trim() : null,
      work_type_id: formData.workTypeId,
      work_description: formData.workDescription.trim(),
      work_date_from: formData.workDateFrom,
      work_date_to: formData.workDateTo,
      work_time_from: formData.workTimeFrom,
      work_time_to: formData.workTimeTo,
      files: formData.attachments,
      urgency: formData.urgency,
    }, {
      onSuccess: () => {
        navigate('/permits');
      }
    });
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.requesterName && formData.requesterEmail && formData.contractorName && formData.contactMobile;
      case 2:
        const hasLocation = formData.workLocationId === 'other' 
          ? formData.workLocationOther.trim() !== ''
          : formData.workLocationId !== '';
        return formData.unit && formData.floor && hasLocation && formData.workTypeId && formData.workDescription;
      case 3:
        return formData.workDateFrom && formData.workDateTo && formData.workTimeFrom && formData.workTimeTo;
      case 4:
        return true;
      default:
        return true;
    }
  };

  const selectedWorkType = workTypes?.find(wt => wt.id === formData.workTypeId);
  const selectedWorkLocation = workLocations?.find(loc => loc.id === formData.workLocationId);
  const isOtherLocation = formData.workLocationId === 'other';
  const workLocationDisplayName = isOtherLocation 
    ? formData.workLocationOther 
    : selectedWorkLocation?.name || '';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
                    currentStep > step.id
                      ? 'bg-success border-success text-success-foreground'
                      : currentStep === step.id
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-muted border-border text-muted-foreground'
                  )}
                >
                  {currentStep > step.id ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs mt-2 font-medium hidden sm:block',
                    currentStep === step.id ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {step.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'w-12 sm:w-20 h-0.5 mx-2',
                    currentStep > step.id ? 'bg-success' : 'bg-border'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form Steps */}
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
              <CardTitle className="font-display">{steps[currentStep - 1].title}</CardTitle>
              <CardDescription>
                {currentStep === 1 && 'Enter the requester and contractor information'}
                {currentStep === 2 && 'Describe the work to be performed'}
                {currentStep === 3 && 'Set the work schedule and urgency level'}
                {currentStep === 4 && 'Upload relevant documents'}
                {currentStep === 5 && 'Review and submit your permit request'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {currentStep === 1 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="requesterName">Requester Name *</Label>
                    <Input
                      id="requesterName"
                      value={formData.requesterName}
                      onChange={(e) => updateField('requesterName', e.target.value)}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="requesterEmail">Requester Email *</Label>
                    <Input
                      id="requesterEmail"
                      type="email"
                      value={formData.requesterEmail}
                      onChange={(e) => updateField('requesterEmail', e.target.value)}
                      placeholder="john@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractorName">Contractor Company *</Label>
                    <Input
                      id="contractorName"
                      value={formData.contractorName}
                      onChange={(e) => updateField('contractorName', e.target.value)}
                      placeholder="ABC Contractors Ltd."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactMobile">Contact Mobile *</Label>
                    <Input
                      id="contactMobile"
                      value={formData.contactMobile}
                      onChange={(e) => updateField('contactMobile', e.target.value)}
                      placeholder="+1 555-0123"
                    />
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="unit">Unit *</Label>
                      <Input
                        id="unit"
                        value={formData.unit}
                        onChange={(e) => updateField('unit', e.target.value)}
                        placeholder="A-101"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="floor">Floor *</Label>
                      <Input
                        id="floor"
                        value={formData.floor}
                        onChange={(e) => updateField('floor', e.target.value)}
                        placeholder="10"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-3">
                      <Label htmlFor="workLocation">Work Location *</Label>
                      <Select
                        value={formData.workLocationId}
                        onValueChange={(value) => updateField('workLocationId', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select work location" />
                        </SelectTrigger>
                        <SelectContent>
                          {workLocationsLoading ? (
                            <SelectItem value="" disabled>Loading...</SelectItem>
                          ) : (
                            <>
                              {(workLocations || []).map((loc) => (
                                <SelectItem key={loc.id} value={loc.id}>
                                  {loc.name}
                                </SelectItem>
                              ))}
                              <SelectItem value="other">Other (specify below)</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      {formData.workLocationId === 'other' && (
                        <Input
                          id="workLocationOther"
                          value={formData.workLocationOther}
                          onChange={(e) => updateField('workLocationOther', e.target.value)}
                          placeholder="Enter custom location"
                          className="mt-2"
                        />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workType">Work Type *</Label>
                    <Select
                      value={formData.workTypeId}
                      onValueChange={(value) => updateField('workTypeId', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select work type" />
                      </SelectTrigger>
                      <SelectContent>
                        {workTypesLoading ? (
                          <SelectItem value="" disabled>Loading...</SelectItem>
                        ) : (
                          (workTypes || []).map((wt) => (
                            <SelectItem key={wt.id} value={wt.id}>
                              {wt.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workDescription">Work Description *</Label>
                    <Textarea
                      id="workDescription"
                      value={formData.workDescription}
                      onChange={(e) => updateField('workDescription', e.target.value)}
                      placeholder="Describe the work to be performed..."
                      rows={4}
                    />
                  </div>
                  
                  {/* Workflow Preview */}
                  {(formData.workLocationId || formData.workTypeId) && (
                    <WorkflowPreview 
                      workType={selectedWorkType}
                      workLocation={selectedWorkLocation}
                      isOtherLocation={isOtherLocation}
                      className="mt-4 p-4 bg-muted/30 rounded-lg"
                    />
                  )}
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6">
                  {/* Urgency Selection */}
                  <div className="space-y-3">
                    <Label>Priority Level *</Label>
                    <RadioGroup
                      value={formData.urgency}
                      onValueChange={(value) => updateField('urgency', value as 'normal' | 'urgent')}
                      className="grid grid-cols-2 gap-4"
                    >
                      <div className={cn(
                        "flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                        formData.urgency === 'normal' 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-muted-foreground'
                      )}>
                        <RadioGroupItem value="normal" id="normal" />
                        <Label htmlFor="normal" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">Normal</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            48-hour SLA for approval
                          </p>
                        </Label>
                      </div>
                      <div className={cn(
                        "flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                        formData.urgency === 'urgent' 
                          ? 'border-destructive bg-destructive/5' 
                          : 'border-border hover:border-muted-foreground'
                      )}>
                        <RadioGroupItem value="urgent" id="urgent" />
                        <Label htmlFor="urgent" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                            <span className="font-medium">Urgent</span>
                            <Badge variant="destructive" className="text-xs">Priority</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            4-hour SLA for approval
                          </p>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Date/Time Selection */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="workDateFrom">Start Date *</Label>
                      <Input
                        id="workDateFrom"
                        type="date"
                        value={formData.workDateFrom}
                        onChange={(e) => updateField('workDateFrom', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workDateTo">End Date *</Label>
                      <Input
                        id="workDateTo"
                        type="date"
                        value={formData.workDateTo}
                        onChange={(e) => updateField('workDateTo', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="workTimeFrom">Start Time *</Label>
                      <Input
                        id="workTimeFrom"
                        type="time"
                        value={formData.workTimeFrom}
                        onChange={(e) => updateField('workTimeFrom', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workTimeTo">End Time *</Label>
                      <Input
                        id="workTimeTo"
                        type="time"
                        value={formData.workTimeTo}
                        onChange={(e) => updateField('workTimeTo', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-4">
                  <div
                    className={cn(
                      'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                      'hover:border-accent/50 hover:bg-accent/5'
                    )}
                  >
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      multiple
                      onChange={handleFileChange}
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Upload className="w-10 h-10 text-muted-foreground" />
                      <p className="text-sm font-medium">Drop files here or click to upload</p>
                      <p className="text-xs text-muted-foreground">
                        PDF, DOC, XLS, JPG, PNG up to 10MB each
                      </p>
                    </label>
                  </div>

                  {formData.attachments.length > 0 && (
                    <div className="space-y-2">
                      {formData.attachments.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <Paperclip className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">{file.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeFile(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {currentStep === 5 && (
                <div className="space-y-6">
                  {/* Urgency Badge */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Priority:</span>
                    {formData.urgency === 'urgent' ? (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Urgent (4hr SLA)
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Normal (48hr SLA)
                      </Badge>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Requester</p>
                      <p className="text-sm">{formData.requesterName}</p>
                      <p className="text-sm text-muted-foreground">{formData.requesterEmail}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Contractor</p>
                      <p className="text-sm">{formData.contractorName}</p>
                      <p className="text-sm text-muted-foreground">{formData.contactMobile}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Location</p>
                      <p className="text-sm">{workLocationDisplayName}</p>
                      <p className="text-sm text-muted-foreground">Unit {formData.unit}, Floor {formData.floor}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Work Type</p>
                      <p className="text-sm">{selectedWorkType?.name}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Work Description</p>
                    <p className="text-sm mt-1">{formData.workDescription}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Schedule</p>
                      <p className="text-sm">{formData.workDateFrom} to {formData.workDateTo}</p>
                      <p className="text-sm text-muted-foreground">{formData.workTimeFrom} - {formData.workTimeTo}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Attachments</p>
                      <p className="text-sm">
                        {formData.attachments.length === 0 
                          ? 'No files attached' 
                          : `${formData.attachments.length} file(s)`}
                      </p>
                    </div>
                  </div>
                  {/* Dynamic Workflow Preview */}
                  {formData.workTypeId && (
                    <WorkflowPreview 
                      workType={selectedWorkType}
                      workLocation={selectedWorkLocation}
                      isOtherLocation={isOtherLocation}
                      className="mt-2"
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(prev => prev - 1)}
          disabled={currentStep === 1}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Previous
        </Button>
        {currentStep < 5 ? (
          <Button
            onClick={() => setCurrentStep(prev => prev + 1)}
            disabled={!canProceed()}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={createPermit.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {createPermit.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Submit Permit Request
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
