import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "app/question-bank.json");
const previous = JSON.parse(await readFile(output, "utf8"));
const applicationKinds = new Set(previous.filter((item) => item.sourceTerm === null).map((item) => item.kind));

const normalize = (value) => String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
const round = (value, digits = 2) => Number(value.toFixed(digits));
const termFromTags = (tags) => String(tags ?? "").split(",").at(-1)?.trim() ?? "";

function quotedDefinition(question) {
  const quoted = String(question).match(/[「『]([^」』]+)[」』]/g)?.at(-1);
  if (quoted) return quoted.slice(1, -1);
  const lines = String(question).split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.at(-1)?.replace(/^＿＿＿＿\s*＝\s*/, "") ?? "";
}

function extractConcepts(subject, category) {
  const found = new Map();
  for (const item of previous) {
    if (item.subject !== subject || item.category !== category) continue;
    const term = Object.hasOwn(item, "sourceTerm") ? item.sourceTerm : termFromTags(item.tags);
    if (!term || term === "計算" || applicationKinds.has(term) || found.has(term)) continue;
    const definition = item.sourceDefinition || (item.answer === term ? quotedDefinition(item.question) : item.answer);
    const note = item.sourceNote || item.explanation;
    if (!definition || normalize(definition) === normalize(term)) continue;
    found.set(term, {
      grade: item.grade,
      category,
      unit: item.unit,
      term,
      definition: String(definition).replace(/[。.]$/, ""),
      note: String(note || definition).replace(/[。.]$/, ""),
    });
  }
  return [...found.values()];
}

function foundationQuestions(concepts) {
  return concepts.flatMap((concept) => [
    {
      ...concept,
      kind: "知識・説明",
      question: `「${concept.term}」を、${concept.unit}の学習内容に即して説明しなさい。`,
      answer: concept.definition,
      explanation: `${concept.term}は、${concept.definition}。${concept.note}。`,
    },
    {
      ...concept,
      kind: "知識・根拠",
      question: `次の説明が示す用語を答え、その判断につながる要点も一つ書きなさい。\n${concept.definition}`,
      answer: `${concept.term}。要点：${concept.note}`,
      explanation: `説明の中心語は${concept.term}です。${concept.note}。`,
    },
    {
      ...concept,
      kind: "説明の評価",
      question: `ある生徒は「${concept.term}」を「${concept.definition}」と説明した。この説明が適切か判断し、${concept.unit}で重要な補足を一つ加えなさい。`,
      answer: `適切。補足：${concept.note}。`,
      explanation: `用語の定義に加え、「${concept.note}」まで説明できると理解が深まります。`,
    },
    {
      ...concept,
      kind: "要点整理",
      question: `${concept.unit}について、「${concept.term}」と「${concept.note}」の関係が分かる一文を書きなさい。`,
      answer: `${concept.term}は${concept.definition}。${concept.note}。`,
      explanation: "用語と、その性質・背景・影響を一つの流れとして結びつけます。",
    },
    {
      ...concept,
      kind: "二段階記述",
      question: `次の説明に対応する用語と、その用語を理解するうえで重要な関連事項を答えなさい。\n説明：${concept.definition}`,
      answer: `用語：${concept.term}。関連事項：${concept.note}。`,
      explanation: "名称だけで終わらず、関連する現象・背景・影響まで確認します。",
    },
    {
      ...concept,
      kind: "根拠抽出",
      question: `資料文を読み、${concept.unit}の用語を一つ答えなさい。さらに、判断の根拠になる部分を資料文から抜き出しなさい。\n資料文：${concept.definition}。${concept.note}。`,
      answer: `用語：${concept.term}。根拠例：${concept.definition}。`,
      explanation: "資料文の中心となる特徴と用語を対応させます。",
    },
    {
      ...concept,
      kind: "関連説明",
      question: `「${concept.term}」が${concept.unit}で重要である理由を、「${concept.definition}」「${concept.note}」の内容を使って説明しなさい。`,
      answer: `${concept.term}は${concept.definition}であり、${concept.note}ため重要である。`,
      explanation: "定義と関連事項を因果関係が伝わるようにつなぎます。",
    },
    {
      ...concept,
      kind: "入試短答",
      question: `${concept.unit}の記述問題で「${concept.term}」を説明する。名称だけでなく、定義と関連事項を含む二文以内の答案を書きなさい。`,
      answer: `${concept.term}は${concept.definition}。${concept.note}。`,
      explanation: "採点語句になる定義と関連事項を、短く過不足なく書きます。",
    },
  ]);
}

const grades = ["中1", "中2", "中3"];
const difficultyFor = (index) => index % 10 < 3 ? "基本" : index % 10 < 8 ? "標準" : "入試基礎";
const item = (grade, unit, kind, question, answer, explanation) => ({ grade, unit, kind, question, answer, explanation });

