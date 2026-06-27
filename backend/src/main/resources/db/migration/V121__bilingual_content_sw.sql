-- Bilingual content authoring: Swahili (_sw) versions of the key text fields on the CMS content types,
-- so a content manager can enter EN + SW in one record. All optional — the public portal falls back to
-- English when the Swahili field is empty.
alter table public.portal_news
    add column if not exists title_sw   text,
    add column if not exists excerpt_sw text,
    add column if not exists body_sw    text;

alter table public.education_materials
    add column if not exists title_sw text,
    add column if not exists body_sw  text;

alter table public.educational_contents
    add column if not exists title_sw        text,
    add column if not exists summary_sw      text,
    add column if not exists full_content_sw text;
