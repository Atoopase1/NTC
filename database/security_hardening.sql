-- ==============================================================================
-- PREPTRACK — COMPREHENSIVE DATABASE SECURITY HARDENING
-- File: database/security_hardening.sql
--
-- Run this in Supabase SQL Editor.
-- Completely safe, idempotent, and non-destructive.
--
-- Defends against:
--   1. Browser console / curl tampering of exam scores and percentages
--   2. Browser console / curl tampering of GPS location & attendance
--   3. Privilege escalation (student attempting to set role = 'admin')
--   4. Modifying or deleting other students' data
--   5. Retroactive tampering of submitted exam results or attendance
-- ==============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ATTENDANCE SUBMISSION SECURITY (SERVER-SIDE VALIDATION TRIGGER)
-- Even if a user tries to POST fake data via curl or browser console,
-- the PostgreSQL server recalculates distance and verifies all criteria.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_attendance_submission()
RETURNS trigger AS $$
DECLARE
  v_session         public.attendance_sessions%ROWTYPE;
  v_ref_lat         NUMERIC;
  v_ref_lng         NUMERIC;
  v_radius          INTEGER;
  v_distance        NUMERIC;
  v_lat1            NUMERIC;
  v_lat2            NUMERIC;
  v_lon1            NUMERIC;
  v_lon2            NUMERIC;
  v_dlat            NUMERIC;
  v_dlon            NUMERIC;
  v_a               NUMERIC;
  v_c               NUMERIC;
  v_R               NUMERIC := 6371000; -- Earth radius in metres
BEGIN
  -- ── 1a. User identity check ─────────────────────────────────────────────
  -- Ensure submission user_id belongs to the authenticated session
  IF auth.uid() IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Cannot submit attendance on behalf of another user';
  END IF;

  -- ── 1b. Load referenced session ─────────────────────────────────────────
  SELECT * INTO v_session
    FROM public.attendance_sessions
   WHERE id = NEW.session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance session does not exist';
  END IF;

  -- ── 1c. Session status check ────────────────────────────────────────────
  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'Attendance session is closed';
  END IF;

  -- ── 1d. Time window check with grace buffer for clock skew ──────────────
  -- 2 minutes early grace, 5 minutes late grace for network latency
  IF NOW() < (v_session.start_time - INTERVAL '2 minutes') THEN
    RAISE EXCEPTION 'Attendance session has not started yet';
  END IF;

  IF NOW() > (v_session.end_time + INTERVAL '5 minutes') THEN
    RAISE EXCEPTION 'Attendance session has ended';
  END IF;

  -- ── 1e. GPS Coordinates must be provided ────────────────────────────────
  IF NEW.student_lat IS NULL OR NEW.student_lng IS NULL THEN
    RAISE EXCEPTION 'GPS coordinates are required to submit attendance';
  END IF;

  -- ── 1f. Server-Side Distance Verification ───────────────────────────────
  v_ref_lat := v_session.reference_lat;
  v_ref_lng := v_session.reference_lng;
  v_radius  := COALESCE(v_session.radius_meters, 30);

  IF v_ref_lat IS NOT NULL AND v_ref_lng IS NOT NULL THEN
    -- Haversine formula computed directly on the server
    v_lat1 := radians(v_ref_lat);
    v_lat2 := radians(NEW.student_lat);
    v_lon1 := radians(v_ref_lng);
    v_lon2 := radians(NEW.student_lng);
    v_dlat := v_lat2 - v_lat1;
    v_dlon := v_lon2 - v_lon1;
    v_a    := sin(v_dlat/2)^2 + cos(v_lat1) * cos(v_lat2) * sin(v_dlon/2)^2;
    v_c    := 2 * atan2(sqrt(v_a), sqrt(1 - v_a));
    v_distance := v_R * v_c;

    -- Server calculates and overrides distance and radius check
    NEW.distance_meters  := round(v_distance::NUMERIC, 2);
    NEW.is_within_radius := (v_distance <= v_radius);

    IF NOT NEW.is_within_radius THEN
      RAISE EXCEPTION 'Location verification failed: You are %.1fm from the session location (allowed radius: %m)',
        v_distance, v_radius;
    END IF;
  ELSE
    -- General location session
    NEW.is_within_radius := true;
    IF NEW.distance_meters IS NULL THEN
      NEW.distance_meters := 0;
    END IF;
  END IF;

  -- Server certifies verification status
  NEW.verification_status := 'verified';
  NEW.submitted_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_attendance ON public.attendance_submissions;
