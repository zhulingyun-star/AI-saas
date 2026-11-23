import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api';
import { useData, useWorkspace } from '../../components/UI';
import { productGroups, type ProductGroup } from '../../productGroups';
import type { Asset } from '../../types';
import type { Folder } from '../../gy/folders';

export { folderPath, folderScope, type Folder } from '../../gy/folders';

export interface AnalysisSummary {
  status: string;
  revision: number;
  model?: string;
  analyzedAt?: string;
  stale?: boolean;
  error?: string;
  hasReport: boolean;
  category?: string;
  confirmCount?: number;
  unverifiedCount?: number;
  provableCount?: number;
  riskCount?: number;
}
export interface LibraryProduct {
  groupId: string;
  anchorId: string;
  folderId?: string | null;
  analysis?: AnalysisSummary | null;
  reviewed: boolean;
  confirmed: string[];
  understandingSaved: boolean;
  personaCount: number;
  projectCount: number;
}
export interface Library {
  folders: Folder[];
  products: Record<string, LibraryProduct>;
}
export type Row<K extends string> = Record<K, string>;
export interface Report {
  category?: string;
  audience?: string;
  tone?: string;
  summary?: string;
  appearance?: string;
  material?: string;
  usage?: string;
  operation?: string;
  styling?: string;
  colors?: string[];
  pain_points?: string[];
  pitch_lines?: string[];
  confirm?: string[];
  showcase_points?: Row<'part' | 'where' | 'what'>[];
  provable_points?: Row<'claim' | 'evidence' | 'how'>[];
  image_views?: Row<'image' | 'view'>[];
  fit_types?: Row<'type' | 'why'>[];
  exaggeration_risks?: Row<'point' | 'why'>[];
}
export interface Analysis {
  status: string;
  brief: string;
  revision: number;
  report?: Report;
  stale: boolean;
  model?: string;
  error?: string;
  analyzedAt?: string;
  sources?: { assets: { id: string; mime: string }[] };
}
export const SECTIONS = [
  ['core', '核心卖点', '图片里看得到'],
  ['sub', '次要卖点', '展示细节'],
  ['pain', '用户痛点', '推断'],
  ['obj', '购买顾虑', '来自“需要确认”'],
  ['scene', '使用场景', '适用场景 + 搭配'],
  ['when', '购买时机', '资料里没有，AI 推断'],
] as const;
export type SectionKey = (typeof SECTIONS)[number][0];
export type UnderstandingContent = Record<SectionKey, string[]>;
export const HOOKS = [
  '痛点型',
  '反常识型',
  '对比型',
  '结果前置型',
  '价格型',
  '人群锁定型',
  '悬念型',
  '身份代入型',
] as const;
export interface Persona {
  id?: string | null;
  name: string;
  pain: string;
  want: string;
  tone: string;
  scene: string;
  worry: string;
  hooks: string[];
  revision: number;
}
export interface Understanding {
  hasAnalysis: boolean;
  saved: boolean;
  understanding: UnderstandingContent;
  source: 'DERIVED' | 'EDITED' | 'AI' | 'EMPTY';
  editedCount: number;
  revision: number;
  aiEnabled: boolean;
  personasSaved: boolean;
  personas: Persona[];
}

export interface ProductItem {
  key: string;
  group: ProductGroup;
  anchorId: string;
  info?: LibraryProduct;
  folderId: string | null;
  images: Asset[];
}

export function useLibrary() {
  const { client } = useWorkspace();
  const assets = useData<Asset[]>('assets');
  const library = useQuery({
    queryKey: [client.id, 'product-library'],
    queryFn: () => request<Library>(`/clients/${client.id}/product-library`),
  });
  const folders = library.data?.folders ?? [];
  const products: ProductItem[] = productGroups(assets.data ?? []).map((group) => {
    const info = library.data?.products[group.key];
    const folderId =
      info?.folderId && folders.some((f) => f.id === info.folderId) ? info.folderId : null;
    return {
      key: group.key,
      group,
      anchorId: group.assets[0].id,
      info,
      folderId,
      images: group.assets.filter((a) => a.mime.startsWith('image/')),
    };
  });
  return {
    assets,
    library,
    folders,
    products,
    isPending: assets.isPending || library.isPending,
    error: assets.error ?? library.error,
  };
}

export function useRefreshLibrary() {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  return () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: [client.id, 'assets'] }),
      cache.invalidateQueries({ queryKey: [client.id, 'product-library'] }),
    ]);
}

/** 需要核对：还没分析、分析失败、分析结果没核对完或已过时 */
export function needsReview(p: ProductItem) {
  const a = p.info?.analysis;
  if (!a) return true;
  if (['QUEUED', 'RUNNING'].includes(a.status)) return false;
  if (!a.hasReport) return true;
  return !p.info?.reviewed || !!a.stale;
}
export function analysisLabel(p: ProductItem): [string, string] {
  const a = p.info?.analysis;
  if (!a) return ['还没分析', 'none'];
  if (a.status === 'QUEUED') return ['排队分析中', 'check'];
  if (a.status === 'RUNNING') return ['分析中', 'check'];
  if (a.status === 'FAILED' && a.hasReport) return ['有结果 · 最近一次重新分析失败', 'check'];
  if (a.status === 'FAILED') return ['分析失败', 'bad'];
  if (a.stale) return ['有结果 · 商品资料改过', 'check'];
  if (!p.info?.reviewed) return ['有结果 · 待核对', 'check'];
  return ['已核对', 'ok'];
}
export function isUnverified(evidence: string | undefined) {
  return (evidence ?? '').includes('待验证');
}
/** 分析里的「图片N」引用 → 当次分析使用的第 N 张图片 */
export function evidenceImages(evidence: string | undefined, count: number) {
  if (!evidence || !/图/.test(evidence)) return [];
  return Array.from(new Set((evidence.match(/\d+/g) ?? []).map(Number))).filter(
    (n) => n >= 1 && n <= count,
  );
}
export function analysisImages(analysis: Analysis | undefined, fallback: Asset[]) {
  const ids = analysis?.sources?.assets.filter((a) => a.mime.startsWith('image/')).map((a) => a.id);
  return ids?.length ? ids : fallback.map((a) => a.id);
}
export function shortDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
