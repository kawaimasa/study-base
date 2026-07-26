import japaneseQuestions from "../../../public/data/kokugo.json";
import mathQuestions from "../../../public/data/math.json";
import englishQuestions from "../../../public/data/english.json";
import scienceSocialQuestions from "../../question-bank.json";

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
    return ((state >>> 0) / 4294967296);
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
  return question.question.replace(/（確認\d+）/g, "").replace(/\s+/g, " ").trim().toLowerCase();
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

function level55Ordered(items: PracticeQuestion[], seedText: string) {
  const difficultyWeight: Record<string, number> = {
    基礎: 0,
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

function selectSubjectQuestions(subject: string, round: number) {
  if (subject === "理社ミックス") {
    const science = level55Ordered(questionBank.filter((question) => question.subject === "理科"), `理科:${round}`);
    const social = level55Ordered(questionBank.filter((question) => question.subject === "社会"), `社会:${round}`);
    const mixed: PracticeQuestion[] = [];
    const totalSets = Math.ceil((science.length + social.length) / QUESTIONS_PER_SET);
    for (let setIndex = 0; setIndex < totalSets; setIndex++) {
      mixed.push(
        ...science.slice(setIndex * 10, setIndex * 10 + 10),
        ...social.slice(setIndex * 10, setIndex * 10 + 10),
      );
    }
    return mixed;
  }

  return level55Ordered(questionBank.filter((question) => question.subject === subject), `${subject}:${round}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const subject = url.searchParams.get("subject") ?? "理社ミックス";
  const set = Math.max(1, Number(url.searchParams.get("set") ?? "1"));
  const round = Math.max(1, Number(url.searchParams.get("round") ?? "1"));
  const count = Math.max(1, Math.min(80, Number(url.searchParams.get("count") ?? String(QUESTIONS_PER_SET))));
  const mode = url.searchParams.get("mode");

  const source = mode === "focus"
    ? level55Ordered(questionBank.filter((question) => question.difficulty === "入試基礎"), `focus:${round}`)
    : selectSubjectQuestions(subject, round);
  const start = (set - 1) * count;
  const questions = source.slice(start, start + count);

  return Response.json({
    subject,
    set,
    round,
    count,
    totalQuestions: source.length,
    totalSets: Math.max(1, Math.ceil(source.length / count)),
    questions,
  });
}
