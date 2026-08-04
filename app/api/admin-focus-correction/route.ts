import { env } from "cloudflare:workers";
import { getAuthenticatedAdmin } from "../../../lib/admin-auth";
import { ensureDeviceAuthTables, type DeviceAuthEnv } from "../../../lib/device-auth";
import { jstDateKey } from "../../../lib/guardian-reports";
import { ensureStudyPresenceTable } from "../../../lib/study-presence";
import { ensureStudyRecordTables } from "../../../lib/study-records";

type FocusCorrectionPayload = {
  studentId?: string;
  summaryDate?: string;
  activeSeconds?: number;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CORRECTION_SECONDS = 6 * 60 * 60;

async function requireAdmin(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const admin = await getAuthenticatedAdmin(request, runtime.DB);
  if (!admin) return { runtime, response: Response.json({ error: "admin login required" }, { status: 401 }) };
  await ensureDeviceAuthTables(runtime.DB);
  await ensureStudyPresenceTable(runtime.DB);
  await ensureStudyRecordTables(runtime.DB);
  return { runtime, admin };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const { runtime } = auth;
  const url = new URL(request.url);
  const displayName = url.searchParams.get("displayName")?.trim();
  const summaryDate = url.searchParams.get("summaryDate")?.trim() || jstDateKey();
  if (!displayName || !DATE_PATTERN.test(summaryDate)) {
    return Response.json({ error: "displayName and a valid summaryDate are required" }, { status: 400 });
  }

  const student = await runtime.DB.prepare(
    "SELECT id, display_name FROM device_users WHERE trim(display_name) = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(displayName).first<{ id: string; display_name: string }>();
  if (!student) return Response.json({ error: "student not found" }, { status: 404 });

  const [sessions, attempts] = await Promise.all([
    runtime.DB.prepare(`SELECT session_id, status, mode, subject, is_juku, active_seconds,
        started_at_ms, last_seen_at_ms, updated_at
      FROM study_session_totals
      WHERE student_id = ? AND summary_date = ?
      ORDER BY started_at_ms ASC`)
      .bind(student.id, summaryDate).all<Record<string, unknown>>(),
    runtime.DB.prepare(`SELECT attempted_at
      FROM practice_attempts
      WHERE student_id = ? AND date(attempted_at, '+9 hours') = ?
      ORDER BY attempted_at ASC`)
      .bind(student.id, summaryDate).all<{ attempted_at: string }>(),
  ]);

  return Response.json({
    student,
    summaryDate,
    sessions: sessions.results ?? [],
    attemptTimes: (attempts.results ?? []).map((row) => row.attempted_at),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const { runtime } = auth;
  let payload: FocusCorrectionPayload;
  try {
    payload = await request.json() as FocusCorrectionPayload;
  } catch {
    return Response.json({ error: "valid JSON is required" }, { status: 400 });
  }

  const studentId = payload.studentId?.trim();
  const summaryDate = payload.summaryDate?.trim() || jstDateKey();
  const activeSeconds = Math.round(Number(payload.activeSeconds));
  if (!studentId || !DATE_PATTERN.test(summaryDate) || !Number.isFinite(activeSeconds)
    || activeSeconds < 0 || activeSeconds > MAX_CORRECTION_SECONDS) {
    return Response.json({ error: "studentId, summaryDate and activeSeconds (0-21600) are required" }, { status: 400 });
  }

  const student = await runtime.DB.prepare("SELECT id, display_name FROM device_users WHERE id = ?")
    .bind(studentId).first<{ id: string; display_name: string }>();
  if (!student) return Response.json({ error: "student not found" }, { status: 404 });

  const now = Date.now();
  const sessionId = `admin-focus-correction:${summaryDate}:${studentId}`;
  await runtime.DB.prepare(`INSERT INTO study_session_totals
      (student_id, session_id, summary_date, status, mode, subject, is_juku,
       active_seconds, started_at_ms, last_seen_at_ms, updated_at)
    VALUES (?, ?, ?, 'stopped', '管理者補正', '', 0, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, session_id) DO UPDATE SET
      active_seconds = excluded.active_seconds,
      last_seen_at_ms = excluded.last_seen_at_ms,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(studentId, sessionId, summaryDate, activeSeconds, now, now).run();

  return Response.json({ saved: true, student, summaryDate, activeSeconds, sessionId });
}
