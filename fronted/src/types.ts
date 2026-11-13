export interface Client {
  id: string;
  name: string;
  category: string;
  createdAt: string;
}
export interface Shot {
  duration: number;
  visual: string;
  narration: string;
  assetId: string | null;
  startAt: number;
  locked: boolean;
}
export interface Project {
  id: string;
  clientId: string;
  name: string;
  sku: string;
  category: string;
  platform: string;
  format: string;
  duration: number;
  facts: string;
  factsConfirmed: boolean;
  shots: Shot[];
  config: Record<string, unknown>;
  status: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export type ProjectInput = Omit<Project, 'id' | 'clientId' | 'status' | 'createdAt' | 'updatedAt'>;
export interface Asset {
  id: string;
  clientId: string;
  name: string;
  kind: string;
  sku: string;
  tags: string;
  mime: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface Job {
  id: string;
  clientId: string;
  projectId: string;
  name: string;
  provider: string;
  status: string;
  progress: number;
  message: string;
  hasOutput: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface Preset {
  id: string;
  name: string;
  kind: string;
  content: string;
  enabled: boolean;
}
export interface Review {
  author: string;
  timecode: number;
  decision: string;
  comment: string;
  createdAt: string;
}
export const categories = [
  '服饰鞋包',
  '美妆个护',
  '食品饮料',
  '家居百货',
  '3C数码',
  '宠物用品',
  '信息流漫剧',
];
export const formats = [
  '真人口播',
  '上身试穿',
  '场景穿搭',
  '细节演示',
  '使用教程',
  '多款混剪',
  '参考片改编',
  '剧情种草',
];
export const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  SCRIPT_READY: '脚本就绪',
  QUEUED: '排队中',
  RUNNING: '制作中',
  BLOCKED: '待接入',
  REVIEW: '待审核',
  CHANGES_REQUESTED: '需修改',
  DELIVERED: '已交付',
  FAILED: '制作失败',
};
export const kindLabel: Record<string, string> = {
  PRODUCT: '商品素材',
  REFERENCE: '参考视频',
  MODEL: '模特',
  GARMENT: '服装',
  VOICE: '声音',
  OTHER: '其他素材',
};
export const newProject = (category = '服饰鞋包'): ProjectInput => ({
  name: '',
  sku: '',
  category,
  platform: '抖音',
  format: '细节演示',
  duration: 15,
  facts: '',
  factsConfirmed: false,
  shots: [],
  config: { cta: '查看商品详情', scene: '居家窗边', style: '日常聊天' },
  revision: 0,
});

export interface Campaign {
  id: string;
  name: string;
  ownerName: string;
  dueDate: string | null;
  targetCount: number;
  brief: string;
  archived: boolean;
  revision: number;
  workCount: number;
  deliveredCount: number;
  reviewCount: number;
  blockedCount: number;
}
export interface Work {
  id: string;
  name: string;
  sku: string;
  format: string;
  duration: number;
  campaignId: string | null;
  assignee: string;
  phase: string;
  dueDate: string | null;
  note: string;
  revision: number;
  jobStatus: string | null;
}
export interface Contact {
  id: string;
  name: string;
  responsibility: string;
}
export const phases: Record<string, string> = {
  PLAN: '待方案确认',
  MATERIALS: '待资源补齐',
  PRODUCTION: '待制作',
  EDIT: '待剪辑',
  REVIEW: '待审片',
  CHANGES: '需修改',
  DELIVERED: '已交付',
  WAITING_SYSTEM: '等待系统',
};
