import japaneseQuestions from "../public/data/kokugo.json";
import mathQuestions from "../public/data/math.json";
import englishQuestions from "../public/data/english.json";
import scienceSocialQuestions from "../app/question-bank.json";

export type WeeklyQuestion = {
  id: string;
  subject: string;
  unit: string;
  difficulty: string;
  question: string;
  answer: string;
  explanation: string;
};

export type WeeklyQuestionInsights = {
  wrongByQuestionId?: Record<string, number>;
  wrongByUnit?: Record<string, number>;
  solvedByUnit?: Record<string, number>;
};

const questionBank = [
  ...japaneseQuestions,
  ...mathQuestions,
  ...englishQuestions,
  ...scienceSocialQuestions,
] as WeeklyQuestion[];

export async function ensureWeeklyTestTables(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS weekly_tests (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      question_count INTEGER NOT NULL,
      subjects_json TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS weekly_test_submissions (
      test_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      answers_json TEXT NOT NULL DEFAULT '{}',
      grades_json TEXT NOT NULL DEFAULT '{}',
      correct_answers INTEGER NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 0,
      away_seconds INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (test_id, student_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS weekly_tests_starts_idx ON weekly_tests(starts_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS weekly_submissions_student_idx ON weekly_test_submissions(student_id)"),
  ]);
}

function questionKey(question: WeeklyQuestion) {
  return question.question.replace(/（確認\d+）/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function selectWeeklyQuestions(subjects: string[], count: number) {
  const buckets = subjects.map((subject) => {
    const seen = new Set<string>();
    return shuffled(questionBank.filter((question) => question.subject === subject)).filter((question) => {
      const key = questionKey(question);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  const selected: WeeklyQuestion[] = [];
  let round = 0;
  while (selected.length < count && buckets.some((bucket) => round < bucket.length)) {
    for (const bucket of buckets) {
      if (selected.length >= count) break;
      if (bucket[round]) selected.push(bucket[round]);
    }
    round += 1;
  }
  return shuffled(selected);
}

function unitKey(question: WeeklyQuestion) {
  return `${question.subject}::${question.unit}`;
}

function importanceScore(question: WeeklyQuestion) {
  const text = `${question.difficulty} ${question.unit} ${question.question}`;
  let score = 0;
  if (text.includes("入試")) score += 18;
  if (text.includes("基礎")) score += 10;
  if (text.includes("重要")) score += 10;
  if (text.includes("標準")) score += 5;
  return score;
}

export function selectSmartWeeklyQuestions(subjects: string[], count: number, insights: WeeklyQuestionInsights = {}) {
  const wrongByQuestionId = insights.wrongByQuestionId ?? {};
  const wrongByUnit = insights.wrongByUnit ?? {};
  const solvedByUnit = insights.solvedByUnit ?? {};
  const subjectSet = new Set(subjects);
  const seen = new Set<string>();
  const candidates = shuffled(questionBank.filter((question) => subjectSet.has(question.subject))).filter((question) => {
    const key = questionKey(question);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const maxUnitSolved = Math.max(0, ...candidates.map((question) => solvedByUnit[unitKey(question)] ?? 0));
  const subjectQuota = new Map(subjects.map((subject) => [subject, Math.ceil(count / Math.max(1, subjects.length)) + 1]));
  const selected: WeeklyQuestion[] = [];
  const pickedIds = new Set<string>();
  const scored = candidates.map((question) => {
    const key = unitKey(question);
    const lowPracticeBoost = Math.max(0, maxUnitSolved - (solvedByUnit[key] ?? 0));
    const score =
      (wrongByQuestionId[question.id] ?? 0) * 90 +
      (wrongByUnit[key] ?? 0) * 28 +
      lowPracticeBoost * 12 +
      importanceScore(question) +
      Math.random();
    return { question, score };
  }).sort((left, right) => right.score - left.score);

  for (const item of scored) {
    if (selected.length >= count) break;
    const quota = subjectQuota.get(item.question.subject) ?? count;
    const currentSubjectCount = selected.filter((question) => question.subject === item.question.subject).length;
    if (currentSubjectCount >= quota && selected.length < Math.floor(count * 0.8)) continue;
    selected.push(item.question);
    pickedIds.add(item.question.id);
  }

  for (const item of scored) {
    if (selected.length >= count) break;
    if (!pickedIds.has(item.question.id)) selected.push(item.question);
  }

  return shuffled(selected.slice(0, count));
}

export function normalizeTestAnswer(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s　。．、，,.・]/g, "").trim();
}

export function gradeWeeklyAnswers(questions: WeeklyQuestion[], answers: Record<string, string>) {
  const grades: Record<string, boolean> = {};
  let correct = 0;
  for (const question of questions) {
    const expected = normalizeTestAnswer(question.answer);
    const actual = normalizeTestAnswer(String(answers[question.id] ?? ""));
    const isCorrect = actual.length > 0 && actual === expected;
    grades[question.id] = isCorrect;
    if (isCorrect) correct += 1;
  }
  return { grades, correct };
}

export function testEndTime(startsAt: string, durationMinutes: number) {
  return new Date(startsAt).getTime() + durationMinutes * 60_000;
}
