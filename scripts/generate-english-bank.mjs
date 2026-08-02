import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "public/data/english.json");

const vocabulary = [
  ["accept", "受け入れる"], ["achieve", "達成する"], ["advice", "助言"], ["allow", "許可する"],
  ["ancient", "古代の"], ["appear", "現れる"], ["area", "地域"], ["arrive", "到着する"],
  ["believe", "信じる"], ["borrow", "借りる"], ["build", "建てる"], ["careful", "注意深い"],
  ["choose", "選ぶ"], ["collect", "集める"], ["common", "一般的な"], ["communicate", "意思を伝える"],
  ["compare", "比較する"], ["continue", "続ける"], ["culture", "文化"], ["decide", "決める"],
  ["different", "異なる"], ["discover", "発見する"], ["during", "〜の間に"], ["earth", "地球"],
  ["education", "教育"], ["environment", "環境"], ["especially", "特に"], ["event", "行事"],
  ["example", "例"], ["experience", "経験"], ["explain", "説明する"], ["famous", "有名な"],
  ["foreign", "外国の"], ["future", "未来"], ["health", "健康"], ["history", "歴史"],
  ["however", "しかしながら"], ["important", "重要な"], ["improve", "改善する"], ["include", "含む"],
  ["information", "情報"], ["instead", "その代わりに"], ["introduce", "紹介する"], ["language", "言語"],
  ["learn", "学ぶ"], ["local", "地元の"], ["memory", "記憶"], ["message", "伝言"],
  ["necessary", "必要な"], ["opinion", "意見"], ["opportunity", "機会"], ["ordinary", "普通の"],
  ["peace", "平和"], ["popular", "人気のある"], ["possible", "可能な"], ["practice", "練習する"],
  ["prepare", "準備する"], ["problem", "問題"], ["produce", "生産する"], ["protect", "守る"],
  ["purpose", "目的"], ["receive", "受け取る"], ["remember", "覚えている"], ["research", "研究"],
  ["respect", "尊敬する"], ["result", "結果"], ["return", "戻る"], ["safe", "安全な"],
  ["several", "いくつかの"], ["share", "共有する"], ["society", "社会"], ["special", "特別な"],
  ["spend", "過ごす"], ["suggest", "提案する"], ["support", "支える"], ["technology", "技術"],
  ["through", "〜を通して"], ["traditional", "伝統的な"], ["understand", "理解する"], ["useful", "役に立つ"],
  ["volunteer", "ボランティア"], ["without", "〜なしで"], ["wonderful", "すばらしい"], ["world", "世界"],
  ["ability", "能力"], ["activity", "活動"], ["against", "〜に反対して"], ["already", "すでに"],
  ["because", "なぜなら"], ["become", "〜になる"], ["between", "〜の間に"], ["century", "世紀"],
  ["change", "変化"], ["community", "地域社会"], ["country", "国"], ["delicious", "おいしい"],
  ["energy", "エネルギー"], ["festival", "祭り"], ["hospital", "病院"], ["knowledge", "知識"],
];

const vocabContexts = [
  "入試でよく使われる基本語です。", "長文読解でも意味を取れるようにしましょう。",
  "会話文でも使われる重要語です。", "英作文で使えるようにつづりも確認しましょう。",
];

function vocabularyQuestion(index) {
  const [word, meaning] = vocabulary[index % vocabulary.length];
  const round = Math.floor(index / vocabulary.length);
  if (round === 0) {
    return {
      category: "語彙", unit: "重要単語", difficulty: index < 60 ? "基本" : "標準",
      question: `次の英単語の日本語の意味を書きなさい。\n${word}`,
      answer: meaning,
      explanation: `${word} は「${meaning}」という意味です。${vocabContexts[index % vocabContexts.length]}`,
      tags: [word],
    };
  }
  return {
    category: "語彙", unit: "つづり", difficulty: "標準",
    question: `次の日本語に合う英単語を、最初の文字に続けて完成させなさい。\n「${meaning}」 ${word[0]}________`,
    answer: word,
    explanation: `「${meaning}」は ${word} と表します。つづりまで正確に覚えましょう。`,
    tags: [word],
  };
}

