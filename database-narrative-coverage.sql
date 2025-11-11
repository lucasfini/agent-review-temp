-- Narrative Coverage & Opportunity Radar schema
-- Tracks per-episode topic coverage, CTA mentions, goal alignment, and AI usage costs

-- Table: narrative_goals
CREATE TABLE IF NOT EXISTS public.narrative_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_id TEXT,
    topic_label TEXT NOT NULL,
    goal_type TEXT NOT NULL CHECK (goal_type IN ('include', 'avoid', 'cta', 'mention')),
    target_mentions INTEGER DEFAULT 1 CHECK (target_mentions >= 0),
    cadence_days INTEGER DEFAULT 30 CHECK (cadence_days IS NULL OR cadence_days > 0),
    metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_narrative_goals_user ON public.narrative_goals (user_id);
CREATE INDEX IF NOT EXISTS idx_narrative_goals_status ON public.narrative_goals (status);

COMMENT ON TABLE public.narrative_goals IS 'Desired topic/CTA coverage goals per user for the Narrative Coverage radar.';
COMMENT ON COLUMN public.narrative_goals.goal_type IS 'include=ensure topic appears, avoid=flag mentions, cta=ensure CTA cadence, mention=general awareness.';

ALTER TABLE public.narrative_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS narrative_goals_select ON public.narrative_goals;
CREATE POLICY narrative_goals_select ON public.narrative_goals
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS narrative_goals_insert ON public.narrative_goals;
CREATE POLICY narrative_goals_insert ON public.narrative_goals
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS narrative_goals_update ON public.narrative_goals;
CREATE POLICY narrative_goals_update ON public.narrative_goals
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS narrative_goals_delete ON public.narrative_goals;
CREATE POLICY narrative_goals_delete ON public.narrative_goals
    FOR DELETE USING (auth.uid() = user_id);

-- Table: narrative_coverage_snapshots
CREATE TABLE IF NOT EXISTS public.narrative_coverage_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_title TEXT,
    coverage_window TEXT,
    topics JSONB NOT NULL,
    ctas JSONB DEFAULT '[]'::jsonb,
    opportunities JSONB DEFAULT '[]'::jsonb,
    analytics JSONB DEFAULT '{}'::jsonb,
    ai_usage JSONB DEFAULT '{}'::jsonb,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    ai_cost_usd NUMERIC(10,4) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_narrative_coverage_project ON public.narrative_coverage_snapshots (project_id);
CREATE INDEX IF NOT EXISTS idx_narrative_coverage_user ON public.narrative_coverage_snapshots (user_id, created_at DESC);

COMMENT ON TABLE public.narrative_coverage_snapshots IS 'Per-episode topic and CTA coverage with AI analysis + opportunity scoring.';
COMMENT ON COLUMN public.narrative_coverage_snapshots.coverage_window IS 'Human readable window for transcript slice analyzed (e.g., full episode, first 30m).';
COMMENT ON COLUMN public.narrative_coverage_snapshots.ai_usage IS 'Tracks model, tokens, and USD cost so creators can be billed.';

ALTER TABLE public.narrative_coverage_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS narrative_coverage_snapshots_select ON public.narrative_coverage_snapshots;
CREATE POLICY narrative_coverage_snapshots_select ON public.narrative_coverage_snapshots
    FOR SELECT USING (auth.uid() = user_id);