function biology(i) {
  const n = Math.floor(i / 10) + 1;
  switch (i % 10) {
    case 0: {
      const hours = 2 + n % 5;
      return item("中1", "植物のはたらき", "実験考察", `一昼夜暗所に置いた植物の葉の一部をアルミ箔で覆い、${hours}時間光を当てた後、ヨウ素液で調べた。覆わなかった部分だけが青紫色になった。この結果から分かることを、デンプンと光を使って説明しなさい。`, "葉でデンプンがつくられるには光が必要である。", "暗所に置く操作で、実験前に葉にあったデンプンの影響を小さくします。");
    }
    case 1: {
      const temp = 30 + (n % 3) * 5;
      return item("中2", "消化と吸収", "実験設計", `デンプンのりとだ液を混ぜ、${temp}℃で保温した試験管Aと、だ液の代わりに水を入れた試験管Bを用意した。一定時間後、Aだけヨウ素液の反応が見られなかった。Bを用意した目的と、この実験から分かることを答えなさい。`, "Bはだ液の有無だけを比べる対照実験である。だ液にはデンプンを分解するはたらきがある。", "温度や時間など、だ液以外の条件をそろえて比較します。");
    }
    case 2: {
      const eyepiece = [10, 15][n % 2], objective = [4, 10, 40][n % 3];
      return item("中1", "顕微鏡", "計算・操作", `接眼レンズ${eyepiece}倍、対物レンズ${objective}倍で観察した。顕微鏡の倍率を求め、低倍率から高倍率へ変えたとき視野の広さと明るさがどう変化するか答えなさい。`, `${eyepiece * objective}倍。視野は狭くなり、暗くなる。`, "倍率は接眼レンズと対物レンズの倍率の積です。");
    }
    case 3: {
      const red = 40 + n * 2, heart = 60 + n;
      return item("中2", "血液循環", "資料分析", `安静時のある生徒について、1分間の脈拍数は${heart}回、1回の拍動で心臓から送り出される血液は${red}mLだった。1分間に送り出される血液量を求め、運動時にこの量が増える理由を酸素と養分に触れて説明しなさい。`, `${heart * red}mL。筋肉へより多くの酸素と養分を運ぶため。`, "心拍出量は、脈拍数×1回に送り出す量で求めます。");
    }
    case 4: {
      const dominant = 3 * (20 + n), recessive = 20 + n;
      return item("中3", "遺伝", "資料分析", `ある形質について同じ組合せの交配を多数行ったところ、優性形質が${dominant}個、劣性形質が${recessive}個現れた。親の遺伝子の組合せをA、aで表し、そう判断した理由も答えなさい。`, "両親ともAa。子の表現型がおよそ3：1になる組合せだから。", "Aa×AaではAA：Aa：aa＝1：2：1、表現型は3：1になります。");
    }
    case 5: {
      const plants = 80 + n * 4, insects = 40 + n * 2;
      return item("中3", "生態系", "因果説明", `草→昆虫→小鳥という食物関係がある場所で、草が${plants}株、昆虫が${insects}匹観察された。その後、小鳥が急に減少した。短期的に昆虫と草がどう変化すると考えられるか、理由とともに答えなさい。`, "昆虫は増え、草は減ると考えられる。昆虫を食べる小鳥が減り、増えた昆虫が草を多く食べるため。", "食物網では一つの個体群の変化が他の生物へ連鎖します。");
    }
    case 6: {
      const water = 20 + n;
      return item("中1", "蒸散", "実験考察", `同じ大きさの葉をつけた枝A、Bを用意し、Aは葉の表側、Bは葉の裏側にワセリンを塗った。${water}分後、Bの吸水量がAより少なかった。気孔の分布に着目して理由を説明しなさい。`, "多くの植物では気孔が葉の裏側に多く、Bではワセリンが気孔をふさいで蒸散が強く抑えられたため。", "蒸散が抑えられると、枝が吸い上げる水の量も減ります。");
    }
    case 7:
      return item("中2", "刺激と反応", "経路説明", `熱い物に触れて手を引いた後に、熱いと感じた。反射の信号が通る経路を「感覚神経・せきずい・運動神経」の語を使って順に説明しなさい。`, "感覚神経→せきずい→運動神経の順に信号が伝わり、手を引く。脳へも信号が伝わって熱いと感じる。", "反射は脳で判断してから動くより短い経路で起こります。");
    case 8: {
      const days = 3 + n % 5;
      return item("中1", "種子の発芽", "条件整理", `同じ種子を、①水・空気・適温、②水なし、③空気なし、④低温の4条件に${days}日間置いた。発芽条件を確かめるために①と③を比べるとき、調べている条件は何か。また、そろえる条件を二つ答えなさい。`, "調べる条件は空気。水、温度、種子の種類や数などをそろえる。", "一度に変える条件を一つだけにするのが対照実験の基本です。");
    }
    default:
      return item("中3", "細胞分裂", "順序・理由", `根の先端を使って細胞分裂を観察するとき、根をうすい塩酸で処理してから押しつぶす。押しつぶす目的を答え、分裂が盛んな部分が根の先端付近である理由も説明しなさい。`, "細胞が重ならないよう一層に広げるため。根が伸びるために先端付近で新しい細胞が盛んにつくられるから。", "操作の目的と、生物学的な理由を分けて答えます。");
  }
}

