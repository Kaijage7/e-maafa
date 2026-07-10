-- F73: bridge the one clear narrative↔loss overlap (Bukoba 2016) without inventing false matches.
-- past_disasters id 4 "Bukoba earthquake 2016" ↔ disaster_events DE-2016-0001 (id 12).
INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, linked_by, created_at)
SELECT 12, 'past_disaster', 4,
       'V179 F73 narrative↔Sendai bridge (Bukoba earthquake 2016)',
       null, now()
 WHERE EXISTS (SELECT 1 FROM public.disaster_events WHERE id = 12)
   AND EXISTS (SELECT 1 FROM public.past_disasters WHERE id = 4)
   AND NOT EXISTS (
         SELECT 1 FROM public.disaster_event_links
          WHERE event_id = 12 AND entity_type = 'past_disaster' AND entity_id = 4
       );
