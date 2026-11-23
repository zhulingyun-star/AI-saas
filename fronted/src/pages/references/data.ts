import { useQuery, useQueryClient } from '@tanstack/react-query';
import { post, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { folderScope, type Folder } from '../../gy/folders';
import type { Asset } from '../../types';
import type { StoryboardState } from '../../storyboard';

export type { Folder };

/** 8 种开头类型（和商品库目标人群里的“常用开头”是同一套） */
export const HOOK_TYPES: readonly [string, string][] = [
  ['痛点型', '开口就说他正烦的事'],
  ['反常识型', '先说一句和常识反着来的话'],
  ['对比型', '左右或前后放一起看'],
  ['结果前置型', '先给结果，再讲怎么来的'],
  ['价格型', '直接说价格或优惠'],
  ['人群锁定型', '开口点名“谁该看”'],
  ['悬念型', '先抛问题，不马上给答案'],
  ['身份代入型', '让观众代入一个身份'],
];
/** 每镜在转化里的任务 */
export const SHOT_TASKS = [
  '抓住注意力',
  '建立需求',
  '给出方案',
  '建立信任',
  '打消顾虑',
  '促进决定',
  '推动下单',
] as const;

export interface RefBoard {
  status: string;
  revision: number;
  hasReport: boolean;
  error: string;
  duration?: number;
  shotCount?: number;
  lineCount?: number;
}
export interface RefUse {
  id: string;
  name: string;
  kind: 'campaign' | 'work';
}
export interface RefItem {
  assetId: string;
  name: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
  folderId?: string | null;
  hook?: string | null;
  storyboard: RefBoard;
  usedBy: RefUse[];
}
export interface RefLibrary {
  folders: Folder[];
  references: RefItem[];
  analysisEnabled: boolean;
}
export interface RefDetail extends RefItem {
  shotTasks: Record<string, string>;
  labelRevision: number;
  analysisEnabled: boolean;
}

export const isRunning = (status?: string) => ['QUEUED', 'RUNNING'].includes(status ?? '');

export function useReferenceLibrary() {
  const { client } = useWorkspace();
  const q = useQuery({
    queryKey: [client.id, 'reference-library'],
    queryFn: () => request<RefLibrary>(`/clients/${client.id}/reference-library`),
    refetchInterval: (query) =>
      query.state.data?.references?.some((r) => isRunning(r.storyboard?.status)) ? 3000 : false,
  });
  const folders = Array.isArray(q.data?.folders) ? q.data.folders : [];
  const refs = (Array.isArray(q.data?.references) ? q.data.references : []).map((r) => ({
    ...r,
    folderId: r.folderId && folders.some((f) => f.id === r.folderId) ? r.folderId : null,
  }));
  return {
    query: q,
    folders,
    refs,
    analysisEnabled: !!q.data?.analysisEnabled,
    isPending: q.isPending,
    error: q.error,
  };
}

export function useRefreshReferences() {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  return () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: [client.id, 'reference-library'] }),
      cache.invalidateQueries({ queryKey: [client.id, 'reference'] }),
      cache.invalidateQueries({ queryKey: [client.id, 'assets'] }),
    ]);
}

/** 当前文件夹（含子文件夹）里的参考视频 */
export function inFolder(refs: RefItem[], folders: Folder[], folder: string) {
  if (folder === 'all') return refs;
  if (folder === 'unfiled') return refs.filter((r) => !r.folderId);
  const scope = folderScope(folders, folder);
  return refs.filter((r) => !!r.folderId && scope.has(r.folderId));
}

/** 拆解状态：[文案, 色调] */
export function boardLabel(b: RefBoard | undefined): [string, 'ok' | 'check' | 'bad' | 'none'] {
  if (!b || b.status === 'EMPTY') return ['还没拆解', 'none'];
  if (isRunning(b.status)) return ['拆解中', 'check'];
  if (b.status === 'FAILED')
    return b.hasReport ? ['已拆解 · 最近一次重拆没成功', 'check'] : ['拆解没成功', 'bad'];
  return ['已拆解', 'ok'];
}

export function clock(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) return '';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export const sec = (n: number) => `${n.toFixed(1)}`;

export function usedText(r: RefItem) {
  return r.usedBy.length ? `用在 ${r.usedBy.length} 个项目` : '还没用过';
}

/** 卡片上的“N 个镜头 · M 句台词” */
export function boardSummary(r: RefItem) {
  const b = r.storyboard;
  if (b.hasReport) return `${b.shotCount ?? 0} 个镜头 · ${b.lineCount ?? 0} 句台词`;
  return boardLabel(b)[0];
}

export const thumbUrl = (clientId: string, assetId: string, at: number) =>
  `/api/clients/${clientId}/assets/${assetId}/storyboard/thumbnail?at=${at.toFixed(3)}`;

/** 封面：有拆解结果时取一张截帧（第一镜之后一点），没有时用视频首帧。 */
export function coverAt(b: RefBoard) {
  if (!b.hasReport || !b.duration) return null;
  return Math.min(Math.max(0, b.duration - 0.05), Math.max(0.5, b.duration * 0.2));
}

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};
export const ACCEPT = '.mp4,.mov,.webm,video/mp4,video/webm,video/quicktime';
/** 和原来视频二创上传一样的限制：MP4 / MOV / WebM，不超过 100MB。返回问题描述，没问题返回空字符串。 */
export function checkVideo(file: File | null | undefined) {
  if (!file) return '先选一条视频';
  if (!MIME[file.name.split('.').pop()?.toLowerCase() ?? ''])
    return '参考视频支持 MP4、MOV 和 WebM 格式';
  if (!file.size) return '视频文件是空的，换一个文件试试';
  if (file.size > 100 * 1024 * 1024) return '参考视频不能超过 100MB';
  return '';
}

/**
 * 上传一条参考视频并放进库里：上传素材 → 放进文件夹 → 起名 → 能拆解就开始拆解。
 * 拆解开不了（例如读片模型没配置）不算上传失败，返回原因给页面显示。
 */
export async function uploadReference(
  clientId: string,
  file: File,
  opts: { name?: string; folderId?: string | null; analyze: boolean },
) {
  const problem = checkVideo(file);
  if (problem) throw new Error(problem);
  const mime = MIME[file.name.split('.').pop()!.toLowerCase()];
  const body = new FormData();
  body.set('kind', 'REFERENCE');
  body.set(
    'file',
    file.type === mime
      ? file
      : new File([file], file.name, { type: mime, lastModified: file.lastModified }),
  );
  const asset = await request<Asset>(`/clients/${clientId}/assets`, { method: 'POST', body });
  const base = `/clients/${clientId}/references/${asset.id}`;
  if (opts.folderId) await put(`${base}/folder`, { folderId: opts.folderId });
  const name = opts.name?.trim();
  if (name && name !== asset.name) await put(`${base}/name`, { name, revision: 0 });
  let startError = '';
  if (opts.analyze) {
    try {
      await post<StoryboardState>(`/clients/${clientId}/assets/${asset.id}/storyboard`, {
        revision: 0,
        confirmed: true,
      });
    } catch (e) {
      startError = (e as Error).message;
    }
  }
  return { asset, startError };
}