function chemistry(i) {
  const n = Math.floor(i / 10) + 1;
  switch (i % 10) {
    case 0: {
      const volume = 20 + n * 5, density = [1.2, 1.5, 2.4, 2.7][n % 4], mass = round(volume * density, 1);
      return item("中1", "物質の性質", "計算・判断", `体積${volume}cm³、質量${mass}gの物体がある。密度を求め、密度1.0g/cm³の水に浮くか沈むか答えなさい。`, `${density}g/cm³。水より密度が大きいので沈む。`, "密度＝質量÷体積で求め、同じ体積あたりの質量を水と比べます。");
    }
    case 1: {
      const water = 50 + n * 5, sol = 20 + (n % 5) * 5, dissolved = Math.floor(water * sol / 100);
      return item("中1", "水溶液", "計算・実験", `${n + 15}℃で水100gに最大${sol}g溶ける物質がある。同じ温度の水${water}gに溶ける最大質量を求め、これより5g多く入れたとき残る固体の質量を答えなさい。`, `最大${dissolved}g溶け、5gが溶け残る。`, "溶解度を水の質量に比例させて求めます。");
    }
    case 2: {
      const solute = 10 + n, water = 90 + n * 2, pct = round(solute / (solute + water) * 100, 1);
      return item("中3", "水溶液とイオン", "濃度計算", `食塩${solute}gを水${water}gに完全に溶かした。質量パーセント濃度を小数第1位まで求めなさい。さらに水を加えると濃度が下がる理由を粒子の数に触れて説明しなさい。`, `${pct}％。食塩の粒子数は変わらず、溶液全体の質量が増えるため。`, "濃度＝溶質÷溶液×100です。");
    }
    case 3: {
      const before = 30 + n * 2, oxygen = 4 + n % 5;
      return item("中2", "化学変化と質量", "資料分析", `密閉容器内で金属${before}gを十分な酸素と反応させると、生成物は${before + oxygen}gになった。結びついた酸素の質量を求め、密閉容器全体の質量が反応前後で変わらない理由を説明しなさい。`, `${oxygen}g。原子の組合せは変わっても、容器外へ物質が出入りせず原子の種類と数が保たれるため。`, "生成物の増加分が結びついた酸素の質量です。");
    }
    case 4:
      return item("中1", "気体の性質", "実験手順", `発生した気体が酸素、二酸化炭素、水素のどれかを確かめたい。安全な確認方法を三つの気体についてそれぞれ答えなさい。`, "酸素：火の消えかかった線香を入れると再び激しく燃える。二酸化炭素：石灰水を白くにごらせる。水素：火を近づけると音を立てて燃える。", "気体を直接吸い込まず、少量を用いて性質を調べます。");
    case 5: {
      const ratio = [3, 4, 7][n % 3], metal = ratio * (2 + n % 4);
      return item("中2", "酸化と還元", "比例・考察", `ある金属と酸素は質量比${ratio}：2で結びつく。金属${metal}gを完全に酸化させるのに必要な酸素は何gか。また、酸素が不足すると未反応の金属が残る理由を説明しなさい。`, `${metal * 2 / ratio}g。物質は決まった質量比で反応するため。`, "化合する物質の質量比は一定です。");
    }
    case 6:
      return item("中2", "化学反応式", "モデル表現", `水素と酸素から水ができる変化を、化学反応式で表し、式の係数をそろえる理由を説明しなさい。`, "2H₂＋O₂→2H₂O。反応前後で原子の種類と数が変わらないようにするため。", "右下の数字を変えず、化学式の前の係数で原子数をそろえます。");
    case 7:
      return item("中3", "酸・アルカリとイオン", "実験考察", `同じ濃さの塩酸と水酸化ナトリウム水溶液を少しずつ混ぜ、BTB溶液が緑色になった。水を蒸発させると白い固体が残った。緑色になった理由と、残った物質名を答えなさい。`, "水素イオンと水酸化物イオンが反応して水になり中性に近づいたため。残った物質は塩化ナトリウム。", "中和では水と塩ができます。");
    case 8: {
      const current = 0.2 + (n % 5) * 0.1, sec = 60 + n * 10;
      return item("中3", "電池と電気分解", "因果説明", `${round(current, 1)}Aの電流を${sec}秒間流して水溶液を電気分解した。電流を2倍にし、時間を半分にした場合、電極に生じる物質の量はどうなるか。理由も答えなさい。`, "ほぼ同じになる。流れた電気量は電流×時間に比例し、2倍×1/2で変わらないため。", "電極で起こる変化の量は、流れた電気量と関係します。");
    }
    default:
      return item("中1", "混合物の分離", "方法選択", `食塩、砂、水が混ざったものから、砂と食塩を別々に回収したい。ろ過と蒸発を使う順序と、それぞれで何を分けるか説明しなさい。`, "最初にろ過して溶けない砂を分け、ろ液を蒸発させて食塩を取り出す。", "溶解性と粒子の大きさ、沸点の違いを利用します。");
  }
}

function physics(i) {
  const n = Math.floor(i / 10) + 1;
  switch (i % 10) {
    case 0: {
      const force = 50 + n * 10, area = [0.02, 0.04, 0.05][n % 3];
      return item("中1", "圧力", "計算・応用", `面積${area}m²の面を${force}Nの力で垂直に押す。圧力を求め、同じ力で接触面積を半分にしたときの圧力も答えなさい。`, `${round(force / area)}Pa。面積を半分にすると${round(force / (area / 2))}Pa。`, "圧力＝面を垂直に押す力÷面積です。");
    }
    case 1: {
      const distance = 60 + n * 12, time = 10 + n % 6;
      return item("中3", "運動", "グラフ・計算", `物体が${time}秒間に${distance}mを一定の速さで進んだ。平均の速さを求め、この運動の時間―距離グラフがどのような形になるか説明しなさい。`, `${round(distance / time, 2)}m/s。原点を通る直線になる。`, "一定の速さでは、進んだ距離は時間に比例します。");
    }
    case 2: {
      const voltage = 4 + (n % 5) * 2, resistance = 2 + n % 4;
      return item("中2", "電流", "回路計算", `抵抗${resistance}Ωに${voltage}Vを加えた。流れる電流を求め、この抵抗を同じもの2個の直列回路に変えたときの電流も答えなさい。`, `${round(voltage / resistance, 2)}A。直列では合成抵抗が${resistance * 2}Ωなので${round(voltage / (resistance * 2), 2)}A。`, "直列回路の合成抵抗は各抵抗の和です。");
    }
    case 3: {
      const voltage = [6, 9, 12][n % 3], resistance = [3, 6, 12][n % 3];
      return item("中2", "電力", "計算・説明", `${voltage}Vの電源に${resistance}Ωの抵抗をつないだ。電流と電力を求め、電力が大きい器具ほど同じ時間にどのような違いがあるか答えなさい。`, `電流${round(voltage / resistance, 2)}A、電力${round(voltage * voltage / resistance, 2)}W。同じ時間に消費する電気エネルギーが大きい。`, "I＝V÷R、P＝VIを使います。");
    }
    case 4: {
      const force = 8 + n, distance = 3 + n % 5, seconds = 4 + n % 4, work = force * distance;
      return item("中3", "仕事と仕事率", "計算・比較", `${force}Nの力で物体を力の向きに${distance}m動かすのに${seconds}秒かかった。仕事と仕事率を求めなさい。`, `仕事${work}J、仕事率${round(work / seconds, 2)}W。`, "仕事＝力×距離、仕事率＝仕事÷時間です。");
    }
    case 5:
      return item("中1", "光", "作図・説明", `凸レンズの焦点より外側に物体を置いた。スクリーンに実像を結ぶための代表的な2本の光線の進み方を文章で説明しなさい。`, "光軸に平行な光はレンズ通過後に焦点を通り、レンズの中心を通る光はほぼ直進する。その交点に実像ができる。", "作図では性質が分かっている光線を2本使います。");
    case 6: {
      const distance = 340 + n * 17, sec = round(distance / 340, 2);
      return item("中1", "音", "計算・考察", `音の速さを340m/sとする。観測者から${distance}m離れた場所で出た音が届くまで何秒かかるか。また、音を高くすると速さも大きくなるか答えなさい。`, `${sec}秒。空気中で温度などが同じなら、音の高さを変えても速さはほぼ変わらない。`, "音の高さは振動数、速さは主に媒質と温度で決まります。");
    }
    case 7:
      return item("中1", "力のつり合い", "ベクトル考察", `机の上で静止する物体には、重力と机から受ける力がはたらく。この2力がつり合うための三つの条件を答えなさい。`, "同一直線上にあり、向きが反対で、大きさが等しい。", "静止していることだけでなく、同じ物体にはたらく力を比較します。");
    case 8: {
      const volume = 100 + n * 10;
      return item("中1", "浮力", "因果説明", `水中に完全に沈めた体積${volume}cm³の物体を、深さだけ変えて静止させた。物体が押しのける水の体積が同じなら、浮力はどうなるか。水圧との関係も説明しなさい。`, "浮力はほぼ変わらない。深くなると上下両面の水圧は増えるが、その差は物体が押しのけた水の重さで決まるため。", "同じ液体中で完全に沈み体積が同じなら、浮力は深さにほぼ依存しません。");
    }
    default:
      return item("中3", "エネルギー", "変換・保存", `高い位置から球を転がし、水平面の物体に衝突させた。出発点を高くすると物体の移動距離が増えた理由を、位置エネルギー、運動エネルギー、エネルギーの一部の行方に触れて説明しなさい。`, "高いほど位置エネルギーが大きく、運動エネルギーへ変わって衝突時の作用が大きくなる。一部は摩擦による熱や音に変わる。", "エネルギーは消えるのではなく、別の形へ変換されます。");
  }
}

