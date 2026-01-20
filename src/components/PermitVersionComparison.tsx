import { usePermitComparison } from '@/hooks/usePermitVersions';
import { Loader2, ArrowRight, Pencil, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

interface PermitVersionComparisonProps {
  leftPermitId: string;
  rightPermitId: string;
}

interface CompareField {
  key: string;
  label: string;
  group: string;
  format?: (value: any) => string;
}

const COMPARE_FIELDS: CompareField[] = [
  // Requester Info
  { key: 'requester_name', label: 'Requester Name', group: 'Requester Info' },
  { key: 'requester_email', label: 'Requester Email', group: 'Requester Info' },
  { key: 'contractor_name', label: 'Contractor', group: 'Requester Info' },
  { key: 'contact_mobile', label: 'Contact Mobile', group: 'Requester Info' },
  
  // Work Details
  { key: 'work_description', label: 'Description', group: 'Work Details' },
  { key: 'work_location', label: 'Location', group: 'Work Details' },
  { key: 'unit', label: 'Unit', group: 'Work Details' },
  { key: 'floor', label: 'Floor', group: 'Work Details' },
  { 
    key: 'work_types', 
    label: 'Work Type', 
    group: 'Work Details',
    format: (value: any) => value?.name || 'N/A'
  },
  { key: 'urgency', label: 'Urgency', group: 'Work Details' },
  
  // Schedule
  { 
    key: 'work_date_from', 
    label: 'Start Date', 
    group: 'Schedule',
    format: (value: string) => value ? format(new Date(value), 'PPP') : 'N/A'
  },
  { 
    key: 'work_date_to', 
    label: 'End Date', 
    group: 'Schedule',
    format: (value: string) => value ? format(new Date(value), 'PPP') : 'N/A'
  },
  { key: 'work_time_from', label: 'Start Time', group: 'Schedule' },
  { key: 'work_time_to', label: 'End Time', group: 'Schedule' },
  
  // Attachments
  { 
    key: 'attachments', 
    label: 'Attachments', 
    group: 'Attachments',
    format: (value: string[] | null) => value ? `${value.length} file(s)` : '0 files'
  },
];

function getValue(permit: any, field: CompareField): string {
  const value = permit?.[field.key];
  if (field.format) {
    return field.format(value);
  }
  if (value === null || value === undefined) return 'N/A';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function isChanged(leftValue: string, rightValue: string): boolean {
  return leftValue !== rightValue;
}

export function PermitVersionComparison({ leftPermitId, rightPermitId }: PermitVersionComparisonProps) {
  const { data, isLoading, error } = usePermitComparison(leftPermitId, rightPermitId);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (error || !data?.left || !data?.right) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Failed to load permits for comparison
      </div>
    );
  }
  
  const { left, right } = data;
  
  // Group fields by category
  const groups = COMPARE_FIELDS.reduce((acc, field) => {
    if (!acc[field.group]) acc[field.group] = [];
    acc[field.group].push(field);
    return acc;
  }, {} as Record<string, CompareField[]>);
  
  // Count changes
  const changedFields = COMPARE_FIELDS.filter(field => 
    isChanged(getValue(left, field), getValue(right, field))
  );
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <Badge variant="secondary" className="mb-1">{left.permit_no}</Badge>
            <p className="text-xs text-muted-foreground">
              {format(new Date(left.created_at), 'PP')}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
          <div className="text-center">
            <Badge variant="default" className="mb-1">{right.permit_no}</Badge>
            <p className="text-xs text-muted-foreground">
              {format(new Date(right.created_at), 'PP')}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1">
          <Pencil className="h-3 w-3" />
          {changedFields.length} change{changedFields.length !== 1 ? 's' : ''}
        </Badge>
      </div>
      
      {/* Comparison Table */}
      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-6">
          {Object.entries(groups).map(([groupName, fields]) => (
            <div key={groupName}>
              <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                {groupName}
              </h4>
              <div className="space-y-2">
                {fields.map(field => {
                  const leftValue = getValue(left, field);
                  const rightValue = getValue(right, field);
                  const changed = isChanged(leftValue, rightValue);
                  
                  return (
                    <div 
                      key={field.key}
                      className={cn(
                        "grid grid-cols-[140px_1fr_1fr] gap-3 p-3 rounded-lg text-sm",
                        changed ? "bg-amber-500/10 border border-amber-500/30" : "bg-muted/30"
                      )}
                    >
                      <div className="font-medium flex items-center gap-2">
                        {changed && <Pencil className="h-3 w-3 text-amber-500" />}
                        {field.label}
                      </div>
                      <div className={cn(
                        "truncate",
                        changed && "line-through text-muted-foreground"
                      )}>
                        {leftValue}
                      </div>
                      <div className={cn(
                        "truncate font-medium",
                        changed && "text-amber-600 dark:text-amber-400"
                      )}>
                        {rightValue}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      
      {/* Legend */}
      <div className="flex gap-6 pt-4 border-t text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/50" />
          <span>Changed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-muted" />
          <span>Unchanged</span>
        </div>
      </div>
    </div>
  );
}
