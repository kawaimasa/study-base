import { env } from "cloudflare:workers";
import { getAuthenticatedAdmin } from "../../../lib/admin-auth";
import { ensureDeviceAuthTables, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureWeeklyTestTables, selectSmartWeeklyQuestions, type WeeklyQuestion, type WeeklyQuestionInsights } from "../../../lib/weekly-tests";

const validSubjects = ["国語", "数学", "英語", "理科", "社会"];

function safeJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value ?? "")) as T;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const admin = await getAuthenticatedAdmin(request, runtime.DB);
  if (!admin) return Response.json({ error: "admin login required" }, { status: 401 });
  await ensureDeviceAuthTables(runtime.DB);
  await ensureWeeklyTestTables(runtime.DB);
  const { results = [] } = await runtime.DB.prepare(`SELECT t.id, t.title, t.starts_at, t.duration_minutes,
      t.question_count, t.subjects_json, t.status, t.created_at,
      COUNT(s.student_id) AS submission_count,
      COALESCE(SUM(CASE WHEN s.status = 'submitted' THEN 1 ELSE 0 END), 0) AS completed_count,
      COALESCE(AVG(CASE WHEN s.status = 'submitted' AND s.total_questions > 0 THEN s.correct_answers * 100.0 / s.total_questions END), 0) AS average_score
    FROM weekly_tests t
    LEFT JOIN weekly_test_submissions s ON s.test_id = t.id
    GROUP BY t.id
    ORDER BY t.starts_at DESC LIMIT 30`).all<Record<string, unknown>>();
  const { results: submissions = [] } = await runtime.DB.prepare(`SELECT s.test_id, t.title AS test_title,
      u.display_name, s.status, s.correct_answers, s.total_questions, s.away_seconds, s.started_at, s.submitted_at
    FROM weekly_test_submissions s
    JOIN weekly_tests t ON t.id = s.test_id
    JOIN device_users u ON u.id = s.student_id
    ORDER BY COALESCE(s.submitted_at, s.started_at) DESC LIMIT 200`).all<Record<string, unknown>>();
  return Response.json({ serverNow: new Date().toISOString(), submissions, tests: results.map((row) => ({
    ...row,
    subjects: JSON.parse(String(row.subjects_json ?? "[]")),
  })) });
}

export async function POST(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const admin = await getAuthenticatedAdmin(request, runtime.DB);
  if (!admin) return Response.json({ error: "admin login required" }, { status: 401 });
  await ensureWeeklyTestTables(runtime.DB);
  const payload = await request.json() as {
    action?: "create" | "cancel";
    testId?: string;
    title?: string;
    startsAt?: string;
    durationMinutes?: number;
    questionCount?: number;
    subjects?: string[];
  };

  if (payload.action === "cancel" && payload.testId) {
    await runtime.DB.prepare("UPDATE weekly_tests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(payload.testId).run();
    return Response.json({ cancelled: true });
  }

  if (payload.action !== "create") return Response.json({ error: "invalid action" }, { status: 400 });
  const title = payload.title?.trim().slice(0, 80) || "7日間総復習テスト";
  const startsAt = new Date(payload.startsAt ?? "");
  const durationMinutes = Math.max(5, Math.min(180, Number(payload.durationMinutes ?? 30)));
  const questionCount = Math.max(5, Math.min(50, Number(payload.questionCount ?? 25)));
  const subjects = [...new Set((payload.subjects ?? []).filter((subject) => validSubjects.includes(subject)))];
  if (!Number.isFinite(startsAt.getTime())) return Response.json({ error: "開始日時を確認してください。" }, { status: 400 });
  if (subjects.length === 0) return Response.json({ error: "科目を1つ以上選んでください。" }, { status: 400 });
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const recentRows = await runtime.DB.prepare(`SELECT t.questions_json, s.grades_json
    FROM weekly_test_submissions s
    JOIN weekly_tests t ON t.id = s.test_id
    WHERE s.status = 'submitted' AND COALESCE(s.submitted_at, s.updated_at, s.started_at) >= ?`)
    .bind(since).all<Record<string, unknown>>();
  const insights: WeeklyQuestionInsights = { wrongByQuestionId: {}, wrongByUnit: {}, solvedByUnit: {} };
  for (const row of recentRows.results ?? []) {
    const rowQuestions = safeJson<WeeklyQuestion[]>(row.questions_json, []);
    const grades = safeJson<Record<string, boolean>>(row.grades_json, {});
    for (const question of rowQuestions) {
      if (!subjects.includes(question.subject)) continue;
      const unitKey = `${question.subject}::${question.unit}`;
      insights.solvedByUnit![unitKey] = (insights.solvedByUnit![unitKey] ?? 0) + 1;
      if (grades[question.id] === false) {
        insights.wrongByQuestionId![question.id] = (insights.wrongByQuestionId![question.id] ?? 0) + 1;
        insights.wrongByUnit![unitKey] = (insights.wrongByUnit![unitKey] ?? 0) + 1;
      }
    }
  }
  const questions = selectSmartWeeklyQuestions(subjects, questionCount, insights);
  if (questions.length < questionCount) return Response.json({ error: "指定条件の問題数が不足しています。" }, { status: 400 });

  const id = crypto.randomUUID();
  await runtime.DB.prepare(`INSERT INTO weekly_tests
    (id, title, starts_at, duration_minutes, question_count, subjects_json, questions_json, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?)`)
    .bind(id, title, startsAt.toISOString(), durationMinutes, questionCount, JSON.stringify(subjects), JSON.stringify(questions), admin.id).run();
  return Response.json({ created: true, id });
}
