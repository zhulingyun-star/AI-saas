import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { folderScope, type Folder } from '../../gy/folders';
import type { Persona } from '../products/data';
import type { RefDetail } from '../references/data';
import type { StoryboardReport } from '../../storyboard';

export type { Folder };

/** 新版「项目」= 一个商品 + 一种创作方式（对应 projects 里的一行）。接口见 backend/API.md「项目（新版）」。 */
export type Mode = 'REMAKE' | 'FRAMEWORK' | 'ONE_CLICK' | 'OTHER';
/** 界面上的叫法：REMAKE=复刻，ONE_CLICK=简易（后端枚举值不变）；FRAMEWORK 新建页已不再提供，老项目照常显示 */
export const MODE_LABEL: Record<Mode, string> = {
  REMAKE: '复刻',
  FRAMEWORK: '框架模式',
  ONE_CLICK: '简易',
  OTHER: '快捷制作',
};
export const RATIOS = [
  ['9:16', '竖屏 9:16'],
  ['16:9', '横屏 16:9'],
] as const;
export const RESOLUTIONS = ['480p', '720p', '1080p'] as const;
export type Ratio = (typeof RATIOS)[number][0];
export const ratioLabel = (r: string) => RATIOS.find(([v]) => v === r)?.[1] ?? '竖屏 9:16';
export const formatRR = (x: { ratio: string; resolution: string }) =>
  `${ratioLabel(x.ratio)} · ${x.resolution}`;

export interface ProductCard {
  anchorId: string;
  groupId: string;
  name: string;
  sku: string;
  coverId: string | null;
  imageIds: string[];
}
export interface ProjectItem {
  id: string;
  name: string;
  revision: number;
  mode: Mode;
  flow: boolean;
  legacyPath: string;
  folderId: string | null;
  product: ProductCard | null;
  reference: { assetId: string; name: string } | null;
  ratio: string;
  resolution: string;
  duration: number;
  status: string;
  storyboardConfirmed: boolean;
  storyboardSaved: boolean;
  /** 框架模式 / 简易：方向数、选中的方向数、选中且分镜已确认的方向数 */
  plan?: { directions: number; selected: number; boardsConfirmed: number };
  versions: {
    count: number;
    running: number;
    unreviewed: number;
    usable: number;
    latestStatus: string | null;
  };
  updatedAt: string;
  createdAt: string;
}
export interface ProjectLibrary {
  folders: Folder[];
  projects: ProjectItem[];
  videoEnabled: boolean;
  aiEnabled: boolean;
}
export interface StoryShot {
  id: string;
  start: number;
  end: number;
  origCamera: string;
  origVisual: string;
  origLines: string[];
  camera: string;
  visual: string;
  lines: string[];
  task: string;
}
export interface Segment {
  key: string;
  title: string;
  text: string;
}
export interface Verdict {
  rating: 'GOOD' | 'BAD' | null;
  reason: string;
  use: 'USABLE' | 'DISCARDED' | null;
  revision: number;
  by: string;
  at: string;
}
export interface Version {
  id: string;
  no: number;
  status: string;
  message: string;
  progress: number;
  submitted: boolean;
  hasOutput: boolean;
  createdAt: string;
  updatedAt: string;
  ratio: string;
  resolution: string;
  duration: number;
  note: string;
  basedOn?: string | null;
  carriedReasons: string[];
  segments: Segment[];
  verdict?: Verdict | null;
  /** 框架模式 / 简易：这一版属于哪个方向 */
  directionId?: string | null;
  /** 简易：出这一版时的设置 */
  oneClick?: OneClickSettings | null;
  /** 项目里的总序号（框架模式的 no 是方向里的序号） */
  jobNo?: number;
}
export interface ProductInfo extends ProductCard {
  analysis: {
    status: string;
    revision: number;
    stale: boolean;
    hasReport: boolean;
    category?: string;
    appearance?: string;
    risks: { point?: string; why?: string }[];
    hasPrice: boolean;
  };
  personas: Persona[];
}
/** 各种创作方式的详情都有的部分（出片步只用这些） */
export interface BaseFlow {
  project: ProjectItem;
  revision: number;
  settings: {
    ratio: string;
    resolution: string;
    personaId: string;
    personaName: string;
    approach: string;
    facts: string;
  };
  product: ProductInfo;
  ignores: string[];
  versions: Version[];
  videoEnabled: boolean;
  aiEnabled: boolean;
}
export interface Flow extends BaseFlow {
  reference: RefDetail & { report: StoryboardReport | null; boardRevision: number };
  legacyApproach: { relation: string; reason: string; approach: string } | null;
  storyboard: {
    saved: boolean;
    confirmed: boolean;
    revision: number;
    shots: StoryShot[];
    stale: boolean;
  };
  targetDuration: number;
  draftSegments: Segment[];
}

