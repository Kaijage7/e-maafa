-- Quarterly disaster-related reporting indicators: apply to ALL institutions.
-- Empty applicable_institution_classes / applicable_sectors means unrestricted
-- (M&E workbench mandate filter treats blank as match-all).

UPDATE public.me_indicator_catalog
SET applicable_institution_classes = null,
    applicable_sectors = null,
    policy_role_code = null,
    updated_at = now()
WHERE active
  AND (
        domain = 'Quarterly Disaster Reporting'
     OR code in (
          'MDA_QTR_RESPONSE_RECOVERY_REPORT',
          'MDA_QTR_RESPONSE_RECOVERY_RECORDS',
          'REG_QTR_RESPONSE_RECOVERY_REPORT',
          'LGA_QTR_RESPONSE_RECOVERY_REPORT',
          'REG_RESPONSE_BUDGET_USED'
        )
  );

-- Keep the indicators active and discoverable under their reporting levels.
UPDATE public.me_indicator_catalog
SET active = true,
    updated_at = now()
WHERE code in (
      'MDA_QTR_RESPONSE_RECOVERY_REPORT',
      'MDA_QTR_RESPONSE_RECOVERY_RECORDS',
      'REG_QTR_RESPONSE_RECOVERY_REPORT',
      'LGA_QTR_RESPONSE_RECOVERY_REPORT',
      'REG_RESPONSE_BUDGET_USED'
);

COMMENT ON COLUMN public.me_indicator_catalog.applicable_institution_classes IS
  'Comma-separated institution classes that may report this indicator. Blank/null = all classes.';
