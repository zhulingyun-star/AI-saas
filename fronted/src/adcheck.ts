/**
 * 广告用语检查（纯函数，不调用接口）：极限词、治病功效说法、说死的承诺、没依据的价格说法，
 * 以及商品分析里写了「不能夸大」的说法。只做提醒，不拦截确认和出片。
 * 用在分镜台词（查看态高亮、可替换或忽略；编辑态实时检查）和出片词（只高亮计数）。
 */

export type AdCat = 'ext' | 'med' | 'fake' | 'price' | 'prod';
export interface AdHit {
  /** 命中在原文里的位置 */
  at: number;
  word: string;
  cat: AdCat;
  why: string;
  /** 建议，第一条用于一键替换；「（删掉…）」表示删掉；「先…」开头的只是建议，不能一键替换 */
  fix: string[];
}
export interface AdRisk {
  point?: string;
  why?: string;
}
export interface AdContext {
  /** 商品资料里有没有真实价格；没有时价格说法都算没依据 */
  hasPrice: boolean;
  /** 商品分析里的 exaggeration_risks（不能夸大的说法） */
  risks?: AdRisk[];
}

export const AD_CAT_LABEL: Record<AdCat, string> = {
  ext: '极限词',
  med: '治病功效',
  fake: '说死的承诺',
  price: '没依据的价格',
  prod: '商品不能这么说',
};
const WHY: Record<Exclude<AdCat, 'prod'>, string> = {
  ext: '广告法不让用「最」「第一」「顶级」这类绝对化说法，容易拒审或被限流',
  med: '普通商品不能说能治病、有医疗作用，这类说法基本会直接拒审',
  fake: '说死了的承诺没法证明，用户一投诉就算虚假宣传',
  price: '商品资料里还没有价格和活动，说出来的价格对不上就是价格违规',
};

/** [说法, 类别, 建议]；长的放前面，先匹配长的 */
const WORDS: [string, Exclude<AdCat, 'prod' | 'price'>, string[]][] = [
  ['全网最低', 'ext', ['活动价以页面为准']],
  ['全网第一', 'ext', ['很多人在用', '口碑不错']],
  ['全网最火', 'ext', ['最近很多人在买']],
  ['销量第一', 'ext', ['卖得不错', '很多人回购']],
  ['独一无二', 'ext', ['很有辨识度']],
  ['绝无仅有', 'ext', ['少见']],
  ['国家级', 'ext', ['（删掉这几个字）']],
  ['世界级', 'ext', ['（删掉这几个字）']],
  ['顶级', 'ext', ['做工细', '质感好']],
  ['史上', 'ext', ['（删掉这两个字）']],
  ['首选', 'ext', ['可以考虑']],
  ['极致', 'ext', ['很讲究']],
  ['第一', 'ext', ['很受欢迎']],
  ['最', 'ext', ['很', '特别']],
  ['药到病除', 'med', ['（删掉，商品不能说治病）']],
  ['缓解疼痛', 'med', ['（删掉，舒适度要先验证）']],
  ['治疗', 'med', ['（删掉，商品不能说治病）']],
  ['根治', 'med', ['（删掉，商品不能说治病）']],
  ['治愈', 'med', ['（删掉，商品不能说治病）']],
  ['抗癌', 'med', ['（删掉，商品不能说治病）']],
  ['疗效', 'med', ['使用感受']],
  ['消炎', 'med', ['（删掉）']],
  ['杀菌', 'med', ['（删掉，除非有检测报告）']],
  ['矫正', 'med', ['（删掉，除非有资质）']],
  ['医用', 'med', ['（删掉）']],
  ['100%有效', 'fake', ['很多人反馈不错']],
  ['100% 有效', 'fake', ['很多人反馈不错']],
  ['百分百', 'fake', ['大多数情况下']],
  ['永不', 'fake', ['不容易']],
  ['永久', 'fake', ['能用很久']],
  ['绝对', 'fake', ['挺']],
  ['保证', 'fake', ['尽量']],
  ['零风险', 'fake', ['（删掉）']],
  ['无效退款', 'fake', ['（删掉，除非真有这个售后）']],
];
/** 「最」「第一」后面接这些字时是在说时间、次序、数量，不算极限词（最近、最后、第一次…） */
const SKIP: Record<string, RegExp> = {
  最: /^最(近|后|终|初|早|晚|多|少|长|短)/,
  第一: /^第一(次|个|句|眼|天|步|版|镜|套|条|集|季|件|段|秒|部分|时间)/,
};
const PRICE: RegExp[] = [
  /原价\s*[¥￥]?\s*\d+/g,
  /[¥￥]\s*\d+/g,
  /\d+(\.\d+)?\s*(块钱|块|元)/g,
  /只要\s*\d+/g,
  /半价/g,
  /打\s*[0-9一二三四五六七八九]\s*折/g,
  /秒杀价|清仓价|史低价?|买一送一|拍一发二|拍1发2/g,
];
const PRICE_FIX = ['先去商品库补上真实价格和活动', '点下面看看今天的价格'];
/** 这些尾巴去掉以后剩下的词也要查：「真皮材质」→「真皮」 */
const TAILS = ['材质', '功能', '进口', '原产', '科技', '效果', '面料'];

