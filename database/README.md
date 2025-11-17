# Database Documentation

This directory contains all SQL schemas and migrations for AudioRepurpose.

## Directory Structure

```
database/
├── schemas/        Schema definitions for tables
├── migrations/     Database migrations
└── README.md       This file
```

## Schemas (`schemas/`)

Core table definitions:

- **insights.sql** - Educational insights extraction (concepts & people)
- **outputs.sql** - Generated content (blog posts, social media, etc.)
- **narrative-coverage.sql** - Narrative coverage analysis
- **speaker-management.sql** - Speaker identification and roles
- **tier-content.sql** - Tier-based content access control
- **cache-tables.sql** - Content and transcription caching
- **cost-tracking.sql** - AI API cost tracking
- **progress-tracking.sql** - Project processing progress
- **performance-level.sql** - Performance monitoring

## Migrations (`migrations/`)

Database schema changes:

- **outputs-migration.sql** - Add user_id and metadata to outputs table
- **speaker-updates.sql** - Speaker management improvements
- **updates.sql** - General schema updates

## Usage

### Apply Schema
```bash
# Run schema files in Supabase SQL editor or via CLI
supabase db push
```

### Run Migration
```bash
# Execute migration files in order
psql $DATABASE_URL -f database/migrations/<migration-file>.sql
```

## Notes

- Always test migrations on a staging database first
- Schema files represent the current desired state
- Migrations represent incremental changes over time
- Keep migrations in chronological order