function earth(i) {
  const n = Math.floor(i / 10) + 1;
  switch (i % 10) {
    case 0: {
      const distance = 40 + n * 5, diff = 5 + n % 5;
      return item("中1", "地震", "計算・資料", `震源から${distance}km離れた地点で初期微動継続時間が${diff}秒だった。同じ地震で初期微動継続時間が${diff * 2}秒の地点は、震源からおよそ何kmと推定できるか。比例するとみなして求め、P波とS波の速さを使って理由も説明しなさい。`, `約${distance * 2}km。P波はS波より速く、震源から遠いほど両者の到着時刻の差が比例して大きくなるため。`, "初期微動継続時間と震源距離の関係を、同じ地震の観測値から比例で推定します。");
    }
    case 1: {
      const a = 2 + n % 7, b = 1 + n % 5, c = 3 + n % 6;
      return item("中1", "地層", "順序判断", `下から厚さ${a}mの砂岩層A、${b}mの火山灰層B、${c}mの泥岩層Cが重なり、その全体を断層Dが切っている。地層の合計の厚さを求め、できた順を古いものから根拠とともに答えなさい。`, `合計${a + b + c}m。A→B→C→D。地層は通常下ほど古く、断層は切っている地層より新しいため。`, "地層累重の法則と、切るものは切られるものより新しいという関係を使います。");
    }
    case 2: {
      const slow = 30 + n * 2, fast = 2 + n % 8;
      return item("中1", "火山と岩石", "比較説明", `同じマグマAを地下で約${slow}年かけて冷やした岩石と、地表付近で約${fast}日で冷えた岩石を比べる。結晶の大きさと組織がどう異なるか、冷却時間と関連づけて説明しなさい。`, "地下でゆっくり冷えた岩石は大きな結晶がそろう等粒状組織になり、地表付近で急に冷えた岩石は斑状組織になる。", "冷却時間が結晶の成長時間を左右します。");
    }
    case 3: {
      const dry = 22 + n % 8, wet = dry - (2 + n % 5);
      return item("中2", "湿度", "資料・判断", `乾湿計で乾球${dry}℃、湿球${wet}℃だった。別の日に乾球温度が同じで乾球と湿球の差がより小さくなった場合、湿度は高いか低いか。理由も答えなさい。`, "湿度は高い。空気が水蒸気を多く含むほど湿球からの蒸発が少なく、温度差が小さくなるため。", "数表を使わなくても、乾湿差と湿度の関係を判断できます。");
    }
    case 4: {
      const before = 24 + n % 8, after = before - (4 + n % 5);
      return item("中2", "前線と天気", "因果説明", `寒冷前線の通過前に${before}℃だった気温が、通過後に${after}℃になり、通過時には短時間の強い雨が降った。気温差を求め、この変化を気団と上昇気流に触れて説明しなさい。`, `${before - after}℃低下。冷たい気団が暖かい気団の下にもぐり込み、暖気を急に押し上げて積乱雲を発達させ、通過後は冷たい気団に覆われるため。`, "前線面付近の空気の動きから天気変化を説明します。");
    }
    case 5: {
      const high = 1020 + n % 8, low = 1000 - n % 6;
      return item("中2", "気圧と風", "天気図判断", `ある地域の西側に${high}hPaの高気圧、東側に${low}hPaの低気圧があり、その間の等圧線は混み合っている。二つの中心気圧の差を求め、風が強まりやすい理由と北半球での高気圧・低気圧周辺の風向きを答えなさい。`, `気圧差は${high - low}hPa。短い距離で気圧が大きく変わるため風が強まりやすい。高気圧では時計回りに吹き出し、低気圧では反時計回りに吹き込む。`, "風の強さは中心気圧だけでなく、等圧線の間隔にも注目します。");
    }
    case 6: {
      const hours = 1 + n % 8;
      return item("中3", "地球の自転", "観察説明", `日本で北の空の星を${hours}時間あけて観察した。星は北極星付近を中心に反時計回りに何度動いて見えるか。また、この見かけの動きが生じる理由を答えなさい。`, `約${hours * 15}度。地球が西から東へ自転するため、星が東から西へ動いて見える。`, "地球は約24時間で360度、1時間に約15度自転します。");
    }
    case 7: {
      const summer = 14 + n % 3, winter = 9 + n % 3;
      return item("中3", "季節と太陽", "モデル説明", `日本のある地点では夏至ごろの昼が約${summer}時間、冬至ごろは約${winter}時間だった。昼の長さの差を求め、夏に昼が長く南中高度も高い理由を地球の公転と地軸の傾きから説明しなさい。`, `約${summer - winter}時間。地軸が傾いたまま公転するため、夏の北半球は太陽側へ傾き、太陽の通り道が長く南中高度も高くなる。`, "地球と太陽の距離の変化が主因ではありません。");
    }
    case 8: {
      const phases = [
        ["夕方に南の空", "上弦の月", "太陽の東側へ約90度"],
        ["真夜中に南の空", "満月", "太陽と反対方向"],
        ["明け方に南の空", "下弦の月", "太陽の西側へ約90度"],
      ][n % 3];
      return item("中3", "月の満ち欠け", "位置関係", `${phases[0]}に月が見えた。月の形を答え、太陽・地球・月の位置関係を説明しなさい。`, `${phases[1]}。地球から見て月が${phases[2]}に位置する。`, "月が見える時刻と方角は、太陽との位置関係から判断します。");
    }
    default: {
      const planets = [
        ["水星", "内惑星", "太陽から大きく離れて見えず、日の出前か日没後に観察される"],
        ["金星", "内惑星", "満ち欠けと見かけの大きさが大きく変化する"],
        ["火星", "外惑星", "地球が追い越すころ逆行して見える"],
        ["木星", "外惑星", "太陽と反対方向にあるころ一晩中観察しやすい"],
      ][n % 4];
      return item("中3", "太陽系", "比較・根拠", `${planets[0]}は内惑星と外惑星のどちらか。地球との公転軌道の位置関係を答え、「${planets[2]}」理由も説明しなさい。`, `${planets[1]}。${planets[0]}と地球の公転軌道・太陽との位置関係が変化するため、${planets[2]}。`, "惑星の見え方を公転軌道の位置関係で説明します。");
    }
  }
}

