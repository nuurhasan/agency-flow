
-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Recreate save function to ensure it's properly registered
CREATE OR REPLACE FUNCTION public.save_credential_password(_credential_id uuid, _password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _key TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT key INTO _key FROM public._encryption_key WHERE id = 1;
  UPDATE public.project_credentials
    SET password_encrypted = CASE WHEN _password IS NULL OR _password = '' THEN NULL
      ELSE extensions.pgp_sym_encrypt(_password, _key) END
    WHERE id = _credential_id;
END; $function$;

-- Recreate reveal function with same fix
CREATE OR REPLACE FUNCTION public.reveal_credential_password(_credential_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _key TEXT;
  _enc BYTEA;
  _creator UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT created_by, password_encrypted
    INTO _creator, _enc
    FROM public.project_credentials
    WHERE id = _credential_id;

  IF _creator IS NULL AND _enc IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF _creator <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _enc IS NULL THEN RETURN NULL; END IF;
  SELECT key INTO _key FROM public._encryption_key WHERE id = 1;
  RETURN extensions.pgp_sym_decrypt(_enc, _key);
END; $function$;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
