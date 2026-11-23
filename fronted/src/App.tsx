import { useEffect, useState } from 'react';
import { Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Film } from 'lucide-react';
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
import VideoRemake from './pages/VideoRemake';
import ProjectEcommerceStart from './pages/ProjectEcommerceStart';
import Shell, { Legacy } from './gy/Shell';
import ProductList from './pages/products/ProductList';
import ProductNew from './pages/products/ProductNew';
import ProductDetail from './pages/products/ProductDetail';
import ProductReview from './pages/products/ProductReview';
import ReferenceList from './pages/references/ReferenceList';
import ReferenceDetail from './pages/references/ReferenceDetail';
import { ReferencePickerDemo } from './pages/references/ReferencePicker';
export default function App() {
  const cache = useQueryClient();
  const navigate = useNavigate();
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
      <Shell
        client={client}
        clients={clients.data ?? []}
        username={me.data.username}
        onSwitch={(id) => {
          setActive(id);
          localStorage.setItem('shangzhen-client', id);
          navigate('/');
        }}
        onCreateClient={() => setCreating(true)}
        onLogout={async () => {
          await request('/auth/logout', { method: 'POST' });
          resetCsrf();
          cache.clear();
          navigate('/');
          me.refetch();
        }}
      >
        <Routes>
          <Route path="/" element={<Legacy page={<Campaigns />} />} />
          <Route path="/projects/:id" element={<Legacy page={<CampaignDetail />} />} />
          <Route path="/projects/:id/remake" element={<Legacy page={<VideoRemake />} />} />
          <Route
            path="/projects/:id/ecommerce"
            element={<Legacy page={<ProjectEcommerceStart />} />}
          />
          <Route path="/tasks" element={<Legacy page={<Tasks />} />} />
          <Route path="/content" element={<Legacy page={<ContentHome />} />} />
          <Route path="/gallery" element={<Legacy page={<Gallery />} />} />
          <Route path="/team" element={<Legacy page={<Team />} />} />
          <Route path="/studio" element={<Legacy page={<Studio />} />} />
          <Route path="/studio/:id" element={<Legacy page={<Studio />} />} />
          <Route path="/batch" element={<Legacy page={<Batch />} />} />
          <Route path="/queue" element={<Legacy page={<Queue />} />} />
          <Route path="/review" element={<Legacy page={<Queue reviewOnly />} />} />
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/new" element={<ProductNew />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/products/:id/review" element={<ProductReview />} />
          <Route path="/assets" element={<Legacy page={<Assets key="assets" />} />} />
          <Route path="/models" element={<Legacy page={<Assets key="models" kind="MODEL" />} />} />
          <Route
            path="/wardrobe"
            element={<Legacy page={<Assets key="wardrobe" kind="GARMENT" />} />}
          />
          <Route path="/voices" element={<Legacy page={<Assets key="voices" kind="VOICE" />} />} />
          <Route path="/references" element={<ReferenceList />} />
          <Route path="/references/:id" element={<ReferenceDetail />} />
          {/* 旧的参考片拆解页地址，跳到新的参考视频库 */}
          <Route path="/reference" element={<Navigate to="/references" replace />} />
          {import.meta.env.DEV && (
            <Route path="/dev/reference-picker" element={<ReferencePickerDemo />} />
          )}
          <Route path="/analytics" element={<Legacy page={<Analytics />} />} />
          <Route path="/presets" element={<Legacy page={<Presets />} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
      {toast && (
        <div className="gy-toast gy-new" role="status">
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