const subjects = [
  ["I", false], ["You", false], ["We", false], ["They", false], ["He", true],
  ["She", true], ["Ken", true], ["Mika", true], ["My brother", true], ["Our teacher", true],
];
const actions = [
  ["play", "plays", "played", "soccer after school"],
  ["study", "studies", "studied", "English every evening"],
  ["visit", "visits", "visited", "the library on Sunday"],
  ["watch", "watches", "watched", "the news before dinner"],
  ["use", "uses", "used", "this computer at school"],
  ["carry", "carries", "carried", "a blue bag to school"],
  ["read", "reads", "read", "an English book at night"],
  ["make", "makes", "made", "lunch for the family"],
  ["go", "goes", "went", "to the park in the morning"],
  ["practice", "practices", "practiced", "the piano for an hour"],
  ["clean", "cleans", "cleaned", "the classroom every Friday"],
  ["help", "helps", "helped", "his grandmother on weekends"],
  ["write", "writes", "wrote", "an email to her friend"],
  ["take", "takes", "took", "pictures in the garden"],
  ["teach", "teaches", "taught", "Japanese at the community center"],
];

function grammarQuestion(index) {
  const [subject, third] = subjects[Math.floor(index / actions.length)];
  const [base, thirdForm, past, complement] = actions[index % actions.length];
  const mode = (index % actions.length) % 3;
  if (mode === 0) {
    const answer = third ? thirdForm : base;
    return { category: "文法", unit: "現在形", difficulty: "基本", question: `（　）内の語を適切な形にして英文を完成させなさい。\n${subject} ( ${base} ) ${complement}.`, answer, explanation: third ? `主語が三人称単数なので ${thirdForm} を使います。` : `主語に合わせ、動詞は原形 ${base} を使います。` };
  }
  if (mode === 1) {
    const original = `${subject} ${third ? thirdForm : base} ${complement}.`;
    const answer = `${subject} ${third ? "does not" : "do not"} ${base} ${complement}.`;
    return { category: "文法", unit: "否定文", difficulty: "標準", question: `次の英文を否定文に書きかえなさい。\n${original}`, answer, explanation: `${third ? "does not" : "do not"} の後ろでは動詞を原形 ${base} にします。` };
  }
  return { category: "文法", unit: "過去形", difficulty: "標準", question: `過去の出来事を表す文になるよう、（　）内の語を適切な形にしなさい。\n${subject} ( ${base} ) ${complement}.`, answer: past, explanation: `過去を表すので ${base} の過去形 ${past} を使います。` };
}

const wordForms = [
  ["interest", "interested", "I am (　) in science.", "be interested in で「〜に興味がある」です。"],
  ["excite", "exciting", "The soccer game was (　).", "物事が人をわくわくさせる場合は exciting です。"],
  ["beauty", "beautiful", "Kyoto has many (　) temples.", "名詞を修飾する形容詞 beautiful を使います。"],
  ["care", "carefully", "Please listen to me (　).", "動詞 listen を修飾する副詞 carefully を使います。"],
  ["use", "useful", "This dictionary is very (　).", "be動詞の後ろには形容詞 useful が入ります。"],
  ["different", "difference", "What is the (　) between these pictures?", "the の後ろには名詞 difference が入ります。"],
  ["success", "successful", "The school festival was (　).", "be動詞の後ろには形容詞 successful が入ります。"],
  ["kind", "kindness", "I will never forget her (　).", "所有格 her の後ろには名詞 kindness が入ります。"],
  ["safe", "safely", "The children arrived home (　).", "動詞 arrived を修飾する副詞 safely を使います。"],
  ["tradition", "traditional", "We enjoyed a (　) Japanese dance.", "名詞 dance を修飾する形容詞 traditional を使います。"],
];
const formModifiers = ["次の英文で", "文の意味を考えて", "品詞に注意して", "入試問題として", "語の働きを考え", "前後の語に注目し", "自然な英文になるよう", "文法的に正しく", "空所の位置を確認し", "英文全体を読んで"];
function wordFormQuestion(index) {
  const [source, answer, sentence, explanation] = wordForms[index % 10];
  const lead = formModifiers[Math.floor(index / 10)];
  return { category: "語形変化", unit: "品詞", difficulty: index < 40 ? "標準" : "入試基礎", question: `${lead}、（　）内に入る適切な形を書きなさい。\n${sentence} [${source}]`, answer, explanation };
}

