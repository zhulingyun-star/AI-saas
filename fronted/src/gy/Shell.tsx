import { useState, type ReactNode, type ComponentType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChartNoAxesCombined,
  ChevronDown,
  Clapperboard,
  Film,
  Images,
  Layers,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  LogOut,
  Mic,
  PanelLeft,
  Plus,
  Shirt,
  User,
  Video,
} from 'lucide-react';
import type { Client } from '../types';
import ProductSidebar from '../pages/products/Sidebar';
import ReferenceSidebar from '../pages/references/Sidebar';
import ProjectSidebar from '../pages/projects/Sidebar';
import LibrarySidebar from '../pages/library/Sidebar';
import TeamSidebar from '../pages/team/Sidebar';

type Icon = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>;
type NavItem = { to: string; label: string; icon: Icon; also?: string[] };
type Section = {
  key: string;
  label: string;
  home: string;
  paths: string[];
  groups?: [string, NavItem[]][];
};

/** 顶部五个主栏目。旧页面先挂在对应栏目下，原有路由都还能直接打开。 */
export const SECTIONS: Section[] = [
  {
    key: 'proj',
    label: '项目',
    home: '/',
    paths: [
      '/',
      '/p',
      '/campaigns',
      '/projects',
      '/tasks',
      '/content',
      '/batch',
      '/studio',
      '/presets',
    ],
    groups: [
      [
        '项目',
        [
          { to: '/', label: '全部项目', icon: LayoutDashboard, also: ['/projects'] },
          { to: '/tasks', label: '我的待办', icon: ListTodo },
        ],
      ],
      [
        '制作',
        [
          { to: '/content', label: '快捷制作', icon: Clapperboard, also: ['/studio'] },
          { to: '/batch', label: '批量排产', icon: Layers },
        ],
      ],
      ['资料', [{ to: '/presets', label: '客户知识', icon: BookOpen }]],
    ],
  },
  { key: 'goods', label: '商品库', home: '/products', paths: ['/products'] },
  { key: 'refs', label: '参考视频', home: '/references', paths: ['/references', '/reference'] },
  {
    key: 'assets',
    label: '资产库',
    home: '/library',
    paths: [
      '/library',
      '/gallery',
      '/queue',
      '/review',
      '/analytics',
      '/assets',
      '/models',
      '/wardrobe',
      '/voices',
    ],
    groups: [
      [
        '视频',
        [
          { to: '/gallery', label: '样片广场', icon: Film },
          { to: '/queue', label: '生成任务', icon: Video },
          { to: '/review', label: '审片交付', icon: ListChecks },
          { to: '/analytics', label: '投放数据', icon: ChartNoAxesCombined },
        ],
      ],
      [
        '素材',
        [
          { to: '/assets', label: '全部素材', icon: Images },
          { to: '/models', label: '模特', icon: User },
          { to: '/wardrobe', label: '服装搭配', icon: Shirt },
          { to: '/voices', label: '声音', icon: Mic },
        ],
      ],
    ],
  },
  {
    key: 'team',
    label: '团队管理',
    home: '/team',
    paths: ['/team'],
  },
];

const within = (pathname: string, base: string) =>
  base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(base + '/');
export const sectionOf = (pathname: string) =>
  SECTIONS.find((s) => s.paths.some((p) => within(pathname, p))) ?? SECTIONS[0];

function readCollapsed() {
  try {
    return localStorage.getItem('gy-side-collapsed') === '1';
  } catch {
    return false;
  }
}

export default function Shell({
  client,
  clients,
  username,
  displayName,
  roleLabel,
  canCreateClient = true,
  onSwitch,
  onCreateClient,
  onLogout,
  children,
}: {
  client: Client;
  clients: Client[];
  username: string;
  displayName?: string;
  roleLabel?: string;
  /** 只有管理员能新建客户（后端也会拦） */
  canCreateClient?: boolean;
  onSwitch: (id: string) => void;
  onCreateClient: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const section = sectionOf(pathname);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem('gy-side-collapsed', next ? '1' : '0');
    } catch {
      /* 浏览器不让存也没关系 */
    }
  };
  return (
    <div className={`gy gy-app${collapsed ? ' gy-collapsed' : ''}`}>
      <header className="gy-top gy-new">
        <button
          type="button"
          className="gy-toggle"
          aria-label={collapsed ? '展开左栏' : '收起左栏'}
          aria-expanded={!collapsed}
          onClick={toggle}
        >
          <PanelLeft size={18} />
        </button>
        <Link to="/" className="gy-wordmark" aria-label="光影云首页">
          光影<em>云</em>
        </Link>
        <nav className="gy-tnav" aria-label="主栏目">
          {SECTIONS.map((s) => (
            <Link key={s.key} to={s.home} aria-current={s.key === section.key ? 'page' : undefined}>
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="gy-top-right">
          <span className="gy-client">
            客户
            <select
              aria-label="切换客户"
              value={client.id}
              onChange={(e) => onSwitch(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="chev" aria-hidden="true" />
            {canCreateClient && (
              <button
                type="button"
                className="gy-icon-btn"
                aria-label="新建客户"
                title="新建客户"
                onClick={onCreateClient}
              >
                <Plus size={14} />
              </button>
            )}
          </span>
          <span className="gy-username" title={`登录账号 ${username}`}>
            {displayName ?? username}
            {roleLabel ? ` · ${roleLabel}` : ''}
          </span>
          <span className="gy-avatar" aria-hidden="true">
            {(displayName ?? username).slice(0, 1).toUpperCase()}
          </span>
          <button
            type="button"
            className="gy-icon-btn"
            title="退出登录"
            aria-label="退出登录"
            onClick={onLogout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <div className="gy-body">
        <aside className="gy-side gy-new" aria-label={`${section.label}导航`}>
          {section.key === 'proj' ? (
            <ProjectSidebar />
          ) : section.key === 'goods' ? (
            <ProductSidebar />
          ) : section.key === 'refs' ? (
            <ReferenceSidebar />
          ) : section.key === 'assets' ? (
            <LibrarySidebar />
          ) : section.key === 'team' ? (
            <TeamSidebar />
          ) : (
            <>
              <nav className="gy-snav" aria-label={`${section.label}子页面`}>
                {section.groups?.map(([group, items]) => (
                  <div key={group} style={{ display: 'contents' }}>
                    <div className="g">{group}</div>
                    {items.map((it) => {
                      const active = [it.to, ...(it.also ?? [])].some((p) => within(pathname, p));
                      return (
                        <Link
                          key={it.to}
                          to={it.to}
                          title={it.label}
                          aria-current={active ? 'page' : undefined}
                        >
                          <it.icon size={16} aria-hidden="true" />
                          <span className="lbl">{it.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
              <div className="gy-side-foot">
                <b>{client.name}</b>
                {client.category}
              </div>
            </>
          )}
        </aside>
        <main className="gy-main" key={client.id}>
          {children}
        </main>
      </div>
    </div>
  );
}

/** 旧页面在新框架里的容器：沿用旧样式，只去掉与左栏重复的页内导航。 */
export function Legacy({ page }: { page: ReactNode }) {
  return <div className="gy-legacy">{page}</div>;
}
