-- Migration 20260823000001: Restrict public.profiles SELECT privileges so
-- ordinary authenticated/anon clients cannot query gmail_refresh_token directly.
-- Server-side service_role retains full column access for Gmail send/callback.

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
    id,
    email,
    name,
    role,
    company,
    gmail_connected,
    gmail_email,
    created_at,
    updated_at
) ON public.profiles TO authenticated;
