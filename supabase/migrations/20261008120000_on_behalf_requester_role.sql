-- =============================================================================
-- "On-Behalf Requester" capability
--
-- Lets specific staff raise work permits / gate passes ON BEHALF OF a tenant
-- (the same ability Al Hamra Customer Service has), WITHOUT making them an
-- approver. can_submit_on_behalf() already allowed admin / *client_relations* /
-- *customer_service* role holders; we add a dedicated role `on_behalf_requester`
-- that is NOT wired to any workflow step (so it confers no approval duties or
-- notifications) and is recognised by the gate.
--
-- Assign the role to a user to grant the capability, e.g.:
--   insert into user_roles (user_id, role_id)
--   select p.id, r.id from profiles p, roles r
--   where p.email = '<user>' and r.name = 'on_behalf_requester';
--
-- Already applied to the live DB (granted to Nawaf Al Mohammad). Idempotent.
-- =============================================================================

insert into public.roles (name, label, description, is_system, is_active)
select 'on_behalf_requester', 'On-Behalf Requester',
       'Allows raising work permits / gate passes on behalf of a tenant. Confers no approval duties and is not part of any workflow step.',
       true, true
where not exists (select 1 from public.roles where name = 'on_behalf_requester');

create or replace function public.can_submit_on_behalf(p_user uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user
      and (r.name = 'admin'
           or r.name ilike '%client_relations%'
           or r.name ilike '%customer_service%'
           or r.name = 'on_behalf_requester')
  );
$function$;
