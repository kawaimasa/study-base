"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type View = "home" | "practice" | "mistakes" | "weekly-test" | "timer" | "ranking";
type Question = {
  id: string;
  subject: string;
  unit: string;
  difficulty: string;
  question: string;
  answer: string;
  explanation: string;
};
type StudySubject = "国語" | "数学" | "英語" | "理科" | "社会" | "理社ミックス";

type TodayScore = {
  date: string;
  correct: number;
  total: number;
};

type TodayFocus = {
  date: string;
  focusSeconds: number;
};

type TodayAwayStats = {
  date: string;
  awaySeconds: number;
  awayCount: number;
  idleSeconds: number;
  idleCount: number;
  jukuAwaySeconds: number;
  jukuAwayCount: number;
  awayStartedAt?: number | null;
  awayAtJuku?: boolean;
  stateUpdatedAtMs?: number;
};

type SubjectProgressMap = Record<Exclude<StudySubject, "理社ミックス">, number>;

type AuthUser = {
  id: string;
  displayName: string;
};

type FreeStudySession = {
  id: string;
  action: string;
  plan: string;
  result: string;
  seconds: number;
  awaySeconds: number;
  idleSeconds: number;
  jukuAwaySeconds: number;
  savedAt: string;
};

type RegisteredStudyMate = {
  id: string;
  displayName: string;
  focusSeconds: number;
  questionsSolved: number;
  isMe: boolean;
  status: "studying" | "away" | "studied_today" | "not_started";
  mode: string;
  subject: string;
  detail: string;
  startedAtMs: number;
  activeSeconds: number;
};

type RankingEntry = {
  id: string;
  displayName: string;
  rank: number;
  focusSeconds: number;
  questionsSolved: number;
  streak: number;
  isMe: boolean;
};

type FreeStudyAction = { key: string; label: string };

function toGivenNameOnly(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.split(" ").at(-1)!.slice(0, 20);
}

type WeeklyTestQuestion = {
  id: string;
  subject: string;
  unit: string;
  difficulty: string;
  question: string;
};

type WeeklyResultQuestion = WeeklyTestQuestion & {
  answer: string;
  explanation: string;
  studentAnswer: string;
  correct: boolean;
};

type WeeklySubmission = {
  status: "in_progress" | "submitted";
  answers: Record<string, string>;
  correctAnswers: number;
  totalQuestions: number;
  awaySeconds: number;
  resultQuestions: WeeklyResultQuestion[];
};

type WeeklyTestData = {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  questionCount: number;
  subjects: string[];
  kind: "active" | "upcoming" | "ended";
  questions: WeeklyTestQuestion[];
  submission: WeeklySubmission | null;
};

const TODAY_SCORE_STORAGE_KEY = "study-base-today-score";
const TODAY_FOCUS_STORAGE_KEY = "study-base-today-focus";
const TODAY_AWAY_STORAGE_KEY = "study-base-today-away";
const SUBJECT_PROGRESS_STORAGE_KEY = "study-base-subject-progress";
const LOGIN_DAYS_STORAGE_KEY = "study-base-login-days";
const REVIEW_QUEUE_STORAGE_KEY = "study-base-review-queue";
const FREE_STUDY_SESSIONS_STORAGE_KEY = "study-base-free-study-sessions";
const ACTIVE_STOPWATCH_STORAGE_KEY = "study-base-active-stopwatch";
const ACTIVE_STOPWATCH_VERSION = 1;
const PRACTICE_DRAFT_STORAGE_KEY = "study-base-practice-draft";
// Version 2 invalidates incomplete drafts created by the old duplicated
// English bank, including the 19-question set that could not be resumed.
const PRACTICE_DRAFT_VERSION = 2;
const QUESTIONS_PER_SUBJECT = 1000;
const QUESTIONS_PER_SET = 20;
const PRACTICE_TIMER_MAX_MINUTES = 15;
const PRACTICE_TIMER_DEFAULT_MINUTES = 15;
const PRACTICE_TIMER_OPTIONS = [5, 10, 15];
const FOCUS_TIMER_OPTIONS = [15, 30, 60, 90];
const FREE_STUDY_ACTIONS: FreeStudyAction[] = [
  { key: "school-work", label: "学校ワーク" },
  { key: "juku", label: "塾" },
  { key: "juku-material", label: "塾教材" },
  { key: "memorize", label: "暗記" },
  { key: "notes", label: "ノートまとめ" },
  { key: "past-exam", label: "過去問" },
  { key: "other", label: "その他" },
];
const IDLE_WARNING_SECONDS = 90;
const APP_SWITCH_BLUR_WINDOW_MS = 2_000;
const STUDENT_LOCK_START_HOUR = 0;
const STUDENT_LOCK_END_HOUR = 5;
const mistakeSubjectFilters = ["すべて", "国語", "数学", "英語", "理科", "社会"] as const;
type MistakeSubjectFilter = (typeof mistakeSubjectFilters)[number];
const DAILY_STREAK_MESSAGES = [
  "続けた日々が、自信になる。",
  "昨日の自分を、ちょっと越えよう。",
  "1問の前進が、未来を変える。",
  "今日の本気は、明日の自信。",
  "続ける君は、ちゃんと強い。",
  "できないは、伸びしろの合図。",
  "迷ったら、まず10分だけ。",
  "小さな一歩も、合格への一歩。",
  "今日の努力は、裏切らない。",
  "焦らなくていい。止まらなければいい。",
  "やる気は、始めたあとについてくる。",
  "未来の君が、今日の君を待っている。",
  "その20問が、明日の差になる。",
  "昨日より1ミリ、前へ。",
  "本気で向き合う君は、かっこいい。",
  "積み重ねは、最強の才能。",
  "今日も机に向かった。それがすごい。",
  "失敗した分だけ、答えに近づく。",
  "君のペースで、ちゃんと進める。",
  "あと1問が、君を強くする。",
  "努力は、見えないところで育ってる。",
  "『できた！』を、今日もひとつ。",
  "青春も受験も、どっちも本気。",
  "ここからの一歩が、未来を変える。",
  "今日の自分に、負けない日にしよう。",
  "休んでもいい。また始めればいい。",
  "自分を信じる材料を、今日つくろう。",
  "その集中、ちゃんと力になる。",
  "いま頑張る君は、もう昨日より強い。",
  "一歩ずつなら、どこまででも行ける。",
  "今日の挑戦に、拍手。",
] as const;

function isValidPracticeQuestion(value: unknown): value is Question {
  if (!value || typeof value !== "object") return false;
  const question = value as Record<string, unknown>;
  return ["id", "subject", "unit", "difficulty", "question", "answer", "explanation"]
    .every((field) => typeof question[field] === "string" && String(question[field]).trim().length > 0);
}

