import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api';
import { useWorkspace } from '../../components/UI';
import type { Me } from '../team/data';

/**
 * 投流数据回流（PRD《投流数据回流模块 v1.0》）：千川账户、导入、素材 / 商品 / 账户看板、投放建议。
 * 接口见 backend/API.md「投流数据回流（V14）」。金额是元，比例是百分数；没有数据就是 null，页面写「—」，不估算。
 * 系统不调用千川接口、不执行任何投放操作；投放建议只记录用户的决定。
 */
export interface Account {
  id: string;
  name: string;
  advertiserId: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED';
  clientId: string;
  clientName?: string;
  createdAt: string;
  createdBy: string;
  revision: number;
}
export interface Measures {
  netRoi?: number | null;
  netGmv?: number | null;
  netOrders?: number | null;
  netSettleRate?: number | null;
  refundRate1h?: number | null;
  overallRoi?: number | null;
  totalGmv?: number | null;
  totalCost?: number | null;
  totalOrders?: number | null;
  coupon?: number | null;
  dataDays?: number | null;
  from?: string | null;
  to?: string | null;
}
export interface MaterialRow extends Measures {
  jobId: string;
  standardName?: string | null;
  title: string;
  productId?: string | null;
  productName?: string;
  coverId?: string | null;
  creator?: string | null;
  ratio?: string;
}
export interface Summary {
  totalCost?: number | null;
  netGmv?: number | null;
  netOrders?: number | null;
  avgNetRoi?: number | null;
  avgRefundRate1h?: number | null;
  materialCount?: number | null;
  totalGmv?: number | null;
  overallRoi?: number | null;
  from?: string | null;
  to?: string | null;
}
export interface Option {
  id: string;
  name: string;
}
export interface MaterialBoard {
  summary: Summary;
  items: MaterialRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  order: 'asc' | 'desc';
  options: {
    accounts: (Option & { advertiserId: string })[];
    products: Option[];
    creators: Option[];
  };
}
export interface ProductRow {
  productId?: string | null;
  productName: string;
  coverId?: string | null;
  materialCount: number;
  netGmv?: number | null;
}
export interface AccountRow extends Account, Measures {
  materialCount: number;
}
export interface Overview {
  pendingSuggestions: number;
  accounts: number;
  hasData: boolean;
  from?: string | null;
  to?: string | null;
}
export type SuggestionStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'DONE';
export interface Suggestion {
  id: string;
  ruleKey: string;
  ruleName: string;
  type: 'STOP' | 'INCREASE_BUDGET' | 'ITERATE' | 'CHECK';
  typeLabel: string;
  reason: string;
  snapshot: Measures & { rule?: string };
  dataThrough: string;
  status: SuggestionStatus;
  revision: number;
  createdAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
  job: {
    id: string;
    standardName?: string | null;
    title: string;
    productName?: string;
    coverId?: string | null;
  };
}
export interface Rule {
  key: string;
  name: string;
  type: string;
  typeLabel: string;
  enabled: boolean;
  params: Record<string, number>;
  defaults: Record<string, number>;
  condition: string;
  revision: number;
}
export interface CampaignStats {
  hasData: boolean;
  summary?: Measures;
  trend?: { date: string; netRoi?: number | null; cost?: number | null; netGmv?: number | null }[];
  through?: string;
}

export const base = (client: string) => `/clients/${client}/analytics`;

/** 投手、客户负责人、管理员能导入、管账户、处理建议；内容制作和只读只能看（后端同样拦着） */
export function useCanOperate() {
  const me = useQuery<Me | null>({ queryKey: ['me'], queryFn: () => request<Me>('/auth/me') });
  const role = me.data?.role;
  return !role || role === 'ADMIN' || role === 'LEAD' || role === 'BUYER';
}
export function useOverview() {
  const { client } = useWorkspace();
  return useQuery({
    queryKey: [client.id, 'analytics', 'overview'],
    queryFn: () => request<Overview>(`${base(client.id)}/overview`),
  });
}
export function useAccounts() {
  const { client } = useWorkspace();
  return useQuery({
    queryKey: [client.id, 'analytics', 'accounts', ''],
    queryFn: () => request<{ items: AccountRow[] }>(`${base(client.id)}/accounts`),
  });
}
export function useRefreshAnalytics() {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  return () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: [client.id, 'analytics'] }),
      cache.invalidateQueries({ queryKey: [client.id, 'video-library'] }),
      cache.invalidateQueries({ queryKey: [client.id, 'video'] }),
    ]);
}

// ---------- 数字 ----------
const zh = (x: number, d: number) =>
  x.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
export const yuan = (x?: number | null) => (x == null ? '—' : `¥${zh(x, x % 1 ? 2 : 0)}`);
export const num = (x?: number | null) => (x == null ? '—' : zh(x, 0));
export const roi = (x?: number | null) => (x == null ? '—' : x.toFixed(2));
export const rate = (x?: number | null) => (x == null ? '—' : `${x.toFixed(1)}%`);
/** 看板高亮：净 ROI ≥ 3 绿、< 1 红；1 小时退款率 > 30% 红 */
export const roiTone = (x?: number | null) =>
  x == null ? '' : x >= 3 ? 'good' : x < 1 ? 'bad' : '';
export const refundTone = (x?: number | null) => (x != null && x > 30 ? 'bad' : '');

/** 把筛选参数拼成查询串（空的不带） */
export function qs(params: Record<string, string | number | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
export const FILTER_KEYS = ['start', 'end', 'accountId', 'product', 'creator', 'job'] as const;

export const STATUS_LABEL: Record<SuggestionStatus, string> = {
  PENDING: '待处理',
  ACCEPTED: '已接受',
  REJECTED: '已忽略',
  DONE: '已执行',
};
export const PARAM_LABEL: Record<string, [string, string]> = {
  refundRate1h: ['1 小时退款率高于', '%'],
  minCost: ['累计消耗高于', '元'],
  netRoi: ['净 ROI', ''],
  netOrders: ['净成交订单至少', '单'],
  days: ['数据至少', '天'],
  settleRate: ['净结算率低于', '%'],
};
