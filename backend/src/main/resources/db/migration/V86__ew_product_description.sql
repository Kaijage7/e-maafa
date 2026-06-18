-- Manual EOCC bulletins (Option 2 contingency upload) carry an operator-written description of the hazard
-- issued, shown on the public portal warning popup + the EOCC Bulletin list alongside the PDF.
ALTER TABLE public.ew_generated_products ADD COLUMN IF NOT EXISTS description text;
