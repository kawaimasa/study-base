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
    ["book", "本"], ["music", "音楽"], ["school", "学校"], ["friend", "友達"], ["water", "水"],
    ["morning", "朝"], ["family", "家族"], ["picture", "写真"], ["question", "質問"], ["summer", "夏"],
  ] as const;
  const adjectives = [
    ["happy", "幸せな"], ["busy", "忙しい"], ["beautiful", "美しい"], ["important", "重要な"], ["popular", "人気のある"],
    ["different", "異なる"], ["strong", "強い"], ["quiet", "静かな"], ["early", "早い"], ["useful", "役に立つ"],
  ] as const;

  for (let offset = 0; offset < count; offset++) {
    const index = startIndex + offset;
    const name = names[index % names.length];
    const place = places[Math.floor(index / names.length) % places.length];
    const verb = verbs[Math.floor(index / (names.length * places.length)) % verbs.length];
    const id = `generated-${subject}-${index + 1}`;

    if (subject === subjectNames.japanese) {
      const kind = index % 4;
      if (kind === 0) items.push({ id, subject, unit: "文の成分", difficulty: "標準", question: `次の文の主語を答えなさい。\n「${name}は${place}で${verb}。」`, answer: name, explanation: `「${name}は」の「${name}」が、だれが動作したかを表す主語です。` });
      if (kind === 1) items.push({ id, subject, unit: "文の成分", difficulty: "標準", question: `次の文の述語を答えなさい。\n「${name}は${place}で${verb}。」`, answer: verb, explanation: `文末の「${verb}」が、主語の動作を表す述語です。` });
      if (kind === 2) items.push({ id, subject, unit: "品詞", difficulty: "標準", question: `次の文から名詞を一つ答えなさい。\n「${name}は${place}で${verb}。」`, answer: name, explanation: `人や場所の名前を表す語は名詞です。` });
      if (kind === 3) items.push({ id, subject, unit: "読解", difficulty: "標準", question: `「${name}は${place}で${verb}。」から分かることを簡潔に答えなさい。`, answer: `${name}が${place}で${verb}こと`, explanation: `主語・場所・動作を落とさずにまとめます。` });
      continue;
    }

    if (subject === subjectNames.math) {
      const a = (index % 19) + 2;
      const x = (Math.floor(index / 19) % 23) + 1;
      const b = (Math.floor(index / (19 * 23)) % 17) + 1;
      const c = a * x + b;
      const kind = index % 3;
      if (kind === 0) items.push({ id, subject, unit: "一次方程式", difficulty: "標準", question: `方程式 ${a}x + ${b} = ${c} を解きなさい。`, answer: `x = ${x}`, explanation: `両辺から${b}を引き、${a}で割ると x = ${x} です。` });
      if (kind === 1) items.push({ id, subject, unit: "計算", difficulty: "標準", question: `${a * x} ÷ ${a} + ${b} を計算しなさい。`, answer: String(x + b), explanation: `先に割り算をして ${x} + ${b} = ${x + b} です。` });
      if (kind === 2) items.push({ id, subject, unit: "比例", difficulty: "標準", question: `y = ${a}x のとき、x = ${x} なら y はいくつですか。`, answer: String(a * x), explanation: `y = ${a} × ${x} = ${a * x} です。` });
      continue;
    }

    if (subject === subjectNames.english) {
      const [word, meaning] = englishWords[index % englishWords.length];
      const [adjective, adjectiveMeaning] = adjectives[Math.floor(index / englishWords.length) % adjectives.length];
      const number = (Math.floor(index / (englishWords.length * adjectives.length)) % 30) + 1;
      const kind = index % 4;
      if (kind === 0) items.push({ id, subject, unit: "語彙", difficulty: "標準", question: `英単語「${word}」の意味を日本語で答えなさい。`, answer: meaning, explanation: `${word} は「${meaning}」という意味です。` });
      if (kind === 1) items.push({ id, subject, unit: "語彙", difficulty: "標準", question: `「${adjectiveMeaning}」を表す英単語を書きなさい。`, answer: adjective, explanation: `${adjective} は「${adjectiveMeaning}」という意味です。` });
      if (kind === 2) items.push({ id, subject, unit: "英文法", difficulty: "標準", question: `I have ${number} ${word}${number === 1 ? "" : "s"}. を日本語にしなさい。`, answer: `私は${number}冊の${meaning}を持っています。`, explanation: `have は「持っている」を表します。` });
      if (kind === 3) items.push({ id, subject, unit: "英文法", difficulty: "標準", question: `This is a ${adjective} ${word}. を日本語にしなさい。`, answer: `これは${adjectiveMeaning}${meaning}です。`, explanation: `a ${adjective} ${word} で「${adjectiveMeaning}${meaning}」です。` });
    }
  }
  return items;
}

function subjectPool(subject: string) {
  const existing = uniqueQuestions(questionBank.filter((question) => question.subject === subject));
  return [...existing, ...generatedQuestions(subject, existing.length, Math.max(0, 1000 - existing.length))];
}

function level55Ordered(items: PracticeQuestion[], seedText: string) {
  const difficultyWeight: Record<string, number> = {
    陜難ｽｺ驕峨・: 0,
    隶灘綜・ｺ繝ｻ: 1,
    陷茨ｽ･髫ｧ・ｦ陜難ｽｺ驕峨・: 2,
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

  if (user && mode !== "focus") {
    await ensureStudyRecordTables(runtime.DB);
    const { results = [] } = await runtime.DB.prepare(`SELECT question_id, question_key
      FROM question_deliveries
      WHERE student_id = ?`).bind(user.id).all<{ question_id: string; question_key: string }>();
    for (const delivered of results) {
      excludeIds.add(String(delivered.question_id));
      excludeKeys.add(String(delivered.question_key));
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
    totalSets: Math.max(1, Math.ceil(filteredSource.length / count)),
    availableQuestions: filteredSource.length,
    complete: returnedQuestions.length === count,
    questions: returnedQuestions,
  });
}

