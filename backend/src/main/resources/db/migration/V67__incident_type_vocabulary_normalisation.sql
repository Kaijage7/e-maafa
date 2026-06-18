-- F-settings: normalise the previously-uncontrolled incident_types vocabulary so the new whitelist
-- validation (default_severity in IncidentOptions.SEVERITY_LEVELS, icon_class in INCIDENT_ICONS)
-- holds for existing rows. The free-text fields had drifted while uncontrolled:
--   * a default_severity of 'High' — not in the canonical Minor/Moderate/Major/Critical/Unknown scale;
--   * icon_class values carrying the redundant Font Awesome style prefix ('fas fa-water' instead of
--     the bare 'fa-water' the UI already prepends 'fas ' to, which double-prefixed the rendered icon).
-- Idempotent: re-running is a no-op once the values are clean.

update public.incident_types set default_severity = 'Major' where default_severity = 'High';

update public.incident_types
   set icon_class = regexp_replace(icon_class, '^(fas|far|fab|fa-solid|fa-regular)\s+', '')
 where icon_class ~ '^(fas|far|fab|fa-solid|fa-regular)\s';