const historyEvents = [
  ["大化の改新", 645, "天皇中心の国家づくりを目指した"], ["大宝律令", 701, "律令国家の制度を整えた"],
  ["平安京遷都", 794, "桓武天皇が都を移した"], ["遣唐使停止", 894, "国風文化が発達する背景になった"],
  ["鎌倉幕府成立", 1185, "武家政権が本格化した"], ["承久の乱", 1221, "幕府の朝廷への支配が強まった"],
  ["元寇", 1274, "御家人の負担が増え幕府衰退の一因になった"], ["建武の新政", 1333, "後醍醐天皇が天皇中心の政治を目指した"],
  ["室町幕府成立", 1336, "足利尊氏が京都に武家政権を開いた"], ["応仁の乱", 1467, "戦国時代へ進むきっかけになった"],
  ["鉄砲伝来", 1543, "戦い方や築城に影響を与えた"], ["江戸幕府成立", 1603, "徳川家康が征夷大将軍になった"],
  ["大政奉還", 1867, "徳川慶喜が政権を朝廷へ返した"], ["廃藩置県", 1871, "中央集権体制を整えた"],
  ["日清戦争", 1894, "下関条約が結ばれた"], ["日露戦争", 1904, "ポーツマス条約が結ばれた"],
  ["普通選挙法", 1925, "25歳以上の男子に選挙権を広げた"], ["日本国憲法施行", 1947, "国民主権・基本的人権・平和主義を掲げた"],
];

