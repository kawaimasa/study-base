import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "public/data/english.json");
const questions = [];

function add({ grade, category, unit, difficulty, question, answer, explanation, tags = [] }) {
  const number = questions.length + 1;
  questions.push({
    id: `EN3-${String(number).padStart(4, "0")}`,
    batch: Math.ceil(number / 20),
    pos: ((number - 1) % 20) + 1,
    subject: "英語",
    grade,
    category,
    unit,
    difficulty,
    question,
    answer,
    explanation,
    tags: [grade, category, unit, difficulty, ...tags].join(","),
  });
}

const vocabulary = [
  ["accept", "受け入れる"], ["achieve", "達成する"], ["advice", "助言"], ["allow", "許可する"],
  ["ancient", "古代の"], ["appear", "現れる"], ["area", "地域"], ["arrive", "到着する"],
  ["believe", "信じる"], ["borrow", "借りる"], ["build", "建てる"], ["careful", "注意深い"],
  ["choose", "選ぶ"], ["collect", "集める"], ["common", "一般的な"], ["communicate", "意思を伝える"],
  ["compare", "比較する"], ["continue", "続ける"], ["culture", "文化"], ["decide", "決める"],
  ["different", "異なる"], ["discover", "発見する"], ["during", "〜の期間中に"], ["earth", "地球"],
  ["education", "教育"], ["environment", "環境"], ["especially", "特に"], ["event", "出来事"],
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

for (const [word, meaning] of vocabulary) {
  add({
    grade: "中1〜3", category: "語彙", unit: "英単語", difficulty: "基本",
    question: `次の英単語の日本語の意味を書きなさい。\n${word}`,
    answer: meaning,
    explanation: `${word} は「${meaning}」という意味です。`,
    tags: [word],
  });
  add({
    grade: "中1〜3", category: "語彙", unit: "英単語", difficulty: "標準",
    question: `次の日本語に合う英単語を書きなさい。\n${meaning}`,
    answer: word,
    explanation: `「${meaning}」は英語で ${word} と表します。`,
    tags: [word],
  });
}

const subjects = [
  ["I", false, "私は"], ["You", false, "あなたは"], ["We", false, "私たちは"], ["They", false, "彼らは"],
  ["He", true, "彼は"], ["She", true, "彼女は"], ["Ken", true, "ケンは"], ["Mika", true, "ミカは"],
  ["My brother", true, "私の兄は"], ["Our teacher", true, "私たちの先生は"],
];
const actions = [
  ["play", "plays", "played", "soccer after school", "放課後にサッカーをする"],
  ["study", "studies", "studied", "English every evening", "毎晩英語を勉強する"],
  ["visit", "visits", "visited", "the library on Sunday", "日曜日に図書館を訪れる"],
  ["watch", "watches", "watched", "the news before dinner", "夕食前にニュースを見る"],
  ["use", "uses", "used", "this computer at school", "学校でこのコンピューターを使う"],
  ["carry", "carries", "carried", "a blue bag to school", "学校へ青いかばんを持っていく"],
  ["read", "reads", "read", "an English book at night", "夜に英語の本を読む"],
  ["make", "makes", "made", "lunch for the family", "家族のために昼食を作る"],
  ["go", "goes", "went", "to the park in the morning", "朝に公園へ行く"],
  ["practice", "practices", "practiced", "the piano for an hour", "1時間ピアノを練習する"],
];

for (const [subject, thirdPerson] of subjects) {
  for (const [base, third, , complement] of actions) {
    const present = thirdPerson ? third : base;
    add({
      grade: "中1", category: "文法", unit: "現在形", difficulty: "基本",
      question: `［　］内の語を適切な形にして、英文を完成させなさい。\n${subject} (　　　) ${complement}. [${base}]`,
      answer: present,
      explanation: thirdPerson ? `主語が三人称単数なので ${base} を ${third} にします。` : `主語に合わせて動詞の原形 ${base} を使います。`,
    });
    const negative = thirdPerson ? `${subject} does not ${base} ${complement}.` : `${subject} do not ${base} ${complement}.`;
    add({
      grade: "中1", category: "文法", unit: "否定文", difficulty: "標準",
      question: `次の英文を否定文に書きかえなさい。\n${subject} ${present} ${complement}.`,
      answer: negative,
      explanation: thirdPerson ? `does not の後ろでは動詞を原形 ${base} に戻します。` : `一般動詞の前に do not を置きます。`,
    });
  }
}

function rotate(words, amount) {
  const index = amount % words.length;
  return [...words.slice(index), ...words.slice(0, index)];
}

const reorderSubjects = ["I", "You", "We", "They", "He", "She", "Ken", "Mika", "My friends", "Our teacher"];
const reorderPredicates = [
  ["will", "visit Kyoto", "next spring"], ["can", "learn English", "in Canada"],
  ["should", "finish this work", "today"], ["can", "solve the problem", "without help"],
  ["may", "join the festival", "tomorrow"], ["would like to", "read books", "after dinner"],
  ["must", "study science", "this year"], ["will try to", "speak clearly", "in class"],
  ["should", "protect nature", "for the future"], ["may", "become a doctor", "someday"],
];

let reorderIndex = 0;
for (const subject of reorderSubjects) {
  for (const [auxiliary, action, time] of reorderPredicates) {
    const words = [subject, ...auxiliary.split(" "), ...action.split(" "), ...time.split(" ")];
    const answer = `${words.join(" ")}.`;
    const shuffled = rotate(words, reorderIndex * 3 + 2);
    add({
      grade: "中2〜3", category: "並べ替え", unit: "語順", difficulty: "標準",
      question: `次の語句を並べ替えて、意味の通る英文を完成させなさい。\n${shuffled.join(" / ")}`,
      answer,
      explanation: `主語、助動詞・表現、動作、時や場所を表す語句の順に並べます。`,
    });
    const auxiliaryWords = auxiliary.split(" ");
    const questionWords = [auxiliaryWords[0][0].toUpperCase() + auxiliaryWords[0].slice(1), subject, ...auxiliaryWords.slice(1), ...action.split(" "), ...time.split(" ")];
    const questionAnswer = `${questionWords.join(" ")}?`;
    add({
      grade: "中2〜3", category: "並べ替え", unit: "疑問文", difficulty: "入試基礎",
      question: `次の語句を並べ替えて疑問文を完成させなさい。\n${rotate(questionWords, reorderIndex + 1).join(" / ")}`,
      answer: questionAnswer,
      explanation: `疑問詞または助動詞を文頭に置き、最後に疑問符を付けます。`,
    });
    reorderIndex += 1;
  }
}

const compositionSubjects = [
  ["私は", "I", "am", "have", "want", "know", "my"],
  ["あなたは", "You", "are", "have", "want", "know", "your"],
  ["私たちは", "We", "are", "have", "want", "know", "our"],
  ["彼らは", "They", "are", "have", "want", "know", "their"],
  ["彼は", "He", "is", "has", "wants", "knows", "his"],
  ["彼女は", "She", "is", "has", "wants", "knows", "her"],
  ["ケンは", "Ken", "is", "has", "wants", "knows", "his"],
  ["ミカは", "Mika", "is", "has", "wants", "knows", "her"],
  ["私の姉は", "My sister", "is", "has", "wants", "knows", "her"],
  ["私の友達は", "My friend", "is", "has", "wants", "knows", "their"],
];
const compositionActions = [
  ["明日、図書館で勉強するつもりです", "{be} going to study at the library tomorrow"],
  ["将来、外国を訪れたいです", "{want} to visit a foreign country in the future"],
  ["毎日英語を練習しなければなりません", "{have} to practice English every day"],
  ["先週、この本を読み終えました", "finished reading this book last week"],
  ["3年間この町に住んでいます", "{have} lived in this town for three years"],
  ["駅への行き方を知っています", "{know} how to get to the station"],
  ["弟より速く走ることができます", "can run faster than {possessive} younger brother"],
  ["先生に手伝ってもらいました", "was helped by the teacher"],
  ["音楽を聞きながら夕食を作りました", "cooked dinner while listening to music"],
  ["多くの人に使われている道具を作りました", "made a tool that is used by many people"],
];

for (const [subjectJa, subjectEn, be, have, want, know, possessive] of compositionSubjects) {
  for (const [actionJa, actionEn] of compositionActions) {
    const adjusted = actionEn
      .replace("{be}", be)
      .replace("{have}", have)
      .replace("{want}", want)
      .replace("{know}", know)
      .replace("{possessive}", possessive);
    const sentence = `${subjectEn} ${adjusted}.`;
    add({
      grade: "中2〜3", category: "英作文", unit: "和文英訳", difficulty: "標準",
      question: `次の日本文を英語にしなさい。\n「${subjectJa}${actionJa}。」`,
      answer: sentence,
      explanation: `主語を ${subjectEn} とし、時制と語順に注意して書きます。`,
    });
    add({
      grade: "中3", category: "英作文", unit: "書きかえ", difficulty: "入試基礎",
      question: `次の内容を、主語を「${subjectEn}」にして1文の英語で表しなさい。\n${actionJa}。`,
      answer: sentence,
      explanation: `主語と動詞を対応させ、文末まで一つの英文としてまとめます。`,
    });
  }
}

const readers = [
  ["Aki", "アキ"], ["Ben", "ベン"], ["Chika", "チカ"], ["Daiki", "ダイキ"], ["Emma", "エマ"],
  ["Fumi", "フミ"], ["George", "ジョージ"], ["Hana", "ハナ"], ["Ian", "イアン"], ["Jun", "ジュン"],
];
const readingPlans = [
  ["the city library", "市立図書館", "read a book about space", "宇宙についての本を読む", "Saturday", "土曜日"],
  ["the science museum", "科学館", "see a robot show", "ロボットショーを見る", "Sunday", "日曜日"],
  ["the community center", "公民館", "help younger children", "年下の子どもを手伝う", "Wednesday", "水曜日"],
  ["the riverside park", "川沿いの公園", "collect plastic bottles", "ペットボトルを集める", "Friday", "金曜日"],
];

for (const [name] of readers) {
  for (const [place, placeJa, activity, activityJa, day, dayJa] of readingPlans) {
    const passage = `${name} is a junior high school student. ${name} will go to ${place} on ${day}. ${name} wants to ${activity} there. ${name} has prepared for the visit since Monday.`;
    const shared = { grade: "中2〜3", category: "読解", unit: "短文読解", difficulty: "入試基礎" };
    add({ ...shared, question: `次の英文を読み、主人公の名前を英語で答えなさい。\n${passage}`, answer: name, explanation: `第1文に ${name} とあります。` });
    add({ ...shared, question: `次の英文を読み、${name}が行く場所を日本語で答えなさい。\n${passage}`, answer: placeJa, explanation: `${place} は「${placeJa}」です。` });
    add({ ...shared, question: `次の英文を読み、${name}が行く曜日を日本語で答えなさい。\n${passage}`, answer: dayJa, explanation: `on ${day} から「${dayJa}」と分かります。` });
    add({ ...shared, question: `次の英文を読み、${name}がそこで何をしたいのか日本語で答えなさい。\n${passage}`, answer: activityJa, explanation: `wants to ${activity} が目的を表します。` });
    add({ ...shared, question: `次の英文の内容に合うように空欄を補いなさい。\n${passage}\n${name} has prepared for the visit since (　　　).`, answer: "Monday", explanation: `最終文の since Monday が根拠です。` });
  }
}

const normalize = (value) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
if (questions.length !== 1000) throw new Error(`expected 1000 questions, received ${questions.length}`);
if (new Set(questions.map(({ id }) => id)).size !== 1000) throw new Error("question ids are not unique");
const normalizedCounts = new Map();
for (const { question } of questions) normalizedCounts.set(normalize(question), (normalizedCounts.get(normalize(question)) ?? 0) + 1);
const duplicateTexts = [...normalizedCounts.entries()].filter(([, count]) => count > 1);
if (duplicateTexts.length > 0) throw new Error(`question texts are not unique: ${JSON.stringify(duplicateTexts)}`);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
console.log(`Generated ${questions.length} unique English questions at ${output}`);
