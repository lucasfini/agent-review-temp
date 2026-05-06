WITH ranked_starter_copies AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, metadata -> 'starterProject' ->> 'sourceProjectId'
      ORDER BY created_at ASC, id ASC
    ) AS copy_rank
  FROM public.projects
  WHERE metadata ? 'starterProject'
    AND metadata -> 'starterProject' ->> 'sourceProjectId' IS NOT NULL
)
DELETE FROM public.projects p
USING ranked_starter_copies r
WHERE p.id = r.id
  AND r.copy_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS projects_one_starter_copy_per_user_idx
  ON public.projects (
    user_id,
    ((metadata -> 'starterProject' ->> 'sourceProjectId'))
  )
  WHERE metadata ? 'starterProject'
    AND metadata -> 'starterProject' ->> 'sourceProjectId' IS NOT NULL;
