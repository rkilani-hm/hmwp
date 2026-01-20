import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkPermit, useWorkTypes, useUpdateAndResubmitPermit } from '@/hooks/useWorkPermits';
import { useAuth } from '@/contexts/AuthContext';
import { 
  ArrowLeft,
  Upload,
  Paperclip,
  X,
  Loader2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Save,
  Send
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AttachmentPreview } from '@/components/ui/AttachmentPreview';

export default function EditPermit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: permit, isLoading, error } = useWorkPermit(id);
  const { data: workTypes, isLoading: workTypesLoading } = useWorkTypes();
  const updateAndResubmit = useUpdateAndResubmitPermit();

  const [formData, setFormData] = useState({
    contractorName: '',
    contactMobile: '',
    unit: '',
    floor: '',
    workLocation: '',
    workTypeId: '',
    workDescription: '',
    workDateFrom: '',
    workDateTo: '',
    workTimeFrom: '',
    workTimeTo: '',
    urgency: 'normal' as 'normal' | 'urgent',
  });
  const [newAttachments, setNewAttachments] = useState<File[]>([]);

  // Initialize form data when permit loads
  useEffect(() => {
    if (permit) {
      setFormData({
        contractorName: permit.contractor_name || '',
        contactMobile: permit.contact_mobile || '',
        unit: permit.unit || '',
        floor: permit.floor || '',
        workLocation: permit.work_location || '',
        workTypeId: permit.work_type_id || '',
        workDescription: permit.work_description || '',
        workDateFrom: permit.work_date_from || '',
        workDateTo: permit.work_date_to || '',
        workTimeFrom: permit.work_time_from || '',
        workTimeTo: permit.work_time_to || '',
        urgency: (permit.urgency as 'normal' | 'urgent') || 'normal',
      });
    }
  }, [permit]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !permit) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Permit not found</p>
      </div>
    );
  }

  // Only allow editing if user is the creator and status is rework_needed or draft
  const canEdit = permit.requester_id === user?.id && 
    (permit.status === 'rework_needed' || permit.status === 'draft');

  if (!canEdit) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cannot Edit</AlertTitle>
          <AlertDescription>
            You can only edit permits that are in draft or rework needed status.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setNewAttachments(prev => [...prev, ...files]);
    }
  };

  const removeNewFile = (index: number) => {
    setNewAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    updateAndResubmit.mutate({
      permitId: permit.id,
      updates: {
        contractor_name: formData.contractorName.trim(),
        contact_mobile: formData.contactMobile.trim(),
        unit: formData.unit.trim(),
        floor: formData.floor.trim(),
        work_location: formData.workLocation.trim(),
        work_type_id: formData.workTypeId,
        work_description: formData.workDescription.trim(),
        work_date_from: formData.workDateFrom,
        work_date_to: formData.workDateTo,
        work_time_from: formData.workTimeFrom,
        work_time_to: formData.workTimeTo,
        urgency: formData.urgency,
      },
      newFiles: newAttachments,
    }, {
      onSuccess: (data) => {
        // Navigate to the NEW permit version
        const newPermitId = data?.newPermitId || permit.id;
        navigate(`/permits/${newPermitId}`);
      }
    });
  };

  const isValid = formData.contractorName && formData.contactMobile && 
    formData.unit && formData.floor && formData.workLocation && 
    formData.workTypeId && formData.workDescription && 
    formData.workDateFrom && formData.workDateTo && 
    formData.workTimeFrom && formData.workTimeTo;

  const versionDisplay = permit.rework_version 
    ? `${permit.permit_no} - V${permit.rework_version + 1}` 
    : permit.permit_no;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-display font-bold">
              Edit Permit
            </h1>
            <Badge variant="outline" className="text-sm">
              {versionDisplay}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Update the permit details and resubmit for approval
          </p>
        </div>
      </div>

      {/* Rework Comments Alert - Prominent Banner */}
      {permit.rework_comments && (
        <div className="rounded-lg border-2 border-orange-500 bg-orange-500/10 p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 rounded-full bg-orange-500 p-3">
              <RotateCcw className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-lg font-semibold text-orange-600">
                  ⚠️ Rework Required
                </h3>
                <p className="text-sm text-muted-foreground">
                  An approver has requested changes to this permit. Please review the feedback below and make the necessary updates.
                </p>
              </div>
              <div className="rounded-md border-2 border-orange-300 bg-white p-4 dark:bg-background">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-600 mb-2">
                  Approver's Feedback
                </p>
                <p className="text-foreground font-medium text-base whitespace-pre-wrap">
                  {permit.rework_comments}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl space-y-6">
        {/* Contractor Info */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Contractor Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
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
          </CardContent>
        </Card>

        {/* Work Details */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Work Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <div className="space-y-2">
                <Label htmlFor="workLocation">Work Location *</Label>
                <Input
                  id="workLocation"
                  value={formData.workLocation}
                  onChange={(e) => updateField('workLocation', e.target.value)}
                  placeholder="Server Room"
                />
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
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Priority Level *</Label>
              <RadioGroup
                value={formData.urgency}
                onValueChange={(value) => updateField('urgency', value)}
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
          </CardContent>
        </Card>

        {/* Attachments */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Attachments</CardTitle>
            <CardDescription>
              Existing attachments will be kept. Add new files if needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Existing Attachments */}
            {(permit.attachments || []).length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Existing Files</Label>
                {(permit.attachments || []).map((filePath, index) => {
                  const filename = filePath.includes('/') 
                    ? decodeURIComponent(filePath.split('/').pop() || `attachment-${index + 1}`)
                    : filePath;
                  return (
                    <AttachmentPreview
                      key={index}
                      filePath={filePath}
                      filename={filename}
                    />
                  );
                })}
              </div>
            )}

            {/* Upload New */}
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

            {/* New Files */}
            {newAttachments.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">New Files</Label>
                {newAttachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeNewFile(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || updateAndResubmit.isPending}
          >
            {updateAndResubmit.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Update & Resubmit
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

