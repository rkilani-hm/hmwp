# Security boundaries
- Resolve role-email recipients only in service-role edge functions; browser notifications must use the existing server sender so recipient lists are not exposed.
- Authorize SECURITY DEFINER mutations using JWT identity and server-owned roles, never `current_user` (which is the function owner).
- Freeze privileged profile fields on non-admin updates in the database, including company synchronization, so trigger order cannot change company access.
- Permit direct workflow-override writes only for admins; authorized approver modifications go through the permission-checked service-role function to prevent RLS bypass.
- Browser notification actions must use the authenticated dispatch-permit-notification gateway, which executes permission-checked RPCs as the caller and derives recipients server-side; raw senders accept only the service-role secret (push additionally permits self-only tests).
- PDF email authorization must check the specific document rather than a global approver role and record the sender before delivery; work-permit browser recipients are restricted to its registered participants, while gate-pass chosen-recipient sharing is retained.