const reorderPredicates = [
  ["will", "visit Kyoto", "next spring"], ["can", "learn English", "in Canada"],
  ["should", "finish this work", "today"], ["can", "solve the problem", "without help"],
  ["may", "join the festival", "tomorrow"], ["would like to", "read books", "after dinner"],
  ["must", "study science", "this year"], ["will try to", "speak clearly", "in class"],
  ["should", "protect nature", "for the future"], ["may", "become a doctor", "someday"],
  ["has to", "leave home", "before seven"], ["wants to", "help visitors", "at the station"],
  ["is going to", "practice tennis", "this afternoon"], ["was able to", "answer the question", "in English"],
  ["has never", "seen snow", "in April"],
];
function rotate(words, amount) { const n = amount % words.length; return [...words.slice(n), ...words.slice(0, n)]; }
function reorderQuestion(index) {
  const [subject] = subjects[Math.floor(index / reorderPredicates.length)];
  const [aux, action, time] = reorderPredicates[index % reorderPredicates.length];
  const words = [subject, ...aux.split(" "), ...action.split(" "), ...time.split(" ")];
  const shuffled = rotate(words, index * 3 + 2);
  return { category: "並べ替え", unit: "語順", difficulty: index < 60 ? "標準" : "入試基礎", question: `次の語句を並べ替えて、意味の通る英文を完成させなさい。\n${shuffled.join(" / ")}`, answer: `${words.join(" ")}.`, explanation: "主語、助動詞や時制表現、動作、時・場所を表す語句の順に組み立てます。" };
}

const blanks = [
  ["because", "I stayed home (　) it was raining.", "雨が降っていた『ので』家にいた、という理由を表します。"],
  ["when", "Please call me (　) you arrive at the station.", "駅に着いた『とき』を表します。"],
  ["if", "(　) it is sunny tomorrow, we will play outside.", "『もし』晴れたら、という条件を表します。"],
  ["than", "This river is longer (　) that one.", "比較級 longer とともに than を使います。"],
  ["for", "She has lived here (　) five years.", "期間を表す five years の前には for を使います。"],
  ["since", "We have known each other (　) 2022.", "起点となる年の前には since を使います。"],
  ["to", "My dream is (　) become a nurse.", "be to do の形で『〜すること』を表します。"],
  ["by", "This song was written (　) a famous musician.", "受け身で動作主を表すときは by を使います。"],
  ["which", "This is the book (　) helped me understand history.", "先行詞が物で、後ろの節の主語となる which を使います。"],
  ["where", "Do you know the park (　) we met last year?", "場所を説明する関係副詞 where を使います。"],
];
const blankLeads = ["接続詞に注意し", "時制を確認し", "文の前後関係を読み", "比較表現に注意し", "現在完了の用法を考え", "語句の結び付きを見て", "不定詞の形を確認し", "受け身の形を確認し", "関係詞の働きを考え", "文全体の意味を考え"];
function blankQuestion(index) {
  const [answer, sentence, explanation] = blanks[index % 10];
  return { category: "空所補充", unit: "文脈・文法", difficulty: index < 30 ? "標準" : "入試基礎", question: `${blankLeads[Math.floor(index / 10)]}、空所に入る最も適切な1語を書きなさい。\n${sentence}`, answer, explanation };
}

