

## Plan: Allow Approvers to Adjust Workflow During Approval

This feature enables authorized approvers to modify the work type or create a custom workflow for a permit during their approval step. All modifications are fully audited.

---

### Overview

When an approver opens a permit pending their approval, they will see a new "Modify Workflow" button. This triggers a dialog where they can:
1. **Change Work Type** - Select a different work type, which automatically applies its predefined workflow template
2. **Create Custom Flow** - Manually select which approval steps are required for this specific permit

---

### Database Schema Changes

#### New Table: `permit_workflow_overrides`

Stores per-permit workflow customizations applied by approvers.

```sql
CREATE TABLE public.permit_workflow_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  workflow_step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  is_required boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(permit_id, workflow_step_id)
);

-- RLS policies
ALTER TABLE public.permit_workflow_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approvers can view overrides" ON public.permit_workflow_overrides
  FOR SELECT TO authenticated
  USING (public.is_approver(auth.uid()));

CREATE POLICY "Approvers can insert overrides" ON public.permit_workflow_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approver(auth.uid()));
```

#### New Table: `permit_workflow_audit`

Detailed audit log for workflow modifications.

```sql
CREATE TABLE public.permit_workflow_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  modified_by uuid NOT NULL REFERENCES auth.users(id),
  modified_by_name text NOT NULL,
  modified_by_email text NOT NULL,
  modification_type text NOT NULL, -- 'work_type_change' | 'custom_flow'
  original_work_type_id uuid,
  new_work_type_id uuid,
  original_steps jsonb,
  new_steps jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- RLS: Only admins can view audit logs
ALTER TABLE public.permit_workflow_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit" ON public.permit_workflow_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert audit" ON public.permit_workflow_audit
  FOR INSERT TO authenticated
  WITH CHECK (true);
```

#### Add column to work_permits

```sql
-- Track if workflow was customized
ALTER TABLE public.work_permits 
ADD COLUMN IF NOT EXISTS workflow_customized boolean DEFAULT false;

-- Track who last modified the workflow
ALTER TABLE public.work_permits 
ADD COLUMN IF NOT EXISTS workflow_modified_by uuid REFERENCES auth.users(id);

ALTER TABLE public.work_permits 
ADD COLUMN IF NOT EXISTS workflow_modified_at timestamptz;
```

---

### Frontend Components

#### 1. New Component: `ModifyWorkflowDialog.tsx`

A dialog that allows approvers to modify the permit workflow.

| Section | Description |
|---------|-------------|
| Tabs | "Change Work Type" or "Custom Flow" |
| Work Type Tab | Dropdown to select a different work type with workflow preview |
| Custom Flow Tab | List of all available steps with toggles to include/exclude |
| Reason Field | Required text field explaining the modification |
| Preview | Visual preview of the resulting workflow |
| Confirm Button | Saves changes with password/biometric verification |

**UI Mockup:**
```text
┌──────────────────────────────────────────────────────────────┐
│  Modify Workflow                                        [X]  │
├──────────────────────────────────────────────────────────────┤
│  ┌───────────────┬───────────────┐                           │
│  │ Change Type   │ Custom Flow   │                           │
│  └───────────────┴───────────────┘                           │
│                                                              │
│  Current Work Type: IT Installation                          │
│  Current Workflow: CS → CR → Head CR → PMD → IT → FMSP       │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Select New Work Type:                                    ││
│  │ ┌────────────────────────────────────────────────────┐   ││
│  │ │ Fitout Work                                    ▼   │   ││
│  │ └────────────────────────────────────────────────────┘   ││
│  │                                                          ││
│  │ New Workflow Preview:                                    ││
│  │ CS → CR → Head CR → PMD → Fitout → FMSP                 ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  Reason for Change: ________________________________________│
│                                                              │
│  ⚠ This change will be logged with your identity            │
│                                                              │
│             [Cancel]    [Save & Continue Approval]           │
└──────────────────────────────────────────────────────────────┘
```

#### 2. Update: `PermitDetail.tsx`

Add "Modify Workflow" button to the actions area for approvers.

```typescript
// Show button only for approvers during their approval step
{canApprove() && isPendingStatus(permit.status) && (
  <Button 
    variant="outline" 
    onClick={() => setModifyWorkflowOpen(true)}
  >
    <Settings2 className="h-4 w-4 mr-2" />
    Modify Workflow
  </Button>
)}
```

#### 3. New Component: `WorkflowModificationPreview.tsx`

Visual diff showing current vs proposed workflow.

---

### Backend Changes

#### 1. New Hook: `useModifyPermitWorkflow.ts`

```typescript
interface ModifyWorkflowParams {
  permitId: string;
  modificationType: 'work_type_change' | 'custom_flow';
  newWorkTypeId?: string;  // For work type change
  customSteps?: { stepId: string; isRequired: boolean }[];  // For custom flow
  reason: string;
}

export function useModifyPermitWorkflow() {
  return useMutation({
    mutationFn: async (params: ModifyWorkflowParams) => {
      // Calls edge function to handle the modification
    },
  });
}
```

