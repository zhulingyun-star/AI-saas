import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api';
import { useWorkspace } from '../../components/UI';
import {
  MODE_LABEL,
  ratioLabel,
  utc,
  type Mode,
  type Segment,
  type Verdict,
} from '../projects/data';

/**
 * 资产库 = 所有项目出好的成片（每一版出片一条），接口见 backend/API.md「资产库与投放数据」。
 * 投放数据只来自手填或导入的表格；没填就是没有，累计、「哪种赢了」「该换新了」都只按真实记录算。
 */
export interface PerfSummary {
  records: number;
  from: string;
  to: string;
  impressions?: number | null;
  clicks?: number | null;
  productClicks?: number | null;
  orders?: number | null;
  ctr?: number | null;
  cvr?: number | null;
  retain3s?: number | null;
  finishRate?: number | null;
  gpm?: number | null;
  roi?: number | null;
  negativeRate?: number | null;
  /** 千川数据（元 / 百分数）；没导入过就没有 */
  cost?: number | null;
  gmv?: number | null;
  netGmv?: number | null;
  netOrders?: number | null;
  netRoi?: number | null;
  netSettleRate?: number | null;
  refundRate1h?: number | null;
}
/** 成片的标准命名：YYMMDD-商品简称-内容形式-创作者-V版本；补不出来时 standardName 为空，problem 写原因 */
export interface Naming {
  standardName?: string | null;
  date: string;
  productShort?: string | null;
  form: string;
  creator?: string | null;
  version?: number | null;
  problem: string;
  revision: number;
}
export interface VideoItem {
  id: string;
  code: string;
  projectId: string;
  projectName: string;
  mode: Mode;
  projectFlow: boolean;
  projectPath: string;
  no: number;
  jobNo: number;
  status: string;
  message: string;
  hasOutput: boolean;
  createdAt: string;
  updatedAt: string;
  ratio: string;
  resolution: string;
  duration: number;
  note: string;
  product?: { anchorId: string; name: string; coverId: string } | null;
  reference?: { assetId: string; name: string } | null;
  direction?: { id: string; title: string; letter: string } | null;
  hook: string;
  personaName: string;
  scene: string;
  contentType: string;
  verdict?: Verdict | null;
  hasPrice: boolean;
  adName: string;
  standardName?: string | null;
  naming?: Naming | null;
  perf?: PerfSummary | null;
  tired: string[];
}
export interface PerfRecord {
  id: string;
  jobId: string;
  from: string;
  to: string;
  impressions?: number | null;
  clicks?: number | null;
  retain3s?: number | null;
  finishRate?: number | null;
  productClicks?: number | null;
  orders?: number | null;
  gpm?: number | null;
  roi?: number | null;
  negativeRate?: number | null;
  note: string;
  cost?: number | null;
  gmv?: number | null;
  refundGmv?: number | null;
  refundOrders?: number | null;
  netGmv?: number | null;
  netOrders?: number | null;
  refundRate1h?: number | null;
  coupon?: number | null;
  accountId?: string | null;
  materialId?: string | null;
  materialName?: string | null;
  source: 'MANUAL' | 'IMPORT';
  revision: number;
  updatedBy: string;
  updatedAt: string;
}
export interface Signal {
  key: string;
  title: string;
  hit: boolean;
  detail: string;
}
export interface VideoDetail extends VideoItem {
  segments: Segment[];
  carriedReasons: string[];
  records: PerfRecord[];
  signals?: Signal[] | null;
  madeOn: string;
}
export interface VideoLibrary {
  videos: VideoItem[];
  pendingVersions: number;
  hooks: string[];
}

export function useVideoLibrary() {
  const { client } = useWorkspace();
  const q = useQuery({
    queryKey: [client.id, 'video-library'],
    queryFn: () => request<VideoLibrary>(`/clients/${client.id}/video-library`),
  });
  const videos = Array.isArray(q.data?.videos) ? q.data.videos : [];
  return { query: q, videos, pending: q.data?.pendingVersions ?? 0, isPending: q.isPending };
}
export function useRefreshVideos() {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  return () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: [client.id, 'video-library'] }),
      cache.invalidateQueries({ queryKey: [client.id, 'video'] }),
    ]);
}

