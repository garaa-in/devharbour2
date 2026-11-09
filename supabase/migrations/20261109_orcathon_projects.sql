BEGIN;

CREATE TABLE IF NOT EXISTS public.orcathon_projects (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  summary text,
  category text NOT NULL CHECK (length(trim(category)) > 0),
  demo_url text CHECK (demo_url ~ '^https?://'),
  repository_url text CHECK (repository_url ~ '^https?://')
);

ALTER TABLE public.orcathon_projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orcathon_projects FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orcathon_projects TO devharbour_runtime;
DROP POLICY IF EXISTS orcathon_gallery_read ON public.orcathon_projects;
CREATE POLICY orcathon_gallery_read ON public.orcathon_projects
  FOR SELECT TO devharbour_runtime USING (true);

COMMIT;
