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
