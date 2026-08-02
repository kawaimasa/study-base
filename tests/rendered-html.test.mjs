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
  assert.match(page, /登録\{studyMateSummary\.registeredCount\}人・今日取り組んだ人/);
  assert.match(page, /登録された名前と今日の学習状況を表示します/);
  assert.doesNotMatch(page, /const liveStudyMates/);
  assert.match(page, /15_000/);
  assert.match(page, /navigator\.sendBeacon\("\/api\/study-presence"/);
  assert.match(matesRoute, /ranked_live_presence/);
  assert.match(matesRoute, /ROW_NUMBER\(\) OVER/);
  assert.match(matesRoute, /CASE WHEN status = 'studying' THEN 0 ELSE 1 END/);
  assert.match(matesRoute, /LEFT JOIN live_presence/);
  assert.match(matesRoute, /studied_today/);
  assert.match(matesRoute, /FROM device_users u/);
  assert.match(matesRoute, /students,/);
  assert.doesNotMatch(matesRoute, /students: students\.filter/);
  assert.match(matesRoute, /registeredCount: students\.length/);
  assert.match(matesRoute, /studyingCount: students\.filter/);
  assert.match(matesRoute, /study_session_totals/);
  assert.match(matesRoute, /practice_attempts/);
  assert.doesNotMatch(matesRoute, /LIMIT 6\b/);
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
  assert.match(rankingsRoute, /SUM\(MAX\(COALESCE\(sf\.focus_seconds/);
  assert.match(rankingsRoute, /SUM\(MAX\(COALESCE\(a\.questions_solved/);
  assert.match(rankingsRoute, /study_session_totals/);
  assert.match(rankingsRoute, /practice_attempts/);
  assert.match(rankingsRoute, /FROM device_users u/);
  assert.match(rankingsRoute, /student_login_days/);
  assert.match(rankingsRoute, /score === previousScore \? previousRank : index \+ 1/);
  assert.doesNotMatch(rankingsRoute, /displayName: `仲間\$\{index \+ 1\}`/);
  assert.doesNotMatch(rankingsRoute, /publicEntries/);
  assert.match(rankingsRoute, /entries,/);
});

test("practice grading and mistake reviews are persisted idempotently in D1", async () => {
  const [page, recordsRoute, recordsHelper, schema, weeklyAdminRoute, weeklyHelper, adminPage] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/study-records/route.ts", root), "utf8"),
    readFile(new URL("lib/study-records.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/api/weekly-tests-admin/route.ts", root), "utf8"),
    readFile(new URL("lib/weekly-tests.ts", root), "utf8"),
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
  ]);

  assert.match(page, /action: "attempt-batch"/);
  assert.match(page, /fetch\("\/api\/study-records", \{ cache: "no-store" \}\)/);
  assert.match(page, /source: "practice"/);
  assert.match(page, /"mistake-review"/);
  assert.match(recordsRoute, /recordPracticeAttemptBatch/);
  assert.doesNotMatch(recordsRoute, /LIMIT 500/);
  assert.doesNotMatch(page, /setReviewQueue\(parsedQueue[\s\S]{0,120}slice\(0, 500\)/);
  assert.doesNotMatch(page, /nextQueue = result === "again"[\s\S]{0,100}slice\(0, 500\)/);
  assert.match(recordsHelper, /practice_attempt_batches/);
  assert.doesNotMatch(recordsHelper, /question_deliveries[\s\S]{0,160}question_json/);
  assert.doesNotMatch(recordsHelper, /delivered_count/);
  assert.match(recordsHelper, /date\(attempted_at, '\+9 hours'\)/);
  assert.match(recordsHelper, /CREATE TABLE IF NOT EXISTS question_catalog/);
  assert.match(recordsHelper, /JSON\.stringify\(question\.payload\)/);
  assert.match(schema, /practiceAttemptBatches/);
  assert.match(schema, /questionCatalog/);
  assert.match(weeklyAdminRoute, /a\.result = 'correct'/);
  assert.match(weeklyAdminRoute, /LEFT JOIN question_catalog/);
  assert.match(weeklyAdminRoute, /correctCandidateCount/);
  assert.match(weeklyHelper, /selectWeeklyQuestionsFromCandidates/);
  assert.match(adminPage, /questionSource: testQuestionSource/);
  assert.match(adminPage, /過去7日間に正解した問題/);
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

test("English bank contains 50 complete sets of genuinely unique questions", async () => {
  const questions = JSON.parse(await readFile(new URL("public/data/english.json", root), "utf8"));
  const normalize = (value) => String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const categories = new Map();
  for (const question of questions) categories.set(question.category, (categories.get(question.category) ?? 0) + 1);

  assert.equal(questions.length, 1000);
  assert.equal(new Set(questions.map(({ id }) => id)).size, 1000);
  assert.equal(new Set(questions.map(({ question }) => normalize(question))).size, 1000);
  assert.equal(new Set(questions.map(({ batch }) => batch)).size, 50);
  assert.deepEqual(Object.fromEntries(categories), {
    "語彙": 150,
    "文法": 150,
    "語形変化": 100,
    "並べ替え": 150,
    "空所補充": 100,
    "英作文": 100,
    "会話": 100,
    "読解": 150,
  });
  for (let batch = 1; batch <= 50; batch += 1) {
    const set = questions.filter((question) => question.batch === batch);
    assert.equal(set.length, 20, `set ${batch} must contain exactly 20 questions`);
    assert.equal(new Set(set.map(({ category }) => category)).size, 8, `set ${batch} must mix all eight formats`);
  }
  assert.ok(questions.every(({ id }) => id.startsWith("EN3-")), "new ids must not collide with previously delivered English questions");
});

test("Japanese and Math banks contain 50 balanced, duplicate-free entrance-exam sets", async () => {
  const [japanese, math] = await Promise.all([
    readFile(new URL("public/data/kokugo.json", root), "utf8").then(JSON.parse),
    readFile(new URL("public/data/math.json", root), "utf8").then(JSON.parse),
  ]);
  const normalize = (value) => String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const expected = [
    {
      name: "Japanese",
      questions: japanese,
      prefix: "JP3-",
      categories: { "漢字": 200, "語句": 150, "文法": 150, "古典": 100, "表現": 100, "読解": 200, "作文": 100 },
      categoriesPerSet: 7,
    },
    {
      name: "Math",
      questions: math,
      prefix: "MA3-",
      categories: { "数と式": 150, "方程式": 150, "関数": 150, "図形": 250, "資料": 50, "確率": 50, "活用": 100, "証明": 50, "思考": 50 },
      categoriesPerSet: 9,
    },
  ];

  for (const bank of expected) {
    const counts = new Map();
    for (const question of bank.questions) counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
    assert.equal(bank.questions.length, 1000, `${bank.name} must contain 1000 questions`);
    assert.equal(new Set(bank.questions.map(({ id }) => id)).size, 1000, `${bank.name} ids must be unique`);
    assert.equal(new Set(bank.questions.map(({ question }) => normalize(question))).size, 1000, `${bank.name} prompts must be unique`);
    assert.deepEqual(Object.fromEntries(counts), bank.categories);
    assert.ok(bank.questions.every(({ id }) => id.startsWith(bank.prefix)), `${bank.name} must use the rebuilt id namespace`);
    for (let batch = 1; batch <= 50; batch += 1) {
      const set = bank.questions.filter((question) => question.batch === batch);
      assert.equal(set.length, 20, `${bank.name} set ${batch} must contain exactly 20 questions`);
      assert.equal(new Set(set.map(({ category }) => category)).size, bank.categoriesPerSet, `${bank.name} set ${batch} must keep its subject balance`);
    }
  }

  assert.ok(japanese.filter(({ category }) => category === "読解").every(({ question }) => question.length >= 170), "Japanese reading passages must have enough context to assess comprehension");
  assert.ok(math.every(({ question, answer }) => !/y=1x/.test(`${question} ${answer}`)), "Math formulas must use natural coefficient notation");
  assert.ok(math.every(({ answer }) => !/\d+\.\d{5,}/.test(answer)), "Math answers must not expose floating-point artifacts");
});

test("Science and Social Studies contain balanced, mixed-format entrance-exam sets", async () => {
  const [questions, practiceRoute] = await Promise.all([
    readFile(new URL("app/question-bank.json", root), "utf8").then(JSON.parse),
    readFile(new URL("app/api/practice-questions/route.ts", root), "utf8"),
  ]);
  const normalize = (value) => String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const template = (value) => normalize(value).replace(/[0-9０-９]+(?:\.[0-9]+)?/g, "#");
  const expected = [
    { subject: "理科", prefix: "SC3-", categories: { "生物": 250, "化学": 250, "物理": 250, "地学": 250 }, categoriesPerSet: 4 },
    { subject: "社会", prefix: "SO3-", categories: { "地理": 350, "歴史": 400, "公民": 250 }, categoriesPerSet: 3 },
  ];

  assert.equal(questions.length, 2000);
  assert.equal(new Set(questions.map(({ id }) => id)).size, 2000);
  assert.equal(new Set(questions.map(({ question }) => normalize(question))).size, 2000);
  assert.ok(questions.every(({ question, answer, explanation, kind }) => question && answer && explanation && kind));
  assert.ok(questions.every(({ question }) => !/確認\d+|小テスト：|復習問題：/.test(question)), "cosmetic duplicate labels must not return");

  for (const bank of expected) {
    const subjectQuestions = questions.filter(({ subject }) => subject === bank.subject);
    const counts = new Map();
    for (const question of subjectQuestions) counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
    assert.equal(subjectQuestions.length, 1000);
    assert.deepEqual(Object.fromEntries(counts), bank.categories);
    assert.ok(subjectQuestions.every(({ id }) => id.startsWith(bank.prefix)));
    assert.ok(new Set(subjectQuestions.map(({ kind }) => kind)).size >= 25, `${bank.subject} must mix at least 25 task formats`);
    const unitCounts = new Map();
    const templateCounts = new Map();
    for (const question of subjectQuestions) {
      unitCounts.set(question.unit, (unitCounts.get(question.unit) ?? 0) + 1);
      const key = template(question.question);
      templateCounts.set(key, (templateCounts.get(key) ?? 0) + 1);
    }
    assert.ok(Math.max(...unitCounts.values()) <= 60, `${bank.subject} must not concentrate more than 60 questions in one unit`);
    assert.ok(Math.max(...templateCounts.values()) <= 35, `${bank.subject} must not repeat one numeric template more than 35 times`);
    for (let batch = 1; batch <= 50; batch += 1) {
      const set = subjectQuestions.filter((question) => question.batch === batch);
      assert.equal(set.length, 20, `${bank.subject} set ${batch} must contain exactly 20 questions`);
      assert.equal(new Set(set.map(({ category }) => category)).size, bank.categoriesPerSet);
    }
  }

  assert.match(practiceRoute, /const balancedCells/);
  assert.match(practiceRoute, /\["生物", "基本", 2\]/);
  assert.match(practiceRoute, /\["地理", "標準", 4\]/);
  assert.match(practiceRoute, /function takeBalancedQuestions/);
  assert.match(practiceRoute, /function takeBalancedMixed/);
  assert.match(practiceRoute, /takeBalancedQuestions\(filteredSource\.slice\(start\), subject, count, randomSeed\)/);
});

test("focus, leave and juku time survive navigation without inflating verified study", async () => {
  const [page, guardianRoute, presenceHelper, guardianHelper] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/guardian-report/route.ts", root), "utf8"),
    readFile(new URL("lib/study-presence.ts", root), "utf8"),
    readFile(new URL("lib/guardian-reports.ts", root), "utf8"),
  ]);

  assert.match(page, /const jukuModeActive = stopwatchRunning && freeStudyAction === "juku"/);
  assert.match(page, /const problemSolvingActive =/);
  assert.match(page, /const jukuNonProblemAway = jukuModeActive && !problemSolvingActive/);
  assert.match(page, /if \(jukuNonProblemAway\) \{\s*startAwayPeriod\(true\)/);
  assert.match(page, /const APP_SWITCH_BLUR_WINDOW_MS = 2_000/);
  assert.match(page, /window\.addEventListener\("blur", handleWindowBlur\)/);
  assert.match(page, /const handleWindowBlur = \(\) => \{[\s\S]*startAwayPeriod\(jukuModeActive\)/);
  assert.match(page, /window\.addEventListener\("focus", handleWindowFocus\)/);
  assert.match(page, /const handleWindowFocus = \(\) => \{[\s\S]*finishAwayPeriod\(\)/);
  assert.match(page, /const \[audioCheckRequired, setAudioCheckRequired\] = useState\(false\)/);
  assert.match(page, /startAwayPeriod\(jukuModeActive\);\s*requireAudioCheck\(\)/);
  assert.match(page, /else if \(!audioCheckRequiredRef\.current\) finishAwayPeriod\(\)/);
  assert.match(page, /音楽を止めた・集中を再開/);
  assert.match(page, /この確認中の時間は集中時間に入らず、離脱時間として記録されます/);
  assert.match(page, /Date\.now\(\) - lastWindowBlurAtRef\.current <= APP_SWITCH_BLUR_WINDOW_MS/);
  assert.match(page, /画面オフは離脱に数えません/);
  assert.match(page, /問題画面だけを学習中とし/);
  assert.match(page, /!jukuModeActive/);
  assert.match(page, /finishAwayPeriod/);
  assert.match(page, /stateUpdatedAtMs: Date\.now\(\)/);
  assert.match(page, /Math\.floor\(\(now - focusLastTickAtRef\.current\) \/ 1000\)/);
  assert.match(page, /ACTIVE_STOPWATCH_STORAGE_KEY/);
  assert.match(page, /stopwatchRestoredForRef/);
  assert.match(page, /baseSeconds \+ elapsedSinceSave/);
  assert.match(page, /window\.addEventListener\("pagehide", handlePageHide\)/);
  assert.match(presenceHelper, /study_session_totals/);
  assert.match(presenceHelper, /presence\.mode === "塾"/);
  assert.match(presenceHelper, /is_juku = 0/);
  assert.match(guardianRoute, /studentDailyFocusSeconds/);
  assert.match(guardianRoute, /MAX\(daily_summaries\.focus_seconds, excluded\.focus_seconds\)/);
  assert.match(guardianRoute, /state_updated_at_ms >= daily_away_stats\.state_updated_at_ms/);
  assert.match(guardianHelper, /state_updated_at_ms INTEGER NOT NULL DEFAULT 0/);
});

test("home shows today's live ranking instead of hiding ranking data behind the ranking tab", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /const homeRankingEntries = useMemo/);
  assert.match(page, /TODAY&apos;S RANKING/);
  assert.match(page, /今日の集中ランキング/);
  assert.match(page, /homeRankingEntries\.map/);
  assert.match(page, /setRankPeriod\("今日"\); changeView\("ranking"\)/);
});

test("practice drafts, active students and protected weekly tests survive real usage", async () => {
  const [page, deviceRoute, weeklyRoute, lineRoute, adminRoute, guardianHelper, adminPage] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/device-auth/route.ts", root), "utf8"),
    readFile(new URL("app/api/weekly-tests/route.ts", root), "utf8"),
    readFile(new URL("app/api/line-webhook/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin-dashboard/route.ts", root), "utf8"),
    readFile(new URL("lib/guardian-reports.ts", root), "utf8"),
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
  ]);

  assert.match(page, /PRACTICE_DRAFT_STORAGE_KEY/);
  assert.match(page, /PRACTICE_DRAFT_VERSION = 2/);
  assert.match(page, /function writeSeenQuestionKeys/);
  assert.match(page, /function questionKey\(question: Question\)/);
  assert.match(page, /practiceSaveInFlightRef/);
  assert.match(page, /if \(!saveResult\.duplicate\)/);
  assert.match(page, /questions\.length !== QUESTIONS_PER_SET/);
  assert.match(page, /practiceLoadInFlightRef/);
  assert.match(deviceRoute, /WHERE is_active = 1/);
  assert.match(deviceRoute, /この生徒は停止中です/);
  assert.match(weeklyRoute, /if \(now >= end\)/);
  assert.match(weeklyRoute, /existing\?\.status !== "in_progress"/);
  assert.match(lineRoute, /pairing_used_at IS NULL/);
  assert.match(lineRoute, /datetime\(pairing_expires_at\) > CURRENT_TIMESTAMP/);
  assert.match(adminRoute, /action === "student-status"/);
  assert.match(adminRoute, /linePushConfigured: Boolean\(runtime\.LINE_CHANNEL_ACCESS_TOKEN\)/);
  assert.match(adminPage, /LINE接続/);
  assert.match(guardianHelper, /INNER JOIN device_users u ON u\.id = p\.student_id AND u\.is_active = 1/);
  assert.match(guardianHelper, /ensureStudyPresenceTable\(env\.DB\)/);
  assert.match(guardianHelper, /ensureStudyRecordTables\(env\.DB\)/);
});
