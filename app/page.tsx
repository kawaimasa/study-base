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
  savedAt: string;
};

type RegisteredStudyMate = {
  id: string;
  displayName: string;
  focusSeconds: number;
  questionsSolved: number;
  isMe: boolean;
};

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
const SUBJECT_PROGRESS_STORAGE_KEY = "study-base-subject-progress";
const LOGIN_DAYS_STORAGE_KEY = "study-base-login-days";
const REVIEW_QUEUE_STORAGE_KEY = "study-base-review-queue";
const FREE_STUDY_SESSIONS_STORAGE_KEY = "study-base-free-study-sessions";
const QUESTIONS_PER_SUBJECT = 1000;
const QUESTIONS_PER_SET = 20;
const PRACTICE_TIMER_MAX_MINUTES = 15;
const PRACTICE_TIMER_DEFAULT_MINUTES = 15;
const PRACTICE_TIMER_OPTIONS = [5, 10, 15];
const FOCUS_TIMER_OPTIONS = [15, 30, 60, 90];
const FREE_STUDY_ACTIONS = ["学校ワーク", "塾教材", "暗記", "ノートまとめ", "過去問", "その他"];
const IDLE_WARNING_SECONDS = 90;
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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

const leaderboard = [
  { rank: 1, name: "そら", time: "3h 12m", streak: 21, color: "purple" },
  { rank: 2, name: "はる", time: "2h 46m", streak: 14, color: "blue", me: true },
  { rank: 3, name: "みお", time: "2h 31m", streak: 9, color: "coral" },
  { rank: 4, name: "りく", time: "2h 08m", streak: 18, color: "green" },
  { rank: 5, name: "ゆい", time: "1h 54m", streak: 7, color: "yellow" },
];

const liveStudyMates = [
  { name: "そら", startTime: "19:42", subject: "数学", unit: "一次関数", minutes: 128, color: "purple", tier: "上位ペース", pace: "近畿55＋" },
  { name: "みお", startTime: "20:18", subject: "英語", unit: "不定詞", minutes: 92, color: "coral", tier: "平均ペース", pace: "近畿55目標" },
  { name: "りく", startTime: "20:51", subject: "理科", unit: "電流・磁界", minutes: 59, color: "green", tier: "追い上げペース", pace: "基礎固め" },
];

function formatStudyTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}時間${rest}分` : `${rest}分`;
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
  const [subjectTimerEnabled, setSubjectTimerEnabled] = useState(false);
  const [timerMode, setTimerMode] = useState<"countdown" | "stopwatch">("countdown");
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [freeStudyAction, setFreeStudyAction] = useState(FREE_STUDY_ACTIONS[0]);
  const [freeStudyPlan, setFreeStudyPlan] = useState("");
  const [freeStudyResult, setFreeStudyResult] = useState("");
  const [freeStudySessions, setFreeStudySessions] = useState<FreeStudySession[]>([]);
  const [awaySeconds, setAwaySeconds] = useState(0);
  const [awayCount, setAwayCount] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [idleCount, setIdleCount] = useState(0);
  const [baseTodayFocusSeconds, setBaseTodayFocusSeconds] = useState(0);
  const [trackedFocusSeconds, setTrackedFocusSeconds] = useState(0);
  const [subjectProgressCounts, setSubjectProgressCounts] = useState<SubjectProgressMap>(defaultSubjectProgress);
  const [guardianEnabled, setGuardianEnabled] = useState(false);
  const [rankPeriod, setRankPeriod] = useState("今日");
  const [liveMinutes, setLiveMinutes] = useState(() => liveStudyMates.map((mate) => mate.minutes));
  const [registeredStudyMates, setRegisteredStudyMates] = useState<RegisteredStudyMate[]>([]);
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
  const sessionActive = timerMode === "countdown" ? running : stopwatchRunning;
  const sessionActiveRef = useRef(sessionActive);
  const awayStartedAtRef = useRef<number | null>(null);
  const lastStudyActionAtRef = useRef(Date.now());
  const idleActiveRef = useRef(false);
  const weeklyAwayStartedAtRef = useRef<number | null>(null);
  const weeklySubmittingRef = useRef(false);

  const loadWeeklyTest = async () => {
    try {
      const response = await fetch("/api/weekly-tests", { cache: "no-store" });
      if (!response.ok) throw new Error("一斉テストを読み込めませんでした。");
      const data = await response.json() as { test: WeeklyTestData | null };
      setWeeklyTest(data.test);
      if (data.test?.submission) {
        setWeeklyAnswers(data.test.submission.answers ?? {});
        setWeeklyAwaySeconds(Number(data.test.submission.awaySeconds ?? 0));
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
        setAuthStatus(data.requiresSetup ? "setup" : "login");
      })
      .catch(() => {
        setAuthError("ログイン状態を確認できません。少し待ってから再読み込みしてください。");
        setAuthStatus("setup");
      });
  }, []);

  useEffect(() => {
    if (!authUser) return;
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
    if (seconds <= 0) {
      setRunning(false);
      return;
    }
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((current) => current - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, seconds]);

  useEffect(() => {
    if (!stopwatchRunning) return;
    const stopwatch = window.setInterval(() => setStopwatchSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(stopwatch);
  }, [stopwatchRunning]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
    if (!sessionActive && awayStartedAtRef.current !== null) {
      const elapsed = Math.max(1, Math.round((Date.now() - awayStartedAtRef.current) / 1000));
      setAwaySeconds((current) => current + elapsed);
      awayStartedAtRef.current = null;
    }
  }, [sessionActive]);

  useEffect(() => {
    if (!sessionActive) return;
    const focusCounter = window.setInterval(() => {
      if (awayStartedAtRef.current === null && !idleActiveRef.current) setTrackedFocusSeconds((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(focusCounter);
  }, [sessionActive]);

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
    if (!sessionActive) return;
    const idleTimer = window.setInterval(() => {
      if (awayStartedAtRef.current !== null) return;
      const inactiveSeconds = Math.floor((Date.now() - lastStudyActionAtRef.current) / 1000);
      if (inactiveSeconds < IDLE_WARNING_SECONDS) return;
      if (!idleActiveRef.current) {
        idleActiveRef.current = true;
        setIdleCount((current) => current + 1);
      }
      setIdleSeconds((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(idleTimer);
  }, [sessionActive]);

  useEffect(() => {
    const startAway = () => {
      if (!sessionActiveRef.current || awayStartedAtRef.current !== null) return;
      awayStartedAtRef.current = Date.now();
      setAwayCount((current) => current + 1);
    };
    const finishAway = () => {
      if (awayStartedAtRef.current === null) return;
      const elapsed = Math.max(1, Math.round((Date.now() - awayStartedAtRef.current) / 1000));
      setAwaySeconds((current) => current + elapsed);
      awayStartedAtRef.current = null;
    };
    const handleVisibilityChange = () => document.hidden ? startAway() : finishAway();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", startAway);
    window.addEventListener("pageshow", finishAway);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", startAway);
      window.removeEventListener("pageshow", finishAway);
    };
  }, []);

  useEffect(() => {
    const liveTimer = window.setInterval(() => {
      setLiveMinutes((current) => current.map((minutes) => minutes + 1));
    }, 60_000);
    return () => window.clearInterval(liveTimer);
  }, []);

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
        const previousSummary = guardianSummaryRef.current;
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
        setBaseTodayFocusSeconds(0);
        setTrackedFocusSeconds(0);
        setAwaySeconds(0);
        setAwayCount(0);
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
        if (!data?.profile) return;
        setGuardianEnabled(Boolean(data.profile.enabled));
      })
      .catch(() => undefined);
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
    const studyMatesTimer = window.setInterval(loadStudyMates, 60_000);
    return () => window.clearInterval(studyMatesTimer);
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    try {
      const scopedKey = userStorageKey(REVIEW_QUEUE_STORAGE_KEY, authUser.id);
      const savedQueue = window.localStorage.getItem(scopedKey) ?? window.localStorage.getItem(REVIEW_QUEUE_STORAGE_KEY);
      if (!savedQueue) return;

      const parsedQueue = JSON.parse(savedQueue) as Question[];
      if (Array.isArray(parsedQueue)) {
        setReviewQueue(parsedQueue.filter((question) => typeof question?.id === "string").slice(0, 50));
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
  const freeStudyRisk = stopwatchSeconds > 0 && !freeStudyResult.trim() && (awaySeconds + idleSeconds > Math.max(180, stopwatchSeconds * 0.2));
  const todayAccuracyGraph = todayAccuracy ?? 0;
  const guardianSummary = useMemo(() => ({
    focusSeconds: reportFocusSeconds,
    awaySeconds: awaySeconds + idleSeconds,
    questionsSolved: todayTotal,
    correctAnswers: todayCorrect,
    wrongAnswers: todayWrong,
  }), [awaySeconds, idleSeconds, reportFocusSeconds, todayCorrect, todayTotal, todayWrong]);
  const guardianSummaryRef = useRef(guardianSummary);
  guardianSummaryRef.current = guardianSummary;

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
    const modelRows = liveStudyMates.map((mate, index) => ({
      id: `model-${mate.name}`,
      name: mate.name,
      startTime: `${mate.startTime}〜`,
      subject: mate.subject,
      unit: mate.unit,
      minutes: liveMinutes[index] ?? mate.minutes,
      color: mate.color,
      tier: mate.tier,
      pace: mate.pace,
      badge: "目標",
      isMe: false,
    }));
    const registeredRows = registeredStudyMates.map((student, index) => {
      const minutes = Math.floor(Math.max(0, student.focusSeconds) / 60);
      return {
        id: student.id,
        name: student.displayName,
        startTime: student.isMe ? "自分" : "登録済",
        subject: student.questionsSolved > 0 ? "今日の演習" : "準備中",
        unit: student.questionsSolved > 0 ? `${student.questionsSolved}問クリア` : "まずは20問から",
        minutes,
        color: registeredColors[index % registeredColors.length],
        tier: student.isMe ? "YOU" : "参加中",
        pace: minutes > 0 ? "実記録" : "未開始",
        badge: student.isMe ? "YOU" : "実参加",
        isMe: student.isMe,
      };
    });
    return [...modelRows, ...registeredRows];
  }, [liveMinutes, registeredStudyMates]);
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
        const next = [...missed, ...current.filter((question) => !missedIds.has(question.id))].slice(0, 50);
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
      void fetch("/api/guardian-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summary", summary: guardianSummaryRef.current }),
      }).catch(() => undefined);
    };
    syncSummary();
    const syncTimer = window.setInterval(syncSummary, 60_000);
    return () => window.clearInterval(syncTimer);
  }, [authUser]);

  const resetAwayTracking = () => {
    awayStartedAtRef.current = null;
    idleActiveRef.current = false;
    lastStudyActionAtRef.current = Date.now();
    setAwaySeconds(0);
    setAwayCount(0);
    setIdleSeconds(0);
    setIdleCount(0);
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
    setFreeStudyResult("");
    resetAwayTracking();
  };

  const saveFreeStudySession = () => {
    if (!authUser || stopwatchSeconds <= 0) return;
    const nextSession: FreeStudySession = {
      id: `free-${Date.now()}`,
      action: freeStudyAction,
      plan: freeStudyPlan.trim(),
      result: freeStudyResult.trim(),
      seconds: stopwatchSeconds,
      awaySeconds,
      idleSeconds,
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

  const fetchPracticeSet = async (subject: StudySubject, targetSet: number, round: number) => {
    const params = new URLSearchParams({
      subject,
      set: String(targetSet),
      round: String(round),
      count: String(QUESTIONS_PER_SET),
    });
    const response = await fetch(`/api/practice-questions?${params.toString()}`);
    if (!response.ok) throw new Error("question bank unavailable");
    return await response.json() as { questions: Question[]; totalSets: number; totalQuestions: number };
  };

  const startSubjectPractice = async (subject: StudySubject, timerMinutes: number | null) => {
    setLoadingSubject(subject);
    try {
      const data = await fetchPracticeSet(subject, 1, 1);
      setSelectedSubject(subject);
      setQuestionSequence(data.questions);
      setPracticeTotalSets(data.totalSets);
      setSetNumber(1);
      setShuffleRound(1);
      setPracticePhase("questions");
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
      changeView("practice");
    } finally {
      setLoadingSubject(null);
    }
  };

  const startNextSet = async () => {
    if (!selectedSubject) {
      setSubjectPickerOpen(true);
      return;
    }
    setSubjectTimerEnabled(false);
    setLoadingSubject(selectedSubject);
    try {
      const nextRound = setNumber >= totalSets ? shuffleRound + 1 : shuffleRound;
      const nextSet = setNumber >= totalSets ? 1 : setNumber + 1;
      const data = await fetchPracticeSet(selectedSubject, nextSet, nextRound);
      setQuestionSequence(data.questions);
      setPracticeTotalSets(data.totalSets);
      setSetNumber(nextSet);
      setShuffleRound(nextRound);
    } finally {
      setLoadingSubject(null);
    }
    setPracticePhase("questions");
    setGrades(Array(QUESTIONS_PER_SET).fill(null));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const completePractice = () => {
    if (gradedCount !== activeQuestions.length) return;

    setReviewQueue((current) => {
      const missedQuestions = activeQuestions.filter((_, index) => grades[index] === "wrong");
      const missedIds = new Set(missedQuestions.map((question) => question.id));
      const correctIds = new Set(activeQuestions.filter((_, index) => grades[index] === "correct").map((question) => question.id));
      const nextQueue = [
        ...missedQuestions,
        ...current.filter((question) => !missedIds.has(question.id) && !correctIds.has(question.id)),
      ].slice(0, 50);

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
    setPracticePhase("complete");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const gradeFocusQuestion = (result: "correct" | "wrong") => {
    if (!focusQuestion) return;

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
  };

  const saveMistakeReview = (question: Question, result: "mastered" | "again") => {
    setReviewQueue((current) => {
      const remaining = current.filter((item) => item.id !== question.id);
      const nextQueue = result === "again" ? [...remaining, question].slice(0, 50) : remaining;
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
                <div className="hero-pills"><span>● 4人が勉強中</span><span>今日も一歩、前へ</span></div>
                <h1>今日も、<br /><em>{authUser.displayName}</em>の伸びしろが<br />動き出す。</h1>
                <p>勉強も、仲間も、今日しかない。未来の自分へ、最高の一日を。</p>
              </div>
              <div className="streak-card">
                <span className="flame">✦</span>
                <div><strong>{loginDaysCount}</strong><span>DAYS</span></div>
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
                      <button className="wrong" onClick={() => gradeFocusQuestion("wrong")}>× まだ</button>
                      <button className="correct" onClick={() => gradeFocusQuestion("correct")}>○ できた</button>
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
                <div className="section-heading compact"><div><p className="eyebrow">KINKI RIVAL PACE</p><h2>近畿圏55勢、いま進行中。</h2></div><span className="online bot-online">{studyMateRows.length}人</span></div>
                <p className="bot-study-note">目標ペース3人と、登録した生徒の今日の実記録を一緒に表示します。</p>
                <div className="study-live-head"><span>仲間</span><span>開始</span><span>学習時間</span></div>
                <div className="study-live-list">
                  {studyMateRows.map((mate) => (
                    <div className={`study-person${mate.isMe ? " me" : ""}`} key={mate.id}>
                      <span className={`friend-avatar ${mate.color}`}>{mate.name[0]}<i /></span>
                      <div className="study-person-copy"><strong>{mate.name}<em>{mate.badge}</em></strong><small>{mate.tier}｜{mate.subject}・{mate.unit}</small><b>{mate.pace}</b></div>
                      <time>{mate.startTime}</time>
                      <span className="elapsed-time">{formatStudyTime(mate.minutes)}</span>
                    </div>
                  ))}
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
              <div className="set-action final-action"><p>{gradedCount < 20 ? `あと${20 - gradedCount}問を判定してください。` : "20問すべて採点できました。"}</p><button className="primary-button big" disabled={gradedCount < 20} onClick={completePractice}>採点を完了して結果を見る</button></div>
            </>}
            {practicePhase === "complete" && <article className="completion-card">
              <span className="completion-mark">✓</span>
              <p className="eyebrow">SET {String(setNumber).padStart(3, "0")} COMPLETE</p>
              <h2>20問、おつかれさま！</h2>
              <p>今日の積み重ねが、ちゃんと合格力になっています。</p>
              <div className="completion-score"><div><strong>{correctCount}</strong><span>正解</span></div><div><strong>{wrongCount}</strong><span>復習へ</span></div><div><strong>{Math.round((correctCount / 20) * 100)}%</strong><span>正答率</span></div></div>
              <button className="primary-button big" onClick={startNextSet}>{setNumber >= totalSets ? "ランダムに並べ替えて SET 001へ ↻" : `次の20問へ　SET ${String(setNumber + 1).padStart(3, "0")} →`}</button>
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
                    <div className="mistake-grade"><span>今回はどうだった？</span><button className="mistake-again" onClick={() => saveMistakeReview(question, "again")}>× まだ復習する</button><button className="mistake-mastered" onClick={() => saveMistakeReview(question, "mastered")}>✓ 克服できた</button></div>
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
            {timerMode === "stopwatch" && <section className="free-study-card" aria-label="フリー学習の内容">
              <div className="free-study-head"><div><span>WHAT DID YOU DO?</span><strong>何をしたかも、記録する。</strong></div><em className={freeStudyRisk ? "risk" : ""}>{freeStudyReliability}</em></div>
              <div className="free-study-actions">
                {FREE_STUDY_ACTIONS.map((action) => <button key={action} className={freeStudyAction === action ? "active" : ""} disabled={stopwatchRunning} onClick={() => setFreeStudyAction(action)}>{action}</button>)}
              </div>
              <label className="free-study-input"><span>開始前：今日は何をする？</span><input value={freeStudyPlan} disabled={stopwatchRunning} onChange={(event) => setFreeStudyPlan(event.target.value)} placeholder="例：数学ワーク P32〜35、英単語50個" /></label>
              {stopwatchSeconds > 0 && <label className="free-study-input"><span>終了後：実際に何ができた？</span><textarea value={freeStudyResult} onChange={(event) => setFreeStudyResult(event.target.value)} placeholder="例：連立方程式12問、丸つけまで。間違いは3問。" /></label>}
              <p>フリー計測は「自己申告」です。内容メモや成果メモがあるほど、管理者が見た時の信頼度が上がります。</p>
            </section>}
            <div className={`timer-orbit ${(timerMode === "countdown" ? running : stopwatchRunning) ? "running" : ""}`}><span>{timerMode === "countdown" ? "残り時間" : "経過時間"}</span><strong>{timerMode === "countdown" ? timerLabel : stopwatchLabel}</strong><small>{timerMode === "countdown" ? running ? "集中中" : seconds === 0 ? "達成！" : "準備OK" : stopwatchRunning ? "計測中" : stopwatchSeconds > 0 ? "一時停止中" : "準備OK"}</small></div>
            {timerMode === "countdown" ? <div className="timer-actions">
              <button className="secondary-button" onClick={() => { setRunning(false); setSeconds(challengeMinutes * 60); resetAwayTracking(); }}>↺ リセット</button>
              <button className="primary-button timer-start" onClick={() => setRunning((current) => !current)} disabled={seconds === 0}>{running ? "一時停止" : "集中をスタート"} {running ? "Ⅱ" : "▶"}</button>
            </div> : <div className="timer-actions">
              <button className="secondary-button" onClick={resetFreeStopwatch}>↺ リセット</button>
              <button className="primary-button timer-start stopwatch-start" onClick={toggleFreeStopwatch} disabled={!stopwatchRunning && !freeStudyHasPlan}>{stopwatchRunning ? "一時停止" : stopwatchSeconds > 0 ? "計測を再開" : "内容を書いてスタート"} {stopwatchRunning ? "Ⅱ" : "▶"}</button>
              {stopwatchSeconds > 0 && <button className="secondary-button save-free-study" onClick={saveFreeStudySession}>成果を保存</button>}
            </div>}
            {timerMode === "stopwatch" && freeStudySessions.length > 0 && <section className="free-study-history" aria-label="フリー学習の履歴">
              <div className="free-study-head"><div><span>RECENT FREE STUDY</span><strong>最近の自己申告</strong></div></div>
              {freeStudySessions.slice(0, 3).map((session) => <article key={session.id}><span>{session.action}</span><strong>{Math.floor(session.seconds / 60)}分</strong><p>{session.result || session.plan}</p><small>離脱 {formatAwayTime(session.awaySeconds)}・未確認 {formatAwayTime(session.idleSeconds)}</small></article>)}
            </section>}
            <section className={`away-monitor ${sessionActive ? "monitoring" : ""}`} aria-label="離脱時間モニター">
              <div className="away-monitor-head"><div><span className="monitor-dot" /><strong>離脱時間モニター</strong></div><span className="monitor-status">{idleActiveRef.current ? "未確認中" : sessionActive ? "計測中" : "待機中"}</span></div>
              <div className="away-metrics"><div><span>離脱時間</span><strong>{awayTimeLabel}</strong></div><div><span>未確認時間</span><strong>{idleTimeLabel}</strong></div><div><span>検出回数</span><strong>{awayCount + idleCount}<small>回</small></strong></div></div>
              <p>別タブ・別アプリ・画面オフに加えて、90秒以上タップやスクロールがない時間も「未確認時間」として分けて記録します。</p>
            </section>
            <div className="focus-rules"><div className={awaySeconds + idleSeconds > 0 ? "away-recorded" : ""}><Icon>◷</Icon><strong>やってない疑いも記録</strong><span>{awaySeconds + idleSeconds > 0 ? `離脱${awayTimeLabel}・未確認${idleTimeLabel}` : "開きっぱなし時間を見える化"}</span></div><div><Icon>✓</Icon><strong>問題行動とセットで評価</strong><span>時間だけでなく、問題数や採点も見ます</span></div></div>
          </section>
        )}

        {view === "ranking" && (
          <section className="ranking-page">
            <div className="ranking-hero"><div><p className="eyebrow">LEADERBOARD</p><h1>みんなの頑張りが、<br />次の一歩になる。</h1></div><div className="rank-badge"><span>YOUR RANK</span><strong>2</strong><small>昨日より 1 UP ↑</small></div></div>
            <div className="period-tabs">{["今日", "今週", "今月"].map((period) => <button key={period} className={rankPeriod === period ? "active" : ""} onClick={() => setRankPeriod(period)}>{period}</button>)}</div>
            <div className="ranking-list">
              {leaderboard.map((person) => (
                <article key={person.rank} className={person.me ? "me" : ""}><span className={`rank-number rank-${person.rank}`}>{person.rank}</span><span className={`friend-avatar ${person.color}`}>{person.name[0]}</span><div><strong>{person.name}{person.me && <em>YOU</em>}</strong><small>🔥 {person.streak}日連続</small></div><span className="rank-time">{person.time}<small>集中時間</small></span></article>
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
          <button className="primary-button timer-prompt-start" autoFocus onClick={() => { const subject = timerPromptSubject; setTimerPromptSubject(null); void startSubjectPractice(subject, timerPromptMinutes); }}>タイマーをセットして始める　▶</button>
          <button className="timer-prompt-skip" onClick={() => { const subject = timerPromptSubject; setTimerPromptSubject(null); void startSubjectPractice(subject, null); }}>今回はタイマーなしで始める</button>
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