const compSubjects = [["私は", "I"], ["あなたは", "You"], ["私たちは", "We"], ["彼らは", "They"], ["彼は", "He"], ["彼女は", "She"], ["健は", "Ken"], ["美香は", "Mika"], ["私の姉は", "My sister"], ["私の友達は", "My friend"]];
const compActions = [
  ["明日、図書館で勉強するつもりです。", "am going to study at the library tomorrow"],
  ["将来、外国を訪れたいです。", "want to visit a foreign country in the future"],
  ["毎日英語を練習しなければなりません。", "have to practice English every day"],
  ["先週、この本を読み終えました。", "finished reading this book last week"],
  ["3年間この町に住んでいます。", "have lived in this town for three years"],
  ["駅への行き方を知っています。", "know how to get to the station"],
  ["弟より速く走ることができます。", "can run faster than my younger brother"],
  ["先生に手伝ってもらいました。", "was helped by the teacher"],
  ["音楽を聞きながら夕食を作りました。", "cooked dinner while listening to music"],
  ["多くの人に使われる道具を作りました。", "made a tool that is used by many people"],
];
function compositionQuestion(index) {
  const [jaSubject, enSubject] = compSubjects[index % 10];
  let [jaAction, enAction] = compActions[Math.floor(index / 10)];
  if (enSubject !== "I") {
    enAction = enAction.replace(/^am /, enSubject === "You" || enSubject === "We" || enSubject === "They" ? "are " : "is ").replace(/^have /, enSubject === "He" || enSubject === "She" || enSubject === "Ken" || enSubject === "Mika" || enSubject.startsWith("My ") ? "has " : "have ").replace(/^want /, enSubject === "He" || enSubject === "She" || enSubject === "Ken" || enSubject === "Mika" || enSubject.startsWith("My ") ? "wants " : "want ").replace(/^know /, enSubject === "He" || enSubject === "She" || enSubject === "Ken" || enSubject === "Mika" || enSubject.startsWith("My ") ? "knows " : "know ");
  }
  return { category: "英作文", unit: "和文英訳", difficulty: index < 40 ? "標準" : "入試基礎", question: `次の日本語を英語1文で表しなさい。\n${jaSubject}${jaAction}`, answer: `${enSubject} ${enAction}.`, explanation: `主語を ${enSubject} とし、時制と語順に注意して1文にまとめます。` };
}

const speakers = ["Aki", "Ben", "Chika", "Daiki", "Emma", "Fumi", "George", "Hana", "Ian", "Jun"];
const conversations = [
  ["How was your weekend?", "It was great.", "週末の感想を尋ねる質問への自然な返答です。"],
  ["Could you help me with this box?", "Sure.", "依頼を快く受ける返答です。"],
  ["What time does the library open?", "It opens at nine.", "時刻を尋ねる質問には時刻で答えます。"],
  ["Why do you study English?", "Because I want to travel abroad.", "Why で尋ねられた理由を Because で答えます。"],
  ["Which bus goes to the museum?", "Bus number five does.", "Which bus への答えとしてバスを特定します。"],
  ["Have you ever been to Nara?", "Yes, I have.", "Have you ever ...? には have を使って答えます。"],
  ["May I use your pen?", "Of course.", "許可を求める表現への自然な返答です。"],
  ["How long have you lived here?", "For six years.", "How long には期間で答えます。"],
  ["What do you think of this idea?", "I think it is useful.", "意見を尋ねる表現への自然な返答です。"],
  ["Shall we practice after school?", "That sounds good.", "誘いを受ける自然な返答です。"],
];
function conversationQuestion(index) {
  const speaker = speakers[index % 10];
  const [line, answer, explanation] = conversations[Math.floor(index / 10)];
  return { category: "会話", unit: "応答表現", difficulty: index < 40 ? "標準" : "入試基礎", question: `次の会話が自然に続くよう、空所に入る英文を書きなさい。\n${speaker}: ${line}\nYou: (　　　　　　　　　)`, answer, explanation };
}

