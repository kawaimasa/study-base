import { env } from "cloudflare:workers";
import { getAuthenticatedDeviceUser, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureWeeklyTestTables, gradeWeeklyAnswers, testEndTime, type WeeklyQuestion } from "../../../lib/weekly-tests";

function publicQuestion(question: WeeklyQuestion) {
  return { id: question.id, subject: question.subject, unit: question.unit, difficulty: question.difficulty, question: question.question };
}

function resultQuestion(question: WeeklyQuestion, answer: string, correct: boolean) {
  return { ...publicQuestion(question), answer: question.answer, explanation: question.explanation, studentAnswer: answer, correct };
}

async function getTest(db: D1Database, testId: string) {
  return db.prepare("SELECT * FROM weekly_tests WHERE id = ? AND status = 'published'").bind(testId).first<Record<string, unknown>>();
}

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });
  await ensureWeeklyTestTables(runtime.DB);
  const { results = [] } = await runtime.DB.prepare("SELECT * FROM weekly_tests WHERE status = 'published' ORDER BY starts_at DESC LIMIT 20")
    .all<Record<string, unknown>>();
  const now = Date.now();
  const tests = results.map((row) => ({
    row,
    start: new Date(String(row.starts_at)).getTime(),
    end: testEndTime(String(row.starts_at), Number(row.duration_minutes)),
  }));
  const active = tests.find((test) => test.start <= now && now < test.end);
  const upcoming = tests.filter((test) => test.start > now).sort((a, b) => a.start - b.start)[0];
  const recent = tests.filter((test) => test.end <= now).sort((a, b) => b.end - a.end)[0];
  const selected = active ?? upcoming ?? recent;
  if (!selected) return Response.json({ serverNow: new Date().toISOString(), test: null });

  const row = selected.row;
  const submission = await runtime.DB.prepare("SELECT * FROM weekly_test_submissions WHERE test_id = ? AND student_id = ?")
    .bind(String(row.id), user.id).first<Record<string, unknown>>();
  const questions = JSON.parse(String(row.questions_json)) as WeeklyQuestion[];
  const submitted = submission?.status === "submitted";
  const kind = active ? "active" : upcoming ? "upcoming" : "ended";
  const answers = submission ? JSON.parse(String(submission.answers_json ?? "{}")) as Record<string, string> : {};
  const grades = submission ? JSON.parse(String(submission.grades_json ?? "{}")) as Record<string, boolean> : {};
  return Response.json({
    serverNow: new Date().toISOString(),
    test: {
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      durationMinutes: row.duration_minutes,
      questionCount: row.question_count,
      subjects: JSON.parse(String(row.subjects_json)),
      kind,
      questions: kind === "active" && !submitted ? questions.map(publicQuestion) : [],
      submission: submission ? {
        status: submission.status,
        answers,
        correctAnswers: submission.correct_answers,
        totalQuestions: submission.total_questions,
        awaySeconds: submission.away_seconds,
        resultQuestions: submitted ? questions.map((question) => resultQuestion(question, answers[question.id] ?? "", Boolean(grades[question.id]))) : [],
      } : null,
    },
  });
}

export async function POST(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });
  await ensureWeeklyTestTables(runtime.DB);
  const payload = await request.json() as { action?: "start" | "submit"; testId?: string; answers?: Record<string, string>; awaySeconds?: number };
  if (!payload.testId) return Response.json({ error: "testId is required" }, { status: 400 });
  const test = await getTest(runtime.DB, payload.testId);
  if (!test) return Response.json({ error: "test not found" }, { status: 404 });
  const now = Date.now();
  const start = new Date(String(test.starts_at)).getTime();
  if (now < start) return Response.json({ error: "test has not started" }, { status: 403 });

  if (payload.action === "start") {
    await runtime.DB.prepare(`INSERT INTO weekly_test_submissions (test_id, student_id, status)
      VALUES (?, ?, 'in_progress') ON CONFLICT(test_id, student_id) DO NOTHING`)
      .bind(payload.testId, user.id).run();
    return Response.json({ started: true });
  }

  if (payload.action !== "submit") return Response.json({ error: "invalid action" }, { status: 400 });
  const existing = await runtime.DB.prepare("SELECT status FROM weekly_test_submissions WHERE test_id = ? AND student_id = ?")
    .bind(payload.testId, user.id).first<{ status: string }>();
  if (existing?.status === "submitted") return Response.json({ error: "already submitted" }, { status: 409 });
  const questions = JSON.parse(String(test.questions_json)) as WeeklyQuestion[];
  const answers = payload.answers ?? {};
  const { grades, correct } = gradeWeeklyAnswers(questions, answers);
  const awaySeconds = Math.max(0, Math.floor(Number(payload.awaySeconds ?? 0)));
  await runtime.DB.prepare(`INSERT INTO weekly_test_submissions
      (test_id, student_id, status, answers_json, grades_json, correct_answers, total_questions, away_seconds, submitted_at, updated_at)
    VALUES (?, ?, 'submitted', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(test_id, student_id) DO UPDATE SET status = 'submitted', answers_json = excluded.answers_json,
      grades_json = excluded.grades_json, correct_answers = excluded.correct_answers,
      total_questions = excluded.total_questions, away_seconds = excluded.away_seconds,
      submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`)
    .bind(payload.testId, user.id, JSON.stringify(answers), JSON.stringify(grades), correct, questions.length, awaySeconds).run();
  return Response.json({
    submitted: true,
    correctAnswers: correct,
    totalQuestions: questions.length,
    awaySeconds,
    resultQuestions: questions.map((question) => resultQuestion(question, answers[question.id] ?? "", Boolean(grades[question.id]))),
  });
}

