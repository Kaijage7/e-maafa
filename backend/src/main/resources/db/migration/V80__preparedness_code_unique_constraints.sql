-- Enforce uniqueness on the preparedness business codes that were minted with count(*)+1.
-- The services now generate codes gap-safely (MAX numeric suffix + 1);
-- these UNIQUE constraints make any residual concurrent-insert race a clean 409 retry instead of two
-- rows silently sharing a code. training_plans.training_id already had its UNIQUE (training_plans_
-- training_id_key); this adds the missing three. Verified at write time: zero existing duplicates in
-- temporary_warehouses.code / evacuation_centers.ecentre_id / alert_subscriptions.subscription_id, so
-- the constraints apply cleanly (no crash-loop). Idempotent (guarded by pg_constraint lookups).

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'temporary_warehouses_code_key') then
    alter table public.temporary_warehouses add constraint temporary_warehouses_code_key unique (code);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'evacuation_centers_ecentre_id_key') then
    alter table public.evacuation_centers add constraint evacuation_centers_ecentre_id_key unique (ecentre_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'alert_subscriptions_subscription_id_key') then
    alter table public.alert_subscriptions add constraint alert_subscriptions_subscription_id_key unique (subscription_id);
  end if;
end $$;
