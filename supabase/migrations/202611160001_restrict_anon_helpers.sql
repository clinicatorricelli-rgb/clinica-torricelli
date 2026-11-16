-- Visitors without login only need the public catalog lookups (available_slots,
-- booking_info). The original migrations granted these two helpers to
-- "authenticated" only, but Supabase's default privileges had already given
-- EXECUTE to "anon" when they were created. Neither did harm (has_admin_role()
-- answers false for a visitor; set_availability_alert_preference() refuses
-- without login), but there is no reason to leave them reachable.
-- Logged-in clients and the admin keep both: the site calls has_admin_role()
-- after login, and private.is_admin() runs as the function owner.
revoke execute on function public.has_admin_role() from anon;
revoke execute on function public.set_availability_alert_preference(text,boolean,text) from anon;
