import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Sparkles, LockKeyhole, Unlock, Download, Plus, Trash2 } from 'lucide-react';
import {
  Header,
  Field,
  Modal,
  Empty,
  useData,
  useWorkspace,
  useAction,
  Loading,
  ErrorState,
} from '../components/UI';
import { request, post, put, fileUrl } from '../api';
import { recipes } from './Content';
import {
  newProject,
  categories,
  formats,
  type Project,
  type ProjectInput,
  type Shot,
  type Asset,
  type Campaign,
  type Job,
} from '../types';
export default function Studio() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { client, notify } = useWorkspace();
  const cache = useQueryClient();
  const action = useAction();
  const [form, setForm] = useState<ProjectInput>(() => newProject(client.category));
  const [stage, setStage] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [activeShot, setActiveShot] = useState(0);
  const [provider, setProvider] = useState('LOCAL');
  const [notice, setNotice] = useState('');
  const [variants, setVariants] = useState(false);
  const hydrated = useRef('');
  const data = useQuery({
    queryKey: [client.id, 'project', id],
    queryFn: () => request<Project>(`/clients/${client.id}/projects/${id}`),
    enabled: !!id,
  });
  const assets = useData<Asset[]>('assets');
  const campaigns = useData<Campaign[]>('campaigns');
  const jobs = useData<Job[]>('jobs', true);
  const system = useQuery({
    queryKey: ['system'],
    queryFn: () => request<{ aiMode: string; videoProviderConnected: boolean; videoModel: string }>('/system'),
  });
  useEffect(() => {
    if (data.data && hydrated.current !== data.data.id) {
      hydrated.current = data.data.id;
      setForm(data.data);
      setStage(data.data.shots.length ? 1 : 0);
    }
  }, [data.data]);
  useEffect(() => {
    if (!id) {
      hydrated.current = '';
      const recipe = recipes.find((r) => r.id === params.get('recipe'));
      const initial = newProject(client.category);
      if (recipe) {
        initial.category = recipe.category;
        initial.format = recipe.format;
        initial.duration = recipe.duration;
        initial.config.recipeId = recipe.id;
        initial.shots = recipe.shots.map((visual, i) => ({
          duration:
            Math.floor(recipe.duration / recipe.shots.length) +
            (i < recipe.duration % recipe.shots.length ? 1 : 0),
          visual,
          narration: i === recipe.shots.length - 1 ? '查看商品详情' : '',
          assetId: null,
          startAt: 0,
          locked: false,
        }));
      }
      if (params.get('campaign')) initial.config.campaignId = params.get('campaign');
      setForm(initial);
      setStage(0);
    }
  }, [id, client.category, params]);
  const set = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const updateShot = (index: number, changes: Partial<Shot>) =>
    set(
      'shots',
      form.shots.map((s, i) => (i === index ? { ...s, ...changes } : s)),
    );
  const visual =
    assets.data?.filter((a) => (a.mime.startsWith('image/') || a.mime.startsWith('video/')) &&
      (!Array.isArray(form.config.productAssetIds) || form.config.productAssetIds.includes(a.id) || form.shots.some(s => s.assetId === a.id))) ?? [];
  const total = form.shots.reduce((n, s) => n + s.duration, 0);
  const current = form.shots[activeShot] ?? form.shots[0];
  const preview = visual.find((a) => a.id === current?.assetId);
  const campaign = campaigns.data?.find((c) => c.id === form.config.campaignId);
  async function save(copy = false) {
    const saved =
      id && !copy
        ? await put<Project>(`/clients/${client.id}/projects/${id}`, form)
        : await post<Project>(`/clients/${client.id}/projects`, {
            ...form,
            name: copy ? (form.name + ' · 副本').slice(0, 150) : form.name,
            revision: 0,
          });
    hydrated.current = saved.id;
    setForm(saved);
    cache.setQueryData([client.id, 'project', saved.id], saved);
    await cache.invalidateQueries({ queryKey: [client.id, 'projects'] });
    await cache.invalidateQueries({ queryKey: [client.id, 'works'] });
    if (!id || copy) navigate('/studio/' + saved.id, { replace: true });
    return saved;
  }
  async function draft(p: Project) {
    const result = await post<{ shots: Shot[]; notice: string }>(
      `/clients/${client.id}/projects/${p.id}/draft`,
      {},
    );
    const ids = Array.isArray(p.config.productAssetIds) ? (p.config.productAssetIds as string[]).filter(id => visual.some(a => a.id === id)) : [];
    const shots = result.shots.map((shot, index) => ({ ...shot, assetId: shot.assetId || (ids.length ? ids[index % ids.length] : null) }));
    const saved = await put<Project>(`/clients/${client.id}/projects/${p.id}`, { ...p, shots });
    setForm(saved);
    cache.setQueryData([client.id, 'project', p.id], saved);
    setNotice(result.notice);
  }
  const edit = editing === null ? null : form.shots[editing];
  if (id && data.isPending) return <Loading />;
  if (data.error) return <ErrorState error={data.error} />;
  return (
    <>
      <Header
        title={stage === 0 ? '直接做视频' : stage === 1 ? '确认这一条的效果' : '出片与审片'}
        description={id ? form.name : ''}
      >
        <button
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              await save();
            }, '作品已保存')
          }
        >
          <Save size={16} />
          保存作品
        </button>
        {id && <button onClick={() => setVariants(true)}>场景变体</button>}
        {id && (
          <a className="button" href={`/api/clients/${client.id}/projects/${id}/export`}>
            <Download size={16} />
            脚本 JSON
          </a>
        )}
      </Header>
      <div className="work-context">
        {form.config.creationMode === 'VIDEO_REMAKE' && <span className="pill">视频二创模式</span>}
        {campaign ? (
          <Link to={'/projects/' + campaign.id}>{campaign.name}</Link>
        ) : (
          <span>未归入交付项目</span>
        )}
        <Link to="/tasks">分工与接力</Link>
        <Link to="/gallery">样片拍法</Link>
      </div>
      {form.config.creationMode === 'VIDEO_REMAKE' && <p className="hint">已按参考片结构创建二创分镜。请核对每镜的商品画面、参考素材和新台词；参考片未作为成片素材使用。
        {campaign && <Link to={`/projects/${campaign.id}/remake`}>制作另一条二创视频</Link>}
      </p>}
      {campaign && <div className="project-flow"><span>① {campaign.name}</span><span>② {String(form.config.productName ?? '商品资料')}</span><strong>③ 视频方案与分镜</strong><span>④ 生成视频</span><span>⑤ 审片交付</span></div>}
      <div className="stepper">
        {['商品 / 角色', '方案确认', '出片 / 审片'].map((label, i) => (
          <button key={label} className={stage === i ? 'current' : ''} onClick={() => setStage(i)}>
            <b>{i + 1}</b>
            {label}
          </button>
        ))}
      </div>
      {action.error && <ErrorState error={new Error(action.error)} />}
      {action.error.includes('已更新') && (
        <div className="conflict-actions">
          <button
            onClick={() =>
              action.run(async () => {
                const latest = await data.refetch();
                if (latest.data) {
                  setForm(latest.data);
                  notify('已读取服务端版本');
                }
              })
            }
          >
            读取服务端版本
          </button>
          <button
            onClick={() =>
              action.run(async () => {
                await save(true);
              }, '本地改动已另存为作品副本')
            }
          >
            另存作品副本
          </button>
          <p>保存失败时本地编辑仍保留，读取服务端版本会替换编辑器内容。</p>
        </div>
      )}
      <div className="studio-grid">
        <section className="panel studio-panel">
          {stage === 0 ? (
            <>
              <h2>商品与卖点</h2>
              {!!form.config.productAnchorId && <div className="hint">已带入商品：{String(form.config.productName)} · {Array.isArray(form.config.productAssetIds) ? form.config.productAssetIds.length : 0} 份素材。资料按创建时保存，不会随商品库修改而自动覆盖。
                <Link to={`/assets?product=${form.config.productAnchorId}${campaign ? `&campaign=${campaign.id}` : ''}`}>查看商品分析</Link>
              </div>}
              <div className="form-grid">
                <Field label="作品名称">
                  <input
                    required
                    maxLength={150}
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="例如：白T · 细节展示"
                  />
                </Field>
                <Field label="商品 SKU">
                  <input
                    maxLength={100}
                    value={form.sku}
                    onChange={(e) => set('sku', e.target.value)}
                  />
                </Field>
                <Field label="内容平台">
                  <select value={form.platform} onChange={(e) => set('platform', e.target.value)}>
                    {['抖音', '小红书', 'TikTok', '视频号'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="所属交付项目">
                  <select
                    value={String(form.config.campaignId ?? '')}
                    onChange={(e) => set('config', { ...form.config, campaignId: e.target.value })}
                  >
                    <option value="">暂不归入项目</option>
                    {campaigns.data
                      ?.filter((c) => !c.archived)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <details>
                <summary>
                  品类与拍法 · {form.category} / {form.format}
                </summary>
                <div className="form-grid">
                  <Field label="商品品类">
                    <select value={form.category} onChange={(e) => set('category', e.target.value)}>
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="内容拍法">
                    <select value={form.format} onChange={(e) => set('format', e.target.value)}>
                      {[...new Set([...formats, ...recipes.map((r) => r.format)])].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="成片时长 / 秒">
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={form.duration}
                      onChange={(e) => set('duration', Number(e.target.value))}
                    />
                  </Field>
                </div>
              </details>
              <Field label="本条要讲的已确认卖点">
                <textarea
                  rows={5}
                  maxLength={8000}
                  value={form.facts}
                  onChange={(e) => {
                    set('facts', e.target.value);
                    set('factsConfirmed', false);
                  }}
                  placeholder="只填写已确认的商品事实；价格、成分、功效未知时标注待确认。"
                />
              </Field>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={form.factsConfirmed}
                  onChange={(e) => set('factsConfirmed', e.target.checked)}
                />
                商品资料与参考授权已核对
              </label>
              <details>
                <summary>出镜、声音与后期</summary>
                <div className="form-grid">
                  {[
                    ['MODEL', '模特参考', 'modelId'],
                    ['VOICE', '声音参考', 'voiceId'],
                    ['GARMENT', '服装参考', 'garmentId'],
                  ].map(([kind, label, key]) => (
                    <Field key={key} label={label}>
                      <select
                        value={String(form.config[key] ?? '')}
                        onChange={(e) => set('config', { ...form.config, [key]: e.target.value })}
                      >
                        <option value="">不指定</option>
                        {assets.data
                          ?.filter((a) => a.kind === kind)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  ))}
                  <Field label="行动文案">
                    <input
                      value={String(form.config.cta ?? '')}
                      maxLength={100}
                      onChange={(e) => set('config', { ...form.config, cta: e.target.value })}
                    />
                  </Field>
                </div>
                <p className="caption">
                  参考引用存入脚本；人物生成、声音混音未接入。本地粗剪仅合成逐镜画面。
                </p>
              </details>
              <div className="form-footer">
                <Link to="/assets" className="button">
                  上传商品素材
                </Link>
                <button
                  className="primary"
                  disabled={action.busy || !form.factsConfirmed}
                  onClick={() =>
                    action.run(async () => {
                      const p = await save();
                      if (!p.shots.length) await draft(p);
                      setStage(1);
                    })
                  }
                >
                  {form.shots.length ? '查看已有方案' : '生成本条分镜方案'}
                </button>
              </div>
              {!form.shots.length && <p className="caption">{system.data?.aiMode === 'openai' ? '生成方案会调用当前文字模型，使用模型额度；不会提交视频生成。' : '按本地规则生成分镜草稿。'}</p>}
            </>
          ) : stage === 1 ? (
            <>
              <div className="row between">
                <h2>拍摄方案</h2>
                <span className={`pill ${total !== form.duration ? 'warning' : ''}`}>
                  {total} / {form.duration}s · {form.shots.length} 镜 · {form.platform}
                </span>
              </div>
              <div className="plan-facts">
                <div>
                  <small>商品证明</small>
                  <p>{form.facts}</p>
                </div>
                <div>
                  <small>行动落点</small>
                  <p>{String(form.config.cta ?? '查看商品详情')}</p>
                </div>
              </div>
              <div className="row wrap">
                <button
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      const p = await save();
                      await draft(p);
                    })
                  }
                >
                  <Sparkles size={16} />
                  {system.data?.aiMode === 'openai' ? 'AI 编导草稿' : '重排未锁定镜头'}
                </button>
                <button
                  onClick={() => {
                    set('shots', [
                      ...form.shots,
                      {
                        duration: 3,
                        visual: '填写画面与动作',
                        narration: '',
                        assetId: null,
                        startAt: 0,
                        locked: false,
                      },
                    ]);
                    setEditing(form.shots.length);
                  }}
                  disabled={form.shots.length >= 20}
                >
                  <Plus size={16} />
                  添加镜头
                </button>
              </div>
              {notice && <div className="caption">{notice}</div>}
              <Field label="默认画面素材">
                <select
                  value=""
                  onChange={(e) => {
                    const assetId = e.target.value;
                    if (assetId)
                      set(
                        'shots',
                        form.shots.map((s) => (s.locked ? s : { ...s, assetId })),
                      );
                  }}
                >
                  <option value="">为未锁定镜头选择实际素材</option>
                  {visual.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              {!form.shots.length && (
                <Empty title="尚未建立镜头单" description="生成编导草稿，或手动添加镜头。" />
              )}
              <div className="plan-shots">
                {form.shots.map((s, i) => (
                  <article className={activeShot === i ? 'active' : ''} key={i}>
                    <button className="shot-time" onClick={() => setActiveShot(i)}>
                      {form.shots.slice(0, i).reduce((n, x) => n + x.duration, 0)}–
                      {form.shots.slice(0, i + 1).reduce((n, x) => n + x.duration, 0)}s
                    </button>
                    <div>
                      <strong>镜头 {String(i + 1).padStart(2, '0')}</strong>
                      <p>{s.narration || '尚未填写台词'}</p>
                      <details>
                        <summary>画面安排</summary>
                        <p>{s.visual}</p>
                        <small>
                          {visual.find((a) => a.id === s.assetId)?.name ?? '尚未引用实际画面素材'}
                        </small>
                      </details>
                    </div>
                    <button
                      onClick={() => {
                        setActiveShot(i);
                        setEditing(i);
                      }}
                    >
                      改这镜
                    </button>
                    <button
                      className="icon-button"
                      aria-label={s.locked ? '解锁镜头' : '锁定镜头'}
                      onClick={() => updateShot(i, { locked: !s.locked })}
                    >
                      {s.locked ? <LockKeyhole size={15} /> : <Unlock size={15} />}
                    </button>
                  </article>
                ))}
              </div>
              <div className="form-footer">
                <button onClick={() => setStage(0)}>返回修改</button>
                <button
                  className="primary"
                  disabled={action.busy || !form.shots.length || total !== form.duration}
                  onClick={() =>
                    action.run(async () => {
                      await save();
                      setStage(2);
                    })
                  }
                >
                  确认方案，进入制作
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>制作方式</h2>
              <div className="provider-options">
                {[
                  ['LOCAL', '本地素材粗剪', '真实素材 → 竖屏 MP4 + 独立 SRT，无音轨混音'],
                  ['VIDEO_API', '外部视频生成', system.data?.videoProviderConnected ? `调用 ${system.data.videoModel}；使用首个引用素材，提交后按供应商账户计费` : '视频供应商尚未启用；提交不会调用外部 API'],
                ].map(([value, label, desc]) => (
                  <label key={value} className={provider === value ? 'selected' : ''}>
                    <input
                      type="radio"
                      checked={provider === value}
                      onChange={() => setProvider(value)}
                    />
                    <strong>{label}</strong>
                    <p>{desc}</p>
                  </label>
                ))}
              </div>
              <dl className="summary">
                <div>
                  <dt>已引用画面</dt>
                  <dd>
                    {form.shots.filter((s) => s.assetId).length} / {form.shots.length} 镜
                  </dd>
                </div>
                <div>
                  <dt>规格</dt>
                  <dd>720 × 1280 · 25fps · {form.duration}s</dd>
                </div>
                <div>
                  <dt>模型费用</dt>
                  <dd>{provider === 'LOCAL' ? '无模型费用' : system.data?.videoProviderConnected ? '按供应商账户实际价格计费' : '视频 API 未启用'}</dd>
                </div>
              </dl>
              <div className="form-footer">
                <button
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      await post(`/clients/${client.id}/presets`, {
                        name: form.name + ' · 配方',
                        kind: 'RECIPE',
                        content: JSON.stringify(form),
                        enabled: true,
                      });
                    }, '配方已保存到客户知识')
                  }
                >
                  存为客户配方
                </button>
                <button
                  className="primary"
                  disabled={action.busy}
                  onClick={() => {
                    if (provider === 'VIDEO_API' && system.data?.videoProviderConnected && !window.confirm(`提交后将调用 ${system.data.videoModel}，费用按供应商账户实际价格计收。确认提交？`)) return;
                    action.run(async () => {
                      const p = await save();
                      await post(`/clients/${client.id}/jobs`, { projectIds: [p.id], provider });
                      await cache.invalidateQueries({ queryKey: [client.id] });
                      navigate(campaign ? '/queue?campaign=' + campaign.id : '/queue');
                      notify('制作任务已创建');
                    })
                  }}
                >
                  确认并提交 1 条任务
                </button>
              </div>
              {id && (
                <div className="result-versions">
                  <h3>本作品的制作版本</h3>
                  {jobs.data
                    ?.filter((j) => j.projectId === id)
                    .map((j) => (
                      <Link key={j.id} to={'/review?job=' + j.id + (campaign ? '&campaign=' + campaign.id : '')}>
                        V{j.revision} · {j.message}
                      </Link>
                    ))}
                </div>
              )}
            </>
          )}
        </section>
        <aside>
          <div className="panel preview-panel">
            <div className="panel-heading">
              <h3>编排预览</h3>
              <span className="pill">非生成</span>
            </div>
            <div className="vertical-preview">
              {preview ? (
                preview.mime.startsWith('video/') ? (
                  <video key={preview.id} controls src={fileUrl(client.id, preview.id)} />
                ) : (
                  <img src={fileUrl(client.id, preview.id)} alt={preview.name} />
                )
              ) : (
                <div className="preview-placeholder">
                  <span>选择商品画面</span>
                  <Link to="/assets">准备素材 ↗</Link>
                </div>
              )}
              {current?.narration && <div className="story-subtitle">{current.narration}</div>}
            </div>
            <div className="frame-strip">
              {form.shots.map((s, i) => (
                <button
                  key={i}
                  className={activeShot === i ? 'active' : ''}
                  onClick={() => setActiveShot(i)}
                >
                  {i + 1}
                  <small>{s.duration}s</small>
                </button>
              ))}
            </div>
            <p className="caption preview-note">已有素材编排预览，不含新生成动作。</p>
          </div>
        </aside>
      </div>
      {edit && editing !== null && (
        <Modal title={'修改第 ' + (editing + 1) + ' 镜'} onClose={() => setEditing(null)}>
          <Field label="画面与动作">
            <textarea
              rows={4}
              disabled={edit.locked}
              maxLength={2000}
              value={edit.visual}
              onChange={(e) => updateShot(editing, { visual: e.target.value })}
            />
          </Field>
          <Field label="台词 / 旁白">
            <textarea
              disabled={edit.locked}
              maxLength={1000}
              value={edit.narration ?? ''}
              onChange={(e) => updateShot(editing, { narration: e.target.value })}
            />
          </Field>
          <div className="form-grid">
            <Field label="时长 / 秒">
              <input
                disabled={edit.locked}
                type="number"
                min={1}
                max={60}
                value={edit.duration}
                onChange={(e) => updateShot(editing, { duration: Number(e.target.value) })}
              />
            </Field>
            <Field label="素材起点 / 秒">
              <input
                disabled={edit.locked}
                type="number"
                min={0}
                max={3600}
                value={edit.startAt}
                onChange={(e) => updateShot(editing, { startAt: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="实际画面素材">
            <select
              disabled={edit.locked}
              value={edit.assetId ?? ''}
              onChange={(e) => updateShot(editing, { assetId: e.target.value || null })}
            >
              <option value="">待选择</option>
              {visual.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="row between">
            <button
              disabled={edit.locked}
              onClick={() => {
                set(
                  'shots',
                  form.shots.filter((_, i) => i !== editing),
                );
                setEditing(null);
              }}
            >
              <Trash2 size={15} />
              删除此镜
            </button>
            <button className="primary" onClick={() => setEditing(null)}>
              保存本镜修改
            </button>
          </div>
          <p className="caption">
            仅更新当前编辑草稿；点击“保存作品”后写入后端。已锁定镜头请先解锁。
          </p>
        </Modal>
      )}
      {variants && (
        <Modal title="场景变体（最多三条）" onClose={() => setVariants(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              action.run(async () => {
                const scenes = String(fd.get('scenes'))
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (!scenes.length || scenes.length > 3)
                  throw new Error('请填写 1–3 个场景，每行一个');
                const source = await save();
                await post(`/clients/${client.id}/projects/${source.id}/variants`, { scenes });
                await cache.invalidateQueries({ queryKey: [client.id] });
                setVariants(false);
                navigate('/content');
              }, '已创建场景变体草稿，尚未调用模型');
            }}
          >
            <Field label="新场景（每行一个）">
              <textarea name="scenes" required maxLength={240} placeholder={'居家窗边\n办公室'} />
            </Field>
            <p className="hint">
              保留商品、台词、镜头顺序和素材引用，逐条重新确认场景与商品事实。此操作只创建草稿，不提交生成。
            </p>
            {action.error && <ErrorState error={new Error(action.error)} />}
            <button className="primary" disabled={action.busy}>
              创建变体草稿
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
