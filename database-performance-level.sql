ALTER TABLE projects
ADD COLUMN IF NOT EXISTS performance_level TEXT DEFAULT 'premium';

COMMENT ON COLUMN projects.performance_level IS 'User-selected processing quality tier: basic, pro, or premium (legacy low/medium/high mapped internally)';
