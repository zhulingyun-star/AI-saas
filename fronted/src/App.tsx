import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Clapperboard,
  FolderOpen,
  SlidersHorizontal,
  ChartNoAxesCombined,
  Users,
  LogOut,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUpRight,
  Film,
} from 'lucide-react';
import { request, post, resetCsrf } from './api';
import { Workspace, Loading, ErrorState, Modal, Field } from './components/UI';
import type { Client } from './types';
import { categories } from './types';
import Campaigns, { CampaignDetail, Tasks } from './pages/Campaigns';
import { ContentHome, Gallery, Team } from './pages/Content';
import Studio from './pages/Studio';
import Assets from './pages/Assets';
import Queue from './pages/Queue';
import Batch from './pages/Batch';
import Presets from './pages/Presets';
import Analytics from './pages/Analytics';
import Reference from './pages/Reference';
const links = [
  ['/', '项目与制作', LayoutDashboard],
  ['/content', '内容制作', Clapperboard],
  ['/assets', '资源中心', FolderOpen],
  ['/presets', '客户知识', SlidersHorizontal],
  ['/analytics', '投放复盘', ChartNoAxesCombined],
  ['/team', '团队与费用', Users],
] as const;
export default function App() {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const selectedSection =
    ['/projects', '/tasks', '/queue', '/review'].some((p) => pathname.startsWith(p)) ||
    pathname === '/'
      ? '/'
      : ['/studio', '/gallery', '/batch'].some((p) => pathname.startsWith(p))
        ? '/content'
        : ['/models', '/wardrobe', '/voices', '/reference'].some((p) => pathname.startsWith(p))
          ? '/assets'
          : pathname;
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => request<{ username: string }>('/auth/me'),
  });
  const clients = useQuery({
    queryKey: ['clients'],
    queryFn: () => request<Client[]>('/clients'),
    enabled: !!me.data,
  });
  const [active, setActive] = useState(() => localStorage.getItem('shangzhen-client') ?? '');
  const [toast, setToast] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  useEffect(() => {
    const onUnauthorized = () => {
      cache.setQueryData(['me'], null);
    };
    window.addEventListener('unauthorized', onUnauthorized);
    return () => window.removeEventListener('unauthorized', onUnauthorized);
  }, [cache]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const client = clients.data?.find((c) => c.id === active) ?? clients.data?.[0];
  if (me.isPending) return <Loading />;
  if (!me.data)
    return (
      <Login
        onLogin={() => {
          cache.clear();
          me.refetch();
        }}
      />
    );
  if (clients.isPending) return <Loading />;
  if (clients.error) return <ErrorState error={clients.error} retry={() => clients.refetch()} />;
  const createDialog = creating && (
    <Modal title="新建客户空间" onClose={() => setCreating(false)}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setCreateError('');
          try {
            const c = await post<Client>('/clients', Object.fromEntries(fd));
            await cache.invalidateQueries({ queryKey: ['clients'] });
            setActive(c.id);
            localStorage.setItem('shangzhen-client', c.id);
            setCreating(false);
            navigate('/');
          } catch (err) {
            setCreateError((err as Error).message);
          }
        }}
      >
        <Field label="客户名称">
          <input name="name" required maxLength={100} placeholder="例如：新品牌 · 内容组" />
        </Field>
        <Field label="主营品类">
          <select name="category">
            {categories.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        {createError && <ErrorState error={new Error(createError)} />}
        <button className="primary" type="submit">
          创建客户空间
        </button>
      </form>
    </Modal>
  );
  if (!client)
    return (
      <>
        <button onClick={() => setCreating(true)}>创建第一个客户</button>
        {createDialog}
      </>
    );
  return (
    <Workspace.Provider value={{ client, username: me.data.username, notify: setToast }}>
      <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
        <aside className="sidebar">
          <NavLink to="/" className="brand">
            <div className="brand-icon">
              <Film size={22} />
            </div>
            <span>
              心流<small>电商内容生产</small>
            </span>
          </NavLink>
          <div className="workspace-label">客户工作空间</div>
          <div className="client-select">
            <select
              aria-label="切换客户"
              value={client.id}
              onChange={(e) => {
                setActive(e.target.value);
                localStorage.setItem('shangzhen-client', e.target.value);
                navigate('/');
              }}
            >
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button onClick={() => setCreating(true)} aria-label="新建客户">
              <Plus size={16} />
            </button>
          </div>
          <nav>
            {links.map(([path, label, Icon]) => (
              <NavLink
                end={path === '/'}
                key={path}
                to={path}
                className={() => (selectedSection === path ? 'active' : '')}
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <span className="connection-dot" />
            <span>服务端存储 · 客户工作空间</span>
            <small>WORKBENCH / 0.1</small>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="row">
              <button
                aria-label="切换侧栏"
                className="icon-button"
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
              <span className="top-client">{client.name}</span>
              <span className="pill">{client.category}</span>
            </div>
            <div className="row">
              <span className="muted">{me.data.username}</span>
              <button
                className="icon-button"
                title="退出登录"
                onClick={async () => {
                  await request('/auth/logout', { method: 'POST' });
                  resetCsrf();
                  cache.clear();
                  navigate('/');
                  me.refetch();
                }}
              >
                <LogOut size={17} />
              </button>
            </div>
          </header>
          <main key={client.id}>
            <Routes>
              <Route path="/" element={<Campaigns />} />
              <Route path="/projects/:id" element={<CampaignDetail />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/content" element={<ContentHome />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/team" element={<Team />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/studio/:id" element={<Studio />} />
              <Route path="/batch" element={<Batch />} />
              <Route path="/queue" element={<Queue />} />
              <Route path="/review" element={<Queue reviewOnly />} />
              <Route path="/assets" element={<Assets key="assets" />} />
              <Route path="/models" element={<Assets key="models" kind="MODEL" />} />
              <Route path="/wardrobe" element={<Assets key="wardrobe" kind="GARMENT" />} />
              <Route path="/voices" element={<Assets key="voices" kind="VOICE" />} />
              <Route path="/reference" element={<Reference />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/presets" element={<Presets />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <footer className="page-footer">
            心流 · 电商内容生产 <span>事实 → 脚本 → 制作 → 审核 → 交付</span>
          </footer>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {createDialog}
    </Workspace.Provider>
  );
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <section className="login-story">
        <div className="brand">
          <Film size={28} />
          <span>
            心流<small>电商内容生产工作台</small>
          </span>
        </div>
        <div className="login-film">
          <img src="/demo/fashion.jpg" alt="服饰拍法示例" />
          <div>
            <span>商品与素材</span>
            <span>方案与分镜</span>
            <span>审片与交付</span>
          </div>
        </div>
        <small>示例图片 · 不代表模型生成效果</small>
      </section>
      <section className="login-form">
        <h2>登录工作空间</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setBusy(true);
            const fd = new FormData(e.currentTarget);
            try {
              await post('/auth/login', Object.fromEntries(fd));
              onLogin();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="账号">
            <input name="username" autoComplete="username" required />
          </Field>
          <Field label="密码">
            <input name="password" type="password" autoComplete="current-password" required />
          </Field>
          {error && <ErrorState error={new Error(error)} />}
          <button className="primary" disabled={busy}>
            {busy ? '登录中…' : '进入工作空间'}
            <ArrowUpRight size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}
