# Spec: Three-tier comment visibility (confidential / internal / public)

## Objective
Replace the single per-step comment blob with a proper comment model where each
comment carries an author, the author's department, and a VISIBILITY TIER chosen
by the author. Enforce visibility SERVER-SIDE so a user can never retrieve a
comment they are not allowed to see — not merely hide it in the UI.

Tiers:
- **confidential** — visible ONLY to users in the SAME department as the author
  (any member of that department, regardless of rank). Not other departments,
  not tenants.
- **internal** — visible to ALL internal (non-tenant) users, any department. NOT
  tenants.
- **public** — visible to EVERYONE, including tenants.

Default tier when a comment is created: **internal**.

## Depends on
The Departments + actor-type foundation spec (departments table,
`profiles.department_id`, `get_user_department` helper). That must be applied
first. This spec assumes departments exist and internal users are (being)
assigned.

## Verified baseline (live)
- Comments today: a single `permit_approvals.comments` text field per approval
  step. Only 1 of 111 approval rows has a comment — legacy migration is trivial.
- No comments table exists. (Option A chosen: comments get their own table.)
- PDF (`generate-permit-pdf`) selects `comments` but renders name/date/status/
  signature in the approval chain — build must locate every place comments are
  actually DISPLAYED (UI timeline, permit detail, PDF if any) and apply the
  visibility filter to ALL of them.

## Requirements

R1. **`permit_comments` table (Option A).** Create
    `public.permit_comments`:
    - id uuid PK
    - permit_id uuid NOT NULL (FK to work_permits; see R8 for gate passes)
    - approval_id uuid NULL (FK to permit_approvals, if the comment is tied to a
      specific step; nullable for general permit comments)
    - author_id uuid NOT NULL (FK auth.users)
    - author_department_id uuid NULL — captured AT WRITE TIME from the author's
      current department (snapshot, so later department changes don't retroac-
      tively expose/hide). NULL if author had no department (fail-closed, see E2).
    - tier text NOT NULL DEFAULT 'internal' CHECK (tier IN
      ('confidential','internal','public'))
    - body text NOT NULL
    - created_at timestamptz NOT NULL DEFAULT now()
    Indexes on (permit_id), (author_department_id, tier).

R2. **Migrate the legacy comment.** The 1 existing populated
    `permit_approvals.comments` (and any others at migration time) become
    `permit_comments` rows with tier='internal', author = the approval's
    approver if resolvable (else a system/unknown marker), author_department_id =
    that user's department if known else NULL. Decide whether to keep or retire
    `permit_approvals.comments` — recommended: keep the column for backward
    reads but stop writing to it; new comments go to `permit_comments`.

R3. **Server-side visibility (the core requirement).** Enforce tier visibility in
    the DATABASE read path via RLS on `permit_comments` (and/or a SECURITY
    DEFINER read function the app uses). A caller may SELECT a comment iff:
    - tier='public', OR
    - tier='internal' AND caller is non-tenant (is_non_tenant_staff(caller)), OR
    - tier='confidential' AND caller's department = comment.author_department_id
      (caller must have a non-NULL department equal to the comment's snapshot
      department).
    Admins may see all (confirm with product owner; recommended yes for support).
    This MUST hold at the API level: a tenant or wrong-department user requesting
    the comment via PostgREST/RPC gets NOTHING — not a filtered-in-UI row.

R3a. **Comment-author dept snapshot.** On insert, set author_department_id from
    `get_user_department(auth.uid())`. If the author is a tenant (no department)
    they may only post tier='public' (tenants commenting on their own permit) —
    or, if product owner prefers tenants cannot choose tier, tenants' comments
    are forced public. Define explicitly: tenants can post only PUBLIC comments.

R4. **Insert policy.** RLS INSERT: author_id = auth.uid(); tier within allowed
    set; a tenant may only insert tier='public'; non-tenants may insert any tier;
    confidential requires the author to HAVE a department (else reject or force a
    safe outcome — fail closed).