function geography(i) {
  const n = Math.floor(i / 10) + 1;
  switch (i % 10) {
    case 0: {
      const longitude = 15 * (1 + n % 8);
      return item("中1", "時差", "計算・理由", `日本標準時の基準となる東経135度の地点が正午のとき、東経${135 - longitude}度の地点の標準時は何時か。東西のどちらの時刻が早いかも説明しなさい。`, `${12 - longitude / 15}時。東にある地点ほど太陽が先に南中するため時刻が早い。`, "経度15度につき1時間の時差として計算します。");
    }
    case 1: {
      const scale = [25000, 50000, 100000][n % 3], cm = 3 + n % 7;
      return item("中1", "地形図", "縮尺計算", `縮尺1:${scale}の地図上で2地点間が${cm}cmだった。実際の距離をkmで求めなさい。また、等高線の間隔が狭い場所の傾斜を答えなさい。`, `${round(scale * cm / 100000, 2)}km。等高線の間隔が狭い場所は傾斜が急。`, "地図上の長さに縮尺の分母を掛け、cmをkmへ直します。");
    }
    case 2: {
      const pop = 80 + n * 5, area = 20 + n;
      return item("中2", "人口", "統計計算", `人口${pop}万人、面積${area * 100}km²の地域の人口密度を求めなさい。人口密度だけでは地域内の人口分布まで分からない理由も答えなさい。`, `約${round(pop * 10000 / (area * 100))}人/km²。地域全体の平均値で、都市への集中など地域内の偏りを示さないため。`, "統計値が示す範囲と限界の両方を確認します。");
    }
    case 3:
      return item("中1", "世界の気候", "資料判定", `ある都市は、年中気温が高く、雨季と乾季が明瞭で、丈の高い草原が広がる。気候名を答え、人々の生活や農業に影響する季節変化を一つ説明しなさい。`, "サバナ気候。雨季と乾季で水の得やすさが変わるため、農耕や放牧の時期に影響する。", "気温だけでなく、降水の季節変化と植生から判断します。");
    case 4:
      return item("中2", "日本の地形", "土地利用", `河川が山地から平地へ出る所では扇状地、河口付近では三角州ができやすい。粒の大きさ、水はけ、代表的な土地利用を関連づけて比較しなさい。`, "扇状地は大きめの土砂がたまり水はけがよく果樹園に利用されやすい。三角州は細かい土砂がたまり低く水を得やすいため水田や市街地に利用されやすい。", "地形の成因から土地利用を説明します。");
    case 5: {
      const rice = 80 + n, veg = 45 + n * 2, industry = 120 + n * 4;
      return item("中2", "地域統計", "複数資料", `A県の指数を米${rice}、野菜${veg}、工業出荷額${industry}（全国平均=100）とする。この県の産業の特色を二つ読み取り、指数だけで生産量そのものを比較できない理由も答えなさい。`, `工業の比重が比較的大きく、${rice >= 100 ? "米も全国平均以上" : "米は全国平均未満"}である。指数は基準に対する割合で、実数を示していないため。`, "資料では単位と基準を確認してから比較します。");
    }
    case 6:
      return item("中2", "近畿地方", "地域考察", `大阪湾岸に工業や人口が集中する一方、京都・奈良には歴史的景観が多い。交通、平野、文化財保護の三点から、近畿地方の地域差を説明しなさい。`, "湾岸部は平野・港・交通網を利用して都市と工業が発達した。京都・奈良では文化財や歴史的景観を守りながら観光や都市機能を両立させる必要がある。", "自然条件と社会条件を組み合わせて地域を説明します。");
    case 7:
      return item("中1", "産業と貿易", "因果説明", `工業製品を多く輸出し、原料や燃料を多く輸入する国では、海沿いに工業地域が発達しやすい。輸送費と港の利用に触れて理由を説明しなさい。`, "重い原料や大量の製品を船で安く運べ、輸入した原料の受入れと製品の輸出を港の近くで効率よく行えるため。", "立地条件を物流の視点から説明します。");
    case 8:
      return item("中2", "農業", "比較・判断", `大都市近郊の農業と、冷涼な高地の農業では出荷の工夫が異なる。近郊農業と抑制栽培について、市場との距離と気候を使って説明しなさい。`, "近郊農業は大都市に近いことを生かして新鮮な野菜などを出荷する。抑制栽培は冷涼な気候を利用して出荷時期を遅らせる。", "用語だけでなく、成立する条件まで答えます。");
    default:
      return item("中1", "持続可能な地域", "課題解決", `観光客の増加で地域の収入は増えたが、ごみ、交通混雑、自然破壊が問題になった。観光を続けながら問題を減らす方策を二つ、効果とともに提案しなさい。`, "例：公共交通の利用を促して渋滞と排出を減らす。入域人数や利用場所を管理し、得た収入を自然保護やごみ処理へ充てる。", "経済・社会・環境の三側面を両立させる提案にします。");
  }
}

function history(i) {
  const n = Math.floor(i / 10);
  const cycle = Math.floor(n / historyEvents.length);
  const event = historyEvents[n % historyEvents.length];
  const next = historyEvents[(n + 1 + cycle + (i % 5)) % historyEvents.length];
  const older = event[1] <= next[1] ? event : next;
  const newer = event[1] <= next[1] ? next : event;
  const grade = Math.max(event[1], next[1]) < 1600 ? "中1" : Math.max(event[1], next[1]) < 1920 ? "中2" : "中3";
  switch (i % 10) {
    case 0:
      return item(grade, "年代整序", "年代・因果", `「${event[0]}（${event[1]}年）」と「${next[0]}（${next[1]}年）」を古い順に並べ、それぞれが政治や社会に与えた影響を簡潔に答えなさい。`, `${older[0]}→${newer[0]}。${event[0]}：${event[2]}。${next[0]}：${next[2]}。`, "年代と出来事の意味を結びつけます。");
    case 1:
      return item(grade, "年代と世紀", "計算・意義", `${event[0]}は${event[1]}年に起きた。何世紀の出来事か答え、「${event[2]}」という説明から歴史上の意義を一文でまとめなさい。`, `${Math.floor((event[1] - 1) / 100) + 1}世紀。${event[2]}。`, "西暦の百の位だけで判断せず、1〜100年が1世紀であることに注意します。");
    case 2:
      return item(grade, "歴史の因果", "原因・結果", `資料には「${event[0]}」について「${event[2]}」とある。このうち出来事は何か、結果・意義は何かを区別して答えなさい。`, `出来事：${event[0]}。結果・意義：${event[2]}。`, "原因・出来事・結果を混同せず、資料の文の役割を見分けます。");
    case 3:
      return item(grade, "時代の間隔", "年代計算", `${older[0]}（${older[1]}年）から${newer[0]}（${newer[1]}年）までは何年か。後の出来事が前の出来事からどの程度離れているかを示し、両者の意義も答えなさい。`, `${newer[1] - older[1]}年。${older[0]}：${older[2]}。${newer[0]}：${newer[2]}。`, "年代差を求めたうえで、単なる前後関係と直接の因果関係を区別します。");
    case 4:
      return item(grade, "比較史", "共通点・相違点", `${event[0]}と${next[0]}を比較する。年代上の前後関係を答えたうえで、「${event[2]}」「${next[2]}」から両者の相違点を説明しなさい。`, `${older[0]}が先。${event[0]}は${event[2]}のに対し、${next[0]}は${next[2]}。`, "同じ観点で二つの出来事を比べます。");
    case 5:
      return item(grade, "史料の読み取り", "主張と根拠", `「${event[0]}は重要な転換点だった」という主張を、「${event[2]}」を根拠にして説明しなさい。さらに、この主張を確かめるために調べたい資料を一つ挙げなさい。`, `${event[2]}ため転換点といえる。資料例：当時の法令、公文書、統計、新聞、当事者の日記など。`, "主張には具体的な根拠を添え、資料の種類も意識します。");
    case 6:
      return item(grade, "時代区分", "時代判断", `${event[0]}（${event[1]}年）が属する時代を答え、その時代の政治や社会を理解するうえで「${event[2]}」が重要な理由を説明しなさい。`, `${event[1] < 710 ? "飛鳥時代以前" : event[1] < 794 ? "奈良時代" : event[1] < 1185 ? "平安時代" : event[1] < 1333 ? "鎌倉時代" : event[1] < 1573 ? "室町時代" : event[1] < 1603 ? "安土桃山時代" : event[1] < 1868 ? "江戸時代" : event[1] < 1912 ? "明治時代" : event[1] < 1926 ? "大正時代" : event[1] < 1989 ? "昭和時代" : "平成以降"}。${event[2]}ため。`, "時代名と出来事の意義をセットで整理します。");
    case 7:
      return item(grade, "歴史的評価", "多面的考察", `${event[0]}について、当時の政府・支配する側と、民衆・影響を受ける側では評価が異なる可能性がある。「${event[2]}」を踏まえ、異なる立場から調べる必要がある理由を答えなさい。`, "立場によって利益や負担、記録に残す内容が異なるため。一方の資料だけでは影響の全体像を捉えられない。", "出来事を複数の立場から検討します。");
    case 8:
      return item(grade, "流れの整理", "前後関係", `${older[0]}から${newer[0]}までの歴史の流れを説明する短い文章を、「その後」「一方」のいずれかを使って書きなさい。各出来事の意義も含めること。`, `例：${older[0]}によって${older[2]}。その後、${newer[0]}によって${newer[2]}。`, "接続語を使い、年代順に意味のつながる文章にします。");
    default:
      return item(grade, "歴史資料", "資料批判", `${event[0]}を調べるため、政府の公文書と当事者の日記を使う。二種類の資料を照合する必要がある理由を、「${event[2]}」という評価にも触れて答えなさい。`, `資料ごとに立場や目的が異なり、「${event[2]}」という評価の根拠や、記録されなかった影響を比較して確かめる必要があるため。`, "史料の内容だけでなく、作成者・目的・作成時期を確認します。");
  }
}

