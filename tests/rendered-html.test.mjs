import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("live study roster uses registered students and durable presence", async () => {
  const [page, matesRoute, presenceRoute, presenceHelper] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/study-mates/route.ts", root), "utf8"),
    readFile(new URL("app/api/study-presence/route.ts", root), "utf8"),
    readFile(new URL("lib/study-presence.ts", root), "utf8"),
  ]);

  assert.match(page, /みんなの今日が、動いてる。/);
  assert.match(page, /登録メンバーだけを、実際の学習状態と時間で表示します。/);
  assert.doesNotMatch(page, /const liveStudyMates/);
  assert.match(page, /15_000/);
  assert.match(page, /navigator\.sendBeacon\("\/api\/study-presence"/);
  assert.match(matesRoute, /LEFT JOIN study_presence/);
  assert.match(matesRoute, /studied_today/);
  assert.match(presenceRoute, /saveStudyPresence/);
  assert.match(presenceHelper, /CREATE TABLE IF NOT EXISTS study_presence/);
  assert.match(presenceHelper, /MAX\(study_presence\.active_seconds, excluded\.active_seconds\)/);
});

test("practice and timer activity contribute to the same live session", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /view === "practice" && practicePhase === "questions"/);
  assert.match(page, /view === "weekly-test" && weeklyStarted/);
  assert.match(page, /status === "studying"/);
  assert.match(page, /formatJstStartTime/);
  assert.match(page, /freeStudyAction === "juku"/);
  assert.ok(
    page.indexOf("const reportFocusSeconds") < page.indexOf("focusSeconds: reportFocusSeconds"),
    "focus totals must be initialized before the live-roster synchronization hook",
  );
});

test("practice start stays open until a complete 20-question set loads", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /const seenIds = authUser \? \[\] : readSeenQuestionIds/);
  assert.match(page, /data\.questions\.length !== QUESTIONS_PER_SET/);
  assert.match(page, /setPracticeStartError\("問題を読み込めませんでした/);
  assert.match(page, /setTimerPromptSubject\(null\);\s*changeView\("practice"\)/);
  assert.doesNotMatch(page, /setTimerPromptSubject\(null\); void startSubjectPractice/);
});

test("ranking is calculated from durable student records", async () => {
  const [page, rankingsRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/rankings/route.ts", root), "utf8"),
  ]);

  assert.doesNotMatch(page, /const leaderboard/);
  assert.doesNotMatch(page, /昨日より 1 UP/);
  assert.match(page, /\/api\/rankings\?period=/);
  assert.match(page, /myRanking\?\.rank/);
  assert.match(rankingsRoute, /SUM\(focus_seconds\)/);
  assert.match(rankingsRoute, /SUM\(questions_solved\)/);
  assert.match(rankingsRoute, /student_login_days/);
  assert.match(rankingsRoute, /score === previousScore \? previousRank : index \+ 1/);
});

test("practice grading and mistake reviews are persisted idempotently in D1", async () => {
  const [page, recordsRoute, recordsHelper, schema] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/study-records/route.ts", root), "utf8"),
    readFile(new URL("lib/study-records.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);

  assert.match(page, /action: "attempt-batch"/);
  assert.match(page, /fetch\("\/api\/study-records", \{ cache: "no-store" \}\)/);
  assert.match(page, /source: "practice"/);
  assert.match(page, /"mistake-review"/);
  assert.match(recordsRoute, /recordPracticeAttemptBatch/);
  assert.match(recordsHelper, /practice_attempt_batches/);
  assert.match(recordsHelper, /date\(attempted_at, '\+9 hours'\)/);
  assert.match(schema, /practiceAttemptBatches/);
});

test("every practice subject keeps a 20-question duplicate-free supply", async () => {
  const route = await readFile(new URL("app/api/practice-questions/route.ts", root), "utf8");
  assert.match(route, /while \(pool\.length < 1000/);
  assert.match(route, /return pool\.slice\(0, 1000\)/);
  assert.match(route, /generated-v2-/);
  assert.match(route, /returnedQuestions\.length < count/);
  assert.match(route, /oldestDelivered\.slice\(0, count - returnedQuestions\.length\)/);
  assert.match(route, /poolSize: source\.length/);
  assert.match(route, /complete: returnedQuestions\.length === count/);
});

test("focus, leave and juku time survive navigation without inflating verified study", async () => {
  const [page, guardianRoute, presenceHelper, guardianHelper] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/guardian-report/route.ts", root), "utf8"),
    readFile(new URL("lib/study-presence.ts", root), "utf8"),
    readFile(new URL("lib/guardian-reports.ts", root), "utf8"),
  ]);

  assert.match(page, /const jukuModeActive = stopwatchRunning && freeStudyAction === "juku"/);
  assert.match(page, /!jukuModeActive/);
  assert.match(page, /finishAwayPeriod/);
  assert.match(page, /stateUpdatedAtMs: Date\.now\(\)/);
  assert.match(page, /Math\.floor\(\(now - focusLastTickAtRef\.current\) \/ 1000\)/);
  assert.match(presenceHelper, /study_session_totals/);
  assert.match(presenceHelper, /presence\.mode === "塾"/);
  assert.match(presenceHelper, /is_juku = 0/);
  assert.match(guardianRoute, /studentDailyFocusSeconds/);
  assert.match(guardianRoute, /MAX\(daily_summaries\.focus_seconds, excluded\.focus_seconds\)/);
  assert.match(guardianRoute, /state_updated_at_ms >= daily_away_stats\.state_updated_at_ms/);
  assert.match(guardianHelper, /state_updated_at_ms INTEGER NOT NULL DEFAULT 0/);
});
