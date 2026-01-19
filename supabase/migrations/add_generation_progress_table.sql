-- Create generation_progress table for real-time content generation tracking
CREATE TABLE IF NOT EXISTS public.generation_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('preparing', 'generating', 'completed', 'failed')),
  current_block jsonb,
  completed_blocks integer NOT NULL DEFAULT 0,
  total_blocks integer NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_generation_progress_project_id ON public.generation_progress(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_progress_status ON public.generation_progress(status);
CREATE INDEX IF NOT EXISTS idx_generation_progress_updated_at ON public.generation_progress(updated_at);

-- Enable Row Level Security
ALTER TABLE public.generation_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own project progress
CREATE POLICY "Users can view their own generation progress"
  ON public.generation_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = generation_progress.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Service role can do everything (for API operations)
CREATE POLICY "Service role can manage all generation progress"
  ON public.generation_progress
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Add comment
COMMENT ON TABLE public.generation_progress IS 'Tracks real-time progress of content generation for projects';
