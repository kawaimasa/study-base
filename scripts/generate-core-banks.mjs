import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root, "public/data");

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const fraction = (n, d) => {
  const g = gcd(n, d);
  return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`;
};
const square = (n) => `${n}²`;

function makeQuestion(subject, number, item) {
  return {
    id: `${subject === "数学" ? "MA3" : "JP3"}-${String(number).padStart(4, "0")}`,
    batch: Math.ceil(number / 20),
    pos: ((number - 1) % 20) + 1,
    subject,
    grade: "中1〜3",
    ...item,
    tags: ["中1〜3", item.category, item.unit, item.difficulty].join(","),
  };
}

function mathItem(batch, slot) {
  const n = batch + 2;
  const family = (batch - 1) % 5;
  const cycle = Math.floor((batch - 1) / 5);
  const difficulty = batch <= 15 ? "基本" : batch <= 35 ? "標準" : "入試基礎";

  if (slot === 0) {
    const variants = [
      { question: `(-${n})+${n + 5}-(-${family + 2})を計算しなさい。`, answer: String(7 + family), explanation: "負の数を引くことは、その絶対値を加えることと同じです。" },
      { question: `${n}-${n + 7}+(-${family + 3})を計算しなさい。`, answer: String(-10 - family), explanation: "加法に直して符号に注意して計算します。" },
      { question: `(-${n})×${family + 2}÷(-2)を計算しなさい。`, answer: String((n * (family + 2)) / 2), explanation: "負÷負は正になります。" },
      { question: `${n + 4}-(-${n - 1})×2を計算しなさい。`, answer: String(6 - n), explanation: "乗法を先に計算してから減法を行います。" },
      { question: `|-${n + 3}|+(-${family + 1})を計算しなさい。`, answer: String(n + 2 - family), explanation: "絶対値は原点からの距離なので正の値です。" },
    ];
    return { category: "数と式", unit: "正負の数", difficulty, ...variants[family] };
  }
  if (slot === 1) {
    const a = family + 2 + cycle;
    const variants = [
      { question: `${a}³÷${a}²を計算しなさい。`, answer: String(a), explanation: "同じ数の累乗の除法では指数を引きます。" },
      { question: `√${a * a * (family + 2)}を、根号の中をできるだけ小さくして表しなさい。`, answer: `${a}√${family + 2}`, explanation: `√${a * a}=${a}を根号の外に出します。` },
      { question: `(√${a + 1})²+√${a * a}を計算しなさい。`, answer: String(2 * a + 1), explanation: "平方根の性質を使ってそれぞれ簡単にします。" },
      { question: `${a}√${family + 3}+${a + 1}√${family + 3}を簡単にしなさい。`, answer: `${2 * a + 1}√${family + 3}`, explanation: "同じ根号を含む項は係数をまとめられます。" },
      { question: `√${(a + 1) ** 2}−√${a ** 2}を計算しなさい。`, answer: "1", explanation: "正の数aについて√a²=aです。" },
    ];
    return { category: "数と式", unit: family === 0 ? "累乗" : "平方根", difficulty, ...variants[family] };
  }
  if (slot === 2) {
    const a = family + 2 + cycle;
    const variants = [
      { question: `${a}(2x−3)−(x+${a})を簡単にしなさい。`, answer: `${2 * a - 1}x−${4 * a}`, explanation: "分配法則で括弧を外し、同類項をまとめます。" },
      { question: `(x+${a})(x−${a})を展開しなさい。`, answer: `x²−${a * a}`, explanation: "和と差の積の公式を使います。" },
      { question: `x²+${2 * a}x+${a * a}を因数分解しなさい。`, answer: `(x+${a})²`, explanation: "完全平方の公式を使います。" },
      { question: `${a}x²−${a * a}xを因数分解しなさい。`, answer: `${a}x(x−${a})`, explanation: `共通因数${a}xでくくります。` },
      { question: `(2x+${a})(x−${a})を展開しなさい。`, answer: `2x²−${a}x−${a * a}`, explanation: "各項を一つずつ掛け合わせ、同類項をまとめます。" },
    ];
    return { category: "数と式", unit: family < 2 ? "式の計算" : "展開・因数分解", difficulty, ...variants[family] };
  }
  if (slot === 3) {
    const a = family + 2 + cycle;
    const x = cycle + 2;
    const b = a * x - (family + 1);
    const variants = [
      { question: `${a}x−${family + 1}=${b}を解きなさい。`, answer: `x=${x}`, explanation: "定数項を移項し、xの係数で割ります。" },
      { question: `${a}(x−2)=${a * (x - 2)}を解きなさい。`, answer: `x=${x}`, explanation: "両辺を係数で割ってから定数を移項します。" },
      { question: `x/${a}+${family + 1}=${x + family + 1}を解きなさい。`, answer: `x=${a * x}`, explanation: "両辺に分母を掛けて分数をなくします。" },
      { question: `${(a / 10).toFixed(1)}x=${(a * x / 10).toFixed(1)}を解きなさい。`, answer: `x=${x}`, explanation: "両辺を小数の係数で割ります。" },
      { question: `${a}x+${a + 1}=${a - 1}x+${x + a + 1}を解きなさい。`, answer: `x=${x}`, explanation: "xを含む項を左辺、定数項を右辺に集めます。" },
    ];
    return { category: "方程式", unit: "一次方程式", difficulty, ...variants[family] };
  }
  if (slot === 4) {
    const x = cycle + 2;
    const y = family + 1;
    const variants = [
      { question: `連立方程式 x+y=${x + y}, x−y=${x - y} を解きなさい。`, answer: `x=${x}, y=${y}`, explanation: "二つの式を加えるとyが消去できます。" },
      { question: `連立方程式 2x+y=${2 * x + y}, x−y=${x - y} を解きなさい。`, answer: `x=${x}, y=${y}`, explanation: "加減法で一方の文字を消去します。" },
      { question: `連立方程式 x+2y=${x + 2 * y}, 3x−y=${3 * x - y} を解きなさい。`, answer: `x=${x}, y=${y}`, explanation: "係数をそろえて加減法を使います。" },
      { question: `連立方程式 y=${x + y}−x, 2x+y=${2 * x + y} を解きなさい。`, answer: `x=${x}, y=${y}`, explanation: "代入法で一文字の方程式にします。" },
      { question: `連立方程式 0.5x+y=${0.5 * x + y}, x+y=${x + y} を解きなさい。`, answer: `x=${x}, y=${y}`, explanation: "小数を含む式は整数倍してから解いても構いません。" },
    ];
    return { category: "方程式", unit: "連立方程式", difficulty, ...variants[family] };
  }
  if (slot === 5) {
    const a = family + 2 + cycle;
    const b = family + 3;
    const variants = [
      { question: `x²−${a + b}x+${a * b}=0を解きなさい。`, answer: `x=${a}, ${b}`, explanation: `(x−${a})(x−${b})=0と因数分解します。` },
      { question: `x²−${a * a}=0を解きなさい。`, answer: `x=±${a}`, explanation: "平方の差として因数分解します。" },
      { question: `(x−${a})²=${b * b}を解きなさい。`, answer: `x=${a + b}, ${a - b}`, explanation: `x−${a}=±${b}として解きます。` },
      { question: `x²+${2 * a}x+${a * a}=0を解きなさい。`, answer: `x=−${a}`, explanation: `(x+${a})²=0です。` },
      { question: `2x²−${2 * a * a}=0を解きなさい。`, answer: `x=±${a}`, explanation: "両辺を2で割ってから平方根を考えます。" },
    ];
    return { category: "方程式", unit: "二次方程式", difficulty, ...variants[family] };
  }
  if (slot === 6) {
    const a = family + 2 + cycle;
    const x = cycle + 1;
    const variants = [
      { question: `yはxに比例し、x=${x}のときy=${a * x}です。比例定数を求めなさい。`, answer: String(a), explanation: "比例式y=axに値を代入します。" },
      { question: `yはxに反比例し、x=${x}のときy=${a}です。x=${a * x}のときのyを求めなさい。`, answer: "1", explanation: "反比例ではxyが一定です。" },
      { question: `比例式y=${a}xで、y=${a * x}となるxを求めなさい。`, answer: String(x), explanation: "yの値を比例式に代入します。" },
      { question: `点(${x}, ${a * x})を通る比例のグラフの式を求めなさい。`, answer: `y=${a}x`, explanation: "原点と点を通る直線の傾きが比例定数です。" },
      { question: `反比例y=${a * x}/xで、x=${x}のときのyを求めなさい。`, answer: String(a), explanation: "xの値を反比例の式に代入します。" },
    ];
    return { category: "関数", unit: family % 2 === 0 ? "比例" : "反比例", difficulty, ...variants[family] };
  }
  if (slot === 7) {
    const a = family + 1 + cycle;
    const x = cycle + 1;
    const c = batch % 7 - 3;
    const ax = a === 1 ? "x" : `${a}x`;
    const nextAx = `${a + 1}x`;
    const variants = [
      { question: `一次関数y=${ax}${c >= 0 ? "+" : ""}${c}で、x=${x}のときのyを求めなさい。`, answer: String(a * x + c), explanation: "式にxの値を代入します。" },
      { question: `傾き${a}、切片${c}の一次関数の式を求めなさい。`, answer: `y=${ax}${c >= 0 ? "+" : ""}${c}`, explanation: "y=ax+bのaが傾き、bが切片です。" },
      { question: `二点(0, ${c})、(${x}, ${a * x + c})を通る直線の傾きを求めなさい。`, answer: String(a), explanation: "yの増加量÷xの増加量で傾きを求めます。" },
      { question: `一次関数y=${ax}${c >= 0 ? "+" : ""}${c}について、xが2増えるとyはいくつ増えますか。`, answer: String(2 * a), explanation: "変化の割合にxの増加量を掛けます。" },
      { question: `直線y=${ax}${c >= 0 ? "+" : ""}${c}とy=${nextAx}${c - x >= 0 ? "+" : ""}${c - x}の交点のx座標を求めなさい。`, answer: String(x), explanation: "二つの式のyを等しいとおいて解きます。" },
    ];
    return { category: "関数", unit: "一次関数", difficulty, ...variants[family] };
  }
  if (slot === 8) {
    const a = family + 1 + cycle;
    const x = cycle + 2;
    const ax2 = a === 1 ? "x²" : `${a}x²`;
    const variants = [
      { question: `関数y=${ax2}で、x=${x}のときのyを求めなさい。`, answer: String(a * x * x), explanation: "xを二乗して比例定数を掛けます。" },
      { question: `yはxの二乗に比例し、x=${x}のときy=${a * x * x}です。比例定数を求めなさい。`, answer: String(a), explanation: "y=ax²に値を代入します。" },
      { question: `関数y=${ax2}で、xが−${x}から${x}まで変化するときのyの最大値を求めなさい。`, answer: String(a * x * x), explanation: "|x|が最大のときyが最大になります。" },
      { question: `関数y=${ax2}で、x=${x}から${x + 1}までの変化の割合を求めなさい。`, answer: String(a * (2 * x + 1)), explanation: "yの増加量をxの増加量で割ります。" },
      { question: `放物線y=${ax2}上でy=${a * x * x}となる点のx座標をすべて求めなさい。`, answer: `x=±${x}`, explanation: "x²の値が同じになる正負二つのxがあります。" },
    ];
    return { category: "関数", unit: "二次関数", difficulty, ...variants[family] };
  }
  if (slot === 9) {
    const a = 35 + batch;
    const variants = [
      { question: `一直線上に隣り合う二つの角の一方が${a}°です。もう一方の角を求めなさい。`, answer: `${180 - a}°`, explanation: "一直線上の角の和は180°です。" },
      { question: `三角形の二つの内角が${a}°と${a + 5}°です。残りの内角を求めなさい。`, answer: `${175 - 2 * a}°`, explanation: "三角形の内角の和は180°です。" },
      { question: `平行な二直線に1本の直線が交わっています。錯角の一方が${a}°のとき、もう一方を求めなさい。`, answer: `${a}°`, explanation: "平行線の錯角は等しいです。" },
      { question: `正${family + 5 + cycle}角形の外角一つの大きさを求めなさい。`, answer: `${fraction(360, family + 5 + cycle)}°`, explanation: "外角の和360°を頂点の数で割ります。" },
      { question: `円周角が${a}°のとき、同じ弧に対する中心角を求めなさい。`, answer: `${2 * a}°`, explanation: "中心角は同じ弧に対する円周角の2倍です。" },
    ];
    return { category: "図形", unit: "角度", difficulty, ...variants[family] };
  }
  if (slot === 10) {
    const a = family + 4 + cycle;
    const h = batch % 6 + 3;
    const variants = [
      { question: `底辺${a}cm、高さ${h}cmの三角形の面積を求めなさい。`, answer: `${a * h / 2}cm²`, explanation: "底辺×高さ÷2で求めます。" },
      { question: `上底${a}cm、下底${a + 3}cm、高さ${h}cmの台形の面積を求めなさい。`, answer: `${(2 * a + 3) * h / 2}cm²`, explanation: "(上底+下底)×高さ÷2で求めます。" },
      { question: `半径${a}cm、中心角90°のおうぎ形の面積をπを使って表しなさい。`, answer: `${a * a}π/4 cm²`, explanation: "円の面積の4分の1です。" },
      { question: `対角線の長さが${a}cmと${h}cmのひし形の面積を求めなさい。`, answer: `${a * h / 2}cm²`, explanation: "対角線の積÷2で求めます。" },
      { question: `半径${a}cmの円の周の長さをπを使って表しなさい。`, answer: `${2 * a}πcm`, explanation: "直径×πで求めます。" },
    ];
    return { category: "図形", unit: "平面図形", difficulty, ...variants[family] };
  }
  if (slot === 11) {
    const a = family + 2 + cycle;
    const h = batch % 6 + 3;
    const variants = [
      { question: `底面積${a * a}cm²、高さ${h}cmの柱体の体積を求めなさい。`, answer: `${a * a * h}cm³`, explanation: "底面積×高さで求めます。" },
      { question: `底面積${a * a}cm²、高さ${h}cmの錐体の体積を求めなさい。`, answer: `${fraction(a * a * h, 3)}cm³`, explanation: "底面積×高さ÷3で求めます。" },
      { question: `半径${a}cm、高さ${h}cmの円柱の体積をπを使って表しなさい。`, answer: `${a * a * h}πcm³`, explanation: "底面の円の面積に高さを掛けます。" },
      { question: `一辺${a}cmの立方体の表面積を求めなさい。`, answer: `${6 * a * a}cm²`, explanation: "同じ正方形6面の面積を合計します。" },
      { question: `縦${a}cm、横${a + 1}cm、高さ${h}cmの直方体の体積を求めなさい。`, answer: `${a * (a + 1) * h}cm³`, explanation: "縦×横×高さで求めます。" },
    ];
    return { category: "図形", unit: "空間図形", difficulty, ...variants[family] };
  }
  if (slot === 12) {
    const a = family + 2 + cycle;
    const variants = [
      { question: `△A${cycle + 1}B${cycle + 1}C${cycle + 1}と△D${cycle + 1}E${cycle + 1}F${cycle + 1}で、二辺とその間の角がそれぞれ等しいときに使う合同条件を答えなさい。`, answer: "二組の辺とその間の角がそれぞれ等しい", explanation: "合同条件を言葉まで正確に覚えます。" },
      { question: `相似比が${a}:${a + 1}の二つの三角形があります。面積比を求めなさい。`, answer: `${a * a}:${(a + 1) ** 2}`, explanation: "面積比は相似比の二乗です。" },
      { question: `相似比が${a}:${a + 1}の二つの立体があります。体積比を求めなさい。`, answer: `${a ** 3}:${(a + 1) ** 3}`, explanation: "体積比は相似比の三乗です。" },
      { question: `平行四辺形A${cycle + 1}B${cycle + 1}C${cycle + 1}D${cycle + 1}で、対角線が互いの中点で交わることを利用して示せる三角形の関係を答えなさい。`, answer: "向かい合う二組の三角形がそれぞれ合同", explanation: "対辺と対角線の半分を対応させて合同を示します。" },
      { question: `相似な三角形で対応する辺が${a}cmと${a + 1}cmです。小さい三角形の周が${a * 6}cmなら、大きい三角形の周を求めなさい。`, answer: `${(a + 1) * 6}cm`, explanation: "周の長さの比は相似比と等しいです。" },
    ];
    return { category: "図形", unit: "合同・相似", difficulty, ...variants[family] };
  }
  if (slot === 13) {
    const triples = [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [7, 24, 25]];
    const scale = cycle + 1;
    const [baseA, baseB, baseC] = triples[family];
    const [a, b, c] = [baseA * scale, baseB * scale, baseC * scale];
    const variants = [
      { question: `直角をはさむ二辺が${a}cmと${b}cmの直角三角形の斜辺を求めなさい。`, answer: `${c}cm`, explanation: "三平方の定理で斜辺の二乗を求め、平方根を取ります。" },
      { question: `斜辺${c}cm、一辺${a}cmの直角三角形の残りの一辺を求めなさい。`, answer: `${b}cm`, explanation: "斜辺²−一辺²を計算します。" },
      { question: `縦${a}cm、横${b}cmの長方形の対角線を求めなさい。`, answer: `${c}cm`, explanation: "対角線を斜辺とする直角三角形を考えます。" },
      { question: `一辺${a}cmの正方形の対角線を根号を使って表しなさい。`, answer: `${a}√2cm`, explanation: "三平方の定理より対角線²=2a²です。" },
      { question: `座標平面上の二点(0,0)と(${a},${b})の距離を求めなさい。`, answer: `${c}cm`, explanation: "x方向とy方向の差を二辺とする直角三角形を考えます。" },
    ];
    return { category: "図形", unit: "三平方の定理", difficulty, ...variants[family] };
  }
  if (slot === 14) {
    const a = batch + 2;
    const values = [a - 2, a, a, a + 1, a + 1, a + 3];
    const variants = [
      { question: `${values.join("、")}の平均値を求めなさい。`, answer: String(values.reduce((s, v) => s + v, 0) / values.length), explanation: "値の合計を個数で割ります。" },
      { question: `${values.join("、")}の中央値を求めなさい。`, answer: String((values[2] + values[3]) / 2), explanation: "中央の二つの値の平均を取ります。" },
      { question: `${values.join("、")}の最頻値をすべて答えなさい。`, answer: `${a}、${a + 1}`, explanation: "最も多く現れる値を調べます。" },
      { question: `${values.join("、")}の範囲を求めなさい。`, answer: "5", explanation: "最大値から最小値を引きます。" },
      { question: `あるデータの第一四分位数が${a}、第三四分位数が${a + 5}です。四分位範囲を求めなさい。`, answer: "5", explanation: "第三四分位数−第一四分位数です。" },
    ];
    return { category: "資料", unit: "データの活用", difficulty, ...variants[family] };
  }
  if (slot === 15) {
    const r = family + 2 + cycle;
    const b = family + 3 + cycle;
    const threshold = 2 + (cycle % 5);
    const dieColor = cycle < 5 ? "赤い" : "青い";
    const variants = [
      { question: `赤玉${r}個、青玉${b}個から1個を無作為に取ります。赤玉の確率を求めなさい。`, answer: fraction(r, r + b), explanation: "赤玉の場合の数を全体の場合の数で割ります。" },
      { question: `1から${r + b}までのカードから1枚取ります。偶数である確率を求めなさい。`, answer: fraction(Math.floor((r + b) / 2), r + b), explanation: "偶数のカードの枚数を全体の枚数で割ります。" },
      { question: `${cycle + 2}枚の硬貨を同時に投げるとき、表が1枚だけ出る確率を求めなさい。`, answer: fraction(cycle + 2, 2 ** (cycle + 2)), explanation: "表になる硬貨の選び方を、表裏の全パターン数で割ります。" },
      { question: `${dieColor}さいころを1個投げるとき、${threshold}以上の目が出る確率を求めなさい。`, answer: fraction(7 - threshold, 6), explanation: `${threshold}から6までの場合を数えます。` },
      { question: `大小2個のさいころを投げるとき、目の和が${cycle + 3}になる確率を求めなさい。`, answer: fraction(6 - Math.abs(7 - (cycle + 3)), 36), explanation: "全36通りから、指定された和になる組を数えます。" },
    ];
    return { category: "確率", unit: "確率", difficulty, ...variants[family] };
  }
  if (slot === 16) {
    const speed = 40 + family * 5 + cycle * 2;
    const minutes = 30 + cycle * 5;
    const variants = [
      { question: `時速${speed}kmで${minutes}分進むと、道のりは何kmですか。`, answer: `${fraction(speed * minutes, 60)}km`, explanation: "分を時間に直して、速さ×時間を計算します。答えが割り切れない場合は分数で表します。" },
      { question: `${1200 + batch * 20}円の商品を${10 + family * 5}%引きで買います。支払額を求めなさい。`, answer: `${(1200 + batch * 20) * (90 - family * 5) / 100}円`, explanation: "定価に割引後の割合を掛けます。" },
      { question: `${200 + batch * 10}gの${10 + family}%食塩水に含まれる食塩は何gですか。`, answer: `${(200 + batch * 10) * (10 + family) / 100}g`, explanation: "食塩水の重さ×濃度で求めます。" },
      { question: `毎分${60 + family * 10}mで${minutes}分歩きました。歩いた道のりをkmで答えなさい。`, answer: `${(60 + family * 10) * minutes / 1000}km`, explanation: "mで求めてから1000で割りkmに直します。" },
      { question: `原価${1000 + batch * 20}円の商品に${20 + family * 5}%の利益を加えた定価を求めなさい。`, answer: `${(1000 + batch * 20) * (120 + family * 5) / 100}円`, explanation: "原価に利益を含む割合を掛けます。" },
    ];
    return { category: "活用", unit: "割合・速さ", difficulty, ...variants[family] };
  }
  if (slot === 17) {
    const x = cycle + 3;
    const variants = [
      { question: `ある数の${family + 2}倍に${family + 1}を加えると${(family + 2) * x + family + 1}になります。ある数を求めなさい。`, answer: String(x), explanation: "ある数をxとして一次方程式を作ります。" },
      { question: `兄は弟より${family + 2}歳年上で、二人の年齢の和は${2 * x + family + 2}歳です。弟の年齢を求めなさい。`, answer: `${x}歳`, explanation: "弟をx歳、兄をx+差とおきます。" },
      { question: `1本${100 + family * 20}円のペンと1冊${200 + family * 30}円のノートを合わせて${x}個買い、合計が${(100 + family * 20) * 2 + (200 + family * 30) * (x - 2)}円でした。ペンは何本ですか。`, answer: "2本", explanation: "ペンの本数をx本として個数と代金の式を作ります。" },
      { question: `長方形の縦は横より${family + 2}cm短く、周の長さは${4 * x - 2 * (family + 2)}cmです。横の長さを求めなさい。`, answer: `${x}cm`, explanation: "横をx、縦をx−差として周の式を作ります。" },
      { question: `連続する二つの整数の和が${2 * x + 1}です。小さい方の整数を求めなさい。`, answer: String(x), explanation: "小さい整数をx、大きい整数をx+1とします。" },
    ];
    return { category: "活用", unit: "文章題", difficulty, ...variants[family] };
  }
  if (slot === 18) {
    const variants = [
      { question: `△A${cycle + 1}B${cycle + 1}C${cycle + 1}と△D${cycle + 1}E${cycle + 1}F${cycle + 1}で、A${cycle + 1}B${cycle + 1}=D${cycle + 1}E${cycle + 1}、B${cycle + 1}C${cycle + 1}=E${cycle + 1}F${cycle + 1}、∠B${cycle + 1}=∠E${cycle + 1}です。合同を示すために使う条件を答えなさい。`, answer: "二組の辺とその間の角がそれぞれ等しい", explanation: "等しい角が、等しい二辺にはさまれています。" },
      { question: `偶数p${cycle + 1}、q${cycle + 1}について、その和が偶数になる理由を、p${cycle + 1}=2a、q${cycle + 1}=2bを使って説明しなさい。`, answer: `p${cycle + 1}+q${cycle + 1}=2a+2b=2(a+b)となり、整数の2倍だから`, explanation: "偶数の定義に戻して式で説明します。" },
      { question: `平行四辺形A${cycle + 1}B${cycle + 1}C${cycle + 1}D${cycle + 1}の対角線の交点をO${cycle + 1}とします。向かい合う三角形が合同になる根拠を二つ答えなさい。`, answer: "対角線が互いを二等分すること、対頂角が等しいこと", explanation: "対角線が互いを二等分する性質と対頂角を使います。" },
      { question: `連続する三つの整数の和が3の倍数になる理由を、中央の整数をk${cycle + 1}として説明しなさい。`, answer: `(k${cycle + 1}−1)+k${cycle + 1}+(k${cycle + 1}+1)=3k${cycle + 1}となるから`, explanation: "三つの整数を中央の整数の前後として表します。" },
      { question: `直角三角形A${cycle + 1}B${cycle + 1}C${cycle + 1}の斜辺の中点が三頂点から等しい距離にあることを示すとき、利用する円の性質を答えなさい。`, answer: "直径に対する円周角は90°であること", explanation: "斜辺を直径とする円を考えます。" },
    ];
    return { category: "証明", unit: "根拠・説明", difficulty: "入試基礎", ...variants[family] };
  }
  const k = batch + 1;
  const variants = [
    { question: `1, 4, 9, 16, …と並ぶ数列の第${k}項を求めなさい。`, answer: String(k * k), explanation: "第n項はn²です。" },
    { question: `2, 5, 8, 11, …と並ぶ数列の第${k}項を求めなさい。`, answer: String(3 * k - 1), explanation: "初項2、公差3の等差数列として考えます。" },
    { question: `マッチ棒で正方形を横一列につなげます。正方形を${k}個作るのに必要な本数を求めなさい。`, answer: String(3 * k + 1), explanation: "最初に4本、その後は1個につき3本増えます。" },
    { question: `点を1段目に1個、2段目に2個、…、${k}段目に${k}個並べます。点の総数を求めなさい。`, answer: String(k * (k + 1) / 2), explanation: "1からnまでの和n(n+1)/2を使います。" },
    { question: `奇数を1から順に${k}個加えた和を求めなさい。`, answer: String(k * k), explanation: "最初のn個の奇数の和はn²です。" },
  ];
  return { category: "思考", unit: "規則性", difficulty: "入試基礎", ...variants[family] };
}

const mathQuestions = [];
for (let batch = 1; batch <= 50; batch += 1) {
  for (let slot = 0; slot < 20; slot += 1) mathQuestions.push(makeQuestion("数学", mathQuestions.length + 1, mathItem(batch, slot)));
}

const kanjiWords = [
  ["概念","がいねん"],["展望","てんぼう"],["推測","すいそく"],["論拠","ろんきょ"],["貢献","こうけん"],["把握","はあく"],["簡潔","かんけつ"],["促進","そくしん"],["模範","もはん"],["克服","こくふく"],
  ["抽象","ちゅうしょう"],["具体","ぐたい"],["顕著","けんちょ"],["柔軟","じゅうなん"],["普遍","ふへん"],["独創","どくそう"],["継承","けいしょう"],["尊重","そんちょう"],["矛盾","むじゅん"],["妥当","だとう"],
  ["分析","ぶんせき"],["統合","とうごう"],["認識","にんしき"],["価値","かち"],["主張","しゅちょう"],["根拠","こんきょ"],["解釈","かいしゃく"],["対照","たいしょう"],["象徴","しょうちょう"],["描写","びょうしゃ"],
  ["情景","じょうけい"],["心情","しんじょう"],["余韻","よいん"],["葛藤","かっとう"],["緊張","きんちょう"],["安堵","あんど"],["憧憬","しょうけい"],["決意","けつい"],["後悔","こうかい"],["共感","きょうかん"],
  ["環境","かんきょう"],["資源","しげん"],["循環","じゅんかん"],["生態","せいたい"],["持続","じぞく"],["地域","ちいき"],["社会","しゃかい"],["制度","せいど"],["権利","けんり"],["責任","せきにん"],
  ["技術","ぎじゅつ"],["情報","じょうほう"],["媒体","ばいたい"],["通信","つうしん"],["革新","かくしん"],["効率","こうりつ"],["課題","かだい"],["解決","かいけつ"],["協働","きょうどう"],["多様","たよう"],
  ["歴史","れきし"],["伝統","でんとう"],["文化","ぶんか"],["遺産","いさん"],["発展","はってん"],["変遷","へんせん"],["背景","はいけい"],["影響","えいきょう"],["交流","こうりゅう"],["共存","きょうぞん"],
  ["観察","かんさつ"],["実験","じっけん"],["仮説","かせつ"],["検証","けんしょう"],["現象","げんしょう"],["法則","ほうそく"],["構造","こうぞう"],["機能","きのう"],["性質","せいしつ"],["要因","よういん"],
  ["判断","はんだん"],["選択","せんたく"],["配慮","はいりょ"],["援助","えんじょ"],["信頼","しんらい"],["誠実","せいじつ"],["寛容","かんよう"],["謙虚","けんきょ"],["慎重","しんちょう"],["積極","せっきょく"],
  ["創造","そうぞう"],["表現","ひょうげん"],["鑑賞","かんしょう"],["批評","ひひょう"],["構想","こうそう"],["工夫","くふう"],["洗練","せんれん"],["調和","ちょうわ"],["印象","いんしょう"],["特徴","とくちょう"],
];

const expressions = [
  ["胸をなで下ろす","安心する"],["息をのむ","驚きや緊張で息を止める"],["頭を抱える","困り果てる"],["耳を傾ける","注意して聞く"],["口をつぐむ","黙る"],["手を焼く","扱いに困る"],["目を見張る","驚いて注目する"],["肩を落とす","落胆する"],["胸が高鳴る","期待や興奮でどきどきする"],["足を運ぶ","わざわざ出向く"],
  ["水に流す","過去の争いをなかったことにする"],["念を押す","重ねて確認する"],["一歩譲る","自分の主張を少し引く"],["的を射る","要点を正確に捉える"],["歯が立たない","相手が強くて対抗できない"],["拍車をかける","進行を一段と速める"],["幕を閉じる","物事を終える"],["道草を食う","目的地へ行く途中で時間を費やす"],["油を売る","仕事を怠けて無駄話をする"],["顔が広い","知り合いが多い"],
  ["試行錯誤","失敗を重ねながら解決方法を探すこと"],["温故知新","昔を学んで新しい知識を得ること"],["臨機応変","状況に応じて適切に対応すること"],["一石二鳥","一つの行動で二つの利益を得ること"],["切磋琢磨","仲間と励まし合って向上すること"],["異口同音","多くの人が同じことを言うこと"],["公明正大","公平で隠し事がないこと"],["自画自賛","自分で自分を褒めること"],["大器晩成","大人物は遅れて才能を現すこと"],["以心伝心","言葉を使わず心が通じること"],
  ["一期一会","一度の出会いを大切にすること"],["一進一退","進んだり退いたりすること"],["優柔不断","決断力に乏しいこと"],["創意工夫","新しい方法を考え出すこと"],["半信半疑","半分信じ半分疑うこと"],["朝令暮改","命令や方針がすぐ変わること"],["付和雷同","自分の考えなく他人に同調すること"],["不言実行","あれこれ言わず実行すること"],["有言実行","言ったことを責任をもって実行すること"],["本末転倒","大切なこととそうでないことを取り違えること"],
  ["石の上にも三年","辛抱強く続ければ成果が出る"],["急がば回れ","急ぐときほど安全な方法を選ぶべきだ"],["失敗は成功のもと","失敗を生かせば成功につながる"],["塵も積もれば山となる","小さなものも積み重なると大きくなる"],["百聞は一見にしかず","何度聞くより一度見る方が理解できる"],["継続は力なり","続けることが力になる"],["備えあれば憂いなし","準備しておけば心配がない"],["郷に入っては郷に従え","その土地の習慣に従うべきだ"],["灯台下暗し","身近なことほど気づきにくい"],["覆水盆に返らず","一度したことは元に戻せない"],
];

const classicalWords = [["をかし","趣がある・おもしろい"],["あはれなり","しみじみと心を打たれる"],["いと","とても"],["つれづれなり","することがなく退屈だ"],["やうやう","だんだん"],["ありがたし","めったにない"],["うつくし","かわいらしい"],["おどろく","目を覚ます"],["かなし","いとしい"],["こころにくし","奥ゆかしい"],["さうざうし","物足りない"],["すさまじ","興ざめだ"],["なつかし","親しみがもてる"],["ののしる","大声で騒ぐ"],["はづかし","立派だ"],["めでたし","すばらしい"],["ゆかし","見たい・知りたい"],["わびし","つらい"],["あやし","不思議だ・粗末だ"],["おぼゆ","思われる"],["ぐす","連れて行く"],["のたまふ","おっしゃる"],["まゐる","参上する"],["みゆ","見える"],["よし","理由・方法"]];
const historicalKana = [["けふ","きょう"],["きのふ","きのう"],["おほきな","おおきな"],["かは","かわ"],["こゑ","こえ"],["ゐる","いる"],["うつくしう","うつくしゅう"],["やうやう","ようよう"],["てふ","ちょう"],["いふ","いう"],["まうす","もうす"],["かう","こう"],["さう","そう"],["あふ","あう"],["おもふ","おもう"],["たまふ","たもう"],["候ふ","そうろう"],["まゐる","まいる"],["をとこ","おとこ"],["をんな","おんな"],["ゑ","え"],["にほひ","におい"],["かへる","かえる"],["とほし","とおし"],["ほほゑむ","ほほえむ"]];

const rhetoric = [["雪のように白い","直喩"],["彼はクラスの太陽だ","隠喩"],["山が私を呼んでいる","擬人法"],["静かに、静かに、夜が来る","反復法"],["見えるだろうか、この小さな光が","倒置法"],["雨、風、そして雷","体言止め"],["絶対に忘れない、あの日のことを","倒置法"],["ざあざあと雨が降る","擬音語"],["心がふわりと軽くなる","擬態語"],["春はあけぼの、夏は夜","対句"],["走った、走った、ただ前へ","反復法"],["希望という名の翼","隠喩"],["木々が手を振っている","擬人法"],["宝石のような星","直喩"],["何という美しさだろう","反語・詠嘆"],["白い雲、青い空","対句"],["沈黙。それが答えだった","体言止め"],["彼の声は鐘だ","隠喩"],["時間が逃げていく","擬人法"],["まるで夢のようだ","直喩"],["一歩、また一歩","反復法"],["冷たい炎","撞着語法"],["海は笑い、空は歌う","擬人法"],["小さな一歩が大きな未来をつくる","対比"],["問いかけても、答えは風の中","体言止め"]];

const kanbunItems = [
  ["未だ学ばず","まだ学んでいない","「未」は「いまだ〜ず」と読みます。"],["将に行かんとす","今にも行こうとする","「将」は「まさに〜んとす」と読みます。"],["人をして学ばしむ","人に学ばせる","「使A B」は「AをしてBしむ」と読みます。"],["学ぶべし","学ぶべきだ","「可」は「べし」と読み、可能・当然などを表します。"],["学ぶこと能はず","学ぶことができない","「不能」は「〜ことあたはず」と読みます。"],
  ["何ぞ学ばざる","どうして学ばないのか","「何不」は反語の形です。"],["学ぶに如かず","学ぶことには及ばない","「不如」は「〜にしかず」と読みます。"],["人皆学ぶ","人はみな学ぶ","漢文の基本語順を訓読します。"],["友遠方より来たる","友人が遠くからやって来る","「自」は「〜より」と読みます。"],["故きを温ねて新しきを知る","昔のことを研究して新しい知識を得る","温故知新の書き下し文です。"],
  ["過ちて改めざる","過ちを犯しても改めない","「而」は文脈に応じて順接・逆接を表します。"],["学びて時に之を習ふ","学んで機会あるごとに復習する","「之」は前の内容を受けます。"],["知る者は好む者に如かず","知っている者は好む者には及ばない","比較の句形「A不如B」です。"],["己の欲せざる所","自分が望まないこと","「所」は名詞化する働きがあります。"],["人に施すこと勿かれ","人にしてはいけない","禁止の「勿〜」です。"],
  ["少年老い易く学成り難し","若者はすぐ年を取り学問は完成しにくい","対句的な表現を捉えます。"],["一寸の光陰軽んずべからず","わずかな時間も軽く見てはいけない","「不可」は「〜べからず」と読みます。"],["春眠暁を覚えず","春の眠りは心地よく夜明けに気づかない","否定の「不」を「〜ず」と読みます。"],["処処啼鳥を聞く","あちらこちらで鳥の鳴き声を聞く","漢詩の情景を捉えます。"],["花落つること知る多少","花がどれほど散ったことだろう","疑問・詠嘆の表現です。"],
  ["百聞は一見に如かず","百回聞くことは一度見ることに及ばない","比較の句形を使っています。"],["千里の行も足下より始まる","遠い旅も足元の一歩から始まる","比喩的な教訓を読み取ります。"],["水滴石を穿つ","小さな努力も続ければ大きな成果になる","故事の比喩を理解します。"],["備へ有れば患ひ無し","準備があれば心配はない","仮定的な関係を読み取ります。"],["人学ばざれば道を知らず","人は学ばなければ道理を知らない","否定と仮定の関係を捉えます。"],
];

const poetryItems = [
  ["俳句の基本音数","五・七・五"],["短歌の基本音数","五・七・五・七・七"],["季語","季節を表す言葉"],["切れ字","や・かな・けりなど"],["句またがり","意味が句をまたいで続くこと"],
  ["初句切れ","第一句の後で意味や調子が切れること"],["二句切れ","第二句の後で意味や調子が切れること"],["三句切れ","第三句の後で意味や調子が切れること"],["字余り","定型より音数が多いこと"],["字足らず","定型より音数が少ないこと"],
  ["枕詞","特定の語にかかる定型的な修飾語"],["掛詞","一つの語に二つの意味を重ねる技法"],["縁語","意味の上で関係する語を組み合わせる技法"],["本歌取り","古い歌の表現を取り入れて新しく詠む技法"],["序詞","ある語を導くための長い修飾表現"],
  ["対句","似た構造の句を並べる表現"],["体言止め","名詞で言い切り余韻を残す表現"],["反復","同じ語句を繰り返して強調する表現"],["倒置","通常の語順を入れ替えて強調する表現"],["擬人法","人でないものを人のように表す技法"],
  ["情景描写","景色や周囲の様子を描く表現"],["心情語","気持ちを直接表す言葉"],["余韻","表現の後に残る味わいや響き"],["リズム","音数や語の繰り返しが生む調子"],["詠嘆","強い感動を表すこと"],
];

const explanationThemes = [
  ["読書","異なる立場を想像する力を育てる","登場人物の考えを自分と比べるから","感想を一文で記録する"],
  ["失敗","次の挑戦に使える情報になる","原因を振り返ることで改善点が見えるから","間違えた理由を書き残す"],
  ["地域の祭り","世代を越えて文化を伝える役割がある","準備を通じて技術や由来が共有されるから","若者が記録動画を作る"],
  ["対話","意見の違いを理解するために必要だ","結論だけでなく理由を聞けるから","相手の言葉を言い換えて確認する"],
  ["観察","思い込みを修正する出発点になる","実際の変化を細かく記録できるから","同じ場所を毎日撮影する"],
  ["休息","集中力を保つための学習の一部である","脳が情報を整理する時間になるから","学習の間に短い休憩を入れる"],
  ["情報発信","受け手を想像する責任が必要だ","同じ言葉でも背景により受け取り方が違うから","公開前に第三者が読み直す"],
  ["自然保護","身近な選択の積み重ねが重要だ","日々の消費が資源の使用量を左右するから","繰り返し使える物を選ぶ"],
  ["伝統技術","変えずに守るだけでなく現代に合わせる必要がある","使う人がいなければ技術が途絶えるから","新しい製品に技法を生かす"],
  ["協働","一人では気づけない解決法を生む","異なる得意分野を組み合わせられるから","役割を途中で見直す"],
  ["言葉","経験の捉え方を形づくる","名づけることで違いを意識できるから","気持ちを具体的な語で表す"],
  ["科学","疑うことと確かめることの両方が大切だ","仮説は検証によって初めて信頼できるから","条件を変えて実験を繰り返す"],
  ["便利さ","失うものにも目を向けて評価すべきだ","時間短縮が技能や交流を減らす場合もあるから","導入前後の変化を比べる"],
  ["記憶","記録によって他者と共有できる知識になる","個人の記憶は時間とともに変化するから","複数の証言を照合する"],
  ["学習計画","結果に応じて修正することが重要だ","最初の予想と実際の進み方は異なるから","週末に達成度を確認する"],
  ["多様性","違いを消すのでなく生かす視点が必要だ","異なる経験が新しい問いを生むから","全員が発言できる方法を選ぶ"],
  ["公共空間","利用者同士の配慮で成り立つ","一人の便利さが他者の不便になることがあるから","利用ルールを話し合う"],
  ["地図","現実を目的に応じて選び直した表現である","すべての情報を同時には載せられないから","用途別の地図を比べる"],
  ["時間","量だけでなく使い方で価値が変わる","同じ一時間でも集中の度合いが違うから","学習内容と成果を記録する"],
  ["質問","理解不足を示すだけでなく学びを深める","問いによって見落としていた関係が見えるから","答えの理由を尋ねる"],
  ["食文化","環境と歴史を映す資料になる","材料や調理法に土地の条件が表れるから","郷土料理の由来を調べる"],
  ["道具","人の能力を補う一方で使い方を変える","便利な機能に合わせて行動も変化するから","使用前後の作業を比べる"],
  ["ルール","目的を共有して初めて意味をもつ","形だけ守っても目的に反する場合があるから","理由を説明して見直す"],
  ["創造","既存の知識を新しく結び直す営みである","全く無関係に見える経験が発想の材料になるから","異分野の例を集める"],
  ["選択","得るものと失うものを比べる必要がある","どの案にも利点と欠点があるから","判断基準を先に決める"],
];

const narrativeSituations = [
  ["発表直前","何度も原稿を握り直していた","友人が客席から黙ってうなずいた","原稿の端に書かれた練習回数を見た","一人ではないと気づき、前を向いた"],
  ["雨の帰り道","傘を忘れた自分に腹を立てていた","知らない下級生が傘を差し出した","小さな傘が二人の肩を半分ずつ覆った","自分も誰かに親切にしようと思った"],
  ["部活動の最後の試合","失敗した場面ばかり思い出していた","仲間が一年分の練習ノートを見せた","ページには失敗の横に改善策が並んでいた","結果だけでなく積み重ねた時間を誇らしく感じた"],
  ["祖父の工房","古い道具を時代遅れだと思っていた","祖父が傷の一つ一つの由来を語った","すり減った柄が長い仕事の時間を物語っていた","道具に受け継がれた知恵を学びたいと思った"],
  ["転校初日","教室の扉の前で足が止まった","隣の席の生徒が正しく名前を呼んだ","机の上には学校案内が開いて置かれていた","準備して待ってくれた人がいると知り緊張がほどけた"],
  ["図書委員の当番","返却本の多さにうんざりしていた","一冊の本から以前の利用者の紹介カードが落ちた","短い文章には本への熱意が詰まっていた","本を次の人へ手渡す仕事の意味に気づいた"],
  ["朝練習のグラウンド","記録が伸びず靴ひもをほどきかけていた","後輩が自分の助言をノートに書き留めていた","そこには昨日伝えた言葉が丁寧に写されていた","自分の努力が誰かの支えにもなると知った"],
  ["文化祭の片付け","飾りを捨てる作業をむなしく感じていた","実行委員が破れた旗の一部を記録帳に貼った","余白には準備中の失敗と工夫が書き足された","終わりを記録することが次の始まりになると思った"],
  ["商店街の取材","店主から昔話ばかり聞かされ退屈していた","古い写真と現在の通りが同じ角度で重なった","変わった建物の間にも同じ看板が残っていた","過去を知ることで今の景色が立体的に見えた"],
  ["合唱練習","自分の声だけが弱いと落ち込んでいた","指揮者が全員に互いの息を聞くよう伝えた","声量を抑えると隣の旋律が初めて聞こえた","目立つことより調和に役割があると理解した"],
  ["理科室の実験","予想と違う結果を失敗だと決めつけた","班員が測定時刻のずれを指摘した","表を並べ直すと温度変化の規則が現れた","結果を疑う前に条件を確かめようと思った"],
  ["地域清掃の日","自分一人が拾っても変わらないと考えていた","幼い子が同じ袋へ小さなごみを入れた","振り返ると参加者の袋がいくつも膨らんでいた","小さな行動も集まれば景色を変えると実感した"],
  ["美術室の放課後","描き直すたび作品が悪くなる気がしていた","先生が最初の下書きも並べて見るよう勧めた","線の迷いが少しずつ減っていることに気づいた","完成だけでなく変化を見ることが大切だと思った"],
  ["駅のホーム","遅れる電車にいら立って時計ばかり見ていた","隣の人が困っている旅行者へ乗換えを説明した","電車が来るまでの時間が誰かを助ける時間に変わった","待つ時間の使い方は自分で選べると気づいた"],
  ["生徒会の話合い","自分の案が否定されたと思い黙り込んだ","反対した生徒が目的は同じだと図に示した","二つの案の共通部分が円の重なりに書かれた","意見の違いは目的への別の道筋だと捉え直した"],
  ["祖母との料理","分量を量らない作り方を不正確だと思った","祖母が生地の音と手触りで水分を確かめた","同じ材料でも天候で加える水を変えていた","数字に表れない経験の知識があると知った"],
  ["校庭の観察記録","毎日同じ木を描くことに飽きていた","一週間前の絵にはなかった小さな芽を見つけた","ページをめくると枝先の変化が連続して見えた","繰り返す観察が一度では見えない変化を示すと分かった"],
  ["修学旅行の班行動","予定を守ることだけに集中していた","道を尋ねた地元の人が裏通りの由来を教えた","地図にない話を聞く間、班員も足を止めた","計画には偶然を受け入れる余白も必要だと思った"],
  ["体育館の倉庫","壊れた用具をすぐ捨てようとした","用務員が交換できる部品を取り出した","直した用具には点検日が新しく記された","物を長く使うには手入れの知識が必要だと知った"],
  ["英語のスピーチ練習","発音の間違いを恐れて声が小さくなっていた","留学生が意味は十分伝わったと笑った","直す箇所と伝わった箇所を別々に印してくれた","間違いと伝達の成功を同時に見てもよいと気づいた"],
  ["避難訓練のあと","毎年同じ動きだと軽く考えていた","先生が昨年とは違う避難経路を示した","工事中の通路には通れない印が付いていた","状況に合わせて備えを更新する必要を感じた"],
  ["河川敷の写真撮影","曇り空では良い写真にならないと思っていた","雲の切れ間から一筋の光が水面を照らした","暗い岸辺があるから光の形がはっきり見えた","条件の悪さも表現の一部になり得ると知った"],
  ["係活動の引継ぎ","細かな注意まで書くのは面倒だと思っていた","後任が去年の短いメモで困った経験を話した","自分には当然の手順で質問が次々に出た","知っている人ほど丁寧に説明すべきだと気づいた"],
  ["大会の応援席","出場できない自分には役割がないと感じていた","選手が応援の合図で緊張がほどけたと話した","声を合わせた瞬間に選手の肩から力が抜けた","競技の外からでも仲間を支えられると実感した"],
  ["卒業前の教室","早く新しい生活へ進みたいとだけ考えていた","机の裏に以前の生徒が残した小さな傷を見つけた","窓から差す光の中で教室の音を一つずつ聞いた","去る場所を覚えておくことも前へ進む準備だと思った"],
];
const narrativeNames = ["春斗","美咲","陸","結衣","蓮","陽菜","湊","葵","悠真","凛","颯太","芽依","大和","紬","樹","咲良","海斗","琴音","直樹","七海","拓海","杏","優斗","莉子","蒼"];

function readingPack(batch) {
  if (batch <= 25) {
    const [topic, claim, reason, example] = explanationThemes[batch - 1];
    const text = `${topic}について考えるとき、目に見える結果だけで価値を決めることはできない。私は「${claim}」と考える。その理由は、${reason}。もちろん、知識を得たり決められた手順を守ったりすることも必要である。しかし、それだけで理解したつもりになると、状況が変わったときに判断できない。例えば、${example}ことができる。このように、学んだ内容を別の場面で確かめ、必要なら考えを修正する過程にこそ意味がある。`;
    return {
      text,
      questions: [
        ["筆者の主張を本文中から抜き出しなさい。", claim, "「私は〜と考える」と示された中心意見に注目します。"],
        ["筆者が、知識や手順だけでは不十分だと考える理由を答えなさい。", "状況が変わったときに判断できないから", "逆接の「しかし」以後から理由を捉えます。"],
        ["筆者は主張を確かめる行動として、どのような例を挙げていますか。", example, "「例えば」の後を、問いに合う形でまとめます。"],
        ["本文の要旨を40字以内でまとめなさい。", `${topic}は、${claim}ため、行動と結び付けて考えることが大切だ。`, "話題・主張・結論を一文にまとめます。"],
      ],
    };
  }
  const index = batch - 26;
  const name = narrativeNames[index];
  const [scene, before, event, detail, after] = narrativeSituations[index];
  const text = `${name}は${scene}、${before}。そのとき、${event}。${detail}。${name}はしばらくその様子を見つめ、急いで出しかけた答えを胸の中へ戻した。そして、${after}。同じ景色なのに、帰り道は来たときとは少し違って見えた。`;
  return {
    text,
    questions: [
      ["出来事の前の主人公の様子を答えなさい。", before, "冒頭の行動描写から読み取ります。"],
      ["主人公の気持ちが変化する直接のきっかけを答えなさい。", event, "「そのとき」の後に起きた出来事を捉えます。"],
      ["出来事の後、主人公はどのように考えましたか。", after, "心情の変化が直接示された文をまとめます。"],
      ["「同じ景色なのに、帰り道は来たときとは少し違って見えた」とあるのはなぜですか。", `出来事を通して、${after}から`, "景色そのものではなく、主人公の見方や心情が変化しています。"],
    ],
  };
}

function japaneseItem(batch, slot) {
  const difficulty = batch <= 15 ? "基本" : batch <= 35 ? "標準" : "入試基礎";
  const wordIndex = (batch - 1) * 4 + slot;
  if (slot < 4) {
    const [kanji, reading] = kanjiWords[wordIndex % 100];
    if (wordIndex < 100) return { category: "漢字", unit: "読み", difficulty, question: `「${kanji}」の読みをひらがなで答えなさい。`, answer: reading, explanation: `${kanji}は「${reading}」と読みます。` };
    return { category: "漢字", unit: "書き", difficulty, question: `「${reading}」を漢字で書きなさい。`, answer: kanji, explanation: `「${reading}」は「${kanji}」と書きます。` };
  }
  if (slot < 7) {
    const index = (batch - 1) * 3 + (slot - 4);
    const [term, meaning] = expressions[index % 50];
    const round = Math.floor(index / 50);
    if (round === 0) return { category: "語句", unit: term.length === 4 ? "四字熟語" : "慣用句・ことわざ", difficulty, question: `「${term}」の意味を答えなさい。`, answer: meaning, explanation: `${term}とは「${meaning}」という意味です。` };
    if (round === 1) return { category: "語句", unit: "文脈", difficulty, question: `次の意味に当てはまる語句を答えなさい。\n「${meaning}」`, answer: term, explanation: `この意味を表す語句は「${term}」です。` };
    return { category: "語句", unit: "活用", difficulty: "入試基礎", question: `「${term}」を使って、その意味が分かる短文を一つ作りなさい。`, answer: `例：${term}という言葉の意味（${meaning}）が伝わる文。`, explanation: "語句の意味と文脈が一致しているかを確認します。" };
  }
  if (slot < 10) {
    const i = (batch - 1) * 3 + (slot - 7);
    const family = i % 6;
    const names = ["弟","姉","生徒","鳥","列車","先生","友達","子ども","風","雨"];
    const contextIndex = Math.floor(i / 6);
    const name = names[contextIndex % names.length];
    const times = ["昨日","今朝","放課後","昼休み","先週"];
    const places = ["廊下を","校庭を","公園を","駅前を","川沿いを"];
    const time = times[contextIndex % times.length];
    const place = places[Math.floor(contextIndex / 5) % places.length];
    const honored = ["校長先生","担任の先生","講師の先生","館長","部長","指導者","司書の先生","来賓の方","審査員","監督"][contextIndex % 10];
    const causes = ["雨が強くなった","風が冷たくなった","日が暮れ始めた","道が混み始めた","疲れが見え始めた"];
    const results = ["試合は続けられた","練習は予定どおり行われた","参加者は最後まで歩いた","発表は中止されなかった","作業は時間内に終わった"];
    const situations = [
      "朝の会が始まる前に","授業の準備を終えてから","昼休みの終了間際に","委員会の仕事を済ませて","部活動へ向かう途中で",
      "図書室から戻るときに","校外学習の集合前に","文化祭の準備中に","発表会の練習後に","掃除当番を終えてから",
      "雨が上がった直後に","日が傾き始めたころに","友達を待っている間に","先生へ報告したあとに","忘れ物を取りに戻って",
      "試合会場へ向かう前に","駅で電車を待ちながら","公園の入口に着いて","川沿いの道を選んで","校門が閉まる前に",
      "朝練習を終えたところで","係の打合せが終わって","作品を提出したあとに","保護者会の準備中に","地域行事から帰る途中で",
    ];
    const situation = situations[contextIndex % situations.length];
    const variants = [
      { unit: "品詞", question: `「${time}、${name}が静かに${place}歩いた」の「静かに」の品詞を答えなさい。`, answer: "形容動詞", explanation: "「静かだ」が活用し、連用形「静かに」になっています。" },
      { unit: "文の成分", question: `「${time}、${name}が${place}走った」の主語を答えなさい。`, answer: `${name}が`, explanation: "「何が」に当たる文節が主語です。" },
      { unit: "活用", question: `「${situation}、${time}は${["書く","読む","走る","話す","待つ"][contextIndex % 5]}ことができない」の動詞を未然形にしなさい。`, answer: ["書か","読ま","走ら","話さ","待た"][contextIndex % 5], explanation: "後ろに「ない」を付けた形から確認します。" },
      { unit: "助動詞", question: `「${situation}、${name}も${places[contextIndex % 5]}歩くらしい」の「らしい」が表す意味を答えなさい。`, answer: "推定", explanation: "根拠をもとに推し量る意味です。" },
      { unit: "敬語", question: `「${situation}、${honored}が${places[contextIndex % 5]}来る」を尊敬語を使って言い換えなさい。`, answer: `${situation}、${honored}が${places[contextIndex % 5]}いらっしゃる`, explanation: "相手の動作を高める尊敬語「いらっしゃる」を使います。" },
      { unit: "接続語", question: `「${causes[contextIndex % 5]}。（　）、${results[Math.floor(contextIndex / 5) % 5]}。」の空所に入る逆接の接続語を答えなさい。`, answer: "しかし（だが・けれども）", explanation: "前後が反対の関係なので逆接を使います。" },
    ];
    return { category: "文法", difficulty, ...variants[family] };
  }
  if (slot < 12) {
    const i = (batch - 1) * 2 + (slot - 10);
    if (i < 50) {
      const [word, meaning] = classicalWords[i % 25];
      const round = Math.floor(i / 25);
      return round === 0
        ? { category: "古典", unit: "古文単語", difficulty, question: `古文の「${word}」の現代語訳を答えなさい。`, answer: meaning, explanation: `「${word}」は「${meaning}」という意味です。` }
        : { category: "古典", unit: "古文単語", difficulty, question: `次の現代語訳に当たる古文単語を答えなさい。\n「${meaning}」`, answer: word, explanation: `この意味を表す古文単語は「${word}」です。` };
    }
    const [oldKana, modern] = historicalKana[(i - 50) % 25];
    const isKanbun = i >= 75;
    const kanbun = kanbunItems[(i - 75) % 25];
    return isKanbun
      ? { category: "古典", unit: "漢文", difficulty: "入試基礎", question: `漢文「${kanbun[0]}」の意味を現代語で答えなさい。`, answer: kanbun[1], explanation: kanbun[2] }
      : { category: "古典", unit: "歴史的仮名遣い", difficulty, question: `歴史的仮名遣い「${oldKana}」を現代仮名遣いに直しなさい。`, answer: modern, explanation: `「${oldKana}」は「${modern}」と直します。` };
  }
  if (slot < 14) {
    const i = (batch - 1) * 2 + (slot - 12);
    const [example, technique] = rhetoric[i % 25];
    if (i < 25) return { category: "表現", unit: "修辞", difficulty, question: `「${example}」で中心的に使われている表現技法を答えなさい。`, answer: technique, explanation: `この表現では${technique}が使われています。` };
    if (i < 50) return { category: "表現", unit: "修辞の効果", difficulty, question: `「${example}」に使われている表現技法と、その効果を答えなさい。`, answer: `${technique}。内容を印象づけたり、情景や感情を強く伝えたりする効果。`, explanation: "技法名だけでなく、その表現が読み手に与える効果まで考えます。" };
    const poetry = poetryItems[(i - 50) % 25];
    return i < 75
      ? { category: "表現", unit: "韻文", difficulty, question: `${poetry[0]}とは何か、簡潔に答えなさい。`, answer: poetry[1], explanation: `${poetry[0]}の基本を確認します。` }
      : { category: "表現", unit: "韻文", difficulty: "入試基礎", question: `「${poetry[1]}」に当たる韻文・表現上の用語を答えなさい。`, answer: poetry[0], explanation: "説明から用語を特定します。" };
  }
  const pack = readingPack(batch);
  if (slot < 18) {
    const [question, answer, explanation] = pack.questions[slot - 14];
    return { category: "読解", unit: batch <= 25 ? "説明的文章" : "文学的文章", difficulty, question: `次の文章を読んで答えなさい。\n${pack.text}\n\n${question}`, answer, explanation };
  }
  if (slot === 18) return { category: "作文", unit: "要約", difficulty: "入試基礎", question: `次の文章の内容を50字以内で要約しなさい。\n${pack.text}`, answer: pack.questions[3][1], explanation: "話題、中心的な考え、結論を残し、具体例を削ってまとめます。" };
  return { category: "作文", unit: "意見文", difficulty: "入試基礎", question: `次の文章を踏まえ、あなたの考えを理由と具体例を含めて80〜120字で書きなさい。\n${pack.text}`, answer: "採点基準：自分の意見、理由、具体例がつながり、指定字数内で書けていること。", explanation: "結論→理由→具体例→結論の順に構成すると伝わりやすくなります。" };
}

const japaneseQuestions = [];
for (let batch = 1; batch <= 50; batch += 1) {
  for (let slot = 0; slot < 20; slot += 1) japaneseQuestions.push(makeQuestion("国語", japaneseQuestions.length + 1, japaneseItem(batch, slot)));
}

function validate(name, questions) {
  const normalize = (value) => String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  if (questions.length !== 1000) throw new Error(`${name}: expected 1000 questions, received ${questions.length}`);
  if (new Set(questions.map(({ id }) => id)).size !== 1000) throw new Error(`${name}: duplicate ids`);
  const questionCounts = new Map();
  for (const { question } of questions) questionCounts.set(normalize(question), (questionCounts.get(normalize(question)) ?? 0) + 1);
  const duplicateQuestions = [...questionCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateQuestions.length) throw new Error(`${name}: ${duplicateQuestions.length} duplicate question texts; sample=${JSON.stringify(duplicateQuestions.slice(0, 8))}`);
  for (let batch = 1; batch <= 50; batch += 1) {
    const set = questions.filter((question) => question.batch === batch);
    if (set.length !== 20 || new Set(set.map(({ category }) => category)).size < 6) throw new Error(`${name}: batch ${batch} is not a complete mixed set`);
  }
}

validate("math", mathQuestions);
validate("japanese", japaneseQuestions);
await mkdir(dataDir, { recursive: true });
await Promise.all([
  writeFile(resolve(dataDir, "math.json"), `${JSON.stringify(mathQuestions, null, 2)}\n`, "utf8"),
  writeFile(resolve(dataDir, "kokugo.json"), `${JSON.stringify(japaneseQuestions, null, 2)}\n`, "utf8"),
]);
console.log("Generated 1000 unique mixed-format Japanese questions and 1000 unique mixed-format Math questions.");