function civics(i) {
  const n = Math.floor(i / 10) + 1;
  switch (i % 10) {
    case 0:
      return item("中3", "基本的人権", "事例判断", `市が公共施設の利用を、合理的な理由なく特定の出身地域の人だけ断った。この事例で問題となる基本的人権を答え、なぜ制限が認められにくいか説明しなさい。`, "法の下の平等。本人の能力や行為と関係のない出身による不合理な差別だから。", "権利名と、事例のどの点が問題かを結びつけます。");
    case 1:
      return item("中3", "国会・内閣", "制度説明", `内閣は国会の信任にもとづいて成立し、衆議院で内閣不信任決議が可決される場合がある。このしくみを何といい、内閣が取れる二つの対応は何か。`, "議院内閣制。内閣は10日以内に衆議院を解散するか、総辞職する。", "国会と内閣が互いに責任を負う関係を確認します。");
    case 2:
      return item("中3", "三権分立", "関係図説明", `法律をつくる機関、法律にもとづいて行政を行う機関、法律に照らして争いを裁く機関をそれぞれ答え、権力を分ける目的を説明しなさい。`, "国会、内閣、裁判所。権力の集中による人権侵害を防ぎ、相互に抑制と均衡を働かせるため。", "機関名だけでなく制度の目的まで答えます。");
    case 3: {
      const votes = 10000 + n * 500, seats = 5;
      return item("中3", "選挙", "計算・制度", `比例代表で政党Aが${votes}票、Bが${Math.floor(votes * .7)}票、Cが${Math.floor(votes * .4)}票を得た。議席${seats}をドント式で配分するとき、各党の票を1、2、3…で割った商の大きい順に議席を与える。この方式の特徴を、小選挙区制と比べて説明しなさい。`, "得票率が議席に反映されやすく、少数意見も代表されやすい。一方、小選挙区制より政党が多くなりやすい。", "実際の商を並べる前に、制度が民意をどう反映するか理解します。");
    }
    case 4:
      return item("中3", "地方自治", "政策参加", `地域の通学路の安全対策を住民が求めたい。首長や議会への要望以外に、地方自治で認められる直接請求や住民参加の方法を一つ挙げ、必要な情報も説明しなさい。`, "例：条例の制定・改廃の直接請求。署名を集め、請求内容、費用、期待される効果などを示す。", "地方自治は『民主主義の学校』とも呼ばれます。");
    case 5:
      return item("中3", "市場経済", "因果説明", `ある商品の需要が増えたが供給量はすぐには増えなかった。このとき価格は一般にどう動くか。その後、価格上昇を見た企業が生産を増やすとどうなるか説明しなさい。`, "最初は価格が上がりやすい。供給が増えると品不足が緩和され、価格上昇が抑えられる方向に働く。", "需要・供給と価格の関係を段階的に考えます。");
    case 6: {
      const income = 300 + n * 10, tax = round(income * (0.08 + (n % 4) * .01), 1);
      return item("中3", "財政", "資料・説明", `年間所得${income}万円の世帯が所得税などとして${tax}万円を負担した。税負担率を求め、税金が社会保障や公共サービスに使われる理由を答えなさい。`, `約${round(tax / income * 100, 1)}％。個人だけでは十分に供給しにくい医療、教育、道路などを社会全体で支えるため。`, "負担だけでなく、税による所得再分配と公共サービスも考えます。");
    }
    case 7:
      return item("中3", "労働と社会保障", "課題解決", `非正規雇用の増加で企業は人員を調整しやすくなったが、働く人の収入や社会保障が不安定になる場合がある。企業・労働者・政府の立場から必要な対策を一つずつ提案しなさい。`, "例：企業は同一労働同一賃金や教育機会を整える。労働者は技能を高め相談制度を利用する。政府は雇用保険や職業訓練、法規制を整える。", "複数の立場から実行可能な対策を考えます。");
    case 8:
      return item("中3", "国際社会", "制度判断", `国際連合の安全保障理事会では、常任理事国の拒否権によって決議できない場合がある。拒否権が設けられた背景と、現在指摘される課題を答えなさい。`, "大国を国際連合の枠組みに参加させ、協調を保つために設けられた。一国の反対で国際社会の対応が止まり、紛争解決が遅れる課題がある。", "制度の長所と限界を両面から考えます。");
    default:
      return item("中3", "情報社会", "権利調整", `SNS上の表現を削除するよう求める場合、表現の自由と、他者の名誉・プライバシーをどう調整すべきか。判断に必要な観点を二つ答えなさい。`, "公共性・真実性、被害の大きさ、本人の同意、表現を残す公益と削除による制約の程度などを比較する。", "権利同士が衝突するときは、一方を常に優先せず具体的事情を検討します。");
  }
}