export interface ProductRule {
  words: string[];
  why: string;
  fix: string[];
}
/**
 * 从商品分析的「不能夸大的说法」里拆关键词：引号里的说法（按 / 、 拆开）和「如…」后面列的例子；
 * 原因里引号括起来的说法当作替换建议。
 */
export function productRules(risks: AdRisk[] | undefined): ProductRule[] {
  const quoted = (t: string) =>
    [...t.matchAll(/[“"「]([^”"」]+)[”"」]/g)].flatMap((m) => m[1].split(/[/／、]/));
  return (risks ?? [])
    .map((r) => {
      const point = String(r.point ?? '');
      const why = String(r.why ?? '');
      const words = quoted(point);
      const ex = point.match(/如([^）)]+)[）)]/);
      if (ex) words.push(...ex[1].split(/[、，,]/));
      const clean = words.map((w) => w.trim()).filter((w) => w.length >= 2 && w.length <= 12);
      for (const w of [...clean])
        for (const tail of TAILS)
          if (w.length - tail.length >= 2 && w.endsWith(tail)) clean.push(w.slice(0, -tail.length));
      const fix = quoted(why)
        .map((x) => x.trim())
        .filter(Boolean);
      return {
        words: Array.from(new Set(clean)).sort((a, b) => b.length - a.length),
        why: why ? `商品分析里写了：${why}` : '商品分析里把这个列为不能夸大的说法',
        fix: fix.length ? fix : ['按商品分析里的建议改说法'],
      };
    })
    .filter((x) => x.words.length);
}

/** 查一段文字。先查商品分析里的说法，再查价格，最后查通用词；同一处只算一次。 */
export function adCheck(text: string, ctx: AdContext): AdHit[] {
  const t = String(text ?? '');
  const used = new Array<boolean>(t.length).fill(false);
  const out: AdHit[] = [];
  const take = (at: number, len: number, cat: AdCat, why: string, fix: string[]) => {
    for (let i = at; i < at + len; i++) if (used[i]) return;
    for (let i = at; i < at + len; i++) used[i] = true;
    out.push({ at, word: t.slice(at, at + len), cat, why, fix });
  };
  for (const rule of productRules(ctx.risks))
    for (const w of rule.words) {
      let at = t.indexOf(w);
      while (at >= 0) {
        take(at, w.length, 'prod', rule.why, rule.fix);
        at = t.indexOf(w, at + w.length);
      }
    }
  if (!ctx.hasPrice)
    for (const re of PRICE) {
      const r = new RegExp(re.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = r.exec(t))) take(m.index, m[0].length, 'price', WHY.price, PRICE_FIX);
    }
  for (const [w, cat, fix] of WORDS) {
    let at = t.indexOf(w);
    while (at >= 0) {
      if (!SKIP[w]?.test(t.slice(at))) take(at, w.length, cat, WHY[cat], fix);
      at = t.indexOf(w, at + w.length);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** 一键替换用的值：'' 表示删掉；null 表示只是建议，不能一键替换 */
export function fixValue(fix: string | undefined): string | null {
  if (!fix) return null;
  if (/^（删掉/.test(fix)) return '';
  if (/^(先|按商品分析)/.test(fix)) return null;
  return fix;
}
export function applyFix(text: string, hit: AdHit, value: string): string {
  if (text.slice(hit.at, hit.at + hit.word.length) !== hit.word) return text;
  return text.slice(0, hit.at) + value + text.slice(hit.at + hit.word.length);
}

function hash(t: string) {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
/** 「没问题，忽略」的记录：哪一句（scope）、哪个词、在哪、这句话本身。句子改了以后忽略自动失效。 */
export function ignoreKey(scope: string, text: string, hit: AdHit) {
  return `${scope}|${hit.word}|${hit.at}|${hash(text)}`.slice(0, 300);
}
export function liveHits(text: string, ctx: AdContext, scope: string, ignored: Set<string>) {
  return adCheck(text, ctx).filter((h) => !ignored.has(ignoreKey(scope, text, h)));
}

/** 把文字切成普通段和命中段，方便高亮 */
export function splitHits(text: string, hits: AdHit[]) {
  const parts: { text: string; hit?: AdHit }[] = [];
  let p = 0;
  for (const h of hits) {
    if (h.at > p) parts.push({ text: text.slice(p, h.at) });
    parts.push({ text: h.word, hit: h });
    p = h.at + h.word.length;
  }
  if (p < text.length) parts.push({ text: text.slice(p) });
  return parts;
}
