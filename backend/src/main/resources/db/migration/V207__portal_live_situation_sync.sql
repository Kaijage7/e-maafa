-- Portal live situation: align published bulletins with early_warning map pins,
-- and hide internal smoke-test news from the citizen strip.

-- 1) Any warning_code that already has a published product on the public map
--    should light early_warnings.show_on_map so landing/portal reflect reality.
UPDATE public.early_warnings ew
SET show_on_map = true,
    updated_at = now()
WHERE ew.status = 'active'
  AND coalesce(ew.show_on_map, false) = false
  AND exists (
        select 1 from public.ew_generated_products gp
        where gp.warning_code = ew.warning_code
          and coalesce(gp.is_published, false) = true
          and coalesce(gp.show_on_map, false) = true
      );

-- 2) Deactivate internal E2E smoke articles (not national communications).
UPDATE public.portal_news
SET is_active = false,
    updated_at = now()
WHERE is_active = true
  AND (
        lower(title) like '%smoke test%'
     or lower(title) like '%ega training smoke%'
  );