const specs = [
  { subject: "理科", category: "生物", target: 250, application: biology },
  { subject: "理科", category: "化学", target: 250, application: chemistry },
  { subject: "理科", category: "物理", target: 250, application: physics },
  { subject: "理科", category: "地学", target: 250, application: earth },
  { subject: "社会", category: "地理", target: 350, application: geography },
  { subject: "社会", category: "歴史", target: 400, application: history },
  { subject: "社会", category: "公民", target: 250, application: civics },
];

const pools = new Map();
for (const spec of specs) {
  const concepts = extractConcepts(spec.subject, spec.category);
  const foundational = foundationQuestions(concepts).slice(0, Math.min(spec.target, concepts.length * 8));
  const questions = foundational.map((q, index) => ({ ...q, difficulty: difficultyFor(index) }));
  const unitLimit = spec.category === "地学" ? 75 : spec.category === "地理" ? 85 : spec.category === "公民" ? 70 : 45;
  let applicationIndex = 0;
  while (questions.length < spec.target) {
    const generated = spec.application(applicationIndex);
    const candidate = {
      subject: spec.subject,
      category: spec.category,
      difficulty: difficultyFor(questions.length),
      ...generated,
      sourceTerm: null,
      sourceDefinition: null,
      sourceNote: null,
    };
    const unitCount = questions.filter((q) => q.unit === candidate.unit).length;
    if (unitCount < unitLimit && !questions.some((q) => normalize(q.question) === normalize(candidate.question))) questions.push(candidate);
    applicationIndex += 1;
    if (applicationIndex > 20_000) {
      const counts = Object.fromEntries([...new Set(questions.map((q) => q.unit))].map((unit) => [unit, questions.filter((q) => q.unit === unit).length]));
      throw new Error(`could not fill ${spec.subject}/${spec.category}: ${questions.length}/${spec.target} ${JSON.stringify(counts)}`);
    }
  }
  pools.set(`${spec.subject}:${spec.category}`, questions);
}

const layouts = {
  "理科": ["生物", "化学", "物理", "地学"].flatMap((category) => Array(5).fill(category)),
  "社会": [...Array(7).fill("地理"), ...Array(8).fill("歴史"), ...Array(5).fill("公民")],
};

const result = [];
for (const subject of ["理科", "社会"]) {
  const offsets = new Map();
  for (let batch = 1; batch <= 50; batch += 1) {
    const rotation = (batch - 1) % layouts[subject].length;
    const layout = [...layouts[subject].slice(rotation), ...layouts[subject].slice(0, rotation)];
    for (let pos = 1; pos <= 20; pos += 1) {
      const category = layout[pos - 1];
      const key = `${subject}:${category}`;
      const index = offsets.get(key) ?? 0;
      const q = pools.get(key)[index];
      offsets.set(key, index + 1);
      const serial = subject === "理科" ? result.filter((v) => v.subject === subject).length + 1 : result.filter((v) => v.subject === subject).length + 1;
      result.push({
        id: `${subject === "理科" ? "SC3" : "SO3"}-${String(serial).padStart(4, "0")}`,
        batch,
        pos,
        subject,
        grade: q.grade ?? grades[(batch - 1) % grades.length],
        category,
        unit: q.unit,
        difficulty: q.difficulty,
        kind: q.kind,
        question: q.question,
        answer: q.answer,
        explanation: q.explanation,
        tags: [subject, category, q.unit, q.kind].join(","),
        sourceTerm: q.term ?? q.sourceTerm ?? null,
        sourceDefinition: q.definition ?? q.sourceDefinition ?? null,
        sourceNote: q.note ?? q.sourceNote ?? null,
      });
    }
  }
}

if (result.length !== 2000) throw new Error(`expected 2000 questions, received ${result.length}`);
if (new Set(result.map(({ id }) => id)).size !== 2000) throw new Error("duplicate ids");
if (new Set(result.map(({ question }) => normalize(question))).size !== 2000) throw new Error("duplicate prompts");
for (const subject of ["理科", "社会"]) {
  const questions = result.filter((q) => q.subject === subject);
  if (questions.length !== 1000) throw new Error(`${subject}: expected 1000 questions`);
  for (let batch = 1; batch <= 50; batch += 1) {
    if (questions.filter((q) => q.batch === batch).length !== 20) throw new Error(`${subject}: incomplete set ${batch}`);
  }
}

await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log("Generated 1000 balanced Science questions and 1000 balanced Social Studies questions.");
