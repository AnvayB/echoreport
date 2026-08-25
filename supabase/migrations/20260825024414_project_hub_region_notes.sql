ALTER TABLE public.ph_regions
  ADD COLUMN notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN manual_complete INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN manual_semi_complete INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN manual_incomplete INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN manual_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

CREATE TRIGGER set_ph_regions_updated_at
  BEFORE UPDATE ON public.ph_regions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed each existing user's regions with the counts/notes already tracked outside the app.
-- These are a manual snapshot shown until real ph_projects rows exist for that region.
INSERT INTO public.ph_regions
  (user_id, name, sort_order, manual_complete, manual_semi_complete, manual_incomplete, manual_total, notes)
SELECT u.id, r.name, r.sort_order, r.manual_complete, r.manual_semi_complete, r.manual_incomplete, r.manual_total, r.notes
FROM auth.users u
CROSS JOIN (VALUES
  ('EMEA', 0, 28, 15, 2, 45,
    'Get details for 2 remaining projects. Main: get AE Assignments for other projects.'),
  ('China (SIP)', 1, 0, 0, 0, 0,
    'Status unclear — waiting on a copy of Currenc''s license tracking sheet to determine project info.'),
  ('China (SIA)', 2, 0, 14, 11, 25,
    'Project names undefined since they''re working with Magillan (or similar) — need to pin down.'),
  ('Korea', 3, 0, 0, 0, 0,
    'Status unclear — Jae Yong doesn''t know the project names yet.'),
  ('USA (SIP)', 4, 21, 57, 26, 114,
    'Tim + Santhosh are asking FAEs to fill in project info for mine & incomplete projects. Ask Matt or Guillaume to create projects in Airtable. Send Tim a reminder?'),
  ('USA (SIA)', 5, 0, 0, 0, 141,
    'No idea yet how to determine project info from the NAFCS HQ board.'),
  ('Japan', 6, 0, 0, 0, 0, '')
) AS r(name, sort_order, manual_complete, manual_semi_complete, manual_incomplete, manual_total, notes)
ON CONFLICT (user_id, name) DO NOTHING;
