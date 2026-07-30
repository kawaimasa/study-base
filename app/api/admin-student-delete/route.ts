import { env } from "cloudflare:workers";
import { getAuthenticatedAdmin } from "../../../lib/admin-auth";
import { ensureDeviceAuthTables, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureGuardianReportTables } from "../../../lib/guardian-reports";
import { ensureStudyPresenceTable } from "../../../lib/study-presence";
import { ensureStudyRecordTables } from "../../../lib/study-records";
import { ensureWeeklyTestTables } from "../../../lib/weekly-tests";

type DeletePayload = {
  displayName?: string;
  confirmation?: string;
};

const DELETE_CONFIRMATION = "完全削除";

export async function POST(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const admin = await getAuthenticatedAdmin(request, runtime.DB);
  if (!admin) return Response.json({ error: "admin login required" }, { status: 401 });

  let payload: DeletePayload;
  try {
    payload = await request.json() as DeletePayload;
  } catch {
    return Response.json({ error: "JSON形式が正しくありません。" }, { status: 400 });
  }

  const displayName = payload.displayName?.trim();
  if (!displayName || payload.confirmation !== DELETE_CONFIRMATION) {
    return Response.json({ error: `生徒名と確認文字「${DELETE_CONFIRMATION}」が必要です。` }, { status: 400 });
  }

  await ensureDeviceAuthTables(runtime.DB);
  await ensureGuardianReportTables(runtime.DB);
  await ensureStudyPresenceTable(runtime.DB);
  await ensureStudyRecordTables(runtime.DB);
  await ensureWeeklyTestTables(runtime.DB);

  const { results = [] } = await runtime.DB.prepare(
    "SELECT id, display_name FROM device_users WHERE trim(display_name) = ? ORDER BY created_at",
  ).bind(displayName).all<{ id: string; display_name: string }>();

  if (results.length === 0) {
    return Response.json({ error: "該当する生徒が見つかりません。" }, { status: 404 });
  }
  if (results.length !== 1) {
    return Response.json({ error: "同じ名前の生徒が複数いるため、削除を中止しました。", matches: results.length }, { status: 409 });
  }

  const studentId = results[0].id;
  const operations = [
    ["device_sessions", runtime.DB.prepare("DELETE FROM device_sessions WHERE user_id = ?").bind(studentId)],
    ["student_login_days", runtime.DB.prepare("DELETE FROM student_login_days WHERE student_id = ?").bind(studentId)],
    ["question_deliveries", runtime.DB.prepare("DELETE FROM question_deliveries WHERE student_id = ?").bind(studentId)],
    ["practice_attempts", runtime.DB.prepare("DELETE FROM practice_attempts WHERE student_id = ?").bind(studentId)],
    ["practice_attempt_batches", runtime.DB.prepare("DELETE FROM practice_attempt_batches WHERE student_id = ?").bind(studentId)],
    ["mistake_notes", runtime.DB.prepare("DELETE FROM mistake_notes WHERE student_id = ?").bind(studentId)],
    ["study_presence", runtime.DB.prepare("DELETE FROM study_presence WHERE student_id = ?").bind(studentId)],
    ["study_session_totals", runtime.DB.prepare("DELETE FROM study_session_totals WHERE student_id = ?").bind(studentId)],
    ["daily_summaries", runtime.DB.prepare("DELETE FROM daily_summaries WHERE student_id = ?").bind(studentId)],
    ["daily_away_stats", runtime.DB.prepare("DELETE FROM daily_away_stats WHERE student_id = ?").bind(studentId)],
    ["guardian_notification_logs", runtime.DB.prepare("DELETE FROM guardian_notification_logs WHERE student_id = ?").bind(studentId)],
    ["guardian_profiles", runtime.DB.prepare("DELETE FROM guardian_profiles WHERE student_id = ?").bind(studentId)],
    ["weekly_test_submissions", runtime.DB.prepare("DELETE FROM weekly_test_submissions WHERE student_id = ?").bind(studentId)],
    ["device_users", runtime.DB.prepare("DELETE FROM device_users WHERE id = ? AND trim(display_name) = ?").bind(studentId, displayName)],
  ] as const;

  const deleteResults = await runtime.DB.batch(operations.map(([, statement]) => statement));
  const deleted = Object.fromEntries(operations.map(([table], index) => [table, Number(deleteResults[index]?.meta.changes ?? 0)]));
  if (deleted.device_users !== 1) {
    return Response.json({ error: "生徒アカウントを削除できませんでした。", deleted }, { status: 500 });
  }

  const remaining = await runtime.DB.prepare(
    "SELECT COUNT(*) AS count FROM device_users WHERE id = ? OR trim(display_name) = ?",
  ).bind(studentId, displayName).first<{ count: number }>();

  return Response.json({
    deleted: true,
    displayName,
    relatedRowsDeleted: Object.values(deleted).reduce((sum, count) => sum + count, 0) - 1,
    tableCounts: deleted,
    remainingAccounts: Number(remaining?.count ?? 0),
  });
}