const readingNames = ["Aki", "Ben", "Chika", "Daiki", "Emma", "Fumi", "George", "Hana", "Ian", "Jun"];
const readingPlans = [
  ["the city library", "市立図書館", "read a book about space", "宇宙についての本を読む", "Saturday", "土曜日"],
  ["the science museum", "科学館", "see a robot show", "ロボットショーを見る", "Sunday", "日曜日"],
  ["the community center", "公民館", "help younger children", "年下の子どもを手伝う", "Wednesday", "水曜日"],
  ["the riverside park", "川沿いの公園", "collect plastic bottles", "ペットボトルを集める", "Friday", "金曜日"],
  ["the local farm", "地元の農場", "learn how vegetables grow", "野菜の育ち方を学ぶ", "Tuesday", "火曜日"],
];
function readingQuestions(index) {
  const name = readingNames[index % 10];
  const [place, placeJa, activity, activityJa, day, dayJa] = readingPlans[Math.floor(index / 10)];
  const passage = `${name} is a junior high school student. ${name} will go to ${place} on ${day}. ${name} wants to ${activity} there. ${name} has prepared for the visit since Monday.`;
  return [
    { category: "読解", unit: "短文読解", difficulty: "入試基礎", question: `次の英文を読み、${name}が行く場所を日本語で答えなさい。\n${passage}`, answer: placeJa, explanation: `${place} が行き先を表しています。` },
    { category: "読解", unit: "短文読解", difficulty: "入試基礎", question: `次の英文を読み、${name}がそこで何をしたいのか日本語で答えなさい。\n${passage}`, answer: activityJa, explanation: `wants to ${activity} が目的を表しています。` },
    { category: "読解", unit: "短文読解", difficulty: "入試基礎", question: `次の英文を読み、${name}が出かける曜日を日本語で答えなさい。\n${passage}`, answer: dayJa, explanation: `on ${day} が曜日を表しています。` },
  ];
}

const banks = {
  vocabulary: Array.from({ length: 150 }, (_, i) => vocabularyQuestion(i)),
  grammar: Array.from({ length: 150 }, (_, i) => grammarQuestion(i)),
  wordForm: Array.from({ length: 100 }, (_, i) => wordFormQuestion(i)),
  reorder: Array.from({ length: 150 }, (_, i) => reorderQuestion(i)),
  blank: Array.from({ length: 100 }, (_, i) => blankQuestion(i)),
  composition: Array.from({ length: 100 }, (_, i) => compositionQuestion(i)),
  conversation: Array.from({ length: 100 }, (_, i) => conversationQuestion(i)),
  reading: Array.from({ length: 50 }, (_, i) => readingQuestions(i)).flat(),
};

const setOrder = [
  "vocabulary", "grammar", "wordForm", "reorder", "blank", "composition", "conversation", "reading",
  "vocabulary", "grammar", "reorder", "reading", "wordForm", "blank", "composition", "conversation",
  "vocabulary", "grammar", "reorder", "reading",
];
const cursors = Object.fromEntries(Object.keys(banks).map((key) => [key, 0]));
const questions = [];

for (let batch = 1; batch <= 50; batch += 1) {
  const set = setOrder.map((key) => banks[key][cursors[key]++]);
  set.forEach((item, position) => {
    const number = questions.length + 1;
    questions.push({
      id: `EN3-${String(number).padStart(4, "0")}`,
      batch,
      pos: position + 1,
      subject: "英語",
      grade: "中1〜3",
      ...item,
      tags: ["中1〜3", item.category, item.unit, item.difficulty, ...(item.tags ?? [])].join(","),
    });
  });
}

const normalize = (value) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
if (questions.length !== 1000) throw new Error(`expected 1000 questions, received ${questions.length}`);
if (new Set(questions.map(({ id }) => id)).size !== 1000) throw new Error("question ids are not unique");
if (new Set(questions.map(({ question }) => normalize(question))).size !== 1000) throw new Error("question texts are not unique");
for (let batch = 1; batch <= 50; batch += 1) {
  const set = questions.filter((question) => question.batch === batch);
  if (set.length !== 20 || new Set(set.map(({ category }) => category)).size !== 8) {
    throw new Error(`batch ${batch} is not a complete mixed-format set`);
  }
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
console.log(`Generated ${questions.length} unique mixed-format English questions at ${output}`);
