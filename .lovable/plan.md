

## Gate Pass & Delivery Permit Management Module

This is a large, multi-phase feature that adds an entirely new module alongside the existing Work Permit system. The plan follows existing patterns (wizard forms, data tables, role-based access, edge functions for PDF).

---

### Phase 1: Database Schema

Create a new `gate_passes` table and `gate_pass_items` table via migration:

**`gate_passes` table:**
- `id` (uuid, PK), `pass_no` (text, auto-generated like `GP-XXXXX`)
- `pass_category` (text: `detailed_material_pass`, `generic_delivery_permit`)
- `pass_type` (text: `material_out`, `material_in`, `asset_transfer`, `scrap_disposal`, `contractor_tools`, `internal_shifting`)
- `status` (text: `draft`, `pending_store_manager`, `pending_finance`, `pending_security`, `approved`, `rejected`, `completed`)
- Requester fields: `requester_id` (uuid), `requester_name`, `requester_email`, `date_of_request`
- Entity fields: `client_contractor_name`, `client_rep_name`, `client_rep_email`, `client_rep_contact`
- Location fields: `unit_floor`, `delivery_area`
- Schedule: `valid_from` (date), `valid_to` (date), `time_from` (time), `time_to` (time)
- Vehicle: `vehicle_make_model`, `vehicle_license_plate`
- Logistics: `shifting_method` (text: `manually`, `material_trolley`, `pallet_trolley`, `forklift`)
- `purpose` (text), `has_high_value_asset` (boolean, computed/stored)
- `store_manager_name`, `store_manager_date`, `store_manager_comments`, `store_manager_signature`
- `finance_name`, `finance_date`, `finance_comments`, `finance_signature`
- `security_name`, `security_date`, `security_comments`, `security_signature`, `security_cctv_confirmed` (boolean)
- `completed_at`, `completed_by`
- Generic delivery fields: `delivery_type` (text: `goods`, `food`, `materials`)
- `pdf_url`, `created_at`, `updated_at`

**`gate_pass_items` table:**
- `id`, `gate_pass_id` (FK), `serial_number` (int), `item_details` (text), `quantity` (text), `remarks` (text), `is_high_value` (boolean)

**RLS policies:**
- Users can view/create their own gate passes (`requester_id = auth.uid()`)
- Approvers (store_manager, finance, security roles) can view and update all gate passes
- Admins can view all

**New roles** (if not existing): `store_manager`, `finance`, `security` -- added to the `roles` table via INSERT (using insert tool, not migration)

**Realtime:** Enable realtime on `gate_passes` table

---

### Phase 2: Frontend - Types & Hooks

**`src/types/gatePass.ts`** - TypeScript interfaces for GatePass and GatePassItem

**`src/hooks/useGatePasses.ts`** - CRUD hooks following the `useWorkPermits.ts` pattern:
- `useGatePasses()` - list all with realtime subscription
- `useGatePass(id)` - single pass detail
- `useCreateGatePass()` - creation with auto-generated pass number, auto-compute `has_high_value_asset` from items, set initial status to `pending_store_manager`
- `useApproveGatePass()` - handles the conditional workflow:
  - Store Manager approves → if `has_high_value_asset` → `pending_finance`, else → `pending_security`
  - Finance approves → `pending_security`
  - Security approves → `approved`
  - Security completes → `completed`

---

### Phase 3: UI Pages & Components

**1. Gate Pass Dashboard (`src/pages/GatePassDashboard.tsx`)**
- Data table with columns: Pass No, Category, Type, Requestor, Status, Date, Actions
- Filters: Status, Pass Type, Date range, Requestor search
- "12-Month Audit Retention" tab that shows archived passes (created_at < 12 months ago)
- "New Gate Pass" button

**2. Gate Pass Creation Form (`src/pages/NewGatePass.tsx` + `src/components/forms/GatePassFormWizard.tsx`)**
- Step 1: Pass Category selection (Detailed vs Generic)
  - If Generic: simplified fields (delivery type, vehicle info, validity)
  - If Detailed: full form continues
- Step 2: Entity & Location info
- Step 3: Schedule & Vehicle & Logistics (with forklift warning)
- Step 4: Item Details (dynamic array, up to 5+ items with high-value toggle)
- Step 5: Purpose & Review

**3. Gate Pass Detail (`src/pages/GatePassDetail.tsx`)**
- Full pass details with status timeline
- Approval actions for the appropriate role (Approve/Reject/Request Changes)
- Print View button, Export to PDF button
- Activity log tab

**4. Gate Pass Approvals (`src/pages/GatePassApprovals.tsx`)**
- Kanban or list view filtered by current user's role
- Quick action buttons (Approve/Reject/Request Changes)
- Shows only passes pending the current user's role

**5. Print View (`src/components/GatePassPrintView.tsx`)**
- Clean formal document layout with Al Hamra logo header
- Signature blocks for "Approved By", "Department Verification", "Security Sign-off"
- Print-specific CSS, triggered via `window.print()`

---

### Phase 4: PDF Generation

**`supabase/functions/generate-gate-pass-pdf/index.ts`**
- Similar to existing `generate-permit-pdf` function
- Renders formal gate pass document with:
  - Company logo header
  - Item grid table
  - Signature blocks
  - QR code for verification

---

### Phase 5: Navigation & Routing

**Update `src/components/layout/AppSidebar.tsx`:**
- Add "Gate Passes" nav item (with `Truck` or `Package` icon) for all role groups

**Update `src/pages/Index.tsx`:**
- Add routes: `/gate-passes`, `/gate-passes/new`, `/gate-passes/:id`, `/gate-passes/approvals`

---

### Technical Notes

- The conditional finance approval step (high-value assets) is handled in the `useApproveGatePass` hook logic, not in the workflow builder -- this is a fixed 4-step SOP
- `has_high_value_asset` is computed on insert/update based on whether any item in `gate_pass_items` has `is_high_value = true`
- The 12-month audit retention is a frontend filter, not a database deletion
- All components use existing shadcn/ui components and Tailwind CSS to match the design system
- Forms are fully responsive for tablet/mobile use at security gates

