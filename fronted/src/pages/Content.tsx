import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Star, Plus, ArrowRight } from 'lucide-react';
import {
  Header,
  Empty,
  Field,
  Modal,
  ErrorState,
  useData,
  useWorkspace,
  useAction,
} from '../components/UI';
import { ProductionNav } from '../components/ProductionNav';
import { WorkList } from './Campaigns';
import { post, put } from '../api';
import { categories, type Preset, type Contact } from '../types';
export const recipes = [
  {
    id: 'try-on',
    name: '先看上身，再看细节',
    category: '服饰鞋包',
    format: '上身试穿',
    duration: 15,
    image: 'fashion.jpg',
    shots: ['正面全身展示', '侧面与背面版型', '领口、袖口与面料近景', '商品收尾'],
  },
  {
    id: 'talk',
    name: '一句口播，接一个商品近景',
    category: '服饰鞋包',
    format: '真人口播',
    duration: 15,
    image: 'shirt.jpg',
    shots: ['口播开场', '展示商品整体', '商品特写与证据', '行动落点'],
  },
  {
    id: 'details',
    name: '不出镜，三镜讲清一件商品',
    category: '服饰鞋包',
    format: '细节演示',
    duration: 10,
    image: 'shoe.jpg',
    shots: ['商品整体', '细节近景', '商品与行动落点'],
  },
  {
    id: 'beauty',
    name: '质地先入镜，步骤接着讲',
    category: '美妆个护',
    format: '手部试用',
    duration: 15,
    image: 'beauty.jpg',
    shots: ['包装与规格', '实拍质地', '真实使用步骤', '商品收尾'],
  },
  {
    id: 'food',
    name: '开袋见实物，再讲配料规格',
    category: '食品饮料',
    format: '开袋试吃',
    duration: 15,
    image: '',
    shots: ['包装配料', '实物展示', '分享场景', '商品收尾'],
  },
  {
    id: 'home',
    name: '先摆出问题，再演示用法',
    category: '家居百货',
    format: '痛点演示',
    duration: 15,
    image: '',
    shots: ['具体生活问题', '商品结构', '真实使用步骤', '结果回收'],
  },
  {
    id: 'digital',
    name: '一个功能，一段真实操作',
    category: '3C数码',
    format: '使用教程',
    duration: 15,
    image: '',
    shots: ['明确使用目标', '接口与开关', '真实操作录屏', '使用结果'],
  },
  {
    id: 'pet',
    name: '养宠日常，商品自然入镜',
    category: '宠物用品',
    format: '养宠日常',
    duration: 10,
    image: '',
    shots: ['真实生活场景', '商品使用方式', '规格与收尾'],
  },
  {
    id: 'drama',
    name: '一次生活冲突，一个自然转折',
    category: '信息流漫剧',
    format: '剧情种草',
    duration: 15,
    image: '',
    shots: ['角色关系与问题', '冲突推进', '商品合理介入', '转折与落点'],
  },
];
export function ContentHome() {
  return (
    <>
      <Header title="内容制作" description="">
        <Link className="button primary" to="/studio">
          直接做视频
          <Plus size={16} />
        </Link>
      </Header>
      <ProductionNav />
      <div className="quick-start">
        <Link to="/">
          <h2>从项目开始（推荐）</h2>
          <p>建立项目 → 选商品 → 制作视频 → 审片交付</p>
          <ArrowRight size={20} />
        </Link>
        <Link to="/studio">
          <h2>直接做视频</h2>
          <p>商品资料 → 方案确认 → 出片与审片</p>
          <ArrowRight size={20} />
        </Link>
        <Link to="/gallery">
          <h2>从样片拍法开始</h2>
          <p>选择镜头结构，换入自己的商品</p>
          <ArrowRight size={20} />
        </Link>
        <Link to="/batch">
          <h2>批量排产</h2>
          <p>保留资料，控制拍法与开场变量</p>
          <ArrowRight size={20} />
        </Link>
      </div>
      <div className="section-heading">
        <h2>已有作品</h2>
        <Link className="text-link" to="/review">
          审片与交付 ↗
        </Link>
      </div>
      <WorkList />
    </>
  );
}
export function Gallery() {
  const [category, setCategory] = useState('全部品类');
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<(typeof recipes)[number] | null>(null);
  const favorites = useData<Preset[]>('presets');
  const action = useAction();
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const isFavorite = (id: string) =>
    favorites.data?.some((p) => p.kind === 'FAVORITE' && p.content === id && p.enabled);
  const list = recipes.filter(
    (r) =>
      (category === '全部品类' || r.category === category) &&
      (tab === 'all' || isFavorite(r.id)) &&
      (r.name + r.format).includes(query),
  );
  return (
    <>
      <Header title="样片广场" description="" />
      <ProductionNav />
      <div className="toolbar">
        <select
          aria-label="样片品类"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option>全部品类</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="样片范围" value={tab} onChange={(e) => setTab(e.target.value)}>
          <option value="all">推荐拍法</option>
          <option value="favorites">我的收藏</option>
        </select>
        <input
          className="project-search"
          aria-label="搜索样片"
          placeholder="搜索拍法或名称"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {action.error && <ErrorState error={new Error(action.error)} />}
      <div className="recipe-grid">
        {list.map((r) => (
          <article className="recipe-card" key={r.id}>
            <button className="recipe-cover" onClick={() => setSelected(r)}>
              {r.image ? (
                <img src={'/demo/' + r.image} alt={r.name} />
              ) : (
                <div className={'recipe-art art-' + r.id}>
                  <span>{r.category}</span>
                  <b>{r.format}</b>
                </div>
              )}
              <span className="pill">拍法示例 · 非生成成片</span>
            </button>
            <div className="recipe-body">
              <h3>{r.name}</h3>
              <small>
                {r.category} · {r.duration}s · {r.format}
              </small>
              <div className="row between">
                <button
                  className="icon-button"
                  aria-label={'收藏 ' + r.name}
                  aria-pressed={isFavorite(r.id) ?? false}
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      const existing = favorites.data?.find(
                        (p) => p.kind === 'FAVORITE' && p.content === r.id,
                      );
                      if (existing)
                        await put(`/clients/${client.id}/presets/${existing.id}`, {
                          ...existing,
                          enabled: !existing.enabled,
                        });
                      else
                        await post(`/clients/${client.id}/presets`, {
                          name: r.name,
                          kind: 'FAVORITE',
                          content: r.id,
                          enabled: true,
                        });
                      await cache.invalidateQueries({ queryKey: [client.id, 'presets'] });
                    })
                  }
                >
                  <Star size={17} fill={isFavorite(r.id) ? 'currentColor' : 'none'} />
                </button>
                <button onClick={() => setSelected(r)}>查看并套用</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!list.length && <Empty title="没有匹配的拍法" description="调整筛选，或先收藏一个拍法。" />}
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="recipe-shot-list">
            {selected.shots.map((s, i) => (
              <div key={s}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                {s}
              </div>
            ))}
          </div>
          <div className="hint">
            只套用镜头结构，不复制示例中的商品事实、价格或人物授权。请上传自己的素材并核对事实。
          </div>
          <Link className="button primary" to={'/studio?recipe=' + selected.id}>
            换成我的商品
          </Link>
        </Modal>
      )}
    </>
  );
}
export function ResourceHub() {
  const [kind, setKind] = useState('PRODUCT');
  return (
    <>
      <div className="resource-tabs section-tabs">
        {[
          ['PRODUCT', '商品素材', '/assets'],
          ['MODEL', '模特', '/models'],
          ['GARMENT', '服装搭配', '/wardrobe'],
          ['VOICE', '声音', '/voices'],
          ['REFERENCE', '参考片', '/reference'],
        ].map(([k, label, path]) => (
          <Link key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)} to={path}>
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}
export function Team() {
  const data = useData<Contact[]>('team');
  const { client, username } = useWorkspace();
  const action = useAction();
  const cache = useQueryClient();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Header title="团队与费用" description="">
        <button className="primary" onClick={() => setAdding(true)}>
          新增分工联系人
        </button>
      </Header>
      <div className="panel padded">
        <h2>分工联系人</h2>
        <p className="caption">
          联系人用于作品责任分配，不创建登录账号或授予客户访问权限。当前登录：{username}。
        </p>
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>负责环节</th>
            </tr>
          </thead>
          <tbody>
            {data.data?.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.responsibility}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.data?.length && (
          <Empty title="还没有分工联系人" description="也可以直接把作品分配给当前账号。" />
        )}
      </div>
      <div className="panel padded">
        <h2>接口与费用</h2>
        <dl className="summary">
          <div>
            <dt>本地粗剪</dt>
            <dd>使用上传素材，无模型费用</dd>
          </div>
          <div>
            <dt>外部视频生成</dt>
            <dd>供应商未接入</dd>
          </div>
          <div>
            <dt>预算 / 支付 / 结算</dt>
            <dd>待配置正式协议</dd>
          </div>
        </dl>
        <p className="caption">真实文本模型由后端环境变量配置，密钥不会返回浏览器。</p>
      </div>
      {adding && (
        <Modal title="新增分工联系人" onClose={() => setAdding(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              action.run(async () => {
                await post(`/clients/${client.id}/team`, Object.fromEntries(fd));
                await cache.invalidateQueries({ queryKey: [client.id, 'team'] });
                setAdding(false);
              });
            }}
          >
            <Field label="联系人姓名">
              <input required maxLength={100} name="name" />
            </Field>
            <Field label="负责环节">
              <select name="responsibility">
                {['编导', '制作', '剪辑', '审核', '项目负责人'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            {action.error && <ErrorState error={new Error(action.error)} />}
            <button disabled={action.busy} className="primary">
              保存联系人
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
