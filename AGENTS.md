# Security boundaries
- Resolve role-email recipients only in service-role edge functions; browser notifications must use the existing server sender so recipient lists are not exposed.
- Authorize SECURITY DEFINER mutations using JWT identity and server-owned roles, never `current_user` (which is the function owner).