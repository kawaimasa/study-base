import { env } from "cloudflare:workers";
import { getAuthenticatedDeviceUser, type DeviceAuthEnv } from "../../../lib/device-auth";
import {
  recordPracticeAttempt,
  recordPracticeAttemptBatch,
  recordQuestionDeliveries,
  studentRecordSnapshot,
  type AttemptResult,
  type StudyRecordQuestion,
} from "../../../lib/study-records";

function toQuestion(value: unknown): StudyRecordQuestion {
  if (!value || typeof value !== "object") throw new Error("question is required");
  const input = value as Record<string, unknown>;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  const key = typeof input.key === "string" ? input.key.trim() : "";
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  if (!id || !key || !subject) throw new Error("question id, key and subject are required");
  return {
    id,
    key,
    subject,
    payload: typeof input.payload === "object" && input.payload !== null ? input.payload as Record<string, unknown> : {},
  };
}

function toAttempt(value: unknown): { question: StudyRecordQuestion; result: AttemptResult; answerText: string; source: string } {
  if (!value || typeof value !== "object") throw new Error("attempt is required");
  const input = value as Record<string, unknown>;
  const result = input.result;
  if (result !== "correct" && result !== "wrong") throw new Error("attempt result must be correct or wrong");
  return {
    question: toQuestion(input.question),
    result: result as AttemptResult,
    answerText: typeof input.answer === "string" ? input.answer : "",
    source: typeof input.source === "string" ? input.source.slice(0, 50) : "practice",
  };
}

export async function GET(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });

  const snapshot = await studentRecordSnapshot(runtime.DB, user.id);
  const { results = [] } = await runtime.DB.prepare(`SELECT question_id, question_key, subject, question_json, wrong_count, last_wrong_at
    FROM mistake_notes
    WHERE student_id = ? AND status = 'active'
    ORDER BY last_wrong_at DESC
    LIMIT 500`).bind(user.id).all<Record<string, unknown>>();
  return Response.json({
    ...snapshot,
    mistakes: results.map((row) => ({
      questionId: String(row.question_id),
      questionKey: String(row.question_key),
      subject: String(row.subject),
      question: JSON.parse(String(row.question_json ?? "{}")) as Record<string, unknown>,
      wrongCount: Number(row.wrong_count ?? 0),
      lastWrongAt: String(row.last_wrong_at ?? ""),
    })),
  });
}

export async function POST(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });
  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON形式が正しくありません。" }, { status: 400 });
  }

  try {
    if (payload.action === "attempt-batch") {
      const batchId = typeof payload.batchId === "string" ? payload.batchId : "";
      const attempts = Array.isArray(payload.attempts) ? payload.attempts.map(toAttempt) : [];
      const result = await recordPracticeAttemptBatch(runtime.DB, user.id, batchId, attempts);
      return Response.json(result);
    }

    if (payload.action === "delivery") {
      const items = Array.isArray(payload.questions) ? payload.questions.map(toQuestion) : [];
      if (items.length < 1 || items.length > 80) return Response.json({ error: "questions must contain 1 to 80 items" }, { status: 400 });
      await recordQuestionDeliveries(runtime.DB, user.id, items);
      return Response.json({ saved: true, delivered: items.length });
    }

    if (payload.action === "attempt") {
      const result = payload.result;
      if (result !== "correct" && result !== "wrong") return Response.json({ error: "result must be correct or wrong" }, { status: 400 });
      const question = toQuestion(payload.question);
      const answer = typeof payload.answer === "string" ? payload.answer : "";
      const source = typeof payload.source === "string" ? payload.source.slice(0, 50) : "practice";
      await recordPracticeAttempt(runtime.DB, user.id, question, result as AttemptResult, answer, source);
      return Response.json({ saved: true, result });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "invalid study record" }, { status: 400 });
  }

  return Response.json({ error: "invalid action" }, { status: 400 });
}