const isRunning = (s?: string | null) => s === 'QUEUED' || s === 'RUNNING';
export const versionRunning = (v: Version) => isRunning(v.status);

export function useProjectLibrary() {
  const { client } = useWorkspace();
  const q = useQuery({
    queryKey: [client.id, 'project-library'],
    queryFn: () => request<ProjectLibrary>(`/clients/${client.id}/project-library`),
    refetchInterval: (query) =>
      query.state.data?.projects?.some?.((p) => p.versions?.running) ? 5000 : false,
  });
  const folders = Array.isArray(q.data?.folders) ? q.data.folders : [];
  const projects = (Array.isArray(q.data?.projects) ? q.data.projects : []).map((p) => ({
    ...p,
    folderId: p.folderId && folders.some((f) => f.id === p.folderId) ? p.folderId : null,
  }));
  return { query: q, folders, projects, isPending: q.isPending, error: q.error };
}
export function useRefreshProjects() {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  return () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: [client.id, 'project-library'] }),
      cache.invalidateQueries({ queryKey: [client.id, 'project-flow'] }),
      cache.invalidateQueries({ queryKey: [client.id, 'product-library'] }),
      cache.invalidateQueries({ queryKey: [client.id, 'reference-library'] }),
      cache.invalidateQueries({ queryKey: [client.id, 'product-projects'] }),
    ]);
}
export function inFolder(projects: ProjectItem[], folders: Folder[], folder: string) {
  if (folder === 'all') return projects;
  if (folder === 'unfiled') return projects.filter((p) => !p.folderId);
  const scope = folderScope(folders, folder);
  return projects.filter((p) => !!p.folderId && scope.has(p.folderId));
}
/** 点项目去哪：新版建的项目都进四步详情；旧流程里的框架模式 / 简易 / 其他作品进旧的制作页 */
export const projectPath = (p: ProjectItem) => (p.flow ? `/p/${p.id}` : p.legacyPath);

