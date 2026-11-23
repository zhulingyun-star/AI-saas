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
export const MODE_LABEL: Record<Mode, string> = {
  REMAKE: '视频二创',
  FRAMEWORK: '框架模式',
  ONE_CLICK: '一键成片',
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
}
export interface Flow {
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
  product: ProductCard & {
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
  };
  reference: RefDetail & { report: StoryboardReport | null; boardRevision: number };
  legacyApproach: { relation: string; reason: string; approach: string } | null;
  storyboard: {
    saved: boolean;
    confirmed: boolean;
    revision: number;
    shots: StoryShot[];
    stale: boolean;
  };
  ignores: string[];
  targetDuration: number;
  draftSegments: Segment[];
  versions: Version[];
  videoEnabled: boolean;
  aiEnabled: boolean;
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
/** 点项目去哪：视频二创进新版四步详情，框架模式 / 一键成片 / 其他作品暂时进旧的制作页 */
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
  if (p.mode === 'FRAMEWORK') return ['待选框架', 'none'];
  if (p.mode === 'ONE_CLICK') return ['待开始', 'none'];
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
