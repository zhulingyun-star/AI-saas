import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api';

/** 团队管理的数据：成员、角色、负责的客户、工作负荷。都来自 /api/team，权限由后端判断。 */

export type Role = 'ADMIN' | 'LEAD' | 'BUYER' | 'MAKER' | 'VIEWER';
export type Status = 'ACTIVE' | 'PENDING' | 'DISABLED';

export interface Me {
  username: string;
  displayName: string;
  role?: Role;
  roleLabel?: string;
  status?: Status;
  owner?: boolean;
  canManage?: boolean;
}
export interface TeamClient {
  id: string;
  name: string;
  category?: string;
}
export interface Member {
  username: string;
  displayName: string;
  role: Role;
  status: Status;
  owner: boolean;
  you: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  revision: number;
  allClients: boolean;
  clients: TeamClient[];
}
export interface TeamData {
  members: Member[];
  clients: TeamClient[];
  canManage: boolean;
  you: string;
}
export interface TeamEvent {
  actor: string;
  action: string;
  target: string;
  detail: string;
  createdAt: string;
}
export interface LoadItem {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  mode: string;
  path: string;
  state: string;
  inProgress: boolean;
  running: number;
  unreviewed: number;
  versions: number;
  updatedAt: string;
}
export interface LoadMember {
  username: string;
  displayName: string;
  role: Role;
  status: Status;
  you: boolean;
  projects: number;
  inProgress: number;
  unreviewed: number;
  running: number;
  reviewedThisWeek: number;
  items: LoadItem[];
}
export interface LoadClient {
  id: string;
  name: string;
  leads: string[];
  members: number;
  projects: number;
  inProgress: number;
  unreviewed: number;
  running: number;
}
export interface Workload {
  members: LoadMember[];
  clients: LoadClient[];
  unassignedProjects: number;
}

export const ROLES: { key: Role; label: string; desc: string; avatar: string }[] = [
  { key: 'ADMIN', label: '管理员', desc: '进全部客户，开通和管理成员', avatar: '#f3e3c6' },
  {
    key: 'LEAD',
    label: '客户负责人',
    desc: '负责的客户里什么都能做，可以改客户知识',
    avatar: '#dbe7f5',
  },
  { key: 'BUYER', label: '投手', desc: '做项目、审片、填写和导入投放数据', avatar: '#d7efdf' },
  {
    key: 'MAKER',
    label: '内容制作',
    desc: '做项目、改分镜和出片；投放数据只能看',
    avatar: '#efe3cf',
  },
  { key: 'VIEWER', label: '只读', desc: '只能查看，不能修改', avatar: '#ece7df' },
];
export const roleOf = (r?: string) => ROLES.find((x) => x.key === r) ?? ROLES[4];
export const STATUS_LABEL: Record<Status, string> = {
  ACTIVE: '正常',
  PENDING: '待首次登录',
  DISABLED: '已停用',
};

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => request<Me>('/auth/me') });
}
export function useTeam() {
  return useQuery({
    queryKey: ['team', 'members'],
    // 缺字段时按空处理，页面不因为接口少返回什么而崩
    queryFn: async (): Promise<TeamData> => {
      const d = await request<Partial<TeamData>>('/team/members');
      return {
        members: Array.isArray(d?.members) ? d.members : [],
        clients: Array.isArray(d?.clients) ? d.clients : [],
        canManage: !!d?.canManage,
        you: d?.you ?? '',
      };
    },
  });
}
export function useTeamEvents(enabled: boolean) {
  return useQuery({
    queryKey: ['team', 'events'],
    queryFn: () => request<TeamEvent[]>('/team/events'),
    enabled,
  });
}
export function useWorkload() {
  return useQuery({
    queryKey: ['team', 'workload'],
    queryFn: async (): Promise<Workload> => {
      const d = await request<Partial<Workload>>('/team/workload');
      return {
        members: Array.isArray(d?.members) ? d.members : [],
        clients: Array.isArray(d?.clients) ? d.clients : [],
        unassignedProjects: d?.unassignedProjects ?? 0,
      };
    },
  });
}
/** 改完成员以后：成员列表、事件、工作负荷和客户列表（管理员新建 / 分配会影响）一起刷新 */
export function useTeamRefresh() {
  const cache = useQueryClient();
  return () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ['team'] }),
      cache.invalidateQueries({ queryKey: ['clients'] }),
    ]);
}

/** 后端时间是 UTC、不带时区的 LocalDateTime */
function parse(value?: string | null) {
  if (!value) return null;
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : value + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}
const pad = (n: number) => String(n).padStart(2, '0');
export function when(value?: string | null, empty = '—') {
  const d = parse(value);
  if (!d) return empty;
  const now = new Date();
  const mins = (now.getTime() - d.getTime()) / 60000;
  if (mins < 2) return '刚刚';
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `昨天 ${hm}`;
  return `${d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '-'}${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
}
export function withinDays(value: string | null, days: number) {
  const d = parse(value);
  return !!d && Date.now() - d.getTime() <= days * 86400000;
}
export const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
