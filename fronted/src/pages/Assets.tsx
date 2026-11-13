import ResourceNav from '../components/ResourceNav';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Search, Download, Image, Play, AudioLines, Shirt } from 'lucide-react';
import {
  Header,
  Empty,
  Modal,
  Field,
  useData,
  useWorkspace,
  useAction,
  Loading,
  ErrorState,
} from '../components/UI';
import { request, post, put, fileUrl } from '../api';
import { kindLabel, type Asset } from '../types';
export default function Assets({ kind }: { kind?: string }) {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const data = useData<Asset[]>('assets');
  const action = useAction();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(kind ?? 'ALL');
  const [upload, setUpload] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [look, setLook] = useState<string[]>([]);
  const reload = () => cache.invalidateQueries({ queryKey: [client.id, 'assets'] });
  const list =
    data.data?.filter(
      (a) =>
        (filter === 'ALL' || a.kind === filter) &&
        `${a.name} ${a.sku} ${a.tags}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  const title =
    kind === 'MODEL'
      ? '模特库'
      : kind === 'GARMENT'
        ? '服装搭配'
        : kind === 'VOICE'
          ? '音色与口播'
          : '商品与素材';
  return (
    <>
      <ResourceNav />
      <Header
        title={title}
        description={
          kind === 'MODEL'
            ? '保留人物参考与授权记录；人物生成能力等待供应商接入。'
            : kind === 'GARMENT'
              ? '管理各部位服装，保存搭配参考；搭配单不是生成的上身图。'
              : kind === 'VOICE'
                ? '上传并试听真人录音。声音克隆与自动配音等待供应商接入。'
                : '把商品图、实拍片段与使用证据，变成可以反复引用的团队资产。'
        }
      >
        <button className="primary" onClick={() => setUpload(true)}>
          <Upload size={16} />
          上传{kind ? kindLabel[kind] : '素材'}
        </button>
      </Header>
      {action.error && <ErrorState error={new Error(action.error)} />}
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="搜索素材"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称、SKU 或标签"
          />
        </div>
        {!kind && (
          <select aria-label="素材分类" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">全部素材</option>
            {Object.entries(kindLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
        <span className="muted">{list.length} 个文件</span>
      </div>
      {kind === 'GARMENT' && (
        <div className="hint row between">
          <span>选择不同部位服装，保存客户搭配参考（已选 {look.length} 件）</span>
          <button
            disabled={!look.length || action.busy}
            onClick={() =>
              action.run(async () => {
                const picked = data.data!.filter((a) => look.includes(a.id));
                const slots = picked.map((a) => String(a.metadata.slot ?? ''));
                if (slots.some((s) => !s)) throw new Error('请先为每件服装填写部位');
                if (
                  new Set(slots).size !== slots.length ||
                  (slots.includes('整身') && (slots.includes('上衣') || slots.includes('下装')))
                )
                  throw new Error('同部位只能选择一件，整身与上衣/下装互斥');
                await post(`/clients/${client.id}/presets`, {
                  name: picked
                    .map((a) => a.name)
                    .join(' + ')
                    .slice(0, 100),
                  kind: 'LOOK',
                  content: JSON.stringify(
                    picked.map((a) => ({ id: a.id, name: a.name, slot: a.metadata.slot })),
                  ),
                  enabled: true,
                });
                setLook([]);
              }, '搭配参考已保存')
            }
          >
            <Shirt size={16} />
            保存搭配
          </button>
        </div>
      )}
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} />
      ) : !list.length ? (
        <section className="panel">
          <Empty
            title="把第一份真实素材放进来"
            description="上传后可在脚本中引用；文件存储在服务端，刷新后仍可使用。"
          >
            <button onClick={() => setUpload(true)}>上传素材</button>
          </Empty>
        </section>
      ) : (
        <div className="asset-grid">
          {list.map((a) => (
            <article className="asset-card" key={a.id}>
              <button
                className="asset-media"
                onClick={() => setSelected(a)}
                aria-label={'查看 ' + a.name}
              >
                {a.mime.startsWith('image/') ? (
                  <img loading="lazy" src={fileUrl(client.id, a.id)} alt={a.name} />
                ) : a.mime.startsWith('video/') ? (
                  <>
                    <video preload="metadata" src={fileUrl(client.id, a.id)} />
                    <Play className="media-symbol" />
                  </>
                ) : (
                  <AudioLines size={42} />
                )}
                <span className="pill">{kindLabel[a.kind]}</span>
              </button>
              <div className="asset-body">
                <button className="plain" onClick={() => setSelected(a)}>
                  <strong>{a.name}</strong>
                </button>
                <small>
                  {a.sku || '未关联 SKU'} · {(a.sizeBytes / 1024 / 1024).toFixed(2)} MB
                </small>
                <div className="tags">
                  {a.tags
                    .split(/[,，]/)
                    .filter(Boolean)
                    .map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                </div>
                {kind === 'GARMENT' && (
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={look.includes(a.id)}
                      onChange={(e) =>
                        setLook(e.target.checked ? [...look, a.id] : look.filter((x) => x !== a.id))
                      }
                    />
                    {String(a.metadata.slot ?? '待设置部位')}
                  </label>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {upload && (
        <Modal title="上传素材" onClose={() => setUpload(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const files = form.getAll('file') as File[];
              action.run(async () => {
                for (const file of files) {
                  const body = new FormData();
                  body.set('file', file);
                  body.set('kind', String(form.get('kind')));
                  body.set('sku', String(form.get('sku')));
                  body.set('tags', String(form.get('tags')));
                  await request(`/clients/${client.id}/assets`, { method: 'POST', body });
                }
                await reload();
                setUpload(false);
              }, '素材已上传到客户空间');
            }}
          >
            <Field label="文件（每个不超过 100MB）">
              <input
                type="file"
                name="file"
                required
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg"
              />
            </Field>
            <Field label="分类">
              <select name="kind" defaultValue={kind ?? 'PRODUCT'}>
                {Object.entries(kindLabel).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="商品 SKU">
                <input name="sku" maxLength={100} />
              </Field>
              <Field label="标签（逗号分隔）">
                <input name="tags" maxLength={500} />
              </Field>
            </div>
            <div className="hint">
              请仅上传你拥有使用权的素材。模特与声音授权信息可在上传后补充。
            </div>
            {action.error && <ErrorState error={new Error(action.error)} />}
            <button className="primary" disabled={action.busy}>
              {action.busy ? '正在上传…' : '上传到客户空间'}
            </button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal title="素材详情与引用信息" onClose={() => setSelected(null)}>
          <div className="detail-media">
            {selected.mime.startsWith('image/') ? (
              <img src={fileUrl(client.id, selected.id)} alt={selected.name} />
            ) : selected.mime.startsWith('video/') ? (
              <video controls src={fileUrl(client.id, selected.id)} />
            ) : (
              <audio controls src={fileUrl(client.id, selected.id)} />
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.run(async () => {
                await put(`/clients/${client.id}/assets/${selected.id}`, selected);
                await reload();
                setSelected(null);
              }, '素材信息已保存');
            }}
          >
            <Field label="文件名称">
              <input
                required
                value={selected.name}
                onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                maxLength={255}
              />
            </Field>
            <div className="form-grid">
              <Field label="SKU">
                <input
                  value={selected.sku}
                  onChange={(e) => setSelected({ ...selected, sku: e.target.value })}
                  maxLength={100}
                />
              </Field>
              <Field label="标签">
                <input
                  value={selected.tags}
                  onChange={(e) => setSelected({ ...selected, tags: e.target.value })}
                  maxLength={500}
                />
              </Field>
            </div>
            {selected.kind === 'GARMENT' && (
              <Field label="服装部位">
                <select
                  value={String(selected.metadata.slot ?? '')}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      metadata: { ...selected.metadata, slot: e.target.value },
                    })
                  }
                >
                  <option value="">请选择部位</option>
                  {['外套', '上衣', '下装', '整身', '鞋履', '配饰'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="来源与授权说明">
              <textarea
                value={String(selected.metadata.authorization ?? '')}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    metadata: { ...selected.metadata, authorization: e.target.value },
                  })
                }
                maxLength={2000}
                placeholder="来源、授权主体、可使用范围与到期时间"
              />
            </Field>
            {action.error && <ErrorState error={new Error(action.error)} />}
            <div className="row between">
              <a className="button" href={fileUrl(client.id, selected.id) + '?download=true'}>
                <Download size={16} />
                下载原文件
              </a>
              <button className="primary" disabled={action.busy}>
                保存信息
              </button>
            </div>
          </form>
        </Modal>
      )}
      <div className="caption row">
        <Image size={14} />
        页面内示例图仅用于展示；业务素材仅来自当前客户的实际上传。
      </div>
    </>
  );
}
