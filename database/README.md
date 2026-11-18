# Database Migrations & Security

All Supabase SQL files for the PrepTrack platform.

## Files & Recommended Run Order

| File | Purpose |
|------|---------|
| `preptrack_migration.sql` | **Main upgrade migration** — creates `attendance_sessions`, `attendance_submissions`, `student_course_preferences`, extends `profiles`, sets up RLS and Realtime. |
| `security_hardening.sql` | **Database Hardening** — PostgreSQL triggers verifying GPS radius, exam scores, anti-privilege escalation, and anti-tamper policies. |
| `database.sql` | Core initial schema (profiles, exam_results, lessons, subjects, scheduled_exams). |
| `admin_migration.sql` | Admin role and permissions setup. |
| `migration_v2.sql` | v2 schema patches and extensions. |
| `fix_rls.sql` | Row Level Security policies clean-up. |
| `setup_messages.sql` | Messaging/notifications schema. |
| `setup_social.sql` | Social and community features schema. |

## How to Apply

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) -> Select your project -> Go to **SQL Editor**.
2. Open `preptrack_migration.sql`, copy and paste the contents into the SQL Editor, and click **Run**.
3. Open `security_hardening.sql`, copy and paste into the SQL Editor, and click **Run** to enforce server-side validation.