R5. **Compose UI — tier selector.** Where users add a comment, add a tier
    selector (Confidential / Internal / Public) defaulting to Internal. Show a
    one-line explanation of each tier. Tenants: no selector (their comments are
    public by definition), or hidden entirely if tenants don't comment — confirm.

R6. **Display filtering everywhere.** Every read path that shows comments — the
    approval timeline, permit detail, and the PDF if it renders comments — must
    show only comments the viewer is permitted to see (driven by R3, not by
    client-side guesswork). The UI filtering is secondary; the server is
    authoritative. Mark each comment's tier visibly (e.g. a small
    "Confidential — BDCR only" / "Internal" / "Public" badge) so authors and
    readers know who can see it.

R7. **PDF behavior.** If comments are rendered in the PDF: the PDF is generated
    server-side and may be downloaded by tenants once a permit is approved, so
    the PDF MUST NOT embed confidential or internal comments in a tenant-
    accessible PDF. Safest: the PDF either omits comments entirely, or includes
    only PUBLIC comments. Decide with product owner; default = PDF shows only
    public comments (or none). NEVER bake a confidential comment into a PDF a
    tenant can fetch.

R8. **Gate passes.** If gate pass comments exist / are in scope, apply the same
    model (a comments table + the same tier rules keyed on department). If GP
    comments are out of scope for now, state so explicitly and leave GP
    unchanged. (Confirm scope; WP is the primary target.)

## Edge cases
E1. Confidential comment by a BDCR user → visible to every BDCR user, no other
    department, no tenant. Verify with two real users in different departments.
E2. Author with NULL department writing confidential → FAIL CLOSED: either reject
    the insert with a clear message ("assign a department to post confidential
    comments") or store it visible to NO ONE but the author. Never broaden.
    Recommended: reject at insert.
E3. Internal comment → every non-tenant sees it regardless of department; tenant
    sees nothing.
E4. Public comment → everyone including the permit's tenant requester sees it.
E5. Viewer department changes after a confidential comment is written: visibility
    follows the COMMENT's snapshot department vs the viewer's CURRENT department.
    A user moved out of BDCR loses access to BDCR confidential comments; a user
    moved into BDCR gains access. (Snapshot is on the comment's author dept;
    viewer is evaluated live. Confirm this is the intended behavior.)
E6. Legacy migrated comments (tier=internal) are hidden from tenants — confirm no
    previously tenant-visible comment becomes hidden in a way that breaks a
    tenant's view of their own permit (none expected, since only 1 exists).
E7. Admin override (if enabled) must be logged when an admin reads confidential
    comments, if product owner wants an audit trail. Optional.

## Definition of done (verified against LIVE state + real multi-user test)
- [ ] `permit_comments` exists with the tier CHECK and FK/indexes per R1.
- [ ] The 1 legacy comment is migrated as tier='internal' with correct author/
      dept where resolvable.
- [ ] RLS on `permit_comments` enforces R3 — verified by SIMULATING reads as:
      (a) a tenant, (b) a non-tenant in a DIFFERENT department, (c) a non-tenant
      in the SAME department as a confidential comment's author. Only (c) and the
      author (and admin) can retrieve a confidential comment; (a) cannot retrieve
      confidential or internal; public is retrievable by all.
- [ ] The tenant-cannot-retrieve check is at the API/DB level (e.g. a direct
      select as the tenant returns zero confidential/internal rows), NOT just UI.
- [ ] Compose UI has a tier selector defaulting to Internal; tenants restricted
      to public (or no selector).
- [ ] All comment display surfaces (timeline, detail, PDF if applicable) show
      only permitted comments and badge each comment's tier.
- [ ] PDF contains no confidential/internal comment in any tenant-fetchable PDF
      (per R7 decision).
- [ ] App builds; DB objects/policies verified live; edited edge function(s)
      pass `deno check`.

## Deployment note (outside the loop)
Table + RLS + migration applied to Supabase directly and verified live (run the
3-persona read simulation against live, rolled back). Frontend (tier selector +
filtered display) via Lovable publish. PDF generator change (if any) deployed as
an edge function. A repo merge alone deploys nothing. After deploy, run a real
two-user, two-department confidential-comment test and a real tenant check.
