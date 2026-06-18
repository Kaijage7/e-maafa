-- V38 created the disaster-repository tables without a schema qualifier, so Flyway placed
-- them in its default schema ("platform") while the application reads "public" (every other
-- migration qualifies with public.*). Move them; FKs and indexes follow the table.
ALTER TABLE platform.disaster_events SET SCHEMA public;
ALTER TABLE platform.disaster_event_effects SET SCHEMA public;
ALTER TABLE platform.disaster_event_links SET SCHEMA public;
ALTER TABLE platform.sendai_indicators SET SCHEMA public;
ALTER TABLE platform.sendai_baselines SET SCHEMA public;