/** 成片的名字：项目 · 方向 · 第几版 */
export function videoName(v: VideoItem) {
  const dir = v.direction?.letter
    ? `方向 ${v.direction.letter} · `
    : v.direction?.title && v.mode === 'FRAMEWORK'
      ? `${v.direction.title} · `
      : '';
  return `${v.projectName} · ${dir}第 ${v.no} 版`;
}
/** 审片状态（和项目详情里同一份审片结果） */
export function reviewState(
  v: Pick<VideoItem, 'verdict' | 'hasOutput' | 'status'>,
): [string, string] {
  if (!v.hasOutput)
    return v.status === 'QUEUED' || v.status === 'RUNNING'
      ? ['出片中', 'wait']
      : ['没出好', 'idle'];
  const u = v.verdict?.use;
  if (u === 'USABLE') return ['可投放', 'ok'];
  if (u === 'DISCARDED') return ['不用了', 'idle'];
  if (v.verdict?.rating) return ['已审片', 'ok'];
  return ['待审片', 'wait'];
}
export const REVIEW_STATES = ['待审片', '已审片', '可投放', '不用了'];
export const ratingLabel = (v: VideoItem) =>
  v.verdict?.rating === 'GOOD' ? '好' : v.verdict?.rating === 'BAD' ? '差' : '未评价';
export const durationBand = (d: number) =>
  d <= 15 ? '15 秒以内' : d <= 30 ? '15–30 秒' : '30 秒以上';
