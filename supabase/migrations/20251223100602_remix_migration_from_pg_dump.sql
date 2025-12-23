CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'contractor',
    'helpdesk',
    'pm',
    'pd',
    'bdcr',
    'mpr',
    'it',
    'fitout',
    'soft_facilities',
    'hard_facilities',
    'pm_service',
    'admin'
);


--
-- Name: permit_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.permit_status AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'pending_pm',
    'pending_pd',
    'pending_bdcr',
    'pending_mpr',
    'pending_it',
    'pending_fitout',
    'pending_soft_facilities',
    'pending_hard_facilities',
    'pending_pm_service',
    'approved',
    'rejected',
    'closed',
    'cancelled'
);


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  
  -- Default role is contractor
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'contractor');
  
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: is_approver(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_approver(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 'soft_facilities', 'hard_facilities', 'pm_service', 'admin')
  )
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    permit_id uuid NOT NULL,
    action text NOT NULL,
    performed_by text NOT NULL,
    performed_by_id uuid,
    details text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    permit_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    message text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['new_permit'::text, 'approval_needed'::text, 'status_change'::text, 'sla_warning'::text, 'sla_breach'::text, 'permit_approved'::text, 'permit_rejected'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    phone text,
    company_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true
);


--
-- Name: signature_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signature_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    permit_id uuid,
    user_id uuid NOT NULL,
    user_email text NOT NULL,
    user_name text NOT NULL,
    role text NOT NULL,
    action text NOT NULL,
    ip_address text,
    user_agent text,
    device_info jsonb DEFAULT '{}'::jsonb,
    signature_hash text,
    password_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT signature_audit_logs_action_check CHECK ((action = ANY (ARRAY['approved'::text, 'rejected'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: work_permits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_permits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    permit_no text NOT NULL,
    status public.permit_status DEFAULT 'draft'::public.permit_status NOT NULL,
    requester_id uuid,
    requester_name text NOT NULL,
    requester_email text NOT NULL,
    contractor_name text NOT NULL,
    unit text NOT NULL,
    floor text NOT NULL,
    contact_mobile text NOT NULL,
    work_description text NOT NULL,
    work_location text NOT NULL,
    work_date_from date NOT NULL,
    work_date_to date NOT NULL,
    work_time_from time without time zone NOT NULL,
    work_time_to time without time zone NOT NULL,
    attachments text[] DEFAULT '{}'::text[],
    work_type_id uuid,
    helpdesk_status text DEFAULT 'pending'::text,
    helpdesk_approver_name text,
    helpdesk_approver_email text,
    helpdesk_date timestamp with time zone,
    helpdesk_comments text,
    helpdesk_signature text,
    pm_status text DEFAULT 'pending'::text,
    pm_approver_name text,
    pm_approver_email text,
    pm_date timestamp with time zone,
    pm_comments text,
    pm_signature text,
    pd_status text DEFAULT 'pending'::text,
    pd_approver_name text,
    pd_approver_email text,
    pd_date timestamp with time zone,
    pd_comments text,
    pd_signature text,
    bdcr_status text DEFAULT 'pending'::text,
    bdcr_approver_name text,
    bdcr_approver_email text,
    bdcr_date timestamp with time zone,
    bdcr_comments text,
    bdcr_signature text,
    mpr_status text DEFAULT 'pending'::text,
    mpr_approver_name text,
    mpr_approver_email text,
    mpr_date timestamp with time zone,
    mpr_comments text,
    mpr_signature text,
    it_status text DEFAULT 'pending'::text,
    it_approver_name text,
    it_approver_email text,
    it_date timestamp with time zone,
    it_comments text,
    it_signature text,
    fitout_status text DEFAULT 'pending'::text,
    fitout_approver_name text,
    fitout_approver_email text,
    fitout_date timestamp with time zone,
    fitout_comments text,
    fitout_signature text,
    soft_facilities_status text DEFAULT 'pending'::text,
    soft_facilities_approver_name text,
    soft_facilities_approver_email text,
    soft_facilities_date timestamp with time zone,
    soft_facilities_comments text,
    soft_facilities_signature text,
    hard_facilities_status text DEFAULT 'pending'::text,
    hard_facilities_approver_name text,
    hard_facilities_approver_email text,
    hard_facilities_date timestamp with time zone,
    hard_facilities_comments text,
    hard_facilities_signature text,
    pm_service_status text DEFAULT 'pending'::text,
    pm_service_approver_name text,
    pm_service_approver_email text,
    pm_service_date timestamp with time zone,
    pm_service_comments text,
    pm_service_signature text,
    closing_remarks text,
    closing_clean_confirmed boolean DEFAULT false,
    closing_incidents text,
    closed_by text,
    closed_date timestamp with time zone,
    pdf_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    urgency text DEFAULT 'normal'::text,
    sla_deadline timestamp with time zone,
    sla_breached boolean DEFAULT false,
    CONSTRAINT work_permits_urgency_check CHECK ((urgency = ANY (ARRAY['normal'::text, 'urgent'::text])))
);


--
-- Name: work_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    requires_pm boolean DEFAULT false NOT NULL,
    requires_pd boolean DEFAULT false NOT NULL,
    requires_bdcr boolean DEFAULT false NOT NULL,
    requires_mpr boolean DEFAULT false NOT NULL,
    requires_it boolean DEFAULT false NOT NULL,
    requires_fitout boolean DEFAULT false NOT NULL,
    requires_soft_facilities boolean DEFAULT false NOT NULL,
    requires_hard_facilities boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: signature_audit_logs signature_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature_audit_logs
    ADD CONSTRAINT signature_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: work_permits work_permits_permit_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_permits
    ADD CONSTRAINT work_permits_permit_no_key UNIQUE (permit_no);


--
-- Name: work_permits work_permits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_permits
    ADD CONSTRAINT work_permits_pkey PRIMARY KEY (id);


--
-- Name: work_types work_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_types
    ADD CONSTRAINT work_types_pkey PRIMARY KEY (id);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_signature_audit_logs_permit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signature_audit_logs_permit_id ON public.signature_audit_logs USING btree (permit_id);


--
-- Name: idx_work_permits_sla_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_permits_sla_deadline ON public.work_permits USING btree (sla_deadline) WHERE (sla_breached = false);


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: work_permits update_work_permits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_work_permits_updated_at BEFORE UPDATE ON public.work_permits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activity_logs activity_logs_performed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_performed_by_id_fkey FOREIGN KEY (performed_by_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: activity_logs activity_logs_permit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_permit_id_fkey FOREIGN KEY (permit_id) REFERENCES public.work_permits(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_permit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_permit_id_fkey FOREIGN KEY (permit_id) REFERENCES public.work_permits(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: signature_audit_logs signature_audit_logs_permit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature_audit_logs
    ADD CONSTRAINT signature_audit_logs_permit_id_fkey FOREIGN KEY (permit_id) REFERENCES public.work_permits(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: work_permits work_permits_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_permits
    ADD CONSTRAINT work_permits_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: work_permits work_permits_work_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_permits
    ADD CONSTRAINT work_permits_work_type_id_fkey FOREIGN KEY (work_type_id) REFERENCES public.work_types(id);


--
-- Name: user_roles Admins can manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: work_types Admins can manage work types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage work types" ON public.work_types TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: signature_audit_logs Admins can view all signature logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all signature logs" ON public.signature_audit_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: work_permits Approvers can update permits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can update permits" ON public.work_permits FOR UPDATE TO authenticated USING (public.is_approver(auth.uid()));


--
-- Name: activity_logs Approvers can view all logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can view all logs" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_approver(auth.uid()));


--
-- Name: work_permits Approvers can view all permits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can view all permits" ON public.work_permits FOR SELECT TO authenticated USING (public.is_approver(auth.uid()));


--
-- Name: signature_audit_logs Approvers can view signature logs for their permits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can view signature logs for their permits" ON public.signature_audit_logs FOR SELECT USING (public.is_approver(auth.uid()));


--
-- Name: activity_logs Authenticated users can create logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK ((performed_by_id = auth.uid()));


--
-- Name: signature_audit_logs Authenticated users can create signature logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create signature logs" ON public.signature_audit_logs FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: work_types Authenticated users can view work types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view work types" ON public.work_types FOR SELECT TO authenticated USING (true);


--
-- Name: notifications Service can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: work_permits Users can create permits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create permits" ON public.work_permits FOR INSERT TO authenticated WITH CHECK ((requester_id = auth.uid()));


--
-- Name: notifications Users can delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: work_permits Users can update own draft permits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own draft permits" ON public.work_permits FOR UPDATE TO authenticated USING (((requester_id = auth.uid()) AND (status = 'draft'::public.permit_status)));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid()));


--
-- Name: activity_logs Users can view logs for own permits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view logs for own permits" ON public.activity_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_permits
  WHERE ((work_permits.id = activity_logs.permit_id) AND (work_permits.requester_id = auth.uid())))));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: work_permits Users can view own permits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own permits" ON public.work_permits FOR SELECT TO authenticated USING ((requester_id = auth.uid()));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: signature_audit_logs Users can view signature logs for own permits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view signature logs for own permits" ON public.signature_audit_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.work_permits
  WHERE ((work_permits.id = signature_audit_logs.permit_id) AND (work_permits.requester_id = auth.uid())))));


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: signature_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signature_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: work_permits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_permits ENABLE ROW LEVEL SECURITY;

--
-- Name: work_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_types ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;