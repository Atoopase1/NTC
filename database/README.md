# Database

All Supabase SQL files for PrepTrack.

## Files

| File | Purpose |
|------|---------|
| database.sql | Core schema (profiles, exam_results, lessons, subjects, scheduled_exams) |
| preptrack_migration.sql | **Main upgrade migration** — adds courses, attendance, admin roles |
| dmin_migration.sql | Admin role and permission setup |
| migration_v2.sql | v2 schema patches |
| ix_rls.sql | Row Level Security policy fixes |
| setup_messages.sql | Messaging/notifications schema |
| setup_social.sql | Social features schema |

## How to run

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) ? Your project ? **SQL Editor**
2. Paste the file contents and click **Run**
3. Run in this order for a fresh setup:
   - database.sql
   - preptrack_migration.sql
"@

Set-Content -Path "c:\Users\techn\OneDrive\Desktop\preptrack\scripts\README.md" -Value @"
# Scripts

Utility scripts for local development and asset processing.

| File | Purpose |
|------|---------|
| emove_bg.py | Background removal utility for image assets |