export const monthOf = (iso: string) => {
  const d = utc(iso);
  return d ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月` : '时间不明';
};
export const directionLabel = (v: VideoItem) => {
  if (v.mode === 'REMAKE')
    return v.reference ? `复刻：${v.reference.name}` : '复刻：参考视频不在了';
  if (!v.direction) return '没有方向';
  return v.direction.title || '没起名的方向';
};
export const sceneLabel = (v: VideoItem) => v.scene || '未标场景';
export const hookLabel = (v: VideoItem) => v.hook || '未标开头';
export const personaLabel = (v: VideoItem) => v.personaName || '未标人群';
export const perfLabel = (v: VideoItem) =>
  v.tired.length ? '该换新了' : v.perf ? '填了投放数据' : '还没填投放数据';

/** 左栏的分类方式：选哪种就按它分组（同一条成片在一种分类里只出现一次） */
export const DIMS: {
  key: string;
  label: string;
  of: (v: VideoItem) => string;
  order?: string[];
}[] = [
  { key: 'product', label: '按商品', of: (v) => v.product?.name ?? '商品不在了' },
  { key: 'project', label: '按项目', of: (v) => v.projectName },
  {
    key: 'mode',
    label: '按创作方式',
    of: (v) => MODE_LABEL[v.mode] ?? '其他',
    order: ['复刻', '简易', '框架模式', '快捷制作'],
  },
  { key: 'direction', label: '按方向', of: directionLabel },
  { key: 'hook', label: '按开头类型', of: hookLabel },
  { key: 'persona', label: '按人群', of: personaLabel },
  { key: 'scene', label: '按场景', of: sceneLabel },
  { key: 'state', label: '按审片状态', of: (v) => reviewState(v)[0], order: REVIEW_STATES },
  { key: 'rating', label: '按评价', of: ratingLabel, order: ['好', '差', '未评价'] },
  { key: 'reference', label: '按参考视频', of: (v) => v.reference?.name ?? '没有参考视频' },
  {
    key: 'duration',
    label: '按时长',
    of: (v) => durationBand(v.duration),
    order: ['15 秒以内', '15–30 秒', '30 秒以上'],
  },
  { key: 'ratio', label: '按画幅', of: (v) => ratioLabel(v.ratio) },
  { key: 'month', label: '按生成时间', of: (v) => monthOf(v.createdAt) },
  {
    key: 'perf',
    label: '按投放数据',
    of: perfLabel,
    order: ['该换新了', '填了投放数据', '还没填投放数据'],
  },
];
export function groupBy(videos: VideoItem[], dim: (typeof DIMS)[number]) {
  const map = new Map<string, VideoItem[]>();
  for (const v of videos) {
    const k = dim.of(v);
    map.set(k, [...(map.get(k) ?? []), v]);
  }
  const keys = [...map.keys()];
  const rank = (k: string) => (dim.order ? dim.order.indexOf(k) : -1);
  keys.sort((a, b) => {
    const ra = rank(a),
      rb = rank(b);
    if (ra >= 0 || rb >= 0) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    if (/^(未标|没有|商品不在)/.test(a) !== /^(未标|没有|商品不在)/.test(b))
      return /^(未标|没有|商品不在)/.test(a) ? 1 : -1;
    return map.get(b)!.length - map.get(a)!.length || a.localeCompare(b, 'zh');
  });
  return keys.map((k) => ({ key: k, videos: map.get(k)! }));
}

// ---------- 数字 ----------
export const fmtN = (x?: number | null) =>
  x == null ? '—' : Math.round(x).toLocaleString('zh-CN');
export const pct = (x?: number | null, d = 1) => (x == null ? '—' : `${x.toFixed(d)}%`);
export const fix = (x?: number | null, d = 2) => (x == null ? '—' : x.toFixed(d));
export const md = (iso: string) => iso.slice(5);
export const dateRange = (a: string, b: string) => (a === b ? md(a) : `${md(a)} 至 ${md(b)}`);

/** 「哪种赢了」的比较维度 */
export const WIN_DIMS: {
  key: string;
  label: string;
  of: (v: VideoItem) => string;
  suffix: string;
}[] = [
  { key: 'hook', label: '开头类型', of: hookLabel, suffix: '开头' },
  { key: 'persona', label: '人群', of: personaLabel, suffix: '' },
  { key: 'scene', label: '场景', of: sceneLabel, suffix: '' },
  { key: 'mode', label: '创作方式', of: (v) => MODE_LABEL[v.mode] ?? '其他', suffix: '' },
  { key: 'direction', label: '方向', of: directionLabel, suffix: '' },
  { key: 'duration', label: '时长', of: (v) => durationBand(v.duration), suffix: '' },
];
export interface WinRow {
  group: string;
  n: number;
  ctr: number | null;
  cvr: number | null;
  roi: number | null;
}
const avg = (xs: (number | null | undefined)[]) => {
  const q = xs.filter((x): x is number => x != null);
  return q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
};
/** 每条成片先算自己的累计，再在组里取平均（每条成片分量一样）；只用填了数据的成片 */
export function winRows(videos: VideoItem[], of: (v: VideoItem) => string): WinRow[] {
  const groups = new Map<string, PerfSummary[]>();
  for (const v of videos) if (v.perf) groups.set(of(v), [...(groups.get(of(v)) ?? []), v.perf]);
  return [...groups.entries()]
    .map(([group, list]) => ({
      group,
      n: list.length,
      ctr: avg(list.map((p) => p.ctr)),
      cvr: avg(list.map((p) => p.cvr)),
      roi: avg(list.map((p) => p.roi)),
    }))
    .sort((a, b) => (b.ctr ?? -1) - (a.ctr ?? -1));
}
/** 一句话说清谁高谁低；条数少的明确说先别下结论 */
export function winSay(rows: WinRow[], suffix: string) {
  const lab = (x: WinRow) => `「${x.group}」${suffix}`;
  if (!rows.length) return '';
  if (rows.length < 2) return `只有${lab(rows[0])}这一组有数据，还比不出来。`;
  const top = rows[0];
  const base = rows.slice(1).sort((a, b) => b.n - a.n)[0];
  if (top.ctr == null || base.ctr == null) return '点击率还算不出来（曝光都是 0）。';
  const r = base.ctr > 0 ? top.ctr / base.ctr : 1;
  const adj = r >= 1.3 ? '高一截' : r >= 1.1 ? '高一些' : '';
  let t = `${lab(top)}的平均点击率${adj ? `比${lab(base)}${adj}` : `和${lab(base)}差不多`}（${pct(top.ctr)} 对 ${pct(base.ctr)}）`;
  t +=
    top.n < 3
      ? `，但只有 ${top.n} 条，先别下结论`
      : base.n < 3
        ? `，不过${lab(base)}只有 ${base.n} 条，对比还不稳`
        : '，两组条数都不少于 3 条';
  const rt = rows.filter((x) => x.roi != null).sort((a, b) => b.roi! - a.roi!)[0];
  if (rt && rt.group !== top.group)
    t += `；投产比最高的是${lab(rt)}（${rt.roi!.toFixed(2)}${rt.n < 3 ? `，也只有 ${rt.n} 条` : ''}）`;
  return t + '。';
}
