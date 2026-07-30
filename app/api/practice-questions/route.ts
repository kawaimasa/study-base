import japaneseQuestions from "../../../public/data/kokugo.json";
import { env } from "cloudflare:workers";
import mathQuestions from "../../../public/data/math.json";
import englishQuestions from "../../../public/data/english.json";
import scienceSocialQuestions from "../../question-bank.json";
import { getAuthenticatedDeviceUser, type DeviceAuthEnv } from "../../../lib/device-auth";
import { ensureStudyRecordTables, recordQuestionDeliveries } from "../../../lib/study-records";

type PracticeQuestion = {
  id: string;
  subject: string;
  unit: string;
  difficulty: string;
  question: string;
  answer: string;
  explanation: string;
};

const QUESTIONS_PER_SET = 20;

const questionBank = [
  ...japaneseQuestions,
  ...mathQuestions,
  ...englishQuestions,
  ...scienceSocialQuestions,
] as PracticeQuestion[];

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seedText: string) {
  const result = [...items];
  const random = seededRandom(hashSeed(seedText));
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function questionKey(question: PracticeQuestion) {
  return question.question
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim()
    .toLowerCase();
}

function uniqueQuestions(items: PracticeQuestion[]) {
  const seen = new Set<string>();
  return items.filter((question) => {
    const key = questionKey(question);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const subjectNames = {
  japanese: String(japaneseQuestions[0]?.subject ?? ""),
  math: String(mathQuestions[0]?.subject ?? ""),
  english: String(englishQuestions[0]?.subject ?? ""),
  science: String(scienceSocialQuestions.find((question) => question.subject !== "")?.subject ?? ""),
  social: String(scienceSocialQuestions.find((question) => question.subject !== scienceSocialQuestions.find((item) => item.subject !== "")?.subject)?.subject ?? ""),
};

function generatedQuestions(subject: string, startIndex: number, count: number): PracticeQuestion[] {
  const items: PracticeQuestion[] = [];
  const names = ["太郎", "花子", "美咲", "健", "翔", "葵", "蓮", "結衣", "陽菜", "陸"];
  const places = ["図書館", "体育館", "校庭", "公園", "教室", "科学館", "美術館", "駅前", "海辺", "山道"];
  const verbs = ["本を読んだ", "絵を描いた", "走った", "観察した", "発表した", "調べた", "練習した", "記録した", "相談した", "計画した"];
  const englishWords = [
    ["book", "本"], ["pencil", "鉛筆"], ["notebook", "ノート"], ["apple", "りんご"], ["chair", "いす"],
    ["desk", "机"], ["bag", "かばん"], ["picture", "写真"], ["question", "質問"], ["flower", "花"],
  ] as const;
  const adjectives = [
    ["happy", "幸せな"], ["busy", "忙しい"], ["beautiful", "美しい"], ["important", "重要な"], ["popular", "人気のある"],
    ["different", "異なる"], ["strong", "強い"], ["quiet", "静かな"], ["early", "早い"], ["useful", "役に立つ"],
  ] as const;

  for (let offset = 0; offset < count; offset++) {
    const index = startIndex + offset;
    const kindDivisor = subject === subjectNames.math ? 3 : 4;
    const scenario = Math.floor(index / kindDivisor);
    const name = names[scenario % names.length];
    const place = places[Math.floor(scenario / names.length) % places.length];
    const verb = verbs[Math.floor(scenario / (names.length * places.length)) % verbs.length];
    // Keep generated-bank revisions in the id so a changed question never
    // collides with an older D1 delivery that used the same numeric slot.
    const id = `generated-v2-${subject}-${index + 1}`;

    if (subject === subjectNames.japanese) {
      const kind = index % 4;
      if (kind === 0) items.push({ id, subject, unit: "文の成分", difficulty: "標準", question: `次の文の主語を答えなさい。\n「${name}は${place}で${verb}。」`, answer: name, explanation: `「${name}は」の「${name}」が、だれが動作したかを表す主語です。` });
      if (kind === 1) items.push({ id, subject, unit: "文の成分", difficulty: "標準", question: `次の文の述語を答えなさい。\n「${name}は${place}で${verb}。」`, answer: verb, explanation: `文末の「${verb}」が、主語の動作を表す述語です。` });
      if (kind === 2) items.push({ id, subject, unit: "品詞", difficulty: "標準", question: `次の文から名詞を一つ答えなさい。\n「${name}は${place}で${verb}。」`, answer: name, explanation: `人や場所の名前を表す語は名詞です。` });
      if (kind === 3) items.push({ id, subject, unit: "読解", difficulty: "標準", question: `「${name}は${place}で${verb}。」から分かることを簡潔に答えなさい。`, answer: `${name}が${place}で${verb}こと`, explanation: `主語・場所・動作を落とさずにまとめます。` });
      continue;
    }

    if (subject === subjectNames.math) {
      const a = (scenario % 19) + 2;
      const x = (Math.floor(scenario / 19) % 23) + 1;
      const b = (Math.floor(scenario / (19 * 23)) % 17) + 1;
      const c = a * x + b;
      const kind = index % 3;
      if (kind === 0) items.push({ id, subject, unit: "一次方程式", difficulty: "標準", question: `方程式 ${a}x + ${b} = ${c} を解きなさい。`, answer: `x = ${x}`, explanation: `両辺から${b}を引き、${a}で割ると x = ${x} です。` });
      if (kind === 1) items.push({ id, subject, unit: "計算", difficulty: "標準", question: `${a * x} ÷ ${a} + ${b} を計算しなさい。`, answer: String(x + b), explanation: `先に割り算をして ${x} + ${b} = ${x + b} です。` });
      if (kind === 2) items.push({ id, subject, unit: "比例", difficulty: "標準", question: `y = ${a}x のとき、x = ${x} なら y はいくつですか。`, answer: String(a * x), explanation: `y = ${a} × ${x} = ${a * x} です。` });
      continue;
    }

    if (subject === subjectNames.english) {
      const [word, meaning] = englishWords[scenario % englishWords.length];
      const [adjective, adjectiveMeaning] = adjectives[Math.floor(scenario / englishWords.length) % adjectives.length];
      const number = (Math.floor(scenario / (englishWords.length * adjectives.length)) % 30) + 1;
      const kind = index % 4;
      const plural = number === 1 ? word : `${word}s`;
      if (kind === 0) items.push({ id, subject, unit: "英文和訳", difficulty: "標準", question: `次の英文を日本語にしなさい。\nI have ${number} ${adjective} ${plural}.`, answer: `私は${adjectiveMeaning}${meaning}を${number}個持っています。`, explanation: `have は「持っている」、${adjective} は「${adjectiveMeaning}」を表します。` });
      if (kind === 1) items.push({ id, subject, unit: "語彙", difficulty: "標準", question: `次の（　）に入る英語を書きなさい。\nI have ${number} (　).〔${adjectiveMeaning}${meaning}〕`, answer: `${adjective} ${plural}`, explanation: `「${adjectiveMeaning}」は ${adjective}、「${meaning}」は ${plural} です。` });
      if (kind === 2) items.push({ id, subject, unit: "英文法", difficulty: "標準", question: `次の英文を日本語にしなさい。\nThis is ${word} number ${number}. It is ${adjective}.`, answer: `これは${number}番の${meaning}です。それは${adjectiveMeaning}です。`, explanation: `number ${number} は「${number}番」、${adjective} は「${adjectiveMeaning}」です。` });
      if (kind === 3) items.push({ id, subject, unit: "英作文", difficulty: "標準", question: `「私は${adjectiveMeaning}${meaning}を${number}個持っています」を英語で書きなさい。`, answer: `I have ${number} ${adjective} ${plural}.`, explanation: `「持っています」は have を使い、数・形容詞・名詞の順に並べます。` });
    }
  }
  return items;
}

function subjectPool(subject: string) {
  let pool = uniqueQuestions(questionBank.filter((question) => question.subject === subject));
  let generatedIndex = 0;
  while (pool.length < 1000 && generatedIndex < 10_000) {
    const batchSize = Math.max(200, (1000 - pool.length) * 2);
    pool = uniqueQuestions([...pool, ...generatedQuestions(subject, generatedIndex, batchSize)]);
    generatedIndex += batchSize;
  }
  return pool.slice(0, 1000);
}

function level55Ordered(items: PracticeQuestion[], seedText: string) {
  const difficultyWeight: Record<string, number> = {
    基本: 0,
    標準: 1,
    入試基礎: 2,
  };
  return seededShuffle(uniqueQuestions(items), seedText)
    .map((question, index) => ({
      question,
      score: (difficultyWeight[question.difficulty] ?? 1) * 100000 + index,
    }))
    .sort((left, right) => left.score - right.score)
    .map(({ question }) => question);
}

function selectSubjectQuestions(subject: string, seed: string) {
  const knownSubjects = new Set(Object.values(subjectNames));
  if (!knownSubjects.has(subject)) {
    const science = level55Ordered(subjectPool(subjectNames.science), `${subjectNames.science}:${seed}`);
    const social = level55Ordered(subjectPool(subjectNames.social), `${subjectNames.social}:${seed}`);
    const mixed: PracticeQuestion[] = [];
    const totalBlocks = Math.ceil(Math.max(science.length, social.length) / 10);
    for (let setIndex = 0; setIndex < totalBlocks; setIndex++) {
      mixed.push(
        ...science.slice(setIndex * 10, setIndex * 10 + 10),
        ...social.slice(setIndex * 10, setIndex * 10 + 10),
      );
    }
    return mixed;
  }

  return level55Ordered(subjectPool(subject), `${subject}:${seed}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const subject = url.searchParams.get("subject") ?? "理社ミックス";
  const set = Math.max(1, Number(url.searchParams.get("set") ?? "1"));
  const round = Math.max(1, Number(url.searchParams.get("round") ?? "1"));
  const count = Math.max(1, Math.min(80, Number(url.searchParams.get("count") ?? String(QUESTIONS_PER_SET))));
  const mode = url.searchParams.get("mode");
  const runtime = env as unknown as DeviceAuthEnv;
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  const excludeIds = new Set(
    (url.searchParams.get("excludeIds") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const excludeKeys = new Set(
    (url.searchParams.get("excludeKeys") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  const deliveryTimes = new Map<string, string>();
  if (user && mode !== "focus") {
    await ensureStudyRecordTables(runtime.DB);
    const { results = [] } = await runtime.DB.prepare(`SELECT question_id, question_key, last_delivered_at
      FROM question_deliveries
      WHERE student_id = ?`).bind(user.id).all<{ question_id: string; question_key: string; last_delivered_at: string }>();
    for (const delivered of results) {
      excludeIds.add(String(delivered.question_id));
      excludeKeys.add(String(delivered.question_key));
      deliveryTimes.set(String(delivered.question_key), String(delivered.last_delivered_at ?? ""));
    }
  }

  // Every request gets a new order. D1 exclusions guarantee that randomizing
  // cannot bring back a question this student has already seen.
  const randomSeed = `${round}:${user?.id ?? "anonymous"}:${crypto.randomUUID()}`;

  const source = mode === "focus"
    ? level55Ordered(questionBank.filter((question) => question.difficulty === "入試基礎"), `focus:${randomSeed}`)
    : selectSubjectQuestions(subject, randomSeed);

  const filteredSource = source.filter((question) => !excludeIds.has(question.id) && !excludeKeys.has(questionKey(question)));

  const start = user && mode !== "focus" ? 0 : (set - 1) * count;
  const returnedQuestions = filteredSource.slice(start, start + count);
  if (user && mode !== "focus" && returnedQuestions.length < count) {
    const selectedKeys = new Set(returnedQuestions.map(questionKey));
    const oldestDelivered = source
      .filter((question) => !selectedKeys.has(questionKey(question)))
      .sort((left, right) => (deliveryTimes.get(questionKey(left)) ?? "").localeCompare(deliveryTimes.get(questionKey(right)) ?? ""));
    returnedQuestions.push(...oldestDelivered.slice(0, count - returnedQuestions.length));
  }

  if (user && mode !== "focus" && returnedQuestions.length > 0) {
    await recordQuestionDeliveries(runtime.DB, user.id, returnedQuestions.map((question) => ({
      id: question.id,
      key: questionKey(question),
      subject: question.subject,
      payload: question as unknown as Record<string, unknown>,
    })));
  }

  return Response.json({
    subject,
    set,
    round,
    count,
    totalQuestions: returnedQuestions.length,
    totalSets: Math.max(1, Math.ceil(source.length / count)),
    poolSize: source.length,
    availableQuestions: filteredSource.length,
    complete: returnedQuestions.length === count,
    questions: returnedQuestions,
  });
}

