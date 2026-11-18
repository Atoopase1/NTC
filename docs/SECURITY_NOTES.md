# PrepTrack Security Architecture & Verification Guide

## 1. Executive Security Summary
The PrepTrack platform upgrade enforces defense-in-depth across client-side interfaces and backend database services. The critical vulnerability present in legacy NTC Prep—where authorization decisions relied on insecure browser `localStorage` checks—has been resolved with asynchronous server-side identity verification via Supabase Auth and database Row Level Security (RLS).

---

## 2. Authorization & Role Verification Matrix

| Mechanism | Purpose | Security Level | Implementation Detail |
|---|---|---|---|
| **Supabase JWT (`auth.jwt()`)** | Identity & Session | **Authoritative (Server)** | Verified on every Supabase query; cannot be forged by client JavaScript. |
| **Database Row Level Security (RLS)** | Data Access Control | **Authoritative (Server)** | Database rejects unauthorized read/write operations regardless of client state. |
| **Asynchronous User Verification** | Route Protection | **Enforced (Client/Server)** | Checks `supabaseClient.auth.getUser()` and verifies role in `public.profiles` on route load. |
| **`preptrack_is_admin` LocalStorage** | Display Optimization | **Presentation Only** | Controls UI visibility (e.g. showing "Admin Portal" link). Tampering does not grant data access. |

---

## 3. Super Administrator Access & Protection

### Permanent Super Administrator
- **Designated Account:** `atoopase@gmail.com`
- **Privilege Scope:** Unrestricted platform administration, exam scheduling, lesson materials, attendance sessions, user block/unblock, and administrator promotion/demotion.
- **Self-Protection Constraints:**
  - Hardcoded server-side checks in RLS policies (`(auth.jwt() ->> 'email') = 'atoopase@gmail.com'`).
  - Frontend scripts (`js/admin-admins.js`) strictly prevent other administrators from modifying, blocking, demoting, or revoking the Super Admin account.

### Granular Administrator Roles
Administrators promoted by the Super Administrator can be assigned granular access permissions:
1. `manage_students` — View student profiles, inspect examination records, block/unblock.
2. `manage_courses` — Create, edit, and reorganize subjects and curriculum modules.
3. `manage_lessons` — Upload study notes, videos, past questions, and lecture slides.
4. `manage_exams` — Create, update, and delete timed scheduled mock examinations.
5. `manage_attendance` — Create geofenced attendance sessions, inspect real-time student GPS submissions.
6. `view_results` — Access platform-wide analytics and examination scoreboards.
7. `manage_admins` — Reserved exclusively for Super Admin or explicitly delegated co-administrators.

---

## 4. Attendance System Geofence Security & Verification

### GPS Distance Verification (Haversine Algorithm)
When a student submits attendance:
1. Coordinates are captured via the HTML5 Geolocation API with `enableHighAccuracy: true` and a strict timeout.
2. Accuracy readings greater than 150 meters are flagged, prompting the user to calibrate GPS or move to open skies.
3. The server/client calculates the great-circle distance between the student's coordinates and the administrator's fixed reference coordinates:
   $$\Delta\sigma = 2 \arcsin \left( \sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)} \right)$$
   $$\text{Distance} = R \cdot \Delta\sigma \quad (\text{where } R = 6,371,000 \text{ meters})$$
4. The calculated distance must be $\le$ the permitted session radius (e.g., 10m, 20m, 30m, 50m, 100m).
5. All verification parameters (`student_lat`, `student_lng`, `distance_meters`, `location_accuracy`, `verification_status`) are permanently logged for auditing.

### Duplicate Prevention & Timing
- **Database Unique Constraint:** `UNIQUE(session_id, user_id)` guarantees at the Postgres level that no student can submit attendance twice for the same session.
- **Time Window Enforced:** Submissions are validated against `start_time` and `end_time` timestamps.

### Location Spoofing Considerations
- Browser-based GPS depends on OS-level location providers (cellular, Wi-Fi, GPS satellite).
- Physical attendance auditing is supported by real-time distance logging and printable attendance rosters with physical signature verification.

---

## 5. Row Level Security (RLS) Status
The `preptrack_migration.sql` script applies RLS to:
- `public.profiles`
- `public.lessons`
- `public.subjects`
- `public.scheduled_exams`
- `public.exam_results`
- `public.attendance_sessions`
- `public.attendance_submissions`
- `public.student_course_preferences`

All sensitive INSERT, UPDATE, and DELETE policies verify `auth.uid()` against verified admin roles or the Super Admin email.

---

## 6. Recommendations for Deployment
1. Execute `preptrack_migration.sql` in the Supabase SQL Editor.
2. In the Supabase Authentication settings, ensure **Secure Email Change** and **Confirm Email** are configured according to institutional policy.
3. Keep Supabase anon key public; never commit or expose the service-role key in frontend source code.

