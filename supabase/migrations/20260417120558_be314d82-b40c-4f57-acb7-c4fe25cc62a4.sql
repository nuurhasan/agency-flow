
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============== ENUMS ==============
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TYPE public.project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'archived');
CREATE TYPE public.service_type AS ENUM ('website', 'seo', 'hosting', 'maintenance', 'branding', 'other');
CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'waiting', 'done');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high');

-- ============== UPDATED_AT HELPER ==============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============== PROFILES ==============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== USER_ROLES ==============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL
$$;

-- ============== APP_SETTINGS (singleton) ==============
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  signups_enabled BOOLEAN NOT NULL DEFAULT true,
  agency_name TEXT NOT NULL DEFAULT 'My Agency',
  reminder_lead_days INT NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.app_settings (id) VALUES (1);

-- ============== PROJECTS ==============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'mint',
  icon TEXT NOT NULL DEFAULT 'folder',
  description TEXT,
  status public.project_status NOT NULL DEFAULT 'active',
  client_name TEXT NOT NULL DEFAULT '',
  service_type public.service_type NOT NULL DEFAULT 'website',
  due_date DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_projects_status ON public.projects(status);

-- ============== TASKS ==============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_tasks_project ON public.tasks(project_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due ON public.tasks(due_date);

-- Auto-set completed_at when status -> done
CREATE OR REPLACE FUNCTION public.set_task_completed_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at = now();
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_task_completed BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_completed_at();

-- ============== TASK_ASSIGNEES ==============
CREATE TABLE public.task_assignees (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

-- ============== TASK_COMMENTS ==============
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_task_comments_task ON public.task_comments(task_id);

-- ============== ACTIVITY_LOG ==============
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_activity_created ON public.activity_log(created_at DESC);

-- ============== PROJECT_CREDENTIALS (encrypted) ==============
-- store password encrypted using a key from app_settings (pgcrypto symmetric)
-- We use a database-level secret kept in vault-like settings: simple GUC fallback.
-- For simplicity here: encrypt with pgp_sym_encrypt using a key derived from a constant; 
-- the column never returns plaintext to clients via direct select (RLS hides password_encrypted column? No — it's bytea, opaque).
CREATE TABLE public.project_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT,
  username TEXT,
  password_encrypted BYTEA,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_credentials ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_credentials_updated BEFORE UPDATE ON public.project_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_credentials_project ON public.project_credentials(project_id);

-- Encryption key (in production, store in Vault). We use a per-project secret stored in settings.
-- Simple approach: a fixed app-wide passphrase from a settings table.
CREATE TABLE public._encryption_key (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  key TEXT NOT NULL
);
ALTER TABLE public._encryption_key ENABLE ROW LEVEL SECURITY;
-- No policies — only accessible by SECURITY DEFINER functions
INSERT INTO public._encryption_key (key) VALUES (encode(gen_random_bytes(32), 'hex'));

-- Save credential password (encrypts)
CREATE OR REPLACE FUNCTION public.save_credential_password(_credential_id UUID, _password TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT key INTO _key FROM public._encryption_key WHERE id = 1;
  UPDATE public.project_credentials
    SET password_encrypted = CASE WHEN _password IS NULL OR _password = '' THEN NULL
      ELSE pgp_sym_encrypt(_password, _key) END
    WHERE id = _credential_id;
END; $$;

-- Reveal credential password (decrypts)
CREATE OR REPLACE FUNCTION public.reveal_credential_password(_credential_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key TEXT; _enc BYTEA;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT key INTO _key FROM public._encryption_key WHERE id = 1;
  SELECT password_encrypted INTO _enc FROM public.project_credentials WHERE id = _credential_id;
  IF _enc IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(_enc, _key);
END; $$;

-- ============== CLIENT_DOMAINS ==============
CREATE TABLE public.client_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  provider TEXT,
  domain_expiry DATE,
  hosting_expiry DATE,
  notes TEXT,
  renewed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_domains ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_domains_updated BEFORE UPDATE ON public.client_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_domains_expiry ON public.client_domains(domain_expiry);

-- ============== DOMAIN_ASSIGNEES ==============
CREATE TABLE public.domain_assignees (
  domain_id UUID NOT NULL REFERENCES public.client_domains(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (domain_id, user_id)
);
ALTER TABLE public.domain_assignees ENABLE ROW LEVEL SECURITY;

-- ============== DOMAIN_REMINDER_STATE ==============
CREATE TABLE public.domain_reminder_state (
  domain_id UUID PRIMARY KEY REFERENCES public.client_domains(id) ON DELETE CASCADE,
  last_sent_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ
);
ALTER TABLE public.domain_reminder_state ENABLE ROW LEVEL SECURITY;

-- ============== AUTH SIGNUP TRIGGER ==============
-- On new auth.users insert:
--   1. respect signups_enabled (raise if disabled)
--   2. create profile
--   3. assign role: admin if first user, else member
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _enabled BOOLEAN;
  _user_count INT;
  _role public.app_role;
  _name TEXT;
BEGIN
  SELECT signups_enabled INTO _enabled FROM public.app_settings WHERE id = 1;
  SELECT COUNT(*) INTO _user_count FROM auth.users;

  -- Allow first user even if disabled (bootstrap), otherwise enforce
  IF NOT _enabled AND _user_count > 1 THEN
    RAISE EXCEPTION 'Signups are disabled';
  END IF;

  _name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  INSERT INTO public.profiles (id, name, email)
    VALUES (NEW.id, _name, NEW.email);

  IF _user_count = 1 THEN _role := 'admin'; ELSE _role := 'member'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============== RLS POLICIES ==============
-- Helper: any signed-in team member can read most things (transparency)

-- profiles
CREATE POLICY "team can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "admins delete profiles" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "team can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage roles insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles update" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles delete" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- app_settings
CREATE POLICY "anyone can read settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "admins update settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- projects
CREATE POLICY "team views projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "team creates projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "team updates projects" ON public.projects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admins delete projects" ON public.projects FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- tasks
CREATE POLICY "team views tasks" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "team creates tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "team updates tasks" ON public.tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admins delete tasks" ON public.tasks FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- task_assignees
CREATE POLICY "team views assignees" ON public.task_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY "team manages assignees ins" ON public.task_assignees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team manages assignees del" ON public.task_assignees FOR DELETE TO authenticated USING (true);

-- task_comments
CREATE POLICY "team views comments" ON public.task_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own comments" ON public.task_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own comments" ON public.task_comments FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- activity_log
CREATE POLICY "team views activity" ON public.activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "team inserts activity" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);

-- project_credentials (passwords are bytea — clients see opaque bytes; reveal via RPC)
CREATE POLICY "team views credentials" ON public.project_credentials FOR SELECT TO authenticated USING (true);
CREATE POLICY "team creates credentials" ON public.project_credentials FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "team updates credentials" ON public.project_credentials FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admins delete credentials" ON public.project_credentials FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- client_domains
CREATE POLICY "team views domains" ON public.client_domains FOR SELECT TO authenticated USING (true);
CREATE POLICY "team creates domains" ON public.client_domains FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "team updates domains" ON public.client_domains FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admins delete domains" ON public.client_domains FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- domain_assignees
CREATE POLICY "team views d_assignees" ON public.domain_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY "team ins d_assignees" ON public.domain_assignees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team del d_assignees" ON public.domain_assignees FOR DELETE TO authenticated USING (true);

-- domain_reminder_state
CREATE POLICY "team views d_state" ON public.domain_reminder_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "team ins d_state" ON public.domain_reminder_state FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team upd d_state" ON public.domain_reminder_state FOR UPDATE TO authenticated USING (true);
CREATE POLICY "team del d_state" ON public.domain_reminder_state FOR DELETE TO authenticated USING (true);
