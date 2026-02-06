-- Add goals_snapshot to narrative_coverage_snapshots to track historical goal state
ALTER TABLE public.narrative_coverage_snapshots
ADD COLUMN IF NOT EXISTS goals_snapshot JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.narrative_coverage_snapshots.goals_snapshot IS 'Snapshot of the active goals at the time of analysis';
