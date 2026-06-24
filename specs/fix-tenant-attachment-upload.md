# Spec: Fix tenant permit-attachment upload (storage RLS path mismatch)

## Objective
Tenants (and any non-approver, non-admin requester) cannot submit a Work Permit
that has file attachments. The upload is rejected with "new row violates
row-level security policy". Fix it so a requester can upload attachments for
their own permit, without weakening attachment confidentiality (a tenant must
never read or write another tenant's attachments).

## Root cause (verified against live code + live storage policies)
- `useCreatePermit` (src/hooks/useWorkPermits.ts) uploads files to
  `permit-attachments` BEFORE the `work_permits` row is created, into a folder
  named after a random `tempId` (`${Date.now()}-${random}/...`), then inserts
  the permit row afterward.
- The live storage INSERT policy "Users can upload permit attachments" requires
  the upload's first folder segment to equal an EXISTING `work_permits.id` owned
  by the caller, OR the caller to be an approver/admin. At upload time no permit
  row exists yet AND the folder is a `tempId`, not a permit id — so for a tenant
  all branches fail. Admins pass via the `has_role('admin')` branch, which is
  why only tenants/non-admins hit the error.

## Chosen approach (decided): Fix A — key attachment path on the uploader's user id
Align the storage policies with the code's deliberate upload-first design by
keying the attachment folder on `auth.uid()` (the same proven pattern already
used by the working "company-logos" policies), instead of requiring a permit id
that does not exist yet.

## Requirements

R1. **Upload path change (frontend).** In `useCreatePermit` (and the
    `useUpdateAndResubmitPermit` new-file upload path, which has the same
    pattern), change the storage folder from a random `tempId` to the uploader's
    user id: path = `${user.id}/${unique-filename}`. The unique filename portion
    must remain collision-resistant. The legacy `work_permits.attachments`
    text[] column and the `permit_attachments` rows must store these new paths.

R2. **Storage INSERT policy.** Replace the INSERT policy on
    `storage.objects` for bucket `permit-attachments` so a NON-tenant constraint
    is not required for upload, but ownership IS: allow INSERT when
    `bucket_id = 'permit-attachments'` AND the first folder segment equals
    `auth.uid()::text` (the uploader can only write into their own folder), OR
    the caller `is_approver(auth.uid())`, OR `has_role(auth.uid(),'admin')`.
    Keep approver/admin branches so internal staff creating permits on behalf of
    others still works.

R3. **Storage SELECT policy.** Update "Users can view own permit attachments"
    so a requester can read attachments in their own `auth.uid()` folder, AND
    approvers/admins can still read attachments for permits they can act on.
    Tenants must NOT be able to read other users' attachment folders. Preserve
    approver/admin read access used by the PDF generation + permit detail views.

R4. **Storage DELETE policy.** Update "Users can delete their own permit
    attachments" to the `auth.uid()`-folder ownership model (a requester may
    delete only files in their own folder), keeping admin capability if the
    current product behavior relies on it.

R5. **No regression for approver/admin uploads.** An approver or admin
    submitting a permit with attachments must continue to succeed.

R6. **Confidentiality preserved.** A tenant must not be able to upload into,
    read from, or delete from another user's folder. Verify the `(storage.
    foldername(name))[1] = auth.uid()::text` check is present on every
    requester-facing branch (INSERT/SELECT/DELETE).

R7. **Tenant ownership boundary (scope confirmation only, do not over-build).**
    This spec covers ONLY the attachment storage path + policies. The broader
    "tenants see/create only their own WPs and GPs, internal permits hidden from
    tenants" rule is a SEPARATE spec (Item 3). Do not implement permit-row
    visibility changes here beyond what storage policies require.

## Edge cases
E1. Upload succeeds but the subsequent `work_permits` insert fails: the existing
    code aborts and best-effort removes uploaded files. With the new
    `auth.uid()` path, the cleanup `remove()` call must reference the new paths.
    Verify orphan cleanup still targets the correct paths.
E2. Multiple attachments in one submit: all go under the same `auth.uid()`
    folder with distinct filenames — no collision.
E3. Rework resubmit (`useUpdateAndResubmitPermit`) currently uploads new files
    into a `${permitId}/...` folder. After this change, decide and implement one
    consistent convention; if the permit id already exists at that point, the
    `${permitId}` path is acceptable ONLY if the SELECT/INSERT policies still
    permit it. Simplest: use `${user.id}/...` everywhere for consistency.
E4. Existing already-uploaded attachments under old `tempId` or `permitId`
    folders must remain readable by approvers/admins (don't break historical
    permits). The SELECT policy's approver/admin branch covers this; verify.
E5. HEIC/octet-stream content types and the existing file validation path are
    unchanged.

## Definition of done (verified against LIVE state)
- [ ] As a TENANT (e.g. rkilani2005@gmail.com), submitting a new WP with a
      file attachment succeeds end to end (no RLS error), and the permit + its
      `permit_attachments` rows are created with `${user.id}/...` paths.
- [ ] The uploaded file is readable by the tenant who owns it, by an approver on
      that permit, and by an admin — verified by policy inspection and a live
      read test.
- [ ] A tenant CANNOT upload into, read, or delete another user's folder
      (verify the `auth.uid()` folder check on INSERT/SELECT/DELETE via
      pg_policies).
- [ ] Approver and admin permit-with-attachment submission still works (no
      regression).
- [ ] Historical attachments under old folder names remain accessible to
      approvers/admins.
- [ ] Frontend upload path changed in BOTH `useCreatePermit` and
      `useUpdateAndResubmitPermit`; orphan-cleanup paths updated to match.
- [ ] App builds; no type errors.
- [ ] `pg_policies` for bucket `permit-attachments` reflect the new INSERT/
      SELECT/DELETE definitions in live DB (migration actually applied).

## Deployment note (outside the loop)
The storage-policy migration must be APPLIED to Supabase (a repo merge alone
does not change DB policies), and the frontend change must be deployed (Lovable
sync + publish). Re-verify the live-DB checkboxes with direct queries after
deploy, and run one real tenant submission on a NEW permit to confirm.