#### 2. New Hook: `usePermitWorkflowOverrides.ts`

Fetches any per-permit workflow overrides.

```typescript
export function usePermitWorkflowOverrides(permitId: string) {
  return useQuery({
    queryKey: ['permit-workflow-overrides', permitId],
    queryFn: async () => {
      const { data } = await supabase
        .from('permit_workflow_overrides')
        .select('*')
        .eq('permit_id', permitId);
      return data;
    },
  });
}
```

#### 3. Update Edge Function: `verify-signature-approval`

Modify the `isStepRequired` function to check permit-specific overrides first:

```typescript
async function isStepRequired(
  step: WorkflowStep,
  stepConfigs: Map<string, boolean>,
  permitOverrides: Map<string, boolean>,  // NEW: Per-permit overrides
  workType: WorkType | null,
  locationType: 'shop' | 'common' | null
): boolean {
  // 1. Check permit-specific overrides first (highest priority)
  if (permitOverrides.has(step.id)) {
    return permitOverrides.get(step.id)!;
  }
  
  // 2. Check work type step config
  if (stepConfigs.has(step.id)) {
    return stepConfigs.get(step.id)!;
  }
  
  // 3. Use workflow step default
  return step.is_required_default;
}
```

#### 4. New Edge Function: `modify-permit-workflow`

Handles workflow modifications with full audit logging.

```typescript
// Key responsibilities:
// 1. Validate user has approval rights for current step
// 2. Store the modification (work type change or custom overrides)
// 3. Create detailed audit log entry
// 4. Update permit.workflow_customized flag
// 5. Recalculate current status if needed
```

---

### Workflow Engine Integration

When the workflow engine (`verify-signature-approval`) processes an approval:

1. **Fetch permit overrides** from `permit_workflow_overrides` table
2. **Priority order for step requirements**:
   - Permit-specific overrides (from `permit_workflow_overrides`)
   - Work type step config (from `work_type_step_config`)  
   - Workflow step defaults (from `workflow_steps.is_required_default`)
3. **Use the resolved requirements** to determine the next step

---

### Audit Trail

Every workflow modification is logged with:

| Field | Description |
|-------|-------------|
| `permit_id` | The affected permit |
| `modified_by` | User ID who made the change |
| `modified_by_name` | Full name for display |
| `modified_by_email` | Email address |
| `modification_type` | "work_type_change" or "custom_flow" |
| `original_work_type_id` | Previous work type (if changed) |
| `new_work_type_id` | New work type (if changed) |
| `original_steps` | JSON of original workflow steps |
| `new_steps` | JSON of new/modified steps |
| `reason` | Approver's explanation |
| `ip_address` | Request origin |
| `user_agent` | Browser/device info |
| `created_at` | Timestamp |

---

### UI Indicators

#### 1. Customized Workflow Badge

Show a visual indicator on permits with modified workflows:

```typescript
{permit.workflow_customized && (
  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
    <Settings2 className="h-3 w-3 mr-1" />
    Workflow Modified
  </Badge>
)}
```

#### 2. Audit View in PermitDetail

Add "Workflow Changes" section in the Activity tab showing modification history.

---

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/ModifyWorkflowDialog.tsx` | Main dialog for workflow modification |
| `src/components/WorkflowModificationPreview.tsx` | Visual comparison of workflows |
| `src/hooks/useModifyPermitWorkflow.ts` | Mutation hook for modifications |
| `src/hooks/usePermitWorkflowOverrides.ts` | Query hook for overrides |
| `src/hooks/usePermitWorkflowAudit.ts` | Query hook for audit history |
| `supabase/functions/modify-permit-workflow/index.ts` | Edge function for modifications |

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/PermitDetail.tsx` | Add "Modify Workflow" button, show customized badge |
| `supabase/functions/verify-signature-approval/index.ts` | Check permit overrides in workflow resolution |
| `src/components/ui/PermitProgressTracker.tsx` | Handle custom workflows in visualization |
| `src/components/ui/WorkflowTimeline.tsx` | Show modified steps differently |
| Database migration | Create new tables and columns |

---

### Security Considerations

1. **Authorization**: Only users with approval rights for the current step can modify
2. **Audit Trail**: All modifications are permanently logged
3. **Password/Biometric Verification**: Required before saving changes
4. **RLS Policies**: Restrict who can view/edit overrides
5. **Validation**: Cannot skip mandatory steps or create invalid workflows

---

### Expected User Flow

1. Approver opens permit pending their approval
2. Clicks "Modify Workflow" button
3. Chooses either "Change Work Type" or "Custom Flow"
4. Makes selections and provides a reason
5. Reviews the workflow preview
6. Confirms with password/biometric
7. System logs the change and updates the permit
8. Approver proceeds with normal approval
9. Future approvers see the customized workflow
10. Audit trail shows the full modification history

