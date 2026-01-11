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
import { usePublicWorkTypes, usePublicWorkLocations, useCreatePublicPermit } from '@/hooks/usePublicPermit';
import { WorkflowPreview } from '@/components/ui/WorkflowPreview';
import { 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  User, 
  Building2, 
  Calendar, 
  FileText,
  Loader2,
  AlertTriangle,
  Clock,
  QrCode,
  CheckCircle2,
  LogIn
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

const steps = [
  { id: 1, title: 'Contractor Info', icon: User },
  { id: 2, title: 'Work Details', icon: Building2 },
  { id: 3, title: 'Schedule', icon: Calendar },
  { id: 4, title: 'Review', icon: FileText },
];

interface FormData {
  externalCompanyName: string;
  externalContactPerson: string;
  contactMobile: string;
  contactEmail: string;
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
  urgency: 'normal' | 'urgent';
}

export default function PublicPermitRequest() {
  const navigate = useNavigate();
  const { data: workTypes, isLoading: workTypesLoading } = usePublicWorkTypes();
  const { data: workLocations, isLoading: workLocationsLoading } = usePublicWorkLocations();
  const createPermit = useCreatePublicPermit();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [submittedPermitNo, setSubmittedPermitNo] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    externalCompanyName: '',
    externalContactPerson: '',
    contactMobile: '',
    contactEmail: '',
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
    urgency: 'normal',
  });

  const updateField = (field: keyof FormData, value: string | 'normal' | 'urgent') => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.contactEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Validate phone format (basic)
    if (formData.contactMobile.length < 8) {
      toast.error('Please enter a valid phone number');
      return;
    }

    // Determine work location text
    const selectedLocation = workLocations?.find(loc => loc.id === formData.workLocationId);
    const workLocationText = formData.workLocationId === 'other' 
      ? formData.workLocationOther.trim()
      : selectedLocation?.name || '';

    createPermit.mutate({
      external_company_name: formData.externalCompanyName.trim(),
      external_contact_person: formData.externalContactPerson.trim(),
      contact_mobile: formData.contactMobile.trim(),
      requester_email: formData.contactEmail.trim(),
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
      urgency: formData.urgency,
    }, {
      onSuccess: (data) => {
        setSubmittedPermitNo(data.permit_no);
      }
    });
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.externalCompanyName && formData.externalContactPerson && formData.contactMobile && formData.contactEmail;
      case 2:
        const hasLocation = formData.workLocationId === 'other' 
          ? formData.workLocationOther.trim() !== ''
          : formData.workLocationId !== '';
        return formData.unit && formData.floor && hasLocation && formData.workTypeId && formData.workDescription;
      case 3:
        return formData.workDateFrom && formData.workDateTo && formData.workTimeFrom && formData.workTimeTo;
      default:
        return true;
    }
  };

  const selectedWorkType = workTypes?.find(wt => wt.id === formData.workTypeId);
  const selectedWorkLocation = workLocations?.find(loc => loc.id === formData.workLocationId);
  const isOtherLocation = formData.workLocationId === 'other';
  
  // Map to WorkflowPreview expected type
  const workflowLocation = selectedWorkLocation ? {
    id: selectedWorkLocation.id,
    name: selectedWorkLocation.name,
    location_type: selectedWorkLocation.location_type as 'shop' | 'common'
  } : null;
  const workLocationDisplayName = isOtherLocation 
    ? formData.workLocationOther 
    : selectedWorkLocation?.name || '';

  // Success screen after submission
  if (submittedPermitNo) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-lg mx-auto space-y-6">
          <div className="text-center space-y-4">
            <img 
              src={alHamraLogo} 
              alt="Al Hamra Logo" 
              className="h-16 mx-auto"
            />
          </div>

          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="py-8 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-green-700 mb-2">
                Permit Request Submitted!
              </h2>
              <p className="text-green-600 mb-6">
                Your work permit request has been received and is pending review.
              </p>
              
              <div className="bg-white rounded-lg p-4 border border-green-200 mb-6">
                <p className="text-sm text-muted-foreground mb-1">Your Permit Number</p>
                <p className="text-2xl font-mono font-bold text-foreground">{submittedPermitNo}</p>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                Please save this permit number. You can use it to check the status of your request.
              </p>

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(`/verify?permit=${submittedPermitNo}`)}
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  View Permit Status
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setSubmittedPermitNo(null);
                    setCurrentStep(1);
                    setFormData({
                      externalCompanyName: '',
                      externalContactPerson: '',
                      contactMobile: '',
                      contactEmail: '',
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
                      urgency: 'normal',
                    });
                  }}
                >
                  Submit Another Request
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="text-center">
            <Button variant="ghost" onClick={() => navigate('/auth')}>
              <LogIn className="h-4 w-4 mr-2" />
              Staff Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <img 
            src={alHamraLogo} 
            alt="Al Hamra Logo" 
            className="h-16 mx-auto"
          />
          <div>
            <Badge variant="secondary" className="mb-2">
              <Building2 className="h-3 w-3 mr-1" />
              Internal Use Only
            </Badge>
            <h1 className="text-2xl font-bold text-foreground">Work Permit Request</h1>
            <p className="text-muted-foreground mt-1">
              Submit a work permit request for Al Hamra internal operations
            </p>
          </div>
        </div>

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
                  {currentStep === 1 && 'Enter your company and contact information'}
                  {currentStep === 2 && 'Describe the work to be performed'}
                  {currentStep === 3 && 'Set the work schedule'}
                  {currentStep === 4 && 'Review and submit your permit request'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {currentStep === 1 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="externalCompanyName">Company Name *</Label>
                      <Input
                        id="externalCompanyName"
                        value={formData.externalCompanyName}
                        onChange={(e) => updateField('externalCompanyName', e.target.value)}
                        placeholder="ABC Contractors Ltd."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="externalContactPerson">Contact Person *</Label>
                      <Input
                        id="externalContactPerson"
                        value={formData.externalContactPerson}
                        onChange={(e) => updateField('externalContactPerson', e.target.value)}
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactMobile">Mobile Number *</Label>
                      <Input
                        id="contactMobile"
                        type="tel"
                        value={formData.contactMobile}
                        onChange={(e) => updateField('contactMobile', e.target.value)}
                        placeholder="+971 50 123 4567"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="contactEmail">Email Address *</Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) => updateField('contactEmail', e.target.value)}
                        placeholder="john@contractor.com"
                      />
                      <p className="text-xs text-muted-foreground">
                        You'll receive status updates at this email address
                      </p>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="unit">Unit / Area *</Label>
                        <Input
                          id="unit"
                          value={formData.unit}
                          onChange={(e) => updateField('unit', e.target.value)}
                          placeholder="Server Room / Empty Unit A-101"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="floor">Floor *</Label>
                        <Input
                          id="floor"
                          value={formData.floor}
                          onChange={(e) => updateField('floor', e.target.value)}
                          placeholder="Ground / Basement / 10"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
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
                        workLocation={workflowLocation}
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
                              Standard processing time
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
                              Expedited processing
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
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="workDateTo">End Date *</Label>
                        <Input
                          id="workDateTo"
                          type="date"
                          value={formData.workDateTo}
                          onChange={(e) => updateField('workDateTo', e.target.value)}
                          min={formData.workDateFrom || new Date().toISOString().split('T')[0]}
                        />
                      </div>
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
                  <div className="space-y-6">
                    <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                      <h3 className="font-semibold">Contractor Information</h3>
                      <div className="grid gap-3 sm:grid-cols-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Company:</span>
                          <p className="font-medium">{formData.externalCompanyName}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Contact Person:</span>
                          <p className="font-medium">{formData.externalContactPerson}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Mobile:</span>
                          <p className="font-medium">{formData.contactMobile}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Email:</span>
                          <p className="font-medium">{formData.contactEmail}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                      <h3 className="font-semibold">Work Details</h3>
                      <div className="grid gap-3 sm:grid-cols-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Unit/Area:</span>
                          <p className="font-medium">{formData.unit}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Floor:</span>
                          <p className="font-medium">{formData.floor}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Location:</span>
                          <p className="font-medium">{workLocationDisplayName}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Work Type:</span>
                          <p className="font-medium">{selectedWorkType?.name || '-'}</p>
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-sm">Description:</span>
                        <p className="font-medium text-sm">{formData.workDescription}</p>
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                      <h3 className="font-semibold">Schedule</h3>
                      <div className="grid gap-3 sm:grid-cols-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Dates:</span>
                          <p className="font-medium">{formData.workDateFrom} to {formData.workDateTo}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Time:</span>
                          <p className="font-medium">{formData.workTimeFrom} - {formData.workTimeTo}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Priority:</span>
                          <Badge variant={formData.urgency === 'urgent' ? 'destructive' : 'secondary'}>
                            {formData.urgency === 'urgent' ? 'Urgent' : 'Normal'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Workflow Preview */}
                    <WorkflowPreview 
                      workType={selectedWorkType}
                      workLocation={workflowLocation}
                      isOtherLocation={isOtherLocation}
                      className="p-4 bg-muted/30 rounded-lg"
                    />

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4 inline mr-2" />
                        By submitting this request, you confirm that all information provided is accurate. 
                        You will receive status updates via email.
                      </p>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex justify-between pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(prev => prev - 1)}
                    disabled={currentStep === 1}
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>

                  {currentStep < steps.length ? (
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
                      className="bg-success hover:bg-success/90"
                    >
                      {createPermit.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Submit Request
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* Staff Login Link */}
        <div className="text-center">
          <Button variant="ghost" onClick={() => navigate('/auth')}>
            <LogIn className="h-4 w-4 mr-2" />
            Staff Login
          </Button>
        </div>
      </div>
    </div>
  );
}