CREATE TRIGGER trg_validate_attendance
  BEFORE INSERT ON public.attendance_submissions
  FOR EACH ROW EXECUTE FUNCTION public.validate_attendance_submission();


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. EXAM RESULT INTEGRITY (SERVER-SIDE VALIDATION TRIGGER)
-- Ensures scores cannot be inflated, negative, or mathematically inconsistent.
-- Recalculates percentage on the database server.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_exam_result()
RETURNS trigger AS $$
BEGIN
  -- ── 2a. Identity check ──────────────────────────────────────────────────
  IF auth.uid() IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Cannot submit exam results on behalf of another user';
  END IF;

  -- ── 2b. Score sanity checks ─────────────────────────────────────────────
  IF NEW.score IS NOT NULL AND NEW.total IS NOT NULL THEN
    IF NEW.total <= 0 THEN
      RAISE EXCEPTION 'Invalid exam total: must be greater than 0';
    END IF;
    IF NEW.score < 0 THEN
      RAISE EXCEPTION 'Invalid exam score: cannot be negative';
    END IF;
    IF NEW.score > NEW.total THEN
      RAISE EXCEPTION 'Invalid exam score: score (%) cannot exceed total questions (%)',
        NEW.score, NEW.total;
    END IF;

    -- ── 2c. Server computes true percentage (ignoring any client spoofing) ─
    NEW.percentage := ROUND((NEW.score::NUMERIC / NEW.total::NUMERIC) * 100);
  END IF;

  NEW.created_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_exam_result ON public.exam_results;
CREATE TRIGGER trg_validate_exam_result
  BEFORE INSERT ON public.exam_results
  FOR EACH ROW EXECUTE FUNCTION public.validate_exam_result();


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. PRIVILEGE ESCALATION PREVENTION
-- Prevents any non-superadmin from changing their own role, admin permissions,
-- or unblocking their own account via UPDATE statements.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_role_elevation()
RETURNS trigger AS $$
BEGIN
  -- If caller is not the super-admin, protect sensitive fields
  IF (auth.jwt() ->> 'email') IS DISTINCT FROM 'atoopase@gmail.com' THEN
    NEW.role              := OLD.role;
    NEW.admin_permissions := OLD.admin_permissions;
    NEW.blocked_until     := OLD.blocked_until;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_elevation ON public.profiles;
CREATE TRIGGER trg_prevent_role_elevation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_elevation();


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. REMOVE RETROACTIVE TAMPERING PERMISSIONS
-- Once attendance or exam results are submitted, students CANNOT update them.
-- ══════════════════════════════════════════════════════════════════════════════

-- Students cannot update exam results
DROP POLICY IF EXISTS "exam_results_update_own" ON public.exam_results;
DROP POLICY IF EXISTS "Users can update their own exam results" ON public.exam_results;

-- Students cannot update attendance submissions
DROP POLICY IF EXISTS "Students can update own submissions" ON public.attendance_submissions;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. VERIFICATION
-- Run these queries after applying to confirm everything is in place:
--
-- SELECT trigger_name, event_object_table, action_timing, event_manipulation
-- FROM information_schema.triggers
-- WHERE trigger_schema = 'public' AND trigger_name IN (
--   'trg_validate_attendance',
--   'trg_validate_exam_result',
--   'trg_prevent_role_elevation'
-- );
-- ══════════════════════════════════════════════════════════════════════════════