/** 列表里的「进度」，只按真实记录算 */
export function progressLabel(p: ProjectItem): [string, 'ok' | 'check' | 'none'] {
  const v = p.versions ?? { count: 0, running: 0, unreviewed: 0, usable: 0 };
  if (v.running) return ['出片中', 'check'];
  if (v.count)
    return [
      [
        `${v.count} 个版本`,
        v.unreviewed ? `${v.unreviewed} 版待审片` : '',
        v.usable ? `${v.usable} 版可投放` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      v.unreviewed ? 'check' : 'ok',
    ];
  if (p.mode === 'REMAKE')
    return p.storyboardConfirmed
      ? ['分镜已确认 · 待出片', 'check']
      : p.storyboardSaved
        ? ['分镜编辑中', 'none']
        : ['待确认分镜', 'none'];
  if (p.mode === 'FRAMEWORK') {
    const x = p.plan;
    if (!p.flow) return ['待选框架', 'none'];
    if (!x?.directions) return ['待出方向', 'none'];
    if (!x.selected) return [`${x.directions} 套方向 · 待选`, 'none'];
    if (x.boardsConfirmed < x.selected)
      return [`${x.selected} 个方向 · 分镜 ${x.boardsConfirmed}/${x.selected} 已确认`, 'none'];
    return [`${x.selected} 个方向 · 分镜已确认 · 待出片`, 'check'];
  }
  if (p.mode === 'ONE_CLICK') return ['待开始出片', 'none'];
  return ['草稿', 'none'];
}

/** 后端时间是 UTC、不带时区 */
export function utc(value?: string | null) {
  if (!value) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : value + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}
export function shortTime(value?: string | null) {
  const d = utc(value);
  if (!d) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function elapsed(from?: string | null, now = Date.now()) {
  const d = utc(from);
  if (!d) return '0:00';
  const s = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** 出片的真实阶段：排队 → 交给视频接口 → 生成中 → 出好了 */
export const STAGES = ['排队中', '交给视频接口', '视频接口生成中', '出好了'] as const;
export function stageOf(v: Version) {
  if (v.status === 'QUEUED') return 0;
  if (v.status === 'RUNNING') return v.submitted ? 2 : 1;
  if (v.hasOutput) return 3;
  return -1;
}
export function versionState(v: Version): [string, string] {
  if (v.status === 'QUEUED' || v.status === 'RUNNING') return ['出片中', 'wait'];
  if (v.status === 'CANCELLED') return ['已取消', 'idle'];
  if (v.status === 'BLOCKED')
    return [v.message.includes('未配置') ? '没有发出' : '结果待核对', 'warn'];
  if (v.status === 'FAILED') return ['没出成功', 'bad'];
  const u = v.verdict?.use;
  if (u === 'USABLE') return ['可投放', 'ok'];
  if (u === 'DISCARDED') return ['不用了', 'idle'];
  if (v.verdict?.rating) return ['已审片', 'ok'];
  if (v.hasOutput) return ['待审片', 'wait'];
  return [v.status, 'idle'];
}

/** 两版出片词按段对齐：同 key 对在一起，哪边没有就是空 */
export function pairSegments(a: Segment[], b: Segment[]) {
  const rows: { key: string; title: string; left: string; right: string }[] = [];
  const used = new Set<string>();
  for (const y of b) {
    const x = a.find((s) => s.key === y.key);
    if (x) used.add(x.key);
    rows.push({ key: y.key, title: y.title, left: x?.text ?? '', right: y.text });
  }
  for (const x of a)
    if (!used.has(x.key)) rows.push({ key: x.key, title: x.title, left: x.text, right: '' });
  return rows;
}
/** 和上一版不同的段（按 key 比） */
export function changedSegments(cur: Segment[], prev: Segment[] | undefined) {
  if (!prev) return [];
  return cur.filter((s) => prev.find((p) => p.key === s.key)?.text !== s.text);
}

// ---------- 框架模式 / 简易 ----------
export interface DirectionData {
  title: string;
  why: string;
  hook: string;
  openVisual: string;
  openLine: string;
  structure: string;
  points: string[];
  scene: string;
  contentType: string;
  tempo: string;
  people: string;
  voice: string;
  look: string;
  ending: string;
  personaName: string;
  duration: number;
}
export interface DirectionBoard {
  saved: boolean;
  confirmed: boolean;
  revision: number;
  /** AI / LOCAL（不是文字模型写的，界面上标「模板」） */
  source: string;
  duration: number;
  stale: boolean;
  shots: StoryShot[];
  draftSegments: Segment[];
}
export interface DirectionRow {
  id: string;
  /** AI：文字模型写的；LOCAL：没配置文字模型时按商品理解拼的（界面上标「模板」） */
  source: 'AI' | 'LOCAL';
  data: DirectionData;
  origin: DirectionData;
  edited: boolean;
  selected: boolean;
  selectOrder: number;
  revision: number;
  productChanged: boolean;
  versionCount: number;
  board: DirectionBoard;
}
export interface OneClickSettings {
  personaName: string;
  duration: number;
  src: 'idea' | 'copy';
  copy: string;
  creative: string;
  people: string;
  voice: string;
  tempo: string;
  look: string;
}
export interface ModeFlow extends BaseFlow {
  mode: 'FRAMEWORK' | 'ONE_CLICK';
  settings: BaseFlow['settings'] & { duration: number; oneClick?: OneClickSettings };
  directions: DirectionRow[];
  options: {
    hooks: string[];
    contentTypes: string[];
    tempos: string[];
    people: string[];
    voices: string[];
    looks: string[];
    endings: string[];
    durations: number[];
    tasks: string[];
  };
}
export const isModeFlow = (f: BaseFlow): f is ModeFlow => 'directions' in f;
/** 选中的方向按 A / B / C 排 */
export const pickedDirections = (f: ModeFlow) =>
  f.directions.filter((d) => d.selected).sort((a, b) => a.selectOrder - b.selectOrder);
export const LETTERS = 'ABC';
/** 不是文字模型写的（source=LOCAL）只打一个短标签「模板」；AI 写的不标 */
export const sourceLabel = (s: string) => (s === 'AI' ? '' : '模板');
/** 简易设置的说明（版本卡上的标签、两版的差别） */
export function oneClickTags(o?: OneClickSettings | null) {
  if (!o) return [];
  return [
    o.src === 'copy' ? '照我的文案' : '让 AI 构思',
    `${o.duration} 秒`,
    o.personaName ? `给「${o.personaName}」看` : '人群没指定',
    o.people,
    o.voice,
    o.tempo,
    o.look,
    o.creative ? '有创意要求' : '',
  ].filter(Boolean);
}
export function oneClickDiff(a?: OneClickSettings | null, b?: OneClickSettings | null) {
  if (!a || !b) return [];
  const out: string[] = [];
  const name: Record<string, string> = {
    personaName: '人群',
    people: '出镜人物',
    voice: '台词和声音',
    tempo: '节奏',
    look: '片种',
  };
  if (a.src !== b.src) out.push(`出发点 → ${b.src === 'copy' ? '照我的文案' : '让 AI 构思'}`);
  if (a.duration !== b.duration) out.push(`时长 ${a.duration} → ${b.duration} 秒`);
  for (const k of ['personaName', 'people', 'voice', 'tempo', 'look'] as const)
    if (a[k] !== b[k]) out.push(`${name[k]} → ${b[k] || '交给 AI'}`);
  if (a.copy !== b.copy) out.push('改了文案');
  if (a.creative !== b.creative) out.push('改了创意要求');
  return out;
}
