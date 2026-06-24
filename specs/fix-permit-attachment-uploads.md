# Spec: Fix permit-attachment uploads (storage RLS path mismatch) — create + add-documents

## Objective
File attachment uploads to the `permit-attachments` storage bucket fail with
"new row violates row-level security policy" on TWO code paths:

  (A) Creating a NEW Work Permit with attachments (new-permit wizard) — fails
      for any tenant / non-approver / non-admin requester.
  (B) Adding documents to an EXISTING, in-approval permit via the "Add
      documents" button on the permit Attachments tab — fails for the permit
      creator (observed on WP-260624-01).

Fix BOTH so a requester can upload attachments for their own permit (new or
existing), without weakening attachment confidentiality: a tenant must never
read, write, or delete another user's attachments.

## Root cause (verified against live code + live storage policies)
- Path A (`useCreatePermit`, src/hooks/useWorkPermits.ts): uploads to
  `permit-attachments` BEFORE the `work_permits` row exists, into a folder named
  after a random `tempId` (`${Date.now()}-${random}/...`).
- Path B (`useFileUpload.uploadFiles`, src/hooks/useFileUpload.ts): uploads to
  `${permitId}/...` for an existing permit.
- Live INSERT policy "Users can upload permit attachments" requires the upload's
  first folder segment to equal an EXISTING `work_permits.id` owned by the caller
  (`wp.requester_id = auth.uid() AND foldername[1] = wp.id`), OR caller is
  approver/admin.
  - Path A fails: at upload time no permit row exists AND the folder is a
    `tempId`, not a permit id. Admins pass via the admin branch (why only
    non-admins hit it).
  - Path B fails for the creator even though the folder IS the permit id —
    indicating the requester branch isn't matching (candidate causes to verify
    live: the permit's `requester_id` not equal to the uploader's `auth.uid()`,
    or the `work_permits` SELECT visibility under which the policy subquery runs
    not returning the row). The build MUST confirm the actual cause via a live
    check before finalizing, but the chosen fix below resolves both paths
    regardless.

## Chosen approach (decided): Fix A — key attachment path on the uploader's user id
Unify BOTH upload paths onto `${auth.uid()}/...` folders and align the storage
policies to an ownership-by-uid model — the same proven pattern already used by
the working "company-logos" policies. This removes the dependency on a permit id
existing at upload time and makes create + add-documents behave identically.

## Requirements

R1. **Unify upload path (frontend).** Change BOTH upload paths to write to
    `${user.id}/${unique-filename}`:
    - `useCreatePermit` (create wizard) — currently `${tempId}/...`.
    - `useFileUpload.uploadFiles` (add-documents on existing permit) — currently
      `${permitId}/...`.
    - `useUpdateAndResubmitPermit` new-file upload — currently `${permitId}/...`.
    Keep filenames collision-resistant. Persist the new paths into the legacy
    `work_permits.attachments` text[] column AND `permit_attachments` rows as
    today.

R2. **Storage INSERT policy** (`storage.objects`, bucket `permit-attachments`):
    allow INSERT when `bucket_id='permit-attachments'` AND
    `(storage.foldername(name))[1] = auth.uid()::text` (uploader writes only into
    their own folder), OR `is_approver(auth.uid())`, OR
    `has_role(auth.uid(),'admin')`. Keep approver/admin branches so internal
    staff uploading on behalf of others still works.

R3. **Storage SELECT policy** ("Users can view own permit attachments"): a user
    can read objects in their own `auth.uid()` folder; approvers/admins retain
    read access for permits they can act on (needed by permit detail + PDF
    generation). Tenants must NOT read other users' folders. Preserve the
    approver/admin branch so HISTORICAL attachments under old `tempId`/`permitId`
    folders remain readable to approvers/admins.

R4. **Storage DELETE policy** ("Users can delete their own permit attachments"):
    move to the `auth.uid()`-folder ownership model; keep admin capability if
    current behavior relies on it. (Note: tighten the role from `public` to
    `authenticated` if consistent with project posture — flag, don't silently
    change auth scope without noting it.)

R5. **No regression for approver/admin uploads** on either path.

R6. **Confidentiality preserved.** The `(storage.foldername(name))[1] =
    auth.uid()::text` check must be present on every requester-facing branch
    (INSERT/SELECT/DELETE). Verify a tenant cannot touch another user's folder.

R7. **Orphan cleanup paths updated.** `useCreatePermit` best-effort `remove()`
    on failed submit must reference the new `${user.id}/...` paths.

## Edge cases
E1. Create wizard: upload succeeds but `work_permits` insert fails → existing
    abort+cleanup still works with new paths.
E2. Multiple attachments in one action → same `${user.id}` folder, distinct
    filenames, no collision.
E3. Add-documents on a permit owned by the uploader → succeeds under the new uid
    folder model.
E4. Add-documents by an APPROVER/ADMIN on someone else's permit → still allowed
    via approver/admin branch.
E5. Historical attachments under old `tempId`/`${permitId}` folders → remain
    readable/downloadable by approvers/admins (verify SELECT approver branch).
E6. HEIC/empty-MIME handling and existing file validation unchanged.
E7. Rework resubmit path uses the same `${user.id}/...` convention for
    consistency.

## Definition of done (verified against LIVE state)
- [ ] As a TENANT (e.g. rkilani2005@gmail.com): creating a NEW WP with an
      attachment succeeds (no RLS error); rows created with `${user.id}/...`
      paths.
- [ ] As the TENANT creator of an EXISTING permit: "Add documents" upload
      succeeds (reproduces WP-260624-01 scenario, now passing).
- [ ] Uploaded file readable by its owner, by an approver on that permit, and by
      an admin — verified by policy inspection + a live read test.
- [ ] A tenant CANNOT upload/read/delete another user's folder (verify uid
      folder check on INSERT/SELECT/DELETE via pg_policies).
- [ ] Approver and admin uploads still work on both paths.
- [ ] Historical attachments under old folder names still accessible to
      approvers/admins.
- [ ] Upload path changed in `useCreatePermit`, `useFileUpload.uploadFiles`, and
      `useUpdateAndResubmitPermit`; orphan-cleanup updated.
- [ ] App builds; no type errors.
- [ ] `pg_policies` for bucket `permit-attachments` reflect new INSERT/SELECT/
      DELETE in live DB (migration applied, not just written).

## Deployment note (outside the loop)
Storage-policy migration must be APPLIED to Supabase (a repo merge alone does not
change DB policies); frontend change must be deployed (Lovable sync + publish).
Re-verify live-DB checkboxes with direct queries after deploy, and run one real
tenant create + one real add-documents on NEW data to confirm.