function shuffleQuestions(questions: Question[]) {
  const shuffled = [...questions];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function questionTextKey(question: Question) {
  return cleanQuestionText(question.question).replace(/\s+/g, " ").trim().toLowerCase();
}

function createDuplicateFreeChunks(source: Question[], chunkSize: number) {
  const chunkCount = Math.ceil(source.length / chunkSize);
  const chunks = Array.from({ length: chunkCount }, (_, index) => ({ index, items: [] as Array<{ question: Question; order: number }> }));
  const groups = new Map<string, Array<{ question: Question; order: number }>>();

  source.forEach((question, order) => {
    const key = questionTextKey(question);
    const group = groups.get(key) ?? [];
    group.push({ question, order });
    groups.set(key, group);
  });

  const orderedGroups = [...groups.values()].sort((left, right) => right.length - left.length);
  orderedGroups.forEach((group, groupIndex) => {
    const candidates = chunks
      .filter((chunk) => chunk.items.length < chunkSize)
      .sort((left, right) => left.items.length - right.items.length || ((left.index - groupIndex + chunkCount) % chunkCount) - ((right.index - groupIndex + chunkCount) % chunkCount));

    group.forEach((item, itemIndex) => {
      candidates[itemIndex]?.items.push(item);
    });
  });

  return chunks
    .filter((chunk) => chunk.items.length > 0)
    .sort((left, right) => {
      const leftAverage = left.items.reduce((sum, item) => sum + item.order, 0) / left.items.length;
      const rightAverage = right.items.reduce((sum, item) => sum + item.order, 0) / right.items.length;
      return leftAverage - rightAverage;
    })
    .flatMap((chunk) => chunk.items.sort((left, right) => left.order - right.order).map(({ question }) => question));
}

function createBalancedMixedSequence(source: Question[]) {
  const scienceQuestions = createDuplicateFreeChunks(shuffleQuestions(source.filter((question) => question.subject === "理科")), 10);
  const socialQuestions = createDuplicateFreeChunks(shuffleQuestions(source.filter((question) => question.subject === "社会")), 10);
  const randomizedSequence: Question[] = [];
  const totalSets = Math.ceil(source.length / QUESTIONS_PER_SET);

  for (let setIndex = 0; setIndex < totalSets; setIndex++) {
    const subjectStart = setIndex * 10;
    randomizedSequence.push(
      ...scienceQuestions.slice(subjectStart, subjectStart + 10),
      ...socialQuestions.slice(subjectStart, subjectStart + 10),
    );
  }

  return randomizedSequence;
}

function createLevel55Sequence(source: Question[]) {
  const difficultyRank: Record<string, number> = { "基本": 0, "標準": 1, "入試基礎": 2 };
  const orderedQuestions = source
    .map((question) => ({ question, score: (difficultyRank[question.difficulty] ?? 1) * 700 + Math.random() * 1400 }))
    .sort((a, b) => a.score - b.score)
    .map(({ question }) => question);
  return createDuplicateFreeChunks(orderedQuestions, QUESTIONS_PER_SET);
}

function getLocalDateKey(date = new Date()) {
  return getJstDateKey(date.getTime());
}

function getJstDateKey(timestamp = Date.now()) {
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getJstHour(timestamp = Date.now()) {
  return new Date(timestamp + 9 * 60 * 60 * 1000).getUTCHours();
}

function isStudentLockedByTime(timestamp = Date.now()) {
  const hour = getJstHour(timestamp);
  return hour >= STUDENT_LOCK_START_HOUR && hour < STUDENT_LOCK_END_HOUR;
}

function getDailyStreakMessage(dateKey: string) {
  const dayNumber = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
  return DAILY_STREAK_MESSAGES[dayNumber % DAILY_STREAK_MESSAGES.length];
}

function userStorageKey(baseKey: string, userId: string) {
  return `${baseKey}:${userId}`;
}

function practiceSeenQuestionStorageKey(userId: string, subject: string) {
  return userStorageKey(`study-base-seen-questions:${subject}`, userId);
}

function practiceSeenQuestionKeyStorageKey(userId: string, subject: string) {
  return userStorageKey(`study-base-seen-question-keys:${subject}`, userId);
}

function normalizeQuestionKey(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function readSeenQuestionIds(userId: string, subject: string) {
  try {
    const raw = window.localStorage.getItem(practiceSeenQuestionStorageKey(userId, subject));
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [] as string[];
  }
}

function readSeenQuestionKeys(userId: string, subject: string) {
  try {
    const raw = window.localStorage.getItem(practiceSeenQuestionKeyStorageKey(userId, subject));
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [] as string[];
  }
}

function writeSeenQuestionIds(userId: string, subject: string, ids: Iterable<string>) {
  try {
    window.localStorage.setItem(practiceSeenQuestionStorageKey(userId, subject), JSON.stringify([...new Set(ids)]));
  } catch {
    // Best-effort only.
  }
}

function writeSeenQuestionKeys(userId: string, subject: string, keys: Iterable<string>) {
  try {
    window.localStorage.setItem(practiceSeenQuestionKeyStorageKey(userId, subject), JSON.stringify([...new Set(keys)]));
  } catch {
    // Best-effort only. Authenticated history remains durable in D1.
  }
}

function questionKey(question: Question) {
  return normalizeQuestionKey(question.question);
}

function cleanQuestionText(text: string | undefined) {
  const cleaned = text
    ?.replace(/（確認\d+）/g, "")
    .replace(/^小テスト：/g, "")
    .replace(/^確認問題：(.+?)について正しく説明しなさい。/g, "$1について、正しく説明しなさい。")
    .replace(/^復習問題：「([^」]+)」の要点を答えなさい。/g, "次の語句について、要点を答えなさい。\n$1")
    .replace(/^入試基礎：.+?で「([^」]+)」と説明される語句は何ですか。/g, "次の説明が表す語句を答えなさい。\n$1")
    .replace(/^(.+?)の重要語句です。「([^」]+)」に当てはまるものは何ですか。/g, "次の説明が表す語句を答えなさい。\n$2")
    .replace(/^次の説明に当てはまる語句を答えなさい。\n「([^」]+)」/g, "次の説明が表す語句を答えなさい。\n$1")
    .replace(/^次の説明に当てはまる語句を答えなさい。/g, "次の説明が表す語句を答えなさい。")
    .replace(/^次の説明に当てはまる用語は何ですか。\n?/g, "次の説明が表す用語を答えなさい。\n")
    .replace(/^「([^」]+)」とは何か、最も適切な説明を答えなさい。/g, "$1について、最も適切な説明を答えなさい。")
    .replace(/^「([^」]+)」の意味を、短く説明しなさい。/g, "$1の意味を、短く説明しなさい。")
    .replace(/「([^」]+)」に当てはまるものは何ですか。/g, "次の説明が表すものを答えなさい。\n$1")
    .trim();
  return cleaned ?? "";
}

const subjects: Array<{ key: Exclude<StudySubject, "理社ミックス">; icon: string; color: string; progress: number; label: string }> = [
  { key: "国語", icon: "あ", color: "coral", progress: 64, label: "漢字・文法・読解・古典｜1000問" },
  { key: "数学", icon: "∑", color: "blue", progress: 78, label: "計算・関数・図形・資料｜1000問" },
  { key: "英語", icon: "A", color: "purple", progress: 52, label: "語彙・文法・会話・読解｜1000問" },
  { key: "理科", icon: "⚗", color: "green", progress: 70, label: "生物・化学・物理・地学｜1000問" },
  { key: "社会", icon: "●", color: "yellow", progress: 46, label: "地理・歴史・公民｜1000問" },
];

const legacySubjectProgress = subjects.reduce((progress, subject) => ({
  ...progress,
  [subject.key]: Math.round((subject.progress / 100) * QUESTIONS_PER_SUBJECT),
}), {} as SubjectProgressMap);

const defaultSubjectProgress = subjects.reduce((progress, subject) => ({
  ...progress,
  [subject.key]: 0,
}), {} as SubjectProgressMap);

function isLegacySubjectProgress(value: SubjectProgressMap) {
  return subjects.every((subject) => value[subject.key] === legacySubjectProgress[subject.key]);
}

function normalizeSubjectProgress(value: unknown): SubjectProgressMap {
  const source = typeof value === "object" && value !== null ? value as Partial<Record<keyof SubjectProgressMap, unknown>> : {};
  return subjects.reduce((progress, subject) => ({
    ...progress,
    [subject.key]: Math.max(0, Math.min(QUESTIONS_PER_SUBJECT, Number(source[subject.key] ?? defaultSubjectProgress[subject.key]))),
  }), {} as SubjectProgressMap);
}

function subjectProgressPercent(solvedCount: number) {
  return Math.min(100, Math.round((solvedCount / QUESTIONS_PER_SUBJECT) * 100));
}

const questions = [
  { subject: "理科", unit: "生物 / 植物", question: "胚珠が子房に包まれている植物を何といいますか。", hint: "『被』には、おおわれているという意味があります。", answer: "被子植物", explanation: "被子植物では、受粉後に胚珠が種子に、子房が果実になります。" },
  { subject: "理科", unit: "生物 / 植物", question: "胚珠が子房に包まれず、むき出しになっている植物を何といいますか。", hint: "マツやイチョウが代表例です。", answer: "裸子植物", explanation: "裸子植物には子房がなく、胚珠がむき出しになっています。" },
  { subject: "理科", unit: "生物 / 植物", question: "道管と師管が集まった植物内の通り道を何といいますか。", hint: "『束』という漢字を使います。", answer: "維管束", explanation: "維管束は、水や養分を運ぶ道管と師管が集まった部分です。" },
  { subject: "理科", unit: "生物 / 植物", question: "根から吸収した水や無機養分が通る管は何ですか。", hint: "水を上へ導く管です。", answer: "道管", explanation: "道管は主に水と無機養分を根から茎、葉へ運びます。" },
  { subject: "理科", unit: "生物 / 植物", question: "葉でつくられた養分が通る管は何ですか。", hint: "維管束の外側にあることが多い管です。", answer: "師管", explanation: "師管は光合成でつくられた養分を植物の各部へ運びます。" },
  { subject: "理科", unit: "生物 / 植物", question: "植物の葉などから水が水蒸気として出ていく現象を何といいますか。", hint: "主に気孔から行われます。", answer: "蒸散", explanation: "蒸散によって根からの吸水も促されます。" },
  { subject: "理科", unit: "生物 / 植物", question: "植物が光を使い、二酸化炭素と水から養分をつくるはたらきは何ですか。", hint: "葉緑体で行われます。", answer: "光合成", explanation: "光合成では養分とともに酸素もつくられます。" },
  { subject: "理科", unit: "生物 / 呼吸", question: "酸素を使って養分からエネルギーを取り出すはたらきは何ですか。", hint: "植物も動物も昼夜を通して行います。", answer: "呼吸", explanation: "呼吸では養分が分解され、二酸化炭素と水が生じます。" },
  { subject: "理科", unit: "生物 / 植物", question: "葉の表皮にあり、気体の出入りや蒸散に関わる小さな穴は何ですか。", hint: "孔辺細胞に囲まれています。", answer: "気孔", explanation: "気孔は二酸化炭素や酸素、水蒸気の出入り口です。" },
  { subject: "理科", unit: "生物 / 植物", question: "シダ植物やコケ植物は、何をつくってなかまを増やしますか。", hint: "種子ではありません。", answer: "胞子", explanation: "シダ植物やコケ植物は胞子で増えます。" },
  { subject: "社会", unit: "地理 / 世界", question: "赤道を0度として、南北の位置を表す数値を何といいますか。", hint: "北〇・南〇と表します。", answer: "緯度", explanation: "緯度は赤道が0度で、南北それぞれ90度まであります。" },
  { subject: "社会", unit: "地理 / 世界", question: "本初子午線を0度として、東西の位置を表す数値を何といいますか。", hint: "東〇・西〇と表します。", answer: "経度", explanation: "経度は東西それぞれ180度まであります。" },
  { subject: "社会", unit: "地理 / 世界", question: "経度0度の基準となる経線を何といいますか。", hint: "旧グリニッジ天文台を通ります。", answer: "本初子午線", explanation: "本初子午線はイギリスの旧グリニッジ天文台を通ります。" },
  { subject: "社会", unit: "地理 / 世界", question: "地球上の2地点における標準時の差を何といいますか。", hint: "経度15度で原則1時間生じます。", answer: "時差", explanation: "地球は24時間で360度回転するため、経度15度で1時間の時差が生じます。" },
  { subject: "社会", unit: "地理 / 気候", question: "赤道周辺に広がり、年中気温が高い気候帯は何ですか。", hint: "熱帯雨林気候やサバナ気候があります。", answer: "熱帯", explanation: "熱帯は回帰線の間を中心に広がる高温な気候帯です。" },
  { subject: "社会", unit: "地理 / 気候", question: "降水量が少なく、樹木が育ちにくい気候帯は何ですか。", hint: "砂漠気候やステップ気候があります。", answer: "乾燥帯", explanation: "乾燥帯では蒸発量が降水量を上回る地域が多く見られます。" },
  { subject: "社会", unit: "地理 / 気候", question: "四季の変化が比較的明瞭で、日本の大部分が属する気候帯は何ですか。", hint: "熱帯と冷帯の間に広がります。", answer: "温帯", explanation: "日本の大部分は温帯の温暖湿潤気候に属します。" },
  { subject: "社会", unit: "地理 / 気候", question: "冬の寒さが厳しく、針葉樹林が広く見られる気候帯は何ですか。", hint: "亜寒帯とも呼ばれます。", answer: "冷帯", explanation: "冷帯は北半球の高緯度地域に広く分布します。" },
  { subject: "社会", unit: "地理 / アジア", question: "季節によって風向きが大きく変わる風を何といいますか。", hint: "モンスーンとも呼ばれます。", answer: "季節風", explanation: "季節風はアジア各地の降水や農業に大きく影響します。" },
  { subject: "社会", unit: "地理 / アジア", question: "熱帯地域などで、単一の商品作物を大規模に栽培する農園を何といいますか。", hint: "天然ゴムやカカオなどを生産します。", answer: "プランテーション", explanation: "プランテーションでは輸出向けの商品作物が大規模に栽培されます。" },
];

function formatStudyTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}時間${rest}分` : `${rest}分`;
}

function formatJstStartTime(timestamp: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatClock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatAwayTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}時間${minutes}分${seconds}秒`;
  return `${minutes}分${seconds}秒`;
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon-box" aria-hidden="true">{children}</span>;
}

function appendSeenQuestionIds(userId: string | null, subject: string | null, questions: Question[]) {
  if (!userId || !subject) return;
  const existing = readSeenQuestionIds(userId, subject);
  writeSeenQuestionIds(userId, subject, [...existing, ...questions.map((question) => question.id)]);
  const existingKeys = readSeenQuestionKeys(userId, subject);
  writeSeenQuestionKeys(userId, subject, [...existingKeys, ...questions.map((question) => normalizeQuestionKey(question.question))]);
}

export default function Home() {
  const [authStatus, setAuthStatus] = useState<"loading" | "setup" | "login" | "authenticated">("loading");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authPin, setAuthPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [view, setView] = useState<View>("home");
  const [selectedSubject, setSelectedSubject] = useState<StudySubject | null>(null);
  const [loadingSubject, setLoadingSubject] = useState<StudySubject | null>(null);
  const [setNumber, setSetNumber] = useState(1);
  const [questionSequence, setQuestionSequence] = useState<Question[]>([]);
  const [practiceTotalSets, setPracticeTotalSets] = useState(1);
  const [focusQuestions, setFocusQuestions] = useState<Question[]>([]);
  const [shuffleRound, setShuffleRound] = useState(1);
  const totalSets = practiceTotalSets;
  const activeQuestions = useMemo(
    () => questionSequence,
    [questionSequence],
  );
  const [practicePhase, setPracticePhase] = useState<"questions" | "review" | "complete">("questions");
  const [grades, setGrades] = useState<Array<"correct" | "wrong" | null>>(() => Array(QUESTIONS_PER_SET).fill(null));
  const [reviewQueue, setReviewQueue] = useState<Question[]>([]);
  const [mistakeSubject, setMistakeSubject] = useState<MistakeSubjectFilter>("すべて");
  const [revealedMistakeIds, setRevealedMistakeIds] = useState<Set<string>>(() => new Set());
  const [mistakeMessage, setMistakeMessage] = useState("");
  const [focusAnswerVisible, setFocusAnswerVisible] = useState(false);
  const [focusOffset, setFocusOffset] = useState(0);
  const [todayScore, setTodayScore] = useState<TodayScore>(() => ({
    date: getLocalDateKey(),
    correct: 0,
    total: 0,
  }));
  const [seconds, setSeconds] = useState(PRACTICE_TIMER_DEFAULT_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [challengeMinutes, setChallengeMinutes] = useState(PRACTICE_TIMER_DEFAULT_MINUTES);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [timerPromptSubject, setTimerPromptSubject] = useState<StudySubject | null>(null);
  const [timerPromptMinutes, setTimerPromptMinutes] = useState(PRACTICE_TIMER_DEFAULT_MINUTES);
  const [practiceStartError, setPracticeStartError] = useState("");
  const [practiceBatchId, setPracticeBatchId] = useState("");
  const [practiceSaving, setPracticeSaving] = useState(false);
  const [singleAttemptSaving, setSingleAttemptSaving] = useState(false);
  const [practiceSaveError, setPracticeSaveError] = useState("");
  const [subjectTimerEnabled, setSubjectTimerEnabled] = useState(false);
  const [timerMode, setTimerMode] = useState<"countdown" | "stopwatch">("countdown");
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [freeStudyAction, setFreeStudyAction] = useState<FreeStudyAction["key"]>(FREE_STUDY_ACTIONS[0].key);
  const [freeStudyPlan, setFreeStudyPlan] = useState("");
  const [freeStudyResult, setFreeStudyResult] = useState("");
  const [freeStudySessions, setFreeStudySessions] = useState<FreeStudySession[]>([]);
  const [awaySeconds, setAwaySeconds] = useState(0);
  const [awayCount, setAwayCount] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [idleCount, setIdleCount] = useState(0);
  const [jukuAwaySeconds, setJukuAwaySeconds] = useState(0);
  const [jukuAwayCount, setJukuAwayCount] = useState(0);
  const [awayStatsLoaded, setAwayStatsLoaded] = useState(false);
  const [baseTodayFocusSeconds, setBaseTodayFocusSeconds] = useState(0);
  const [trackedFocusSeconds, setTrackedFocusSeconds] = useState(0);
  const [subjectProgressCounts, setSubjectProgressCounts] = useState<SubjectProgressMap>(defaultSubjectProgress);
  const [guardianEnabled, setGuardianEnabled] = useState(false);
  const [rankPeriod, setRankPeriod] = useState<"今日" | "今週" | "今月">("今日");
  const [rankingRows, setRankingRows] = useState<RankingEntry[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [registeredStudyMates, setRegisteredStudyMates] = useState<RegisteredStudyMate[]>([]);
  const [presenceActiveSeconds, setPresenceActiveSeconds] = useState(0);
  const [seenQuestionIds, setSeenQuestionIds] = useState<Record<string, string[]>>({});
  const [loginDaysCount, setLoginDaysCount] = useState(1);
  const [dailyMessageDate, setDailyMessageDate] = useState(() => getJstDateKey());
  const [studentLocked, setStudentLocked] = useState(() => isStudentLockedByTime());
  const [weeklyTest, setWeeklyTest] = useState<WeeklyTestData | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const [weeklyAnswers, setWeeklyAnswers] = useState<Record<string, string>>({});
  const [weeklyNow, setWeeklyNow] = useState(Date.now());
  const [weeklyStarted, setWeeklyStarted] = useState(false);
  const [weeklyAwaySeconds, setWeeklyAwaySeconds] = useState(0);
  const [weeklySubmitting, setWeeklySubmitting] = useState(false);
  const [weeklyMessage, setWeeklyMessage] = useState("");
  const [statsDetail, setStatsDetail] = useState<"focus" | "solved" | null>(null);
  const timerSessionActive = timerMode === "countdown" ? running : stopwatchRunning;
  const sessionActive = !studentLocked && (timerSessionActive
    || (view === "practice" && practicePhase === "questions")
    || (view === "weekly-test" && weeklyStarted && weeklyTest?.kind === "active"));
  const jukuModeActive = stopwatchRunning && freeStudyAction === "juku";
  const problemSolvingActive = (view === "practice" && practicePhase === "questions")
    || view === "mistakes"
    || (view === "weekly-test" && weeklyStarted && weeklyTest?.kind === "active");
  const jukuNonProblemAway = jukuModeActive && !problemSolvingActive;
  const sessionActiveRef = useRef(sessionActive);
  const presenceSessionIdRef = useRef<string | null>(null);
  const presenceStartedAtRef = useRef(0);
  const presenceActiveSecondsRef = useRef(0);
  const presenceLastTickAtRef = useRef(Date.now());
  const awayStartedAtRef = useRef<number | null>(null);
  const lastWindowBlurAtRef = useRef(0);
  const lastStudyActionAtRef = useRef(Date.now());
  const idleActiveRef = useRef(false);
  const focusLastTickAtRef = useRef(Date.now());
  const countdownEndsAtRef = useRef<number | null>(null);
  const stopwatchStartedAtRef = useRef<number | null>(null);
  const stopwatchBaseSecondsRef = useRef(0);
  const stopwatchSecondsRef = useRef(0);
  const stopwatchRestoredForRef = useRef<string | null>(null);
  const stopwatchPersistenceReadyRef = useRef(false);
  const weeklyAwayStartedAtRef = useRef<number | null>(null);
  const weeklySubmittingRef = useRef(false);
  const practiceDraftRestoredForRef = useRef<string | null>(null);
  const practiceLoadInFlightRef = useRef(false);
  const practiceSaveInFlightRef = useRef(false);
  const awayStatsRef = useRef<TodayAwayStats>({
    date: getLocalDateKey(),
    awaySeconds: 0,
    awayCount: 0,
    idleSeconds: 0,
    idleCount: 0,
    jukuAwaySeconds: 0,
    jukuAwayCount: 0,
  });

  const persistAwayStats = (stats: TodayAwayStats, useBeacon = false) => {
    if (!authUser) return;
    try {
      window.localStorage.setItem(userStorageKey(TODAY_AWAY_STORAGE_KEY, authUser.id), JSON.stringify(stats));
    } catch {
      // The server copy below remains available when browser storage is unavailable.
    }
    const payload = JSON.stringify({ action: "away", summaryDate: stats.date, away: stats });
    if (useBeacon && typeof navigator.sendBeacon === "function") {
      try {
        navigator.sendBeacon("/api/guardian-report", new Blob([payload], { type: "application/json" }));
        return;
      } catch {
        // Use fetch as a fallback.
      }
    }
    void fetch("/api/guardian-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  };

  const finishAwayPeriod = () => {
    const startedAt = awayStartedAtRef.current;
    if (startedAt === null) return;
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const atJuku = Boolean(awayStatsRef.current.awayAtJuku);
    const nextAway: TodayAwayStats = {
      ...awayStatsRef.current,
      awaySeconds: awayStatsRef.current.awaySeconds + (atJuku ? 0 : elapsed),
      jukuAwaySeconds: awayStatsRef.current.jukuAwaySeconds + (atJuku ? elapsed : 0),
      awayStartedAt: null,
      awayAtJuku: false,
      stateUpdatedAtMs: Date.now(),
    };
    awayStatsRef.current = nextAway;
    awayStartedAtRef.current = null;
    setAwaySeconds(nextAway.awaySeconds);
    setJukuAwaySeconds(nextAway.jukuAwaySeconds);
    persistAwayStats(nextAway);
  };

  const startAwayPeriod = (atJuku: boolean) => {
    if (!sessionActiveRef.current || awayStartedAtRef.current !== null) return;
    awayStartedAtRef.current = Date.now();
    const current = awayStatsRef.current;
    const nextAway: TodayAwayStats = atJuku
      ? { ...current, jukuAwayCount: current.jukuAwayCount + 1, awayStartedAt: awayStartedAtRef.current, awayAtJuku: true, stateUpdatedAtMs: Date.now() }
      : { ...current, awayCount: current.awayCount + 1, awayStartedAt: awayStartedAtRef.current, awayAtJuku: false, stateUpdatedAtMs: Date.now() };
    awayStatsRef.current = nextAway;
    persistAwayStats(nextAway, true);
    if (atJuku) setJukuAwayCount(nextAway.jukuAwayCount);
    else setAwayCount(nextAway.awayCount);
  };

  const loadWeeklyTest = async () => {
    try {
      const response = await fetch("/api/weekly-tests", { cache: "no-store" });
      if (!response.ok) throw new Error("一斉テストを読み込めませんでした。");
      const data = await response.json() as { test: WeeklyTestData | null };
      setWeeklyTest(data.test);
      if (data.test?.submission) {
        setWeeklyAnswers((current) => Object.keys(current).length > 0 ? current : data.test!.submission!.answers ?? {});
        setWeeklyAwaySeconds((current) => Math.max(current, Number(data.test!.submission!.awaySeconds ?? 0)));
        setWeeklyStarted(data.test.submission.status === "in_progress");
      }
      setWeeklyMessage("");
    } catch (error) {
      setWeeklyMessage(error instanceof Error ? error.message : "一斉テストを読み込めませんでした。");
    } finally {
      setWeeklyLoading(false);
    }
  };

  useEffect(() => {
    void fetch("/api/device-auth")
      .then(async (response) => {
        if (!response.ok) throw new Error("ログイン状態を確認できませんでした。");
        return response.json();
      })
      .then((data) => {
        if (data.authenticated && data.user) {
          setAuthUser(data.user as AuthUser);
          setAuthStatus("authenticated");
          return;
        }
        setAuthDisplayName(String(data.displayName ?? ""));
        if (data.disabled) setAuthError("この生徒は停止中です。管理者に利用再開を依頼してください。");
        setAuthStatus(data.requiresSetup ? "setup" : "login");
      })
      .catch(() => {
        setAuthError("ログイン状態を確認できません。少し待ってから再読み込みしてください。");
        setAuthStatus("setup");
      });
  }, []);

  useEffect(() => {
    if (!authUser) return;
    setAwayStatsLoaded(false);
    try {
      const scopedKey = userStorageKey(LOGIN_DAYS_STORAGE_KEY, authUser.id);
      const savedDays = window.localStorage.getItem(scopedKey) ?? window.localStorage.getItem(LOGIN_DAYS_STORAGE_KEY);
      const parsedDays = savedDays ? JSON.parse(savedDays) : [];
      const daySet = new Set(Array.isArray(parsedDays) ? parsedDays.filter((value) => typeof value === "string") : []);
      daySet.add(getLocalDateKey());
      const nextDays = [...daySet].sort();
      window.localStorage.setItem(scopedKey, JSON.stringify(nextDays));
      setLoginDaysCount(Math.max(1, nextDays.length));
    } catch {
      setLoginDaysCount(1);
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    void loadWeeklyTest();
    const poller = window.setInterval(() => void loadWeeklyTest(), 15_000);
    return () => window.clearInterval(poller);
  }, [authUser]);

  useEffect(() => {
    const clock = window.setInterval(() => setWeeklyNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!authUser || !weeklyTest || weeklyTest.kind !== "active" || weeklyTest.submission?.status === "submitted") return;
    const storageKey = `weekly-test-answers:${weeklyTest.id}:${authUser.id}`;
    if (!weeklyTest.submission?.answers || Object.keys(weeklyTest.submission.answers).length === 0) {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) setWeeklyAnswers(JSON.parse(saved) as Record<string, string>);
      } catch {
        // The test can continue without a local draft.
      }
    }
    if (view !== "weekly-test" || weeklyStarted) return;
    setWeeklyStarted(true);
    void fetch("/api/weekly-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", testId: weeklyTest.id }),
    }).catch(() => setWeeklyMessage("開始記録を送信できませんでした。答案はそのまま続けられます。"));
  }, [authUser, view, weeklyStarted, weeklyTest]);

  useEffect(() => {
    if (!running) {
      countdownEndsAtRef.current = null;
      return;
    }
    countdownEndsAtRef.current = Date.now() + Math.max(0, seconds) * 1000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil(((countdownEndsAtRef.current ?? Date.now()) - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) setRunning(false);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    stopwatchSecondsRef.current = stopwatchSeconds;
  }, [stopwatchSeconds]);

  useEffect(() => {
    if (!stopwatchRunning) {
      stopwatchStartedAtRef.current = null;
      stopwatchBaseSecondsRef.current = stopwatchSecondsRef.current;
      return;
    }
    stopwatchBaseSecondsRef.current = stopwatchSecondsRef.current;
    stopwatchStartedAtRef.current = Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - (stopwatchStartedAtRef.current ?? Date.now())) / 1000);
      const next = stopwatchBaseSecondsRef.current + Math.max(0, elapsed);
      stopwatchSecondsRef.current = next;
      setStopwatchSeconds(next);
    };
    tick();
    const stopwatch = window.setInterval(tick, 250);
    return () => {
      tick();
      window.clearInterval(stopwatch);
    };
  }, [stopwatchRunning]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
    if (!sessionActive) finishAwayPeriod();
  }, [sessionActive]);

  useEffect(() => {
    if (!sessionActive) return;
    if (jukuNonProblemAway) {
      startAwayPeriod(true);
      return;
    }
    if (!document.hidden) finishAwayPeriod();
  }, [jukuNonProblemAway, sessionActive]);

  useEffect(() => {
    if (!sessionActive) return;
    focusLastTickAtRef.current = Date.now();
    const focusCounter = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - focusLastTickAtRef.current) / 1000);
      if (elapsed < 1) return;
      focusLastTickAtRef.current += elapsed * 1000;
      if (!document.hidden && awayStartedAtRef.current === null && !idleActiveRef.current && !jukuModeActive) {
        setTrackedFocusSeconds((current) => current + elapsed);
      }
    }, 250);
    return () => window.clearInterval(focusCounter);
  }, [jukuModeActive, sessionActive]);

  useEffect(() => {
    const markStudyAction = () => {
      lastStudyActionAtRef.current = Date.now();
      idleActiveRef.current = false;
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, markStudyAction, { passive: true }));
    return () => events.forEach((eventName) => window.removeEventListener(eventName, markStudyAction));
  }, []);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
    if (sessionActive) {
      lastStudyActionAtRef.current = Date.now();
      idleActiveRef.current = false;
      return;
    }
    idleActiveRef.current = false;
  }, [sessionActive]);

  useEffect(() => {
    if (!sessionActive || jukuModeActive) return;
    const idleTimer = window.setInterval(() => {
      if (awayStartedAtRef.current !== null) return;
      const inactiveSeconds = Math.floor((Date.now() - lastStudyActionAtRef.current) / 1000);
      if (inactiveSeconds < IDLE_WARNING_SECONDS) return;
      if (!idleActiveRef.current) {
        idleActiveRef.current = true;
        setTrackedFocusSeconds((current) => Math.max(0, current - IDLE_WARNING_SECONDS));
        setIdleCount((current) => {
          const next = current + 1;
          awayStatsRef.current = { ...awayStatsRef.current, idleCount: Math.max(awayStatsRef.current.idleCount, next) };
          return next;
        });
        setIdleSeconds((current) => {
          const next = current + IDLE_WARNING_SECONDS;
          awayStatsRef.current = { ...awayStatsRef.current, idleSeconds: Math.max(awayStatsRef.current.idleSeconds, next) };
          return next;
        });
      }
      setIdleSeconds((current) => {
        const next = current + 1;
        awayStatsRef.current = { ...awayStatsRef.current, idleSeconds: Math.max(awayStatsRef.current.idleSeconds, next) };
        return next;
      });
    }, 1000);
    return () => window.clearInterval(idleTimer);
  }, [jukuModeActive, sessionActive]);

  useEffect(() => {
    const handleWindowBlur = () => {
      lastWindowBlurAtRef.current = Date.now();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Mobile browsers do not expose a definitive "screen was turned off" event.
        // In juku mode, only a recent window blur is treated as an app switch;
        // visibility changes without blur are treated as screen-off and ignored.
        if (!jukuModeActive || Date.now() - lastWindowBlurAtRef.current <= APP_SWITCH_BLUR_WINDOW_MS) {
          startAwayPeriod(jukuModeActive);
        }
      }
      else if (jukuNonProblemAway) startAwayPeriod(true);
      else finishAwayPeriod();
    };
    const handlePageHide = () => {
      if (!jukuModeActive || Date.now() - lastWindowBlurAtRef.current <= APP_SWITCH_BLUR_WINDOW_MS) {
        startAwayPeriod(jukuModeActive);
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handleVisibilityChange);
    };
  }, [authUser, challengeMinutes, freeStudyAction, freeStudyPlan, jukuModeActive, jukuNonProblemAway, selectedSubject, sessionActive, setNumber, timerMode, view]);

  useEffect(() => {
    const messageTimer = window.setInterval(() => setDailyMessageDate(getJstDateKey()), 60_000);
    return () => window.clearInterval(messageTimer);
  }, []);

  useEffect(() => {
    const updateLock = () => setStudentLocked(isStudentLockedByTime());
    updateLock();
    const lockTimer = window.setInterval(updateLock, 60_000);
    return () => window.clearInterval(lockTimer);
  }, []);

  useEffect(() => {
    if (!studentLocked) return;
    setRunning(false);
    setStopwatchRunning(false);
    setTimerPromptSubject(null);
    setWeeklyMessage("深夜0時〜朝5時は生徒画面をお休みにしています。朝になったら再開できます。");
  }, [studentLocked]);

  useEffect(() => {
    if (!timerPromptSubject && !subjectPickerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTimerPromptSubject(null);
        setSubjectPickerOpen(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [timerPromptSubject, subjectPickerOpen]);

  useEffect(() => {
    if (!authUser) return;
    let midnightTimer: number;
    const scheduleMidnightReset = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      midnightTimer = window.setTimeout(() => {
      const previousDate = getLocalDateKey(new Date(Date.now() - 1000));
      const { summaryDate: _summaryDate, ...previousSummary } = guardianSummaryRef.current;
      if (guardianEnabled) {
        void fetch("/api/guardian-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "summary", summaryDate: previousDate, summary: previousSummary }),
          }).catch(() => undefined);
        }

        const emptyScore = { date: getLocalDateKey(), correct: 0, total: 0 };
        setTodayScore(emptyScore);
        try { window.localStorage.setItem(userStorageKey(TODAY_SCORE_STORAGE_KEY, authUser.id), JSON.stringify(emptyScore)); } catch { /* Continue without browser storage. */ }
        try { window.localStorage.setItem(userStorageKey(TODAY_FOCUS_STORAGE_KEY, authUser.id), JSON.stringify({ date: getLocalDateKey(), focusSeconds: 0 })); } catch { /* Continue without browser storage. */ }
        try {
          window.localStorage.setItem(
            userStorageKey(TODAY_AWAY_STORAGE_KEY, authUser.id),
            JSON.stringify({
              date: getLocalDateKey(),
              awaySeconds: 0,
              awayCount: 0,
              idleSeconds: 0,
              idleCount: 0,
              jukuAwaySeconds: 0,
              jukuAwayCount: 0,
            }),
          );
        } catch { /* Continue without browser storage. */ }
        setBaseTodayFocusSeconds(0);
        setTrackedFocusSeconds(0);
        setAwaySeconds(0);
        setAwayCount(0);
        setIdleSeconds(0);
        setIdleCount(0);
        setJukuAwaySeconds(0);
        setJukuAwayCount(0);
        awayStatsRef.current = {
          date: getLocalDateKey(),
          awaySeconds: 0,
          awayCount: 0,
          idleSeconds: 0,
          idleCount: 0,
          jukuAwaySeconds: 0,
          jukuAwayCount: 0,
        };
        if (awayStartedAtRef.current !== null) awayStartedAtRef.current = Date.now();
        scheduleMidnightReset();
      }, nextMidnight.getTime() - now.getTime());
    };
    scheduleMidnightReset();
    return () => window.clearTimeout(midnightTimer);
  }, [authUser, guardianEnabled]);

  useEffect(() => {
    if (!authUser) return;
    try {
      const scopedKey = userStorageKey(TODAY_SCORE_STORAGE_KEY, authUser.id);
      const savedScore = window.localStorage.getItem(scopedKey) ?? window.localStorage.getItem(TODAY_SCORE_STORAGE_KEY);
      if (!savedScore) return;

      const parsedScore = JSON.parse(savedScore) as Partial<TodayScore>;
      if (
        parsedScore.date === getLocalDateKey() &&
        typeof parsedScore.correct === "number" &&
        typeof parsedScore.total === "number"
      ) {
        setTodayScore({
          date: parsedScore.date,
          correct: Math.max(0, parsedScore.correct),
          total: Math.max(0, parsedScore.total),
        });
        window.localStorage.setItem(scopedKey, savedScore);
      }
    } catch {
      window.localStorage.removeItem(userStorageKey(TODAY_SCORE_STORAGE_KEY, authUser.id));
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    try {
      const scopedKey = userStorageKey(TODAY_FOCUS_STORAGE_KEY, authUser.id);
      const savedFocus = window.localStorage.getItem(scopedKey) ?? window.localStorage.getItem(TODAY_FOCUS_STORAGE_KEY);
      if (!savedFocus) return;

      const parsedFocus = JSON.parse(savedFocus) as Partial<TodayFocus>;
      if (parsedFocus.date === getLocalDateKey() && typeof parsedFocus.focusSeconds === "number") {
        setBaseTodayFocusSeconds(Math.max(0, parsedFocus.focusSeconds));
        setTrackedFocusSeconds(0);
        window.localStorage.setItem(scopedKey, savedFocus);
      }
    } catch {
      window.localStorage.removeItem(userStorageKey(TODAY_FOCUS_STORAGE_KEY, authUser.id));
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    try {
      const scopedKey = userStorageKey(TODAY_AWAY_STORAGE_KEY, authUser.id);
      const savedAway = window.localStorage.getItem(scopedKey) ?? window.localStorage.getItem(TODAY_AWAY_STORAGE_KEY);
      if (!savedAway) return;

      const parsedAway = JSON.parse(savedAway) as Partial<TodayAwayStats>;
      if (parsedAway.date === getLocalDateKey()) {
        setAwaySeconds(Math.max(0, Number(parsedAway.awaySeconds ?? 0)));
        setAwayCount(Math.max(0, Number(parsedAway.awayCount ?? 0)));
        setIdleSeconds(Math.max(0, Number(parsedAway.idleSeconds ?? 0)));
        setIdleCount(Math.max(0, Number(parsedAway.idleCount ?? 0)));
        setJukuAwaySeconds(Math.max(0, Number(parsedAway.jukuAwaySeconds ?? 0)));
        setJukuAwayCount(Math.max(0, Number(parsedAway.jukuAwayCount ?? 0)));
        awayStatsRef.current = {
          date: parsedAway.date,
          awaySeconds: Math.max(0, Number(parsedAway.awaySeconds ?? 0)),
          awayCount: Math.max(0, Number(parsedAway.awayCount ?? 0)),
          idleSeconds: Math.max(0, Number(parsedAway.idleSeconds ?? 0)),
          idleCount: Math.max(0, Number(parsedAway.idleCount ?? 0)),
          jukuAwaySeconds: Math.max(0, Number(parsedAway.jukuAwaySeconds ?? 0)),
          jukuAwayCount: Math.max(0, Number(parsedAway.jukuAwayCount ?? 0)),
          awayStartedAt: typeof parsedAway.awayStartedAt === "number" ? parsedAway.awayStartedAt : null,
          awayAtJuku: Boolean(parsedAway.awayAtJuku),
          stateUpdatedAtMs: Math.max(0, Number(parsedAway.stateUpdatedAtMs ?? 0)),
        };
        window.localStorage.setItem(scopedKey, savedAway);
      }
    } catch {
      window.localStorage.removeItem(userStorageKey(TODAY_AWAY_STORAGE_KEY, authUser.id));
    } finally {
      setAwayStatsLoaded(true);
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser || practiceDraftRestoredForRef.current === authUser.id) return;
    practiceDraftRestoredForRef.current = authUser.id;
    try {
      const raw = window.localStorage.getItem(userStorageKey(PRACTICE_DRAFT_STORAGE_KEY, authUser.id));
      if (!raw) return;
      const draft = JSON.parse(raw) as Record<string, unknown>;
      const storageKey = userStorageKey(PRACTICE_DRAFT_STORAGE_KEY, authUser.id);
      if (draft.version !== PRACTICE_DRAFT_VERSION || Date.now() - Number(draft.savedAt ?? 0) > 24 * 60 * 60 * 1000) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      const questions = Array.isArray(draft.questions) ? draft.questions : [];
      const validQuestions = questions.filter(isValidPracticeQuestion);
      const uniqueQuestionIds = new Set(validQuestions.map((question) => question.id));
      if (
        validQuestions.length !== QUESTIONS_PER_SET
        || uniqueQuestionIds.size !== QUESTIONS_PER_SET
        || typeof draft.selectedSubject !== "string"
        || !validQuestions.every((question) => question.subject === draft.selectedSubject)
      ) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      setSelectedSubject(draft.selectedSubject as StudySubject);
      setQuestionSequence(validQuestions);
      setPracticeTotalSets(Math.max(1, Number(draft.totalSets ?? 1)));
      setSetNumber(Math.max(1, Number(draft.setNumber ?? 1)));
      setShuffleRound(Math.max(1, Number(draft.shuffleRound ?? 1)));
      setPracticePhase(draft.phase === "review" ? "review" : "questions");
      const savedGrades = Array.isArray(draft.grades) ? draft.grades : [];
      setGrades(Array.from({ length: QUESTIONS_PER_SET }, (_, index) => savedGrades[index] === "correct" || savedGrades[index] === "wrong" ? savedGrades[index] : null));
      setPracticeBatchId(typeof draft.batchId === "string" ? draft.batchId : crypto.randomUUID());
      setSubjectTimerEnabled(Boolean(draft.timerEnabled));
      setChallengeMinutes(Math.max(1, Math.min(PRACTICE_TIMER_MAX_MINUTES, Number(draft.challengeMinutes ?? PRACTICE_TIMER_DEFAULT_MINUTES))));
      setSeconds(Math.max(0, Number(draft.seconds ?? 0)));
      setRunning(Boolean(draft.running) && Number(draft.seconds ?? 0) > 0);
      setView("practice");
    } catch {
      window.localStorage.removeItem(userStorageKey(PRACTICE_DRAFT_STORAGE_KEY, authUser.id));
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser || practiceDraftRestoredForRef.current !== authUser.id) return;
    const storageKey = userStorageKey(PRACTICE_DRAFT_STORAGE_KEY, authUser.id);
    if (practicePhase === "complete") {
      window.localStorage.removeItem(storageKey);
      return;
    }
    if (view !== "practice" || questionSequence.length !== QUESTIONS_PER_SET || !selectedSubject) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        version: PRACTICE_DRAFT_VERSION,
        savedAt: Date.now(),
        selectedSubject,
        questions: questionSequence,
        totalSets: practiceTotalSets,
        setNumber,
        shuffleRound,
        phase: practicePhase,
        grades,
        batchId: practiceBatchId,
        timerEnabled: subjectTimerEnabled,
        challengeMinutes,
        seconds,
        running,
      }));
    } catch {
      // D1 still prevents repeats even if this browser cannot save a draft.
    }
  }, [authUser, challengeMinutes, grades, practiceBatchId, practicePhase, practiceTotalSets, questionSequence, running, seconds, selectedSubject, setNumber, shuffleRound, subjectTimerEnabled, view]);

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    void fetch("/api/study-records", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("study records unavailable");
        return response.json() as Promise<{
          today: string;
          loginDays: number;
          solved: number;
          correct: number;
          mistakes: Array<{ question?: Record<string, unknown> }>;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setLoginDaysCount(Math.max(1, Number(data.loginDays ?? 0)));
        const serverScore: TodayScore = {
          date: data.today,
          correct: Math.max(0, Number(data.correct ?? 0)),
          total: Math.max(0, Number(data.solved ?? 0)),
        };
        setTodayScore((current) => {
          const next = current.date === serverScore.date && current.total > serverScore.total ? current : serverScore;
          try {
            window.localStorage.setItem(userStorageKey(TODAY_SCORE_STORAGE_KEY, authUser.id), JSON.stringify(next));
          } catch {
            // D1 remains the source of truth if browser storage is unavailable.
          }
          return next;
        });
        const remoteQuestions = (Array.isArray(data.mistakes) ? data.mistakes : [])
          .map((item) => item.question as unknown as Question)
          .filter((question) => typeof question?.id === "string");
        setReviewQueue(() => {
          const next = remoteQuestions;
          try {
            window.localStorage.setItem(userStorageKey(REVIEW_QUEUE_STORAGE_KEY, authUser.id), JSON.stringify(next));
          } catch {
            // D1 remains the source of truth if browser storage is unavailable.
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    try {
      const scopedKey = userStorageKey(SUBJECT_PROGRESS_STORAGE_KEY, authUser.id);
      const savedProgress = window.localStorage.getItem(scopedKey);
      if (!savedProgress) {
        setSubjectProgressCounts(defaultSubjectProgress);
        window.localStorage.setItem(scopedKey, JSON.stringify(defaultSubjectProgress));
        return;
      }
      const loadedProgress = normalizeSubjectProgress(JSON.parse(savedProgress));
      const nextProgress = isLegacySubjectProgress(loadedProgress) ? defaultSubjectProgress : loadedProgress;
      setSubjectProgressCounts(nextProgress);
      window.localStorage.setItem(scopedKey, JSON.stringify(nextProgress));
    } catch {
      setSubjectProgressCounts(defaultSubjectProgress);
      window.localStorage.removeItem(userStorageKey(SUBJECT_PROGRESS_STORAGE_KEY, authUser.id));
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    void fetch("/api/guardian-report")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.profile) setGuardianEnabled(Boolean(data.profile.enabled));
        if (data?.summary && typeof data.summary === "object") {
          const remoteFocusSeconds = Math.max(0, Number(data.summary.focusSeconds ?? 0));
          setBaseTodayFocusSeconds((current) => Math.max(current, remoteFocusSeconds));
        }
        if (!data?.away || typeof data.away !== "object") return;
        const remoteAway: TodayAwayStats = {
          date: getLocalDateKey(),
          awaySeconds: Math.max(0, Number(data.away.awaySeconds ?? 0)),
          awayCount: Math.max(0, Number(data.away.awayCount ?? 0)),
          idleSeconds: Math.max(0, Number(data.away.idleSeconds ?? 0)),
          idleCount: Math.max(0, Number(data.away.idleCount ?? 0)),
          jukuAwaySeconds: Math.max(0, Number(data.away.jukuAwaySeconds ?? 0)),
          jukuAwayCount: Math.max(0, Number(data.away.jukuAwayCount ?? 0)),
          awayStartedAt: typeof data.away.awayStartedAt === "number" ? data.away.awayStartedAt : null,
          awayAtJuku: Boolean(data.away.awayAtJuku),
          stateUpdatedAtMs: Math.max(0, Number(data.away.stateUpdatedAtMs ?? 0)),
        };
        const localStateIsNewer = Number(awayStatsRef.current.stateUpdatedAtMs ?? 0) >= remoteAway.stateUpdatedAtMs!;
        const newestState = localStateIsNewer ? awayStatsRef.current : remoteAway;
        const mergedAway: TodayAwayStats = {
          date: remoteAway.date,
          awaySeconds: Math.max(awayStatsRef.current.awaySeconds, remoteAway.awaySeconds),
          awayCount: Math.max(awayStatsRef.current.awayCount, remoteAway.awayCount),
          idleSeconds: Math.max(awayStatsRef.current.idleSeconds, remoteAway.idleSeconds),
          idleCount: Math.max(awayStatsRef.current.idleCount, remoteAway.idleCount),
          jukuAwaySeconds: Math.max(awayStatsRef.current.jukuAwaySeconds, remoteAway.jukuAwaySeconds),
          jukuAwayCount: Math.max(awayStatsRef.current.jukuAwayCount, remoteAway.jukuAwayCount),
          awayStartedAt: newestState.awayStartedAt ?? null,
          awayAtJuku: Boolean(newestState.awayAtJuku),
          stateUpdatedAtMs: Math.max(Number(awayStatsRef.current.stateUpdatedAtMs ?? 0), Number(remoteAway.stateUpdatedAtMs ?? 0)),
        };
        if (mergedAway.awayStartedAt) {
          const elapsed = Math.max(1, Math.round((Date.now() - mergedAway.awayStartedAt) / 1000));
          if (mergedAway.awayAtJuku) mergedAway.jukuAwaySeconds += elapsed;
          else mergedAway.awaySeconds += elapsed;
          mergedAway.awayStartedAt = null;
          mergedAway.awayAtJuku = false;
          mergedAway.stateUpdatedAtMs = Date.now();
        }
        awayStatsRef.current = mergedAway;
        setAwaySeconds(mergedAway.awaySeconds);
        setAwayCount(mergedAway.awayCount);
        setIdleSeconds(mergedAway.idleSeconds);
        setIdleCount(mergedAway.idleCount);
        setJukuAwaySeconds(mergedAway.jukuAwaySeconds);
        setJukuAwayCount(mergedAway.jukuAwayCount);
        persistAwayStats(mergedAway);
      })
      .catch(() => undefined);
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    try {
      const subjectKeys = ["国語", "数学", "英語", "理科", "社会", "理社ミックス"] as const;
      const nextSeen = Object.fromEntries(subjectKeys.map((subject) => [subject, readSeenQuestionIds(authUser.id, subject)]));
      setSeenQuestionIds(nextSeen as Record<string, string[]>);
    } catch {
      setSeenQuestionIds({});
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    const loadStudyMates = () => {
      void fetch("/api/study-mates", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (Array.isArray(data?.students)) setRegisteredStudyMates(data.students as RegisteredStudyMate[]);
        })
        .catch(() => undefined);
    };
    loadStudyMates();
    const studyMatesTimer = window.setInterval(loadStudyMates, 15_000);
    return () => window.clearInterval(studyMatesTimer);
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    const period = rankPeriod === "今週" ? "week" : rankPeriod === "今月" ? "month" : "today";
    const loadRankings = () => {
      setRankingLoading(true);
      void fetch(`/api/rankings?period=${period}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (Array.isArray(data?.entries)) setRankingRows(data.entries as RankingEntry[]);
        })
        .catch(() => undefined)
        .finally(() => setRankingLoading(false));
    };
    loadRankings();
    const rankingTimer = window.setInterval(loadRankings, 15_000);
    return () => window.clearInterval(rankingTimer);
  }, [authUser, rankPeriod]);

  useEffect(() => {
    if (!authUser) return;

    const mode = view === "practice"
      ? "20問演習"
      : view === "weekly-test"
        ? "一斉テスト"
        : timerMode === "stopwatch"
          ? (FREE_STUDY_ACTIONS.find((item) => item.key === freeStudyAction)?.label ?? "フリー学習")
          : "集中タイマー";
    const subject = view === "practice" ? (selectedSubject ?? "") : "";
    const detail = view === "practice"
      ? `セット${String(setNumber).padStart(3, "0")}`
      : view === "weekly-test"
        ? "テストに挑戦中"
        : timerMode === "stopwatch"
          ? freeStudyPlan.trim()
          : `${challengeMinutes}分チャレンジ`;

    const sendPresence = (status: "studying" | "away" | "stopped", useBeacon = false) => {
      const sessionId = presenceSessionIdRef.current;
      if (!sessionId) return;
      const payload = JSON.stringify({
        sessionId,
        status,
        mode,
        subject,
        detail,
        startedAtMs: presenceStartedAtRef.current,
        activeSeconds: presenceActiveSecondsRef.current,
      });
      if (useBeacon) {
        try {
          navigator.sendBeacon("/api/study-presence", new Blob([payload], { type: "application/json" }));
          return;
        } catch {
          // Fall through to a keepalive request when sendBeacon is unavailable.
        }
      }
      void fetch("/api/study-presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    };

    if (!sessionActive) {
      if (presenceSessionIdRef.current) sendPresence("stopped", true);
      presenceSessionIdRef.current = null;
      presenceStartedAtRef.current = 0;
      presenceActiveSecondsRef.current = 0;
      setPresenceActiveSeconds(0);
      return;
    }

    if (!presenceSessionIdRef.current) {
      presenceSessionIdRef.current = crypto.randomUUID();
      presenceStartedAtRef.current = Date.now();
      presenceActiveSecondsRef.current = 0;
      setPresenceActiveSeconds(0);
    }

    presenceLastTickAtRef.current = Date.now();
    sendPresence(document.hidden ? "away" : "studying");
    const secondTimer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - presenceLastTickAtRef.current) / 1000);
      if (elapsed < 1) return;
      presenceLastTickAtRef.current += elapsed * 1000;
      if (document.hidden || awayStartedAtRef.current !== null || idleActiveRef.current || jukuModeActive) return;
      presenceActiveSecondsRef.current += elapsed;
      setPresenceActiveSeconds(presenceActiveSecondsRef.current);
    }, 250);
    const heartbeatTimer = window.setInterval(() => sendPresence(document.hidden ? "away" : "studying"), 15_000);
    const handleVisibility = () => sendPresence(document.hidden ? "away" : "studying", document.hidden);
    const handlePageHide = () => sendPresence("away", true);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handleVisibility);
    return () => {
      window.clearInterval(secondTimer);
      window.clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handleVisibility);
    };
  }, [authUser, jukuModeActive, sessionActive]);

  useEffect(() => {
    if (!authUser) return;
    try {
      const scopedKey = userStorageKey(REVIEW_QUEUE_STORAGE_KEY, authUser.id);
      const savedQueue = window.localStorage.getItem(scopedKey) ?? window.localStorage.getItem(REVIEW_QUEUE_STORAGE_KEY);
      if (!savedQueue) return;

      const parsedQueue = JSON.parse(savedQueue) as Question[];
      if (Array.isArray(parsedQueue)) {
        setReviewQueue(parsedQueue.filter((question) => typeof question?.id === "string"));
        window.localStorage.setItem(scopedKey, savedQueue);
      }
    } catch {
      // Start with the important-question list if saved review data is unavailable.
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    try {
      const savedSessions = window.localStorage.getItem(userStorageKey(FREE_STUDY_SESSIONS_STORAGE_KEY, authUser.id));
      if (!savedSessions) return;
      const parsedSessions = JSON.parse(savedSessions) as FreeStudySession[];
      if (Array.isArray(parsedSessions)) {
        setFreeStudySessions(parsedSessions.filter((session) => typeof session?.id === "string").slice(0, 20));
      }
    } catch {
      // Free-study notes are optional; continue without saved sessions.
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser || stopwatchRestoredForRef.current === authUser.id) return;
    stopwatchRestoredForRef.current = authUser.id;
    stopwatchPersistenceReadyRef.current = false;
    const storageKey = userStorageKey(ACTIVE_STOPWATCH_STORAGE_KEY, authUser.id);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        if (Number(saved.version) === ACTIVE_STOPWATCH_VERSION) {
          const wasRunning = Boolean(saved.running);
          const savedSeconds = Math.max(0, Math.floor(Number(saved.seconds) || 0));
          const baseSeconds = Math.max(0, Math.floor(Number(saved.baseSeconds) || savedSeconds));
          const startedAtMs = Math.max(0, Math.floor(Number(saved.startedAtMs) || 0));
          const elapsedSinceSave = wasRunning && startedAtMs > 0
            ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
            : 0;
          const restoredSeconds = wasRunning ? baseSeconds + elapsedSinceSave : savedSeconds;
          const savedAction = typeof saved.action === "string" && FREE_STUDY_ACTIONS.some((item) => item.key === saved.action)
            ? saved.action as FreeStudyAction["key"]
            : FREE_STUDY_ACTIONS[0].key;

          stopwatchSecondsRef.current = restoredSeconds;
          stopwatchBaseSecondsRef.current = restoredSeconds;
          stopwatchStartedAtRef.current = null;
          setStopwatchSeconds(restoredSeconds);
          setFreeStudyAction(savedAction);
          setFreeStudyPlan(typeof saved.plan === "string" ? saved.plan.slice(0, 500) : "");
          setFreeStudyResult(typeof saved.result === "string" ? saved.result.slice(0, 1000) : "");
          setTimerMode("stopwatch");
          setStopwatchRunning(wasRunning);
          if (restoredSeconds > 0 || wasRunning) setView("timer");
        } else {
          window.localStorage.removeItem(storageKey);
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    const readyTimer = window.setTimeout(() => {
      stopwatchPersistenceReadyRef.current = true;
    }, 0);
    return () => window.clearTimeout(readyTimer);
  }, [authUser]);

  useEffect(() => {
    if (!authUser || stopwatchRestoredForRef.current !== authUser.id || !stopwatchPersistenceReadyRef.current) return;
    const storageKey = userStorageKey(ACTIVE_STOPWATCH_STORAGE_KEY, authUser.id);
    const persistStopwatch = () => {
      const startedAtMs = stopwatchRunning ? stopwatchStartedAtRef.current : null;
      const exactSeconds = stopwatchRunning && startedAtMs !== null
        ? stopwatchBaseSecondsRef.current + Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
        : stopwatchSecondsRef.current;
      if (exactSeconds <= 0 && !stopwatchRunning) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      window.localStorage.setItem(storageKey, JSON.stringify({
        version: ACTIVE_STOPWATCH_VERSION,
        savedAt: Date.now(),
        seconds: exactSeconds,
        running: stopwatchRunning,
        startedAtMs: stopwatchRunning ? (startedAtMs ?? Date.now()) : null,
        baseSeconds: stopwatchRunning ? stopwatchBaseSecondsRef.current : exactSeconds,
        action: freeStudyAction,
        plan: freeStudyPlan,
        result: freeStudyResult,
      }));
    };
    try {
      persistStopwatch();
    } catch {
      // Keep the active stopwatch running even when browser storage is unavailable.
    }
    const handlePageHide = () => {
      try { persistStopwatch(); } catch { /* Best-effort final save. */ }
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [authUser, freeStudyAction, freeStudyPlan, freeStudyResult, stopwatchRunning, stopwatchSeconds]);

  useEffect(() => {
    if (!authUser || !awayStatsLoaded) return;
    const nextAway: TodayAwayStats = {
      date: getLocalDateKey(),
      awaySeconds,
      awayCount,
      idleSeconds,
      idleCount,
      jukuAwaySeconds,
      jukuAwayCount,
      awayStartedAt: awayStatsRef.current.awayStartedAt ?? null,
      awayAtJuku: awayStatsRef.current.awayAtJuku ?? false,
      stateUpdatedAtMs: awayStatsRef.current.stateUpdatedAtMs ?? 0,
    };
    awayStatsRef.current = nextAway;
    try {
      window.localStorage.setItem(userStorageKey(TODAY_AWAY_STORAGE_KEY, authUser.id), JSON.stringify(nextAway));
    } catch {
      // Daily away stats are best-effort persisted in the browser.
    }
  }, [authUser, awayStatsLoaded, awaySeconds, awayCount, idleSeconds, idleCount, jukuAwaySeconds, jukuAwayCount]);

  useEffect(() => {
    if (!authUser || focusQuestions.length > 0) return;
    const params = new URLSearchParams({ mode: "focus", count: "20", set: "1", round: "1" });
    void fetch(`/api/practice-questions?${params.toString()}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (Array.isArray(data?.questions)) setFocusQuestions(data.questions);
      })
      .catch(() => undefined);
  }, [authUser, focusQuestions.length]);

  const correctCount = grades.filter((grade) => grade === "correct").length;
  const wrongCount = grades.filter((grade) => grade === "wrong").length;
  const gradedCount = correctCount + wrongCount;
  const currentSetCorrect = practicePhase === "review" ? correctCount : 0;
  const currentSetTotal = practicePhase === "review" ? gradedCount : 0;
  const savedTodayScore = todayScore.date === getLocalDateKey() ? todayScore : { correct: 0, total: 0 };
  const todayCorrect = savedTodayScore.correct + currentSetCorrect;
  const todayTotal = savedTodayScore.total + currentSetTotal;
  const todayWrong = Math.max(0, todayTotal - todayCorrect);
  const todayAccuracy = todayTotal > 0 ? Math.round((todayCorrect / todayTotal) * 100) : null;
  const reportFocusSeconds = baseTodayFocusSeconds + trackedFocusSeconds;
  const reportFocusHours = Math.floor(reportFocusSeconds / 3600);
  const reportFocusMinutes = Math.floor((reportFocusSeconds % 3600) / 60);

  useEffect(() => {
    if (!authUser) return;
    setRegisteredStudyMates((current) => current.map((student) => (
      student.id === authUser.id
        ? {
            ...student,
            focusSeconds: Math.max(student.focusSeconds, reportFocusSeconds),
            questionsSolved: Math.max(student.questionsSolved, todayTotal),
          }
        : student
    )));
  }, [authUser, reportFocusSeconds, todayTotal]);

  const focusTrackedMinutes = Math.floor(trackedFocusSeconds / 60);
  const focusBaseMinutes = Math.floor(baseTodayFocusSeconds / 60);
  const focusAwayMinutes = Math.floor(awaySeconds / 60);
  const freeStudyHasPlan = freeStudyPlan.trim().length > 0;
  const freeStudyReliability = stopwatchSeconds === 0
    ? "未開始"
    : freeStudyResult.trim()
      ? "成果メモあり"
      : freeStudyHasPlan
        ? "内容メモあり"
        : "時間のみ";
  const freeStudyAtJuku = freeStudyAction === "juku";
  const freeStudyAwaySeconds = freeStudyAtJuku ? jukuAwaySeconds : awaySeconds;
  const freeStudyRisk = stopwatchSeconds > 0 && !freeStudyAtJuku && !freeStudyResult.trim() && (awaySeconds + idleSeconds > Math.max(180, stopwatchSeconds * 0.2));
  const todayAccuracyGraph = todayAccuracy ?? 0;
  const guardianSummary = useMemo(() => ({
    summaryDate: getLocalDateKey(),
    focusSeconds: reportFocusSeconds,
    awaySeconds: awaySeconds + idleSeconds,
    questionsSolved: todayTotal,
    correctAnswers: todayCorrect,
    wrongAnswers: todayWrong,
    away: {
      awaySeconds,
      awayCount,
      idleSeconds,
      idleCount,
      jukuAwaySeconds,
      jukuAwayCount,
      awayStartedAt: awayStatsRef.current.awayStartedAt ?? null,
      awayAtJuku: awayStatsRef.current.awayAtJuku ?? false,
      stateUpdatedAtMs: awayStatsRef.current.stateUpdatedAtMs ?? 0,
    },
  }), [awayCount, awaySeconds, idleCount, idleSeconds, jukuAwayCount, jukuAwaySeconds, reportFocusSeconds, todayCorrect, todayTotal, todayWrong]);
  const guardianSummaryRef = useRef(guardianSummary);
  guardianSummaryRef.current = guardianSummary;
  const lastSyncedSummaryRef = useRef<string>("");

  useEffect(() => {
    if (!authUser) return;
    try {
      window.localStorage.setItem(
        userStorageKey(TODAY_FOCUS_STORAGE_KEY, authUser.id),
        JSON.stringify({ date: getLocalDateKey(), focusSeconds: reportFocusSeconds }),
      );
    } catch {
      // The live card can still update even if browser storage is unavailable.
    }
  }, [authUser, reportFocusSeconds]);

  const focusIsReview = reviewQueue.length > 0;
  const focusQuestion = focusIsReview
    ? reviewQueue[0]
    : focusQuestions[focusOffset % Math.max(1, focusQuestions.length)];
  const filteredMistakes = useMemo(
    () => reviewQueue.filter((question) => mistakeSubject === "すべて" || question.subject === mistakeSubject),
    [mistakeSubject, reviewQueue],
  );
  const timerLabel = useMemo(() => formatClock(seconds), [seconds]);
  const stopwatchLabel = useMemo(() => formatClock(stopwatchSeconds), [stopwatchSeconds]);
  const awayTimeLabel = useMemo(() => formatAwayTime(awaySeconds), [awaySeconds]);
  const idleTimeLabel = useMemo(() => formatAwayTime(idleSeconds), [idleSeconds]);
  const dailyStreakMessage = useMemo(() => getDailyStreakMessage(dailyMessageDate), [dailyMessageDate]);
  const studyMateRows = useMemo(() => {
    const registeredColors = ["yellow", "blue", "green", "coral", "purple"];
    return registeredStudyMates.map((student, index) => {
      const isLocallyStudying = student.isMe && sessionActive;
      const status = isLocallyStudying ? "studying" : student.status;
      const minutes = Math.floor(Math.max(0, student.focusSeconds) / 60);
      const hasStudyTime = minutes > 0 || student.questionsSolved > 0;
      const activity = isLocallyStudying
        ? view === "practice"
          ? `${selectedSubject ?? "演習"}・20問演習`
          : view === "weekly-test"
            ? "一斉テスト"
            : timerMode === "stopwatch"
              ? (FREE_STUDY_ACTIONS.find((item) => item.key === freeStudyAction)?.label ?? "フリー学習")
              : "集中タイマー"
        : [student.subject, student.mode].filter(Boolean).join("・");
      return {
        id: student.id,
        name: student.displayName,
        startTime: status === "studying" || status === "away"
          ? formatJstStartTime(isLocallyStudying ? presenceStartedAtRef.current : student.startedAtMs)
          : "—",
        activity: activity || (hasStudyTime ? `今日は${student.questionsSolved}問` : "今日はまだ"),
        detail: isLocallyStudying ? "取り組み中" : student.detail,
        minutes,
        color: registeredColors[index % registeredColors.length],
        badge: student.isMe ? "YOU" : status === "studying" ? "勉強中" : status === "away" ? "一時離席" : hasStudyTime ? "今日済" : "未開始",
        isMe: student.isMe,
        status,
      };
    });
  }, [freeStudyAction, registeredStudyMates, selectedSubject, sessionActive, timerMode, view]);
  const studyingMateCount = studyMateRows.filter((mate) => mate.status === "studying").length;

  const rankingEntries = useMemo(() => {
    const palette = ["purple", "blue", "coral", "green", "yellow"] as const;
    return rankingRows.map((student, index) => ({
      ...student,
      name: student.displayName,
      time: formatStudyTime(Math.floor(Math.max(0, student.focusSeconds) / 60)),
      color: palette[index % palette.length],
      me: student.isMe,
    }));
  }, [rankingRows]);
  const myRanking = rankingEntries.find((entry) => entry.me);

  const weeklyStartMs = weeklyTest ? new Date(weeklyTest.startsAt).getTime() : 0;
  const weeklyEndMs = weeklyTest ? weeklyStartMs + weeklyTest.durationMinutes * 60_000 : 0;
  const weeklyRemainingSeconds = weeklyTest?.kind === "active" ? Math.max(0, Math.ceil((weeklyEndMs - weeklyNow) / 1000)) : 0;
  const weeklyUntilStartSeconds = weeklyTest?.kind === "upcoming" ? Math.max(0, Math.ceil((weeklyStartMs - weeklyNow) / 1000)) : 0;
  const weeklyAnsweredCount = weeklyTest?.questions.filter((question) => String(weeklyAnswers[question.id] ?? "").trim()).length ?? 0;
  const weeklyResult = weeklyTest?.submission?.status === "submitted" ? weeklyTest.submission : null;

  const submitWeeklyTest = async (automatic = false) => {
    if (!authUser || !weeklyTest || weeklySubmittingRef.current || weeklyTest.submission?.status === "submitted") return;
    weeklySubmittingRef.current = true;
    setWeeklySubmitting(true);
    setWeeklyMessage(automatic ? "時間になりました。自動で採点しています…" : "答案を採点しています…");
    let finalAwaySeconds = weeklyAwaySeconds;
    if (weeklyAwayStartedAtRef.current !== null) {
      const elapsed = Math.max(1, Math.round((Date.now() - weeklyAwayStartedAtRef.current) / 1000));
      finalAwaySeconds += elapsed;
      setWeeklyAwaySeconds((current) => current + elapsed);
      weeklyAwayStartedAtRef.current = null;
    }
    try {
      const response = await fetch("/api/weekly-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", testId: weeklyTest.id, answers: weeklyAnswers, awaySeconds: finalAwaySeconds }),
      });
      const data = await response.json() as {
        error?: string;
        correctAnswers: number;
        totalQuestions: number;
        awaySeconds: number;
        resultQuestions: WeeklyResultQuestion[];
      };
      if (!response.ok) throw new Error(data.error === "already submitted" ? "このテストは採点済みです。" : String(data.error ?? "採点できませんでした。"));
      const submission: WeeklySubmission = {
        status: "submitted",
        answers: weeklyAnswers,
        correctAnswers: data.correctAnswers,
        totalQuestions: data.totalQuestions,
        awaySeconds: data.awaySeconds,
        resultQuestions: data.resultQuestions,
      };
      setWeeklyTest((current) => current ? { ...current, submission } : current);
      setWeeklyMessage("採点が完了しました。間違えた問題は復習ノートにも保存しました。");
      setTodayScore((current) => {
        const today = getLocalDateKey();
        const base = current.date === today ? current : { date: today, correct: 0, total: 0 };
        const next = { date: today, correct: base.correct + data.correctAnswers, total: base.total + data.totalQuestions };
        try { window.localStorage.setItem(userStorageKey(TODAY_SCORE_STORAGE_KEY, authUser.id), JSON.stringify(next)); } catch { /* Keep this session's score. */ }
        return next;
      });
      setReviewQueue((current) => {
        const missed = data.resultQuestions.filter((question) => !question.correct) as unknown as Question[];
        const missedIds = new Set(missed.map((question) => question.id));
        const next = [...missed, ...current.filter((question) => !missedIds.has(question.id))];
        try { window.localStorage.setItem(userStorageKey(REVIEW_QUEUE_STORAGE_KEY, authUser.id), JSON.stringify(next)); } catch { /* Keep this session's queue. */ }
        return next;
      });
      addSubjectProgress(data.resultQuestions);
      try { window.localStorage.removeItem(`weekly-test-answers:${weeklyTest.id}:${authUser.id}`); } catch { /* Draft cleanup is optional. */ }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setWeeklyMessage(error instanceof Error ? error.message : "採点できませんでした。もう一度お試しください。");
      if (String(error).includes("採点済み")) void loadWeeklyTest();
    } finally {
      weeklySubmittingRef.current = false;
      setWeeklySubmitting(false);
    }
  };

  useEffect(() => {
    if (!weeklyStarted || !weeklyTest || weeklyTest.kind !== "active" || weeklyResult) return;
    const isAway = () => document.hidden || view !== "weekly-test";
    const updateAway = () => {
      if (isAway()) {
        if (weeklyAwayStartedAtRef.current === null) weeklyAwayStartedAtRef.current = Date.now();
      } else if (weeklyAwayStartedAtRef.current !== null) {
        const elapsed = Math.max(1, Math.round((Date.now() - weeklyAwayStartedAtRef.current) / 1000));
        setWeeklyAwaySeconds((current) => current + elapsed);
        weeklyAwayStartedAtRef.current = null;
      }
    };
    updateAway();
    document.addEventListener("visibilitychange", updateAway);
    window.addEventListener("pagehide", updateAway);
    window.addEventListener("pageshow", updateAway);
    return () => {
      document.removeEventListener("visibilitychange", updateAway);
      window.removeEventListener("pagehide", updateAway);
      window.removeEventListener("pageshow", updateAway);
      if (weeklyAwayStartedAtRef.current !== null && !isAway()) {
        const elapsed = Math.max(1, Math.round((Date.now() - weeklyAwayStartedAtRef.current) / 1000));
        setWeeklyAwaySeconds((current) => current + elapsed);
        weeklyAwayStartedAtRef.current = null;
      }
    };
  }, [view, weeklyResult, weeklyStarted, weeklyTest]);

  useEffect(() => {
    if (!weeklyStarted || !weeklyTest || weeklyTest.kind !== "active" || weeklyResult || weeklyRemainingSeconds > 0) return;
    void submitWeeklyTest(true);
  }, [weeklyRemainingSeconds, weeklyResult, weeklyStarted, weeklyTest]);

  useEffect(() => {
    if (!authUser) return;
    const syncSummary = () => {
      const serialized = JSON.stringify(guardianSummaryRef.current);
      if (serialized === lastSyncedSummaryRef.current) return;
      lastSyncedSummaryRef.current = serialized;
      const { summaryDate, away, ...summary } = guardianSummaryRef.current;
      const payload = JSON.stringify({ action: "summary", summaryDate, summary, away });
      void fetch("/api/guardian-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      })
        .then(() => {
          void fetch("/api/study-mates", { cache: "no-store" })
            .then((response) => response.ok ? response.json() : null)
            .then((data) => {
              if (Array.isArray(data?.students)) setRegisteredStudyMates(data.students as RegisteredStudyMate[]);
            })
            .catch(() => undefined);
        })
        .catch(() => undefined);
    };
    syncSummary();
    const syncTimer = window.setInterval(syncSummary, 5_000);
    const onVisibilityChange = () => {
      if (!document.hidden) syncSummary();
    };
    const onPageHide = () => {
      const { summaryDate, away, ...summary } = guardianSummaryRef.current;
      const payload = JSON.stringify({ action: "summary", summaryDate, summary, away });
      try {
        navigator.sendBeacon("/api/guardian-report", new Blob([payload], { type: "application/json" }));
      } catch {
        syncSummary();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(syncTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    const syncSummary = window.setTimeout(() => {
      const serialized = JSON.stringify(guardianSummaryRef.current);
      if (serialized === lastSyncedSummaryRef.current) return;
      lastSyncedSummaryRef.current = serialized;
      const { summaryDate, away, ...summary } = guardianSummaryRef.current;
      void fetch("/api/guardian-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summary", summaryDate, summary, away }),
        keepalive: true,
      }).catch(() => undefined);
    }, 2500);
    return () => window.clearTimeout(syncSummary);
  }, [authUser, guardianSummary]);

  const resetAwayTracking = () => {
    awayStartedAtRef.current = null;
    idleActiveRef.current = false;
    lastStudyActionAtRef.current = Date.now();
  };

  const changeChallengeMinutes = (minutes: number) => {
    const safeMinutes = Math.max(1, Math.min(360, minutes));
    setChallengeMinutes(safeMinutes);
    setSeconds(safeMinutes * 60);
    setRunning(false);
    resetAwayTracking();
  };

  const changeTimerMode = (mode: "countdown" | "stopwatch") => {
    setRunning(false);
    setStopwatchRunning(false);
    setTimerMode(mode);
    resetAwayTracking();
  };

  const toggleFreeStopwatch = () => {
    if (!stopwatchRunning && !freeStudyHasPlan) return;
    setStopwatchRunning((current) => !current);
  };

  const resetFreeStopwatch = () => {
    setStopwatchRunning(false);
    setStopwatchSeconds(0);
    stopwatchSecondsRef.current = 0;
    stopwatchBaseSecondsRef.current = 0;
    stopwatchStartedAtRef.current = null;
    setFreeStudyResult("");
    resetAwayTracking();
  };

  const saveFreeStudySession = () => {
    if (!authUser || stopwatchSeconds <= 0) return;
    const nextSession: FreeStudySession = {
      id: `free-${Date.now()}`,
      action: FREE_STUDY_ACTIONS.find((item) => item.key === freeStudyAction)?.label ?? "???",
      plan: freeStudyPlan.trim(),
      result: freeStudyResult.trim(),
      seconds: stopwatchSeconds,
      awaySeconds,
      idleSeconds,
      jukuAwaySeconds,
      savedAt: new Date().toISOString(),
    };
    setFreeStudySessions((current) => {
      const next = [nextSession, ...current].slice(0, 20);
      try {
        window.localStorage.setItem(userStorageKey(FREE_STUDY_SESSIONS_STORAGE_KEY, authUser.id), JSON.stringify(next));
      } catch {
        // Keep the saved note in this session if browser storage is unavailable.
      }
      return next;
    });
    setStopwatchRunning(false);
    setStopwatchSeconds(0);
    setFreeStudyPlan("");
    setFreeStudyResult("");
    resetAwayTracking();
  };

  const changeView = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateWeeklyAnswer = (questionId: string, answer: string) => {
    setWeeklyAnswers((current) => {
      const next = { ...current, [questionId]: answer };
      try {
        if (authUser && weeklyTest) window.localStorage.setItem(`weekly-test-answers:${weeklyTest.id}:${authUser.id}`, JSON.stringify(next));
      } catch {
        // Keep the answer in memory if local draft storage is unavailable.
      }
      return next;
    });
  };

  const gradeQuestion = (index: number, result: "correct" | "wrong") => {
    setGrades((current) => current.map((grade, gradeIndex) => gradeIndex === index ? result : grade));
  };

  const addSubjectProgress = (completedQuestions: Question[]) => {
    if (!authUser || completedQuestions.length === 0) return;
    const subjectCounts = completedQuestions.reduce((counts, question) => {
      if (question.subject === "理社ミックス") return counts;
      if (!subjects.some((subject) => subject.key === question.subject)) return counts;
      counts[question.subject as Exclude<StudySubject, "理社ミックス">] = (counts[question.subject as Exclude<StudySubject, "理社ミックス">] ?? 0) + 1;
      return counts;
    }, {} as Partial<SubjectProgressMap>);

    if (Object.keys(subjectCounts).length === 0) return;

    setSubjectProgressCounts((current) => {
      const next = normalizeSubjectProgress(current);
      for (const [subject, count] of Object.entries(subjectCounts) as Array<[keyof SubjectProgressMap, number]>) {
        next[subject] = Math.min(QUESTIONS_PER_SUBJECT, next[subject] + count);
      }
      try {
        window.localStorage.setItem(userStorageKey(SUBJECT_PROGRESS_STORAGE_KEY, authUser.id), JSON.stringify(next));
      } catch {
        // The progress bar still updates for this session if browser storage is unavailable.
      }
      return next;
    });
  };

  const askSubjectTimer = (subject: StudySubject) => {
    setPracticeStartError("");
    setTimerPromptMinutes(Math.min(PRACTICE_TIMER_MAX_MINUTES, challengeMinutes));
    setSubjectPickerOpen(false);
    setTimerPromptSubject(subject);
  };

  const askPracticeTimer = () => {
    if (selectedSubject) {
      askSubjectTimer(selectedSubject);
      return;
    }
    setSubjectPickerOpen(true);
  };

  const fetchPracticeSet = async (subject: StudySubject, targetSet: number, round: number, excludeIds: string[] = [], excludeKeys: string[] = []) => {
    // Once a learner has a history, the API already removes every prior question.
    // Start at the first remaining page instead of skipping a fresh block of 20.
    const requestedSet = excludeIds.length > 0 || excludeKeys.length > 0 ? 1 : targetSet;
    const params = new URLSearchParams({
      subject,
      set: String(requestedSet),
      round: String(round),
      count: String(QUESTIONS_PER_SET),
    });
    if (excludeIds.length > 0) params.set("excludeIds", excludeIds.join(","));
    if (excludeKeys.length > 0) params.set("excludeKeys", excludeKeys.join(","));
    const response = await fetch(`/api/practice-questions?${params.toString()}`);
    if (response.status === 401) {
      setAuthUser(null);
      setAuthStatus("login");
      throw new Error("login required");
    }
    if (!response.ok) throw new Error("question bank unavailable");
    return await response.json() as { questions: Question[]; totalSets: number; totalQuestions: number };
  };

  const loadNextPracticeSet = async (subject: StudySubject, targetSet: number, round: number) => {
    // Signed-in learners are excluded by D1 in the API. Sending the complete
    // local history in the URL eventually exceeds Cloudflare's URL limit.
    const seenIds = authUser ? [] : readSeenQuestionIds("anonymous", subject);
    const seenKeys = authUser ? [] : readSeenQuestionKeys("anonymous", subject);
    const data = await fetchPracticeSet(subject, targetSet, round, seenIds, seenKeys);
    appendSeenQuestionIds(authUser?.id ?? null, subject, data.questions);
    if (authUser) setSeenQuestionIds((current) => ({ ...current, [subject]: [...(current[subject] ?? []), ...data.questions.map((question) => question.id)] }));
    return data;
  };

  const startSubjectPractice = async (subject: StudySubject, timerMinutes: number | null) => {
    if (practiceLoadInFlightRef.current) return;
    practiceLoadInFlightRef.current = true;
    setPracticeStartError("");
    setLoadingSubject(subject);
    try {
      const data = await loadNextPracticeSet(subject, 1, 1);
      if (data.questions.length !== QUESTIONS_PER_SET) throw new Error("incomplete question set");
      setSelectedSubject(subject);
      setQuestionSequence(data.questions);
      setPracticeTotalSets(data.totalSets);
      setSetNumber(1);
      setShuffleRound(1);
      setPracticePhase("questions");
      setPracticeBatchId(crypto.randomUUID());
      setPracticeSaveError("");
      setGrades(Array(QUESTIONS_PER_SET).fill(null));
      setStopwatchRunning(false);
      resetAwayTracking();
      if (timerMinutes !== null) {
        const safeMinutes = Math.max(1, Math.min(PRACTICE_TIMER_MAX_MINUTES, timerMinutes));
        setTimerMode("countdown");
        setChallengeMinutes(safeMinutes);
        setSeconds(safeMinutes * 60);
        setSubjectTimerEnabled(true);
        setRunning(true);
      } else {
        setSubjectTimerEnabled(false);
        setRunning(false);
      }
      setTimerPromptSubject(null);
      changeView("practice");
    } catch {
      setPracticeStartError("問題を読み込めませんでした。通信を確認して、もう一度押してください。");
    } finally {
      practiceLoadInFlightRef.current = false;
      setLoadingSubject(null);
    }
  };

  const startNextSet = async () => {
    if (practiceLoadInFlightRef.current) return;
    if (!selectedSubject) {
      setSubjectPickerOpen(true);
      return;
    }
    practiceLoadInFlightRef.current = true;
    setSubjectTimerEnabled(false);
    setLoadingSubject(selectedSubject);
    try {
      const nextRound = setNumber >= totalSets ? shuffleRound + 1 : shuffleRound;
      const nextSet = setNumber >= totalSets ? 1 : setNumber + 1;
      const data = await loadNextPracticeSet(selectedSubject, nextSet, nextRound);
      if (data.questions.length !== QUESTIONS_PER_SET) throw new Error("incomplete question set");
      setQuestionSequence(data.questions);
      setPracticeTotalSets(data.totalSets);
      setSetNumber(nextSet);
      setShuffleRound(nextRound);
      setPracticeBatchId(crypto.randomUUID());
      setPracticeSaveError("");
      setPracticePhase("questions");
      setGrades(Array(QUESTIONS_PER_SET).fill(null));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setPracticeSaveError("次の20問を準備できませんでした。もう一度押してください。");
    } finally {
      practiceLoadInFlightRef.current = false;
      setLoadingSubject(null);
    }
  };

  const completePractice = async () => {
    if (practiceSaveInFlightRef.current || !authUser || gradedCount !== QUESTIONS_PER_SET || activeQuestions.length !== QUESTIONS_PER_SET) return;
    practiceSaveInFlightRef.current = true;
    const batchId = practiceBatchId || crypto.randomUUID();
    if (!practiceBatchId) setPracticeBatchId(batchId);
    setPracticeSaving(true);
    setPracticeSaveError("");
    try {
      const response = await fetch("/api/study-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attempt-batch",
          batchId,
          attempts: activeQuestions.map((question, index) => ({
            question: {
              id: question.id,
              key: questionKey(question),
              subject: question.subject,
              payload: question,
            },
            result: grades[index],
            source: "practice",
          })),
        }),
      });
      if (!response.ok) throw new Error("practice save failed");
      const saveResult = await response.json() as { duplicate?: boolean };

      if (!saveResult.duplicate) {
      setReviewQueue((current) => {
      const missedQuestions = activeQuestions.filter((_, index) => grades[index] === "wrong");
      const missedIds = new Set(missedQuestions.map((question) => question.id));
      const correctIds = new Set(activeQuestions.filter((_, index) => grades[index] === "correct").map((question) => question.id));
      const nextQueue = [
        ...missedQuestions,
        ...current.filter((question) => !missedIds.has(question.id) && !correctIds.has(question.id)),
      ];

      try {
        if (authUser) window.localStorage.setItem(userStorageKey(REVIEW_QUEUE_STORAGE_KEY, authUser.id), JSON.stringify(nextQueue));
      } catch {
        // Keep the review queue in this session if browser storage is unavailable.
      }

      return nextQueue;
      });

      setTodayScore((current) => {
      const today = getLocalDateKey();
      const base = current.date === today ? current : { date: today, correct: 0, total: 0 };
      const nextScore = {
        date: today,
        correct: base.correct + correctCount,
        total: base.total + gradedCount,
      };

      try {
        if (authUser) window.localStorage.setItem(userStorageKey(TODAY_SCORE_STORAGE_KEY, authUser.id), JSON.stringify(nextScore));
      } catch {
        // The score still works for this session if browser storage is unavailable.
      }

      return nextScore;
      });
      addSubjectProgress(activeQuestions);
      }

      // D1 is authoritative. This also repairs a browser that retried a batch
      // after the server had already accepted it.
      const snapshotResponse = await fetch("/api/study-records", { cache: "no-store" });
      if (snapshotResponse.ok) {
        const snapshot = await snapshotResponse.json() as {
          today: string;
          solved: number;
          correct: number;
          mistakes?: Array<{ question?: Record<string, unknown> }>;
        };
        const authoritativeScore = {
          date: snapshot.today,
          correct: Math.max(0, Number(snapshot.correct ?? 0)),
          total: Math.max(0, Number(snapshot.solved ?? 0)),
        };
        setTodayScore(authoritativeScore);
        try {
          window.localStorage.setItem(userStorageKey(TODAY_SCORE_STORAGE_KEY, authUser.id), JSON.stringify(authoritativeScore));
        } catch {
          // D1 remains authoritative.
        }
        const authoritativeMistakes = (Array.isArray(snapshot.mistakes) ? snapshot.mistakes : [])
          .map((item) => item.question as unknown as Question)
          .filter(isValidPracticeQuestion);
        setReviewQueue(authoritativeMistakes);
        try {
          window.localStorage.setItem(userStorageKey(REVIEW_QUEUE_STORAGE_KEY, authUser.id), JSON.stringify(authoritativeMistakes));
        } catch {
          // D1 remains authoritative.
        }
      }
      setPracticePhase("complete");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setPracticeSaveError("採点結果を保存できませんでした。通信を確認して、もう一度押してください。");
    } finally {
      practiceSaveInFlightRef.current = false;
      setPracticeSaving(false);
    }
  };

  const saveSingleAttempt = async (question: Question, result: "correct" | "wrong", source: string) => {
    if (!authUser) throw new Error("login required");
    const response = await fetch("/api/study-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "attempt-batch",
        batchId: crypto.randomUUID(),
        attempts: [{
          question: {
            id: question.id,
            key: questionKey(question),
            subject: question.subject,
            payload: question,
          },
          result,
          source,
        }],
      }),
    });
    if (!response.ok) throw new Error("attempt save failed");
  };

  const gradeFocusQuestion = async (result: "correct" | "wrong") => {
    if (!focusQuestion || singleAttemptSaving) return;
    setSingleAttemptSaving(true);
    setMistakeMessage("");
    try {
      await saveSingleAttempt(focusQuestion, result, focusIsReview ? "focus-review" : "focus");
    } catch {
      setMistakeMessage("結果を保存できませんでした。通信を確認して、もう一度押してください。");
      setSingleAttemptSaving(false);
      return;
    }

    if (focusIsReview) {
      setReviewQueue((current) => {
        const remaining = current.filter((question) => question.id !== focusQuestion.id);
        const nextQueue = result === "wrong" ? [...remaining, focusQuestion] : remaining;
        try {
          if (authUser) window.localStorage.setItem(userStorageKey(REVIEW_QUEUE_STORAGE_KEY, authUser.id), JSON.stringify(nextQueue));
        } catch {
          // Keep the review result in this session if browser storage is unavailable.
        }
        return nextQueue;
      });
    } else {
      setFocusOffset((current) => current + 1);
    }

    setFocusAnswerVisible(false);
    addSubjectProgress([focusQuestion]);
    setSingleAttemptSaving(false);
  };

  const saveMistakeReview = async (question: Question, result: "mastered" | "again") => {
    if (singleAttemptSaving) return;
    setSingleAttemptSaving(true);
    setMistakeMessage("");
    try {
      await saveSingleAttempt(question, result === "mastered" ? "correct" : "wrong", "mistake-review");
    } catch {
      setMistakeMessage("復習結果を保存できませんでした。通信を確認して、もう一度押してください。");
      setSingleAttemptSaving(false);
      return;
    }
    setReviewQueue((current) => {
      const remaining = current.filter((item) => item.id !== question.id);
      const nextQueue = result === "again" ? [...remaining, question] : remaining;
      try {
        if (authUser) window.localStorage.setItem(userStorageKey(REVIEW_QUEUE_STORAGE_KEY, authUser.id), JSON.stringify(nextQueue));
      } catch {
        // Keep the review result in this session if browser storage is unavailable.
      }
      return nextQueue;
    });
    setRevealedMistakeIds((current) => {
      const next = new Set(current);
      next.delete(question.id);
      return next;
    });
    setMistakeMessage(result === "mastered" ? "1問を克服済みにしました。いい復習！" : "復習リストの最後に戻しました。もう一度挑戦しよう。 ");
    setSingleAttemptSaving(false);
  };

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setAuthSubmitting(true);
    try {
      const response = await fetch("/api/device-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: authStatus === "setup" ? "register" : "login",
          displayName: toGivenNameOnly(authDisplayName),
            pin: authPin,
          }),
        });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.error ?? "ログインできませんでした。"));
      setAuthUser(data.user as AuthUser);
      setAuthDisplayName(String(data.user.displayName));
      setAuthPin("");
      setAuthStatus("authenticated");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "ログインできませんでした。");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const logout = async () => {
    setRunning(false);
    setStopwatchRunning(false);
    await fetch("/api/device-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => undefined);
    setAuthUser(null);
    setAuthPin("");
    setAuthError("");
    setAuthStatus("login");
  };

  if (authStatus !== "authenticated" || !authUser) {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-brand"><span className="brand-mark">S</span><strong>STUDY BASE</strong></div>
          {authStatus === "loading" ? (
            <div className="auth-loading" role="status"><span /><p>この端末を確認しています…</p></div>
          ) : (
            <>
              <p className="eyebrow">ONE DEVICE・ONE STUDENT</p>
              <h1 id="auth-title">{authStatus === "setup" ? "この端末をあなた専用に" : `おかえり、${authDisplayName || "受験生"}さん`}</h1>
              <p className="auth-lead">{authStatus === "setup" ? "名前とPINを登録すると、学習記録がこの端末のあなた専用になります。" : "登録したPINで学習を続けよう。"}</p>
              <form className="auth-form" onSubmit={submitAuth}>
                {authStatus === "setup" && (
                  <label><span>下の名前・ニックネーム</span><input value={authDisplayName} onChange={(event) => setAuthDisplayName(event.target.value)} maxLength={20} autoComplete="nickname" placeholder="例：はる" required /></label>
                )}
                <label><span>{authStatus === "setup" ? "ログインPINを決める" : "ログインPIN"}</span><input value={authPin} onChange={(event) => setAuthPin(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} autoComplete={authStatus === "setup" ? "new-password" : "current-password"} placeholder="4〜8桁の数字" required /></label>
                {authError && <p className="auth-error" role="alert">{authError}</p>}
                <button className="primary-button auth-submit" disabled={authSubmitting}>{authSubmitting ? "確認中…" : authStatus === "setup" ? "この端末に登録して始める" : "ログインする"}</button>
              </form>
              <div className="auth-device-note"><span>1</span><p><strong>この端末は1人専用</strong><br />ログアウト後も別の利用者は新規登録できません。</p></div>
              <small className="auth-footnote">PINを5回間違えると、5分間ロックされます。</small>
            </>
          )}
        </section>
      </main>
    );
  }

  if (studentLocked) {
    return (
      <main className="student-lock-page">
        <section className="student-lock-card" aria-labelledby="student-lock-title">
          <div className="auth-brand"><span className="brand-mark">S</span><strong>STUDY BASE</strong></div>
          <p className="eyebrow">NIGHT LOCK・JST 0:00-5:00</p>
          <h1 id="student-lock-title">今日はここまで。</h1>
          <p>日本時間0時〜朝5時は、生徒画面をお休みにしています。眠る時間も、合格へ向かう大事な準備です。</p>
          <div className="student-lock-window">
            <span>再開時間</span>
            <strong>朝5:00</strong>
            <small>管理者画面は /admin から利用できます。</small>
          </div>
          <button className="secondary-button" onClick={() => void logout()}>ログアウト</button>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => changeView("home")} aria-label="ホームへ">
          <span className="brand-mark">S</span>
          <span>STUDY BASE</span>
        </button>
        <nav className="desktop-nav" aria-label="メインメニュー">
          <button className={view === "home" ? "active" : ""} onClick={() => changeView("home")}>ホーム</button>
          <button className={view === "practice" ? "active" : ""} onClick={askPracticeTimer}>問題演習</button>
          <button className={view === "mistakes" ? "active" : ""} onClick={() => changeView("mistakes")}>間違いノート</button>
          <button className={view === "weekly-test" ? "active" : ""} onClick={() => changeView("weekly-test")}>一斉テスト</button>
          <button className={view === "timer" ? "active" : ""} onClick={() => changeView("timer")}>集中タイマー</button>
          <button className={view === "ranking" ? "active" : ""} onClick={() => changeView("ranking")}>ランキング</button>
        </nav>
        <div className="account-menu"><span className="avatar" aria-hidden="true">{authUser.displayName.slice(0, 1)}</span><span className="account-name">{authUser.displayName}</span><button onClick={() => void logout()}>ログアウト</button></div>
      </header>

      <div className="page-shell">
        {view === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">TODAY&apos;S MISSION</p>
                <div className="hero-pills"><span>● {studyMateRows.length}人が勉強中</span><span>今日も一歩、前へ</span></div>
                <h1>今日も、<br /><em>{authUser.displayName}</em>の伸びしろが<br />動き出す。</h1>
                <p>勉強も、仲間も、今日しかない。未来の自分へ、最高の一日を。</p>
              </div>
              <div className="streak-card">
                <span className="flame">✦</span>
                <div><strong>{loginDaysCount}</strong><span>{loginDaysCount === 1 ? "DAY" : "DAYS"}</span></div>
                <p>{dailyStreakMessage}</p>
              </div>
            </section>

            <section className="stats-grid" aria-label="今日の学習状況">
              <button className="stat-card stat-card-button" onClick={() => setStatsDetail("focus")} aria-label="今日の集中時間の内訳を見る"><Icon>◷</Icon><div><span>今日の集中時間</span><strong>{reportFocusHours}<span>h</span> {reportFocusMinutes}<span>m</span></strong><small>日本時間0時に翌日分へ切替</small></div><div className="mini-ring">{Math.min(100, Math.round(reportFocusSeconds / 72))}%</div></button>
              <article className="stat-card"><Icon>✓</Icon><div><span>今日の正答率</span><strong>{todayAccuracy ?? "--"}<span>%</span></strong><small className={todayTotal > 0 ? "up" : ""}>{todayTotal > 0 ? `${todayCorrect} / ${todayTotal}問を採点済み` : "20問を採点すると表示"}</small><div className="accuracy-graph" aria-label={`今日の正答率 ${todayAccuracyGraph}%`}><span style={{ width: `${todayAccuracyGraph}%` }} /></div></div><button className="accuracy-action" onClick={askPracticeTimer} aria-label="問題演習を始める">{todayTotal > 0 ? "続ける" : "挑戦"}<span>→</span></button></article>
              <button className="stat-card stat-card-button" onClick={() => setStatsDetail("solved")} aria-label="今日解いた問題の内訳を見る"><Icon>◎</Icon><div><span>今日解いた問題</span><strong>{todayTotal}<span>問</span></strong><small>{todayTotal > 0 ? `${todayCorrect}問正解` : "採点すると自動で追加"}</small></div><div className="stat-action-chip">内訳 →</div></button>
              <article className="stat-card wrong-stat"><Icon>×</Icon><div><span>間違えた問題</span><strong>{todayWrong}<span>問</span></strong><small>{reviewQueue.length > 0 ? `間違いノートに${reviewQueue.length}問保存中` : "現在、間違いなし"}</small></div><button className="accuracy-action mistake-action" onClick={() => changeView("mistakes")} aria-label="間違いノートを開く">復習<span>→</span></button></article>
            </section>

            <section className="home-grid">
              <div>
                <div className="section-heading"><div><p className="eyebrow">CHOOSE YOUR MISSION・5教科 各1000問</p><h2>好きな科目から、流れに乗ろう。</h2></div><button className="text-button" disabled={Boolean(loadingSubject)} onClick={() => askSubjectTimer("理社ミックス")}>理社ミックス →</button></div>
                <div className="subjects-grid">
                  {subjects.map((subject) => (
                    (() => {
                      const solvedCount = subjectProgressCounts[subject.key] ?? 0;
                      const progress = subjectProgressPercent(solvedCount);
                      return (
                        <button key={subject.key} className="subject-card" disabled={Boolean(loadingSubject)} onClick={() => askSubjectTimer(subject.key)}>
                          <span className={`subject-icon ${subject.color}`}>{subject.icon}</span>
                          <span className="subject-copy"><strong>{subject.key}</strong><small>{loadingSubject === subject.key ? "1000問を準備中…" : `${Math.min(QUESTIONS_PER_SUBJECT, solvedCount)} / ${QUESTIONS_PER_SUBJECT}問`}</small></span>
                          <span className="subject-progress"><span style={{ width: `${progress}%` }} /></span>
                          <span className="percent">{progress}%</span>
                        </button>
                      );
                    })()
                  ))}
                </div>
              </div>

              <aside className="focus-panel">
                <p className="eyebrow">TODAY&apos;S FOCUS</p>
                <h2>今日の1問が、<br />未来を変える。</h2>
                <div className="focus-visual"><span>{focusQuestion?.subject === "理科" ? "理" : "社"}</span><i>{focusIsReview ? "復習優先" : "＋12 XP"}</i></div>
                <span className="pill purple-pill">{focusIsReview ? `間違えた問題・残り${reviewQueue.length}問` : `重要問題・${focusQuestion?.subject ?? "理科"}`}</span>
                <h3 className="focus-question-text">{cleanQuestionText(focusQuestion?.question)}</h3>
                <p>{focusQuestion?.subject}・{focusQuestion?.unit}｜{focusIsReview ? "前回の間違いをもう一度" : "近畿圏入試で差がつく重要ポイント"}</p>
                {!focusAnswerVisible ? (
                  <button className="primary-button" onClick={() => setFocusAnswerVisible(true)}>この1問の答えを見る <span>→</span></button>
                ) : (
                  <div className="focus-answer">
                    <span>ANSWER</span>
                    <strong>{focusQuestion?.answer}</strong>
                    <p>{focusQuestion?.explanation}</p>
                    <div className="focus-grade">
                      <button className="wrong" disabled={singleAttemptSaving} onClick={() => void gradeFocusQuestion("wrong")}>× まだ</button>
                      <button className="correct" disabled={singleAttemptSaving} onClick={() => void gradeFocusQuestion("correct")}>○ できた</button>
                    </div>
                  </div>
                )}
              </aside>
            </section>

            <section className="bottom-grid">
              <article className="timer-teaser">
                <div><p className="eyebrow">FOCUS BOOST</p><h2>集中ブースト</h2><p>通知を止めて、未来が変わる時間を始めよう。</p></div>
                <div className="timer-preview"><strong>02:00:00</strong><span>2時間チャレンジ</span></div>
                <button className="round-button" onClick={() => changeView("timer")} aria-label="タイマーを開く">▶</button>
              </article>
              <article className="friends-card">
                <div className="section-heading compact"><div><p className="eyebrow">STUDY MATES</p><h2>みんなの今日が、動いてる。</h2></div><span className={`online${studyingMateCount === 0 ? " offline" : ""}`}>{studyingMateCount}人が勉強中</span></div>
                <p className="bot-study-note">登録メンバーだけを、実際の学習状態と時間で表示します。</p>
                <div className="study-live-head"><span>仲間</span><span>開始</span><span>学習時間</span></div>
                <div className="study-live-list">
                  {studyMateRows.map((mate) => (
                    <div className={`study-person is-${mate.status}${mate.isMe ? " me" : ""}`} key={mate.id}>
                      <span className={`friend-avatar ${mate.color}`}>{mate.name[0]}<i /></span>
                      <div className="study-person-copy"><strong>{mate.name}<em>{mate.badge}</em></strong><small>{mate.activity}{mate.detail ? `・${mate.detail}` : ""}</small></div>
                      <time>{mate.startTime}</time>
                      <span className="elapsed-time">{mate.status === "not_started" ? "—" : formatStudyTime(mate.minutes)}</span>
                    </div>
                  ))}
                  {studyMateRows.length === 0 && <p className="study-live-empty">登録メンバーがまだいません。</p>}
                </div>
              </article>
            </section>
          </>
        )}

        {view === "practice" && (
          <section className="practice-page">
            <div className="practice-topline">
              <div><p className="eyebrow">{selectedSubject}・SET {String(setNumber).padStart(3, "0")} / {String(totalSets).padStart(3, "0")}{shuffleRound > 1 ? `｜${shuffleRound}周目・ランダム` : ""}</p><h1>{practicePhase === "questions" ? `${selectedSubject} 20問チャレンジ` : practicePhase === "review" ? "答え合わせ" : "結果"}</h1></div>
              <div className="session-progress"><span>{practicePhase === "questions" ? "STEP 1｜まず全部解く" : practicePhase === "review" ? "STEP 2｜自己採点" : "COMPLETE"}</span><strong>{practicePhase === "questions" ? "20問" : practicePhase === "review" ? `${gradedCount} / 20` : "20 / 20"}</strong><i><b style={{ width: `${practicePhase === "questions" ? 50 : practicePhase === "review" ? 50 + gradedCount * 2.5 : 100}%` }} /></i></div>
            </div>
            {subjectTimerEnabled && practicePhase === "questions" && <div className={`practice-timer-strip${running ? " running" : ""}`} role="timer" aria-label={`残り時間 ${timerLabel}`}>
              <div><span>◷ 20問チャレンジ</span><strong>{seconds === 0 ? "TIME UP" : timerLabel}</strong><small>{running ? "集中タイマー計測中" : seconds === 0 ? "時間になりました。ここまでの力を確認しよう。" : "一時停止中"}</small></div>
              <button onClick={() => setRunning((current) => !current)} disabled={seconds === 0}>{running ? "一時停止" : "再開"}</button>
            </div>}
            {practicePhase === "questions" && <>
              <div className="set-guide"><div><strong>近畿圏55レベル</strong><span>基礎から標準・近畿圏の入試基礎へ段階的に出題します。</span></div><span className="set-mix">{selectedSubject === "理社ミックス" ? "理科10問＋社会10問" : `${selectedSubject} 20問`}</span></div>
              <div className="question-sheet">
                {activeQuestions.map((question, index) => (
                  <article className="sheet-question" key={`${question.subject}-${index}`}>
                    <span className="sheet-number">{index + 1}</span>
                    <div><div className="question-meta"><span className="pill purple-pill">{question.subject}</span><span>{question.unit}</span></div><h2>{cleanQuestionText(question.question)}</h2><div className="writing-line" aria-hidden="true" /></div>
                  </article>
                ))}
              </div>
              <div className="set-action"><p>20問すべて解いてから、まとめて答え合わせをします。</p><button className="primary-button big" onClick={() => { setRunning(false); setPracticePhase("review"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>20問の答えを見る →</button></div>
            </>}
            {practicePhase === "review" && <>
              <div className="review-summary"><div><strong>{gradedCount}</strong><span>/ 20 採点済み</span></div><div className="review-counts"><span className="score-good">○ できた {correctCount}</span><span className="score-bad">× できなかった {wrongCount}</span></div></div>
              <div className="answer-sheet">
                {activeQuestions.map((question, index) => (
                  <article className={`review-card ${grades[index] ?? ""}`} key={`${question.answer}-${index}`}>
                    <div className="review-question"><span className="sheet-number">{index + 1}</span><div><div className="question-meta"><span className="pill purple-pill">{question.subject}</span><span>{question.unit}</span></div><h2>{cleanQuestionText(question.question)}</h2></div></div>
                    <div className="answer-box"><span>ANSWER</span><strong>{question.answer}</strong><p>{question.explanation}</p></div>
                    <div className="self-grade"><span>自分の答えは？</span><button className={grades[index] === "wrong" ? "selected wrong" : "wrong"} onClick={() => gradeQuestion(index, "wrong")} aria-pressed={grades[index] === "wrong"}>× できなかった</button><button className={grades[index] === "correct" ? "selected correct" : "correct"} onClick={() => gradeQuestion(index, "correct")} aria-pressed={grades[index] === "correct"}>○ できた</button></div>
                  </article>
                ))}
              </div>
              <div className="set-action final-action"><p>{practiceSaveError || (gradedCount < 20 ? `あと${20 - gradedCount}問を判定してください。` : "20問すべて採点できました。")}</p><button className="primary-button big" disabled={gradedCount < 20 || practiceSaving} onClick={() => void completePractice()}>{practiceSaving ? "採点結果を保存中…" : "採点を完了して結果を見る"}</button></div>
            </>}
            {practicePhase === "complete" && <article className="completion-card">
              <span className="completion-mark">✓</span>
              <p className="eyebrow">SET {String(setNumber).padStart(3, "0")} COMPLETE</p>
              <h2>20問、おつかれさま！</h2>
              <p>今日の積み重ねが、ちゃんと合格力になっています。</p>
              <div className="completion-score"><div><strong>{correctCount}</strong><span>正解</span></div><div><strong>{wrongCount}</strong><span>復習へ</span></div><div><strong>{Math.round((correctCount / 20) * 100)}%</strong><span>正答率</span></div></div>
              {practiceSaveError && <p className="auth-error" role="alert">{practiceSaveError}</p>}
              <button className="primary-button big" disabled={Boolean(loadingSubject)} onClick={() => void startNextSet()}>{loadingSubject ? "次の20問を準備中…" : setNumber >= totalSets ? "ランダムに並べ替えて SET 001へ ↻" : `次の20問へ　SET ${String(setNumber + 1).padStart(3, "0")} →`}</button>
            </article>}
          </section>
        )}

        {view === "mistakes" && (
          <section className="mistakes-page">
            <div className="mistakes-hero">
              <div><p className="eyebrow">YOUR GROWTH NOTE</p><h1>間違いノート</h1><p>間違えた問題は、伸びる場所。答えられるまで何度でも戻ってこよう。</p></div>
              <div className="mistakes-total"><strong>{reviewQueue.length}</strong><span>復習する問題</span></div>
            </div>
            <div className="mistake-filters" role="tablist" aria-label="科目で絞り込む">
              {mistakeSubjectFilters.map((subject) => {
                const count = subject === "すべて" ? reviewQueue.length : reviewQueue.filter((question) => question.subject === subject).length;
                return <button key={subject} role="tab" aria-selected={mistakeSubject === subject} className={mistakeSubject === subject ? "active" : ""} onClick={() => { setMistakeSubject(subject); setMistakeMessage(""); }}>{subject}<span>{count}</span></button>;
              })}
            </div>
            {mistakeMessage && <p className="mistake-message" role="status">✓ {mistakeMessage}</p>}
            {filteredMistakes.length > 0 ? <div className="mistake-list">
              {filteredMistakes.map((question, index) => {
                const answerVisible = revealedMistakeIds.has(question.id);
                return <article className={`mistake-card${answerVisible ? " answer-open" : ""}`} key={question.id}>
                  <div className="mistake-card-head"><span className="mistake-number">{String(index + 1).padStart(2, "0")}</span><div><span className="pill purple-pill">{question.subject}</span><small>{question.unit}</small></div></div>
                  <h2>{cleanQuestionText(question.question)}</h2>
                  {!answerVisible ? <>
                    <div className="mistake-writing-line"><span>まずはノートに答えを書こう</span></div>
                    <button className="mistake-reveal" aria-expanded="false" onClick={() => setRevealedMistakeIds((current) => new Set(current).add(question.id))}>もう一度解いて、答えを見る →</button>
                  </> : <>
                    <div className="mistake-answer"><span>ANSWER</span><strong>{question.answer}</strong><p>{question.explanation}</p></div>
                    <div className="mistake-grade"><span>今回はどうだった？</span><button className="mistake-again" disabled={singleAttemptSaving} onClick={() => void saveMistakeReview(question, "again")}>× まだ復習する</button><button className="mistake-mastered" disabled={singleAttemptSaving} onClick={() => void saveMistakeReview(question, "mastered")}>✓ 克服できた</button></div>
                  </>}
                </article>;
              })}
            </div> : <div className="mistake-empty">
              <span>✓</span>
              <h2>{reviewQueue.length === 0 ? "間違いノートは空っぽ！" : `${mistakeSubject}の復習問題はありません`}</h2>
              <p>{reviewQueue.length === 0 ? "克服した問題はここから消えていきます。次の20問に挑戦しよう。" : "ほかの科目を選ぶと、保存中の問題を確認できます。"}</p>
              <button className="primary-button" onClick={() => reviewQueue.length === 0 ? changeView("home") : setMistakeSubject("すべて")}>{reviewQueue.length === 0 ? "科目を選んで挑戦する" : "すべての問題を見る"}</button>
            </div>}
          </section>
        )}

        {view === "weekly-test" && (
          <section className="weekly-test-page">
            {weeklyLoading ? <div className="weekly-state-card"><span className="weekly-state-icon">◷</span><h1>一斉テストを確認中…</h1><p>管理者が公開した最新のテストを読み込んでいます。</p></div> : !weeklyTest ? <div className="weekly-state-card"><span className="weekly-state-icon">✓</span><p className="eyebrow">WEEKLY CHALLENGE</p><h1>次の一斉テストを待とう。</h1><p>テストが公開されると、ここに開始時刻と出題内容が表示されます。</p></div> : weeklyResult ? <>
              <div className="weekly-result-hero">
                <div><p className="eyebrow">WEEKLY TEST COMPLETE</p><h1>{weeklyTest.title}</h1><p>7日分の力を確認できました。間違いは復習ノートに保存されています。</p></div>
                <div className="weekly-result-score"><strong>{weeklyResult.correctAnswers}</strong><span>/ {weeklyResult.totalQuestions}問</span><small>{Math.round((weeklyResult.correctAnswers / Math.max(1, weeklyResult.totalQuestions)) * 100)}%</small></div>
              </div>
              <div className="weekly-result-meta"><span>提出済み</span><strong>離脱時間 {formatAwayTime(weeklyResult.awaySeconds)}</strong><button onClick={() => changeView("mistakes")}>間違いを復習する →</button></div>
              <div className="weekly-result-list">
                {weeklyResult.resultQuestions.map((question, index) => <article key={question.id} className={question.correct ? "correct" : "wrong"}>
                  <div className="weekly-result-head"><span>{question.correct ? "○" : "×"}</span><div><small>{question.subject}・{question.unit}</small><strong>問{index + 1}</strong></div></div>
                  <h2>{cleanQuestionText(question.question)}</h2>
                  <div className="weekly-answer-comparison"><div><span>あなたの答え</span><strong>{question.studentAnswer || "未回答"}</strong></div><div><span>正解</span><strong>{question.answer}</strong></div></div>
                  <p>{question.explanation}</p>
                </article>)}
              </div>
            </> : weeklyTest.kind === "upcoming" ? <div className="weekly-state-card weekly-waiting">
              <span className="weekly-live-label">公開中・開始待ち</span><p className="eyebrow">EVERYONE STARTS TOGETHER</p><h1>{weeklyTest.title}</h1>
              <p>みんなで同じ時刻にスタート。開始すると問題がここに表示されます。</p>
              <div className="weekly-countdown"><span>開始まで</span><strong>{formatClock(weeklyUntilStartSeconds)}</strong></div>
              <dl><div><dt>開始</dt><dd>{new Date(weeklyTest.startsAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</dd></div><div><dt>制限時間</dt><dd>{weeklyTest.durationMinutes}分</dd></div><div><dt>問題数</dt><dd>{weeklyTest.questionCount}問</dd></div></dl>
              <div className="weekly-subjects">{weeklyTest.subjects.map((subject) => <span key={subject}>{subject}</span>)}</div>
            </div> : weeklyTest.kind === "ended" ? <div className="weekly-state-card"><span className="weekly-state-icon">!</span><p className="eyebrow">TEST CLOSED</p><h1>{weeklyTest.title}は終了しました。</h1><p>次の一斉テストが公開されると、この画面にお知らせします。</p></div> : <>
              <header className="weekly-exam-header">
                <div><span className="weekly-live-label">● 一斉テスト実施中</span><p className="eyebrow">7 DAYS REVIEW</p><h1>{weeklyTest.title}</h1><p>{weeklyTest.questionCount}問・{weeklyTest.subjects.join(" / ")}</p></div>
                <div className="weekly-exam-clock" role="timer" aria-label={`残り時間 ${formatClock(weeklyRemainingSeconds)}`}><span>残り時間</span><strong>{formatClock(weeklyRemainingSeconds)}</strong><small>{weeklyAnsweredCount} / {weeklyTest.questionCount}問 回答</small></div>
              </header>
              {weeklyMessage && <p className="weekly-message" role="status">{weeklyMessage}</p>}
              <div className="weekly-away-strip"><span>離脱時間も記録中</span><strong>{formatAwayTime(weeklyAwaySeconds)}</strong><small>別タブ・別アプリ・画面オフの時間</small></div>
              <div className="weekly-question-list">
                {weeklyTest.questions.map((question, index) => <article key={question.id}>
                  <div className="weekly-question-number">{String(index + 1).padStart(2, "0")}</div>
                  <div className="weekly-question-body"><div className="question-meta"><span className="pill purple-pill">{question.subject}</span><span>{question.unit}</span></div><h2>{cleanQuestionText(question.question)}</h2><label><span>答え</span><input value={weeklyAnswers[question.id] ?? ""} onChange={(event) => updateWeeklyAnswer(question.id, event.target.value)} autoComplete="off" placeholder="ここに入力" /></label></div>
                </article>)}
              </div>
              <div className="weekly-submit-card"><div><strong>{weeklyAnsweredCount}問回答済み</strong><span>未回答も含めて、終了時刻になると自動提出されます。</span></div><button className="primary-button" disabled={weeklySubmitting} onClick={() => void submitWeeklyTest(false)}>{weeklySubmitting ? "採点中…" : "答案を提出して採点する"}</button></div>
            </>}
            {weeklyMessage && weeklyTest?.kind !== "active" && <p className="weekly-message" role="status">{weeklyMessage}</p>}
          </section>
        )}

        {view === "timer" && (
          <section className="timer-page">
            <p className="eyebrow">DEEP FOCUS</p>
            <h1>{timerMode === "countdown" ? `${challengeMinutes}分後、今よりちょっと強い自分へ。` : "やった時間は、ぜんぶ自信になる。"}</h1>
            <p>{timerMode === "countdown" ? "全部できなくていい。まずはスタートを押して、今日の一歩を始めよう。" : "何分でもOK。今日の頑張りを、自分の記録に残そう。"}</p>
            <div className="timer-mode-tabs" role="tablist" aria-label="計測モード">
              <button role="tab" aria-selected={timerMode === "countdown"} className={timerMode === "countdown" ? "active" : ""} onClick={() => changeTimerMode("countdown")}>◷ チャレンジタイマー</button>
              <button role="tab" aria-selected={timerMode === "stopwatch"} className={timerMode === "stopwatch" ? "active" : ""} onClick={() => changeTimerMode("stopwatch")}>⏱ フリーストップウォッチ</button>
            </div>
            {timerMode === "countdown" && <div className="duration-control">
              <span>チャレンジ時間</span>
              <div className="duration-presets">{FOCUS_TIMER_OPTIONS.map((minutes) => <button key={minutes} disabled={running} className={challengeMinutes === minutes ? "active" : ""} onClick={() => changeChallengeMinutes(minutes)}>{minutes}分</button>)}</div>
              <label><input type="number" min="1" max="360" value={challengeMinutes} disabled={running} onChange={(event) => changeChallengeMinutes(Number(event.target.value))} aria-label="チャレンジ時間（分）" /><span>分</span></label>
            </div>}
            {timerMode === "stopwatch" && <section className="free-study-card" aria-label="何をしたかも、記録する。">
              <div className="free-study-head">
                <div><span>WHAT DID YOU DO?</span><strong>何をしたかも、記録する。</strong></div>
                <em className={freeStudyRisk ? "risk" : ""}>{freeStudyAtJuku ? "塾はノーカウント" : freeStudyReliability}</em>
              </div>
              <div className="free-study-actions">
                {FREE_STUDY_ACTIONS.map((action) => <button key={action.key} className={`${freeStudyAction === action.key ? "active" : ""}${action.key === "juku" ? " juku-action" : ""}`} disabled={stopwatchRunning} onClick={() => setFreeStudyAction(action.key)}>{action.label}</button>)}
              </div>
              <label className="free-study-input"><span>開始前：今日は何をする？</span><input value={freeStudyPlan} disabled={stopwatchRunning} onChange={(event) => setFreeStudyPlan(event.target.value)} placeholder="例：数学ワーク P32〜35、英単語50個" /></label>
              {stopwatchSeconds > 0 && <label className="free-study-input"><span>終了後：今日は何をした？</span><textarea value={freeStudyResult} onChange={(event) => setFreeStudyResult(event.target.value)} placeholder="例：ワーク2周、英単語50個、間違い直し完了" /></label>}
              <p>{freeStudyAtJuku ? "塾モードでは、演習・復習・一斉テスト以外の時間を塾離脱として記録します。" : "フリー計測中は、やった内容と時間を記録して後で見返せます。"}</p>
            </section>}
            <div className={`timer-orbit ${(timerMode === "countdown" ? running : stopwatchRunning) ? "running" : ""}`}><span>{timerMode === "countdown" ? "残り時間" : "経過時間"}</span><strong>{timerMode === "countdown" ? timerLabel : stopwatchLabel}</strong><small>{timerMode === "countdown" ? running ? "計測中" : seconds === 0 ? "終了" : "準備OK" : stopwatchRunning ? "計測中" : stopwatchSeconds > 0 ? "記録待ち" : "準備OK"}</small></div>
            {timerMode === "countdown" ? <div className="timer-actions">
              <button className="secondary-button" onClick={() => { setRunning(false); setSeconds(challengeMinutes * 60); resetAwayTracking(); }}>リセット</button>
              <button className="primary-button timer-start" onClick={() => setRunning((current) => !current)} disabled={seconds === 0}>{running ? "一時停止" : "計測スタート"} {running ? "⏸" : "▶"}</button>
            </div> : <div className="timer-actions">
              <button className="secondary-button" onClick={resetFreeStopwatch}>リセット</button>
              <button className="primary-button timer-start stopwatch-start" onClick={toggleFreeStopwatch} disabled={!stopwatchRunning && !freeStudyHasPlan}>{stopwatchRunning ? "一時停止" : stopwatchSeconds > 0 ? "再開" : "計測をスタート"} {stopwatchRunning ? "⏸" : "▶"}</button>
              {stopwatchSeconds > 0 && <button className="secondary-button save-free-study" onClick={saveFreeStudySession}>記録を保存</button>}
            </div>}
            {timerMode === "stopwatch" && freeStudySessions.length > 0 && <section className="free-study-history" aria-label="最近のフリー記録">
              <div className="free-study-head"><div><span>RECENT FREE STUDY</span><strong>最近の記録</strong></div></div>
              {freeStudySessions.slice(0, 3).map((session) => <article key={session.id}><span>{session.action}</span><strong>{Math.floor(session.seconds / 60)}分</strong><p>{session.result || session.plan}</p><small>{session.action === "塾" ? `塾 ${formatAwayTime(session.jukuAwaySeconds)} / 離脱 ${formatAwayTime(session.awaySeconds)} / 放置 ${formatAwayTime(session.idleSeconds)}` : `離脱 ${formatAwayTime(session.awaySeconds)} / 放置 ${formatAwayTime(session.idleSeconds)}`}</small></article>)}
            </section>}
            <section className={`away-monitor ${sessionActive ? "monitoring" : ""}`} aria-label="離脱時間モニター">
              <div className="away-monitor-head"><div><span className="monitor-dot" /><strong>離脱時間モニター</strong></div><span className="monitor-status">{idleActiveRef.current ? "放置中" : sessionActive ? "計測中" : "待機中"}</span></div>
              <div className="away-metrics"><div><span>{freeStudyAtJuku ? "塾時間の離脱" : "離脱時間"}</span><strong>{formatAwayTime(freeStudyAwaySeconds)}</strong></div><div><span>放置時間</span><strong>{freeStudyAtJuku ? "0分0秒" : idleTimeLabel}</strong></div><div><span>回数</span><strong>{(freeStudyAtJuku ? jukuAwayCount : awayCount) + (freeStudyAtJuku ? 0 : idleCount)}<small>回</small></strong></div></div>
              <p>{freeStudyAtJuku ? "塾モードでは問題画面だけを学習中とし、その他の画面・別タブ・別アプリを塾離脱として記録します。画面オフは離脱に数えません。集中時間・ランキングには加算しません。" : "別タブ・別アプリ・画面オフの時間を自動で記録します。90秒以上止まると放置時間も加算されます。"}</p>
            </section>
            <div className="focus-rules"><div className={awaySeconds + idleSeconds > 0 ? "away-recorded" : ""}><Icon>◌</Icon><strong>離脱時間の扱い</strong><span>{freeStudyAtJuku ? `問題以外の時間 ${formatAwayTime(jukuAwaySeconds)}` : awaySeconds + idleSeconds > 0 ? `記録中 ${awayTimeLabel} / 放置 ${idleTimeLabel}` : "離脱なしで計測中"}</span></div><div><Icon>★</Icon><strong>集中時間の考え方</strong><span>やった時間だけを記録して、塾ではノーカウントにできます。</span></div></div>
          </section>
        )}


        {view === "ranking" && (
          <section className="ranking-page">
            <div className="ranking-hero"><div><p className="eyebrow">LEADERBOARD</p><h1>みんなの頑張りが、<br />次の一歩になる。</h1></div><div className="rank-badge"><span>YOUR RANK</span><strong>{myRanking?.rank ?? "—"}</strong><small>{rankPeriod}の集中時間で集計</small></div></div>
            <div className="period-tabs">{(["今日", "今週", "今月"] as const).map((period) => <button key={period} className={rankPeriod === period ? "active" : ""} onClick={() => setRankPeriod(period)}>{period}</button>)}</div>
            <div className="ranking-list">
              {rankingLoading && rankingEntries.length === 0 && <p className="ranking-status">順位を集計しています…</p>}
              {!rankingLoading && rankingEntries.length === 0 && <p className="ranking-status">登録済みの生徒データがありません。</p>}
              {rankingEntries.map((person) => (
                <article key={person.id} className={person.me ? "me" : ""}><span className={`rank-number rank-${person.rank}`}>{person.rank}</span><span className={`friend-avatar ${person.color}`}>{person.name[0]}</span><div><strong>{person.name}{person.me && <em>YOU</em>}</strong><small>{person.streak > 0 ? `🔥 ${person.streak}日連続` : `${person.questionsSolved}問`}</small></div><span className="rank-time">{person.time}<small>集中時間</small></span></article>
              ))}
            </div>
            <p className="privacy-note">ニックネームだけで参加。個人情報は表示されません。</p>
          </section>
        )}
      </div>

      {subjectPickerOpen && <div className="timer-prompt-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSubjectPickerOpen(false); }}>
        <section className="timer-prompt subject-picker-prompt" role="dialog" aria-modal="true" aria-labelledby="subject-picker-title">
          <button className="timer-prompt-close" onClick={() => setSubjectPickerOpen(false)} aria-label="閉じる">×</button>
          <span className="timer-prompt-icon">□</span>
          <p className="eyebrow">CHOOSE SUBJECT</p>
          <h2 id="subject-picker-title">どの科目で始める？</h2>
          <p>科目を選んだら、次に「この20問を何分で挑むか」を聞きます。</p>
          <div className="subject-picker-grid">
            {subjects.map((subject) => <button key={subject.key} onClick={() => askSubjectTimer(subject.key)}><span className={`subject-icon ${subject.color}`}>{subject.icon}</span><strong>{subject.key}</strong><small>{subject.label}</small></button>)}
            <button className="subject-picker-mix" onClick={() => askSubjectTimer("理社ミックス")}><span className="subject-icon purple">理社</span><strong>理社ミックス</strong><small>理科10問＋社会10問</small></button>
          </div>
        </section>
      </div>}

      {timerPromptSubject && <div className="timer-prompt-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTimerPromptSubject(null); }}>
        <section className="timer-prompt" role="dialog" aria-modal="true" aria-labelledby="timer-prompt-title">
          <button className="timer-prompt-close" onClick={() => setTimerPromptSubject(null)} aria-label="閉じる">×</button>
          <span className="timer-prompt-icon">◷</span>
          <p className="eyebrow">{timerPromptSubject}・20 QUESTIONS</p>
          <h2 id="timer-prompt-title">この20問、何分で挑む？</h2>
          <p>時間を決めると、集中のスイッチが入る。自分にちょうどいい時間を選ぼう。</p>
          <div className="timer-prompt-presets" aria-label="チャレンジ時間">
            {PRACTICE_TIMER_OPTIONS.map((minutes) => <button key={minutes} className={timerPromptMinutes === minutes ? "active" : ""} onClick={() => setTimerPromptMinutes(minutes)} aria-pressed={timerPromptMinutes === minutes}>{minutes}<small>分</small></button>)}
          </div>
          <label className="timer-prompt-custom"><span>自分で決める</span><input type="number" min="1" max={PRACTICE_TIMER_MAX_MINUTES} value={timerPromptMinutes} onChange={(event) => setTimerPromptMinutes(Math.max(1, Math.min(PRACTICE_TIMER_MAX_MINUTES, Number(event.target.value) || 1)))} /><small>分</small></label>
          {practiceStartError && <p className="auth-error" role="alert">{practiceStartError}</p>}
          <button className="primary-button timer-prompt-start" autoFocus disabled={Boolean(loadingSubject)} onClick={() => void startSubjectPractice(timerPromptSubject, timerPromptMinutes)}>{loadingSubject ? "20問を準備中…" : "タイマーをセットして始める　▶"}</button>
          <button className="timer-prompt-skip" disabled={Boolean(loadingSubject)} onClick={() => void startSubjectPractice(timerPromptSubject, null)}>今回はタイマーなしで始める</button>
        </section>
      </div>}

      {statsDetail && <div className="stats-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setStatsDetail(null); }}>
        <section className="stats-detail-panel" role="dialog" aria-modal="true" aria-labelledby="stats-detail-title">
          <button className="timer-prompt-close" onClick={() => setStatsDetail(null)} aria-label="閉じる">×</button>
          {statsDetail === "focus" ? <>
            <p className="eyebrow">TODAY FOCUS</p>
            <h2 id="stats-detail-title">今日の集中時間の内訳</h2>
            <div className="stats-detail-total"><strong>{reportFocusHours}<span>h</span> {reportFocusMinutes}<span>m</span></strong><small>日本時間0時で翌日分へ切替</small></div>
            <div className="stats-breakdown-list">
              <div><span>開始時点の記録</span><strong>{focusBaseMinutes}分</strong></div>
              <div><span>この端末で増えた時間</span><strong>{focusTrackedMinutes}分</strong></div>
              <div><span>離脱として見えた時間</span><strong>{focusAwayMinutes}分</strong></div>
            </div>
            <button className="primary-button stats-detail-action" onClick={() => { setStatsDetail(null); changeView("timer"); }}>集中タイマーを開く →</button>
          </> : <>
            <p className="eyebrow">TODAY QUESTIONS</p>
            <h2 id="stats-detail-title">今日解いた問題の内訳</h2>
            <div className="solved-score-graph">
              <span className="correct" style={{ width: `${todayTotal > 0 ? Math.round((todayCorrect / todayTotal) * 100) : 0}%` }} />
              <span className="wrong" style={{ width: `${todayTotal > 0 ? Math.round((todayWrong / todayTotal) * 100) : 0}%` }} />
            </div>
            <div className="stats-breakdown-list two">
              <div><span>正解</span><strong>{todayCorrect}問</strong></div>
              <div><span>間違い</span><strong>{todayWrong}問</strong></div>
              <div><span>保存中の復習</span><strong>{reviewQueue.length}問</strong></div>
            </div>
            <div className="stats-detail-actions"><button className="primary-button" onClick={() => { setStatsDetail(null); askPracticeTimer(); }}>次の20問へ →</button><button className="secondary-button" onClick={() => { setStatsDetail(null); changeView("mistakes"); }}>間違いノート</button></div>
          </>}
        </section>
      </div>}

      <nav className="mobile-nav" aria-label="スマートフォンメニュー">
        <button className={view === "home" ? "active" : ""} onClick={() => changeView("home")}><span>⌂</span>ホーム</button>
        <button className={view === "practice" ? "active" : ""} onClick={askPracticeTimer}><span>□</span>演習</button>
        <button className={view === "mistakes" ? "active" : ""} onClick={() => changeView("mistakes")}><span>↺</span>復習</button>
        <button className={view === "weekly-test" ? "active" : ""} onClick={() => changeView("weekly-test")}><span>⚑</span>テスト</button>
        <button className={view === "timer" ? "active" : ""} onClick={() => changeView("timer")}><span>◷</span>集中</button>
        <button className={view === "ranking" ? "active" : ""} onClick={() => changeView("ranking")}><span>♕</span>順位</button>
      </nav>
    </main>
  );
}
