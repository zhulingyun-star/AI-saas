import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Pencil, Plus, Sparkles } from 'lucide-react';
import { fileUrl, post, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import type { Asset } from '../../types';
import { Btn, Card, CardHead, Dialog, EmptyState, Field, Notice, Tabs } from '../../gy/ui';
import {
  analysisImages,
  analysisLabel,
  evidenceImages,
  folderPath,
  isUnverified,
  needsReview,
  useRefreshLibrary,
  type Analysis,
  type Report,
} from './data';
import { useProduct } from './useProduct';
import { PersonasCard, UnderstandingCard } from './Understanding';
import ImageViewer from './ImageViewer';
import ProductProjects from './ProductProjects';

const TABS = ['商品分析', '图片说明'] as const;
type Tab = (typeof TABS)[number];
type RowKey = 'provable_points' | 'exaggeration_risks' | 'fit_types' | 'showcase_points';
const EMPTY_ROW: Record<RowKey, Record<string, string>> = {
  provable_points: { claim: '', evidence: '待验证', how: '' },
  exaggeration_risks: { point: '', why: '' },
  fit_types: { type: '', why: '' },
  showcase_points: { part: '', where: '', what: '' },
};

export default function ProductDetail() {
  const { id = '' } = useParams();
  const { client, notify } = useWorkspace();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const refresh = useRefreshLibrary();
  const { product, folders, analysis, setAnalysis, endpoint, anchor, isPending, error } =
    useProduct(id);
  const [tab, setTab] = useState<Tab>('商品分析');
  const [draft, setDraft] = useState<Report | null>(null);
  const [draftRev, setDraftRev] = useState(0);
  const [img, setImg] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<'name' | 'sku' | null>(null);
  const [redo, setRedo] = useState(false);
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const status = analysis.data?.status;
  const prev = useRef(status);
  useEffect(() => {
    const was = prev.current;
    prev.current = status;
    if (
      was &&
      ['QUEUED', 'RUNNING'].includes(was) &&
      status &&
      !['QUEUED', 'RUNNING'].includes(status)
    ) {
      void refresh();
      void cache.invalidateQueries({ queryKey: [client.id, 'product-understanding', anchor] });
    }
  }, [status, refresh, cache, client.id, anchor]);

  if (isPending)
    return (
      <div className="gy-page gy-new">
        <span className="gy-muted">正在加载商品…</span>
      </div>
    );
  if (error || !product)
    return (
      <div className="gy-page gy-new">
        <button type="button" className="gy-backlink" onClick={() => navigate('/products')}>
          <ChevronLeft size={14} aria-hidden="true" />
          返回商品列表
        </button>
        <Card>
          <EmptyState title="没找到这个商品">
            {error ? (error as Error).message : '它可能属于别的客户，或者已经不在商品库里。'}
          </EmptyState>
        </Card>
      </div>
    );

  const a = analysis.data;
  const report = draft ?? a?.report;
  const running = ['QUEUED', 'RUNNING'].includes(a?.status ?? '');
  const images = product.images;
  const imageIds = images.map((x) => x.id);
  const srcIds = analysisImages(a, images);
  const coverId = product.group.cover.id;
  const editing = !!draft;
  const provable = report?.provable_points ?? [];
  const [label, tone] = analysisLabel(product);
  const pendingConfirm = (report?.confirm ?? []).filter((t) => !t.endsWith('（已补充）')).length;
  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      if (done) notify(done);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upd = <K extends keyof Report>(k: K, v: Report[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setCover = (assetId: string) =>
    run(async () => {
      await put(`${endpoint}/cover`, { assetId });
      await refresh();
    }, '封面已更新');
  const saveInfo = (productName: string, sku: string) =>
    run(
      async () => {
        await put(`/clients/${client.id}/product-groups/${anchor}`, { productName, sku });
        await refresh();
      },
      productName !== product.group.productName
        ? `商品已改名为「${productName}」`
        : '商品信息已保存',
    );
  const openImage = (assetId: string) => {
    const i = imageIds.indexOf(assetId);
    if (i < 0) return;
    setImg(i);
    setTab('图片说明');
  };
  const evThumbs = (ev: string | undefined) =>
    evidenceImages(ev, srcIds.length).map((n) => {
      const assetId = srcIds[n - 1];
      return (
        <button
          key={n}
          type="button"
          title={`图片${n}`}
          aria-label={`看图片${n}`}
          onClick={() => openImage(assetId)}
        >
          <img src={fileUrl(client.id, assetId)} alt="" />
        </button>
      );
    });

  // ---- 文字字段 ----
  const textField = (title: string, k: keyof Report) => (
    <div className="gy-uf">
      <span>{title}</span>
      {editing ? (
        <textarea
          className="gy-textarea"
          aria-label={title}
          maxLength={2000}
          rows={Math.min(6, Math.max(2, Math.ceil(String(report?.[k] ?? '').length / 46)))}
          value={String(report?.[k] ?? '')}
          onChange={(e) => upd(k, e.target.value as never)}
        />
      ) : (
        <div className="v">
          {String(report?.[k] ?? '') || <span className="gy-muted">暂无</span>}
        </div>
      )}
    </div>
  );
  const listEditor = (k: 'confirm' | 'pitch_lines' | 'pain_points', addLabel: string, max = 12) => {
    const list = report?.[k] ?? [];
    return (
      <>
        {list.map((t, i) => (
          <div className="gy-erow" key={i}>
            <textarea
              className="gy-textarea"
              rows={2}
              maxLength={600}
              aria-label={`${addLabel}${i + 1}`}
              value={t}
              onChange={(e) =>
                upd(
                  k,
                  list.map((x, n) => (n === i ? e.target.value : x)),
                )
              }
            />
            <button
              type="button"
              className="gy-icon-btn"
              aria-label="删除这条"
              onClick={() =>
                upd(
                  k,
                  list.filter((_, n) => n !== i),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
        {list.length < max && (
          <button type="button" className="gy-addrow" onClick={() => upd(k, [...list, ''])}>
            + {addLabel}
          </button>
        )}
      </>
    );
  };
  const rowsEditor = (k: RowKey, fields: [string, string][], addLabel: string) => {
    const list = (report?.[k] ?? []) as Record<string, string>[];
    const set = (i: number, f: string, v: string) =>
      upd(k, list.map((r, n) => (n === i ? { ...r, [f]: v } : r)) as never);
    return (
      <>
        {list.map((r, i) => (
          <div className="gy-ecard" key={i}>
            <div className="top2">
              <span>{fields[0][1]}</span>
              <button
                type="button"
                className="gy-icon-btn"
                aria-label="删除这条"
                onClick={() => upd(k, list.filter((_, n) => n !== i) as never)}
              >
                ×
              </button>
            </div>
            {fields.map(([f, l], fi) => (
              <div key={f} style={{ display: 'grid', gap: 4 }}>
                {fi > 0 && <span className="gy-fine">{l}</span>}
                <textarea
                  className="gy-textarea"
                  rows={fi ? 2 : 1}
                  maxLength={800}
                  aria-label={`${l}${i + 1}`}
                  value={r[f] ?? ''}
                  onChange={(e) => set(i, f, e.target.value)}
                />
              </div>
            ))}
            {k === 'provable_points' && (
              <>
                <span className="gy-fine">依据（点选图片）</span>
                <div className="gy-evpick">
                  {srcIds.map((assetId, n) => {
                    const nums = evidenceImages(r.evidence, srcIds.length);
                    const on = nums.includes(n + 1);
                    return (
                      <button
                        key={assetId}
                        type="button"
                        aria-label={`图片${n + 1}`}
                        aria-pressed={on}
                        onClick={() => {
                          const next = on
                            ? nums.filter((x) => x !== n + 1)
                            : [...nums, n + 1].sort((x, y) => x - y);
                          set(i, 'evidence', evidenceText(next, isUnverified(r.evidence)));
                        }}
                      >
                        <img src={fileUrl(client.id, assetId)} alt="" />
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="tv"
                    aria-pressed={isUnverified(r.evidence)}
                    onClick={() =>
                      set(
                        i,
                        'evidence',
                        evidenceText(
                          evidenceImages(r.evidence, srcIds.length),
                          !isUnverified(r.evidence),
                        ),
                      )
                    }
                  >
                    待验证
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {list.length < 12 && (
          <button
            type="button"
            className="gy-addrow"
            onClick={() => upd(k, [...list, { ...EMPTY_ROW[k] }] as never)}
          >
            + {addLabel}
          </button>
        )}
      </>
    );
  };
  const saveDraft = () =>
    run(async () => {
      if (!draft || !a) return;
      const clean = { ...draft } as Record<string, unknown>;
      for (const k of ['colors', 'pain_points', 'pitch_lines', 'confirm'] as const)
        clean[k] = (draft[k] ?? []).map((x) => x.trim()).filter(Boolean);
      const result = await put<Analysis>(`${endpoint}/analysis`, {
        revision: draftRev,
        brief: a.brief,
        report: clean,
      });
      setAnalysis(result);
      setDraft(null);
      await refresh();
      void cache.invalidateQueries({ queryKey: [client.id, 'product-understanding', anchor] });
    }, '商品分析已保存');

  const analysisTab = report ? (
    <div className="gy-und-grid">
      <Card pad editing={editing}>
        {textField('一句话', 'summary')}
        {textField('外观', 'appearance')}
        {textField('材质', 'material')}
        <div className="gy-f2">
          {textField('适用场景', 'usage')}
          {textField('使用方式', 'operation')}
        </div>
        {textField('搭配', 'styling')}
        <div className="gy-uf">
          <span>颜色</span>
          <div className="gy-chips">
            {(report.colors ?? []).map((c, i) => (
              <span className="gy-tag" key={`${c}${i}`}>
                {c}
                {editing && (
                  <button
                    type="button"
                    className="x"
                    aria-label={`删除 ${c}`}
                    onClick={() =>
                      upd(
                        'colors',
                        (report.colors ?? []).filter((_, n) => n !== i),
                      )
                    }
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {!editing && !(report.colors ?? []).length && <span className="gy-muted">暂无</span>}
            {editing && <ColorAdd onAdd={(v) => upd('colors', [...(report.colors ?? []), v])} />}
          </div>
        </div>
        <div className="gy-uf">
          <span>卖点文案</span>
          <div style={{ display: 'grid', gap: 6 }}>
            {editing
              ? listEditor('pitch_lines', '添加一条卖点文案')
              : (report.pitch_lines ?? []).map((t, i) => (
                  <div className="gy-item" style={{ gridTemplateColumns: '1fr' }} key={i}>
                    <span className="txt">{t}</span>
                  </div>
                ))}
            {!editing && !(report.pitch_lines ?? []).length && (
              <span className="gy-muted">暂无</span>
            )}
          </div>
        </div>
        <div className="gy-uf">
          <span>用户痛点（推断，不是事实）</span>
          {editing ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {listEditor('pain_points', '添加一条痛点')}
            </div>
          ) : (
            <div className="gy-chips">
              {(report.pain_points ?? []).length ? (
                (report.pain_points ?? []).map((t, i) => (
                  <span className="gy-tag" key={i}>
                    {t}
                  </span>
                ))
              ) : (
                <span className="gy-muted">暂无</span>
              )}
            </div>
          )}
        </div>
        {editing && (
          <div className="gy-f2">
            {textField('品类', 'category')}
            {textField('目标人群', 'audience')}
            {textField('调性', 'tone')}
          </div>
        )}
        <div className="gy-srcline">
          <span>
            {editing
              ? '改完点保存，会记一个新的修订号'
              : `人群：${report.audience || '—'} · 调性：${report.tone || '—'} · 修订 ${a?.revision ?? 0}`}
          </span>
        </div>
      </Card>
      <div className="gy-col">
        <Card pad editing={editing}>
          <CardHead title="可以证明的卖点">
            <small>{provable.length} 条</small>
          </CardHead>
          {editing
            ? rowsEditor(
                'provable_points',
                [
                  ['claim', '卖点'],
                  ['how', '怎么拍出来'],
                ],
                '添加卖点',
              )
            : provable.map((x, i) => (
                <div className={`gy-item${isUnverified(x.evidence) ? ' need' : ''}`} key={i}>
                  <span className="txt">
                    {x.claim}
                    <small>{x.how}</small>
                  </span>
                  <span className={`gy-ev${isUnverified(x.evidence) ? ' guess' : ''}`}>
                    {evThumbs(x.evidence)}
                    {isUnverified(x.evidence)
                      ? '待验证'
                      : !evidenceImages(x.evidence, srcIds.length).length && x.evidence}
                  </span>
                </div>
              ))}
          {!editing && !provable.length && <span className="gy-muted">暂无</span>}
        </Card>
        <Card pad editing={editing}>
          <CardHead title="需要确认">
            <small>
              {(report.confirm ?? []).filter((t) => !t.endsWith('（已补充）')).length} 项待确认
            </small>
          </CardHead>
          {editing
            ? listEditor('confirm', '添加一项')
            : (report.confirm ?? []).map((t, i) => (
                <div className={`gy-item${t.endsWith('（已补充）') ? '' : ' need'}`} key={i}>
                  <span className="txt">{t.replace(/（已补充）$/, '')}</span>
                  {t.endsWith('（已补充）') && <span className="gy-pill ok">已补充</span>}
                </div>
              ))}
          {!editing && !(report.confirm ?? []).length && (
            <span className="gy-muted">没有要确认的</span>
          )}
        </Card>
        <Card pad editing={editing}>
          <CardHead title="不能夸大的说法">
            <small>{(report.exaggeration_risks ?? []).length} 条</small>
          </CardHead>
          {editing
            ? rowsEditor(
                'exaggeration_risks',
                [
                  ['point', '说法'],
                  ['why', '原因'],
                ],
                '添加一条',
              )
            : (report.exaggeration_risks ?? []).map((x, i) => (
                <div className="gy-warnbox" key={i}>
                  <b>{x.point}</b>
                  {x.why}
                </div>
              ))}
          {!editing && !(report.exaggeration_risks ?? []).length && (
            <span className="gy-muted">暂无</span>
          )}
        </Card>
        <Card pad editing={editing}>
          <CardHead title="可展示的细节">
            <small>{(report.showcase_points ?? []).length} 条</small>
          </CardHead>
          {editing
            ? rowsEditor(
                'showcase_points',
                [
                  ['part', '部位'],
                  ['where', '位置'],
                  ['what', '看得到的特征'],
                ],
                '添加细节',
              )
            : (report.showcase_points ?? []).map((x, i) => (
                <div className="gy-item" style={{ gridTemplateColumns: 'minmax(0,1fr)' }} key={i}>
                  <span className="txt">
                    {x.part}
                    {x.where ? ` · ${x.where}` : ''}
                    <small>{x.what}</small>
                  </span>
                </div>
              ))}
        </Card>
      </div>
    </div>
  ) : (
    <Card>
      <EmptyState
        title={
          running ? '正在分析商品图片' : a?.status === 'FAILED' ? '分析没有成功' : '还没有分析结果'
        }
      >
        <span>
          {running
            ? '分析在后台进行，完成后这里会自动显示。'
            : '分析会读取整组图片，整理外观、材质、卖点和需要确认的信息。'}
        </span>
        {!running && (
          <Btn variant="primary" onClick={() => setRedo(true)}>
            <Sparkles size={14} aria-hidden="true" />
            分析商品
          </Btn>
        )}
      </EmptyState>
    </Card>
  );

  const current = imageIds[Math.min(img, imageIds.length - 1)];
  const num = current ? srcIds.indexOf(current) + 1 : 0;
  const views = report?.image_views ?? [];
  const viewIndex = views.findIndex((v) => String(v.image) === String(num));
  const cites = num
    ? provable.filter((x) => evidenceImages(x.evidence, srcIds.length).includes(num))
    : [];
  const imagesTab = (
    <div style={{ display: 'grid', gap: 14 }}>
      {images.length ? (
        <Card className="gy-viewer" editing={editing}>
          <div className="gy-vstage">
            <button
              type="button"
              className="gy-vimg"
              aria-label="放大查看"
              onClick={() => setLightbox(Math.min(img, imageIds.length - 1))}
            >
              <img src={fileUrl(client.id, current)} alt={`图片${img + 1}`} />
            </button>
            <div className="gy-vthumbs" role="group" aria-label="选择图片">
              {imageIds.map((x, i) => (
                <button
                  key={x}
                  type="button"
                  aria-pressed={x === current}
                  aria-label={`图片${i + 1}`}
                  onClick={() => setImg(i)}
                >
                  <img src={fileUrl(client.id, x)} alt="" />
                </button>
              ))}
            </div>
          </div>
          <aside className="gy-vside">
            <div className="gy-vh">
              <b>图片{img + 1}</b>
              {current === coverId && <span className="gy-covertag">封面</span>}
              <span className="gy-muted">
                {img + 1} / {imageIds.length}
              </span>
            </div>
            <div className="gy-uf">
              <span>拍到了什么</span>
              {!num ? (
                <span className="gy-muted">这张图是分析之后加的，重新分析后会有说明。</span>
              ) : editing ? (
                <textarea
                  className="gy-textarea"
                  rows={5}
                  maxLength={800}
                  aria-label="拍到了什么"
                  value={viewIndex >= 0 ? views[viewIndex].view : ''}
                  onChange={(e) =>
                    upd(
                      'image_views',
                      viewIndex >= 0
                        ? views.map((v, n) =>
                            n === viewIndex ? { ...v, view: e.target.value } : v,
                          )
                        : [...views, { image: String(num), view: e.target.value }],
                    )
                  }
                />
              ) : (
                <div className="v">
                  {viewIndex >= 0 ? (
                    views[viewIndex].view
                  ) : (
                    <span className="gy-muted">没有说明</span>
                  )}
                </div>
              )}
            </div>
            <div className="gy-uf">
              <span>用这张图做依据的卖点 · {cites.length} 条</span>
              {cites.length ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  {cites.map((x, i) => (
                    <div
                      className="gy-item"
                      style={{ gridTemplateColumns: 'minmax(0,1fr)' }}
                      key={i}
                    >
                      <span className="txt">
                        {x.claim}
                        <small>{x.how}</small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="gy-muted">还没有卖点用这张图做依据</span>
              )}
            </div>
            <div className="gy-row">
              {current !== coverId && (
                <Btn size="xs" busy={busy} onClick={() => void setCover(current)}>
                  设为封面
                </Btn>
              )}
              <Btn size="xs" variant="ghost" onClick={() => fileInput.current?.click()}>
                <Plus size={13} aria-hidden="true" />
                添加图片
              </Btn>
            </div>
          </aside>
        </Card>
      ) : (
        <Card>
          <EmptyState title="这个商品还没有图片">
            <Btn variant="primary" onClick={() => fileInput.current?.click()}>
              添加图片
            </Btn>
          </EmptyState>
        </Card>
      )}
      {report && (
        <Card pad editing={editing}>
          <CardHead title="适合的广告类型" />
          <div className="gy-grid2">
            {editing
              ? rowsEditor(
                  'fit_types',
                  [
                    ['type', '类型'],
                    ['why', '原因'],
                  ],
                  '添加类型',
                )
              : (report.fit_types ?? []).map((f, i) => (
                  <div className="gy-pcard" key={i}>
                    <b>{f.type}</b>
                    <p>{f.why}</p>
                  </div>
                ))}
          </div>
          {!editing && !(report.fit_types ?? []).length && <span className="gy-muted">暂无</span>}
        </Card>
      )}
    </div>
  );

  const uploadMore = async (files: File[]) => {
    await run(async () => {
      let groupId = product.group.groupId;
      if (!groupId) {
        const members = await put<Asset[]>(`/clients/${client.id}/product-groups/${anchor}`, {
          productName: product.group.productName,
          sku: product.group.sku,
        });
        groupId = String(members[0].metadata.productGroupId ?? '');
      }
      for (const file of files) {
        const body = new FormData();
        body.set('file', file);
        body.set('kind', 'PRODUCT');
        body.set('sku', product.group.sku);
        body.set('tags', '');
        body.set('productName', product.group.productName);
        body.set('productGroupId', groupId);
        await request(`/clients/${client.id}/assets`, { method: 'POST', body });
      }
      await refresh();
    }, `已添加 ${files.length} 张图片。图片变了，分析结果可能需要重新做`);
  };

  return (
    <div className="gy-page gy-new">
      <button type="button" className="gy-backlink" onClick={() => navigate('/products')}>
        <ChevronLeft size={14} aria-hidden="true" />
        返回商品列表
      </button>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept="image/jpeg,image/png,image/webp"
        aria-label="添加商品图"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          if (files.length) void uploadMore(files);
        }}
      />
      <Card className="gy-ghead">
        <button
          type="button"
          className="gy-cover"
          aria-label="查看商品主图"
          onClick={() => coverId && setLightbox(Math.max(0, imageIds.indexOf(coverId)))}
        >
          {product.group.cover.mime.startsWith('image/') && (
            <img src={fileUrl(client.id, coverId)} alt="商品主图" />
          )}
        </button>
        <div style={{ minWidth: 0 }}>
          {renaming === 'name' ? (
            <InlineEdit
              label="商品名称"
              initial={product.group.productName}
              onDone={(v) => (
                setRenaming(null),
                v && v !== product.group.productName && void saveInfo(v, product.group.sku)
              )}
            />
          ) : (
            <h1>
              {product.group.productName}
              <button
                type="button"
                className="gy-icon-btn"
                aria-label="重命名商品"
                title="重命名"
                onClick={() => setRenaming('name')}
              >
                <Pencil size={14} />
              </button>
            </h1>
          )}
          <div className="gy-meta2">
            {renaming === 'sku' ? (
              <InlineEdit
                small
                label="SKU"
                initial={product.group.sku}
                onDone={(v) => (
                  setRenaming(null),
                  v !== null &&
                    v !== product.group.sku &&
                    void saveInfo(product.group.productName, v)
                )}
              />
            ) : (
              <button
                type="button"
                className="gy-link"
                style={{ color: 'inherit' }}
                title="修改 SKU"
                onClick={() => setRenaming('sku')}
              >
                {product.group.sku ? `SKU ${product.group.sku}` : 'SKU 未设置'}
              </button>
            )}
            {report?.category && <span>{report.category}</span>}
            <span>{images.length} 张图</span>
            {a?.model && a.status !== 'EMPTY' && <span>分析模型 {a.model}</span>}
            <span>{folderPath(folders, product.folderId)}</span>
          </div>
          <div className="gy-stats3">
            <div>
              <span>可证明卖点</span>
              <b>{provable.filter((x) => !isUnverified(x.evidence)).length}</b>
            </div>
            <div>
              <span>需要确认</span>
              <b style={{ color: pendingConfirm ? 'var(--gy-warning)' : undefined }}>
                {pendingConfirm}
              </b>
            </div>
            <div>
              <span>夸大风险</span>
              <b>{(report?.exaggeration_risks ?? []).length}</b>
            </div>
            <div>
              <span>关联项目</span>
              <b>{product.info?.projectCount ?? 0}</b>
            </div>
          </div>
        </div>
        <div className="gy-ghead-side">
          <div className="gy-row">
            <span className={`gy-pill ${tone === 'ok' ? 'ok' : tone === 'none' ? 'idle' : 'warn'}`}>
              {label}
            </span>
            {needsReview(product) && a?.report && !running && (
              <Btn
                size="xs"
                variant="primary"
                onClick={() => navigate(`/products/${anchor}/review`)}
              >
                去核对
              </Btn>
            )}
            <Btn
              disabled={running || editing}
              busy={running}
              onClick={() => {
                setBrief(a?.brief ?? '');
                setRedo(true);
              }}
            >
              {!running && <Sparkles size={14} aria-hidden="true" />}
              {running ? '正在分析…' : a?.report ? '重新分析' : '分析商品'}
            </Btn>
          </div>
          <label className="gy-row gy-muted">
            移到
            <select
              className="gy-select"
              style={{ width: 180, height: 30 }}
              aria-label="移动到文件夹"
              value={product.folderId ?? ''}
              disabled={busy}
              onChange={(e) => {
                const folderId = e.target.value;
                void run(
                  async () => {
                    await put(`${endpoint}/folder`, { folderId: folderId || null });
                    await refresh();
                  },
                  `已移到「${folderPath(folders, folderId || null)}」`,
                );
              }}
            >
              <option value="">未分类</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPath(folders, f.id)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>
      {err && <Notice tone="error">{err}</Notice>}
      {a?.stale && (
        <Notice tone="warn" title="商品图片或名称改过">
          分析结果是按之前的资料做的，可以核对后继续用，或者重新分析。
        </Notice>
      )}
      {a?.status === 'FAILED' && (
        <Notice
          tone="warn"
          title={a.report ? '最近一次重新分析没有成功，现在显示的是之前的结果' : '分析没有成功'}
        >
          {a.error}
        </Notice>
      )}
      {analysis.error && <Notice tone="error">{(analysis.error as Error).message}</Notice>}
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="商品详情">
        {report &&
          (editing ? (
            <>
              <span className="gy-muted">正在编辑，所有内容都可以改</span>
              <Btn variant="ghost" size="xs" onClick={() => setDraft(null)}>
                取消
              </Btn>
              <Btn variant="primary" size="xs" busy={busy} onClick={() => void saveDraft()}>
                保存
              </Btn>
            </>
          ) : (
            <Btn
              size="xs"
              disabled={running}
              onClick={() => {
                setDraft(structuredClone(a!.report!));
                setDraftRev(a!.revision);
              }}
            >
              编辑
            </Btn>
          ))}
      </Tabs>
      {tab === '商品分析' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {analysisTab}
          <UnderstandingCard anchor={anchor} />
          <PersonasCard anchor={anchor} />
          <ProductProjects anchor={anchor} />
        </div>
      ) : (
        imagesTab
      )}
      {lightbox !== null && (
        <ImageViewer
          clientId={client.id}
          ids={imageIds}
          index={lightbox}
          coverId={coverId}
          busy={busy}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          onSetCover={(x) => void setCover(x)}
        />
      )}
      {redo && (
        <Dialog
          title={a?.report ? '重新分析商品' : '分析商品'}
          onClose={() => setRedo(false)}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setRedo(false)}>
                取消
              </Btn>
              <Btn
                variant="primary"
                busy={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await post<Analysis>(`${endpoint}/analysis`, { brief });
                    setAnalysis(result);
                    setRedo(false);
                    await refresh();
                  }, '已开始分析，完成后会自动显示')
                }
              >
                {a?.report ? '重新分析' : '开始分析'}
              </Btn>
            </>
          }
        >
          {a?.report && <Notice tone="warn">重新分析会替换现在的分析结果和手动修改。</Notice>}
          <Field label="补充说明（选填）" htmlFor="redo-brief">
            <textarea
              id="redo-brief"
              className="gy-textarea"
              rows={4}
              maxLength={3000}
              value={brief}
              placeholder="写下已确认的材质、规格、用法，不确定的写“待确认”。"
              onChange={(e) => setBrief(e.target.value)}
            />
          </Field>
          <span className="gy-fine">分析整组图片和这段说明，视频和音频不参与。</span>
          {err && <Notice tone="error">{err}</Notice>}
        </Dialog>
      )}
    </div>
  );
}

function evidenceText(nums: number[], unverified: boolean) {
  const seen = nums.length ? `${nums.map((n) => `图片${n}`).join('、')}可见` : '';
  return unverified ? (seen ? `${seen}；待验证` : '待验证') : seen || '待验证';
}

function ColorAdd({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <label className="gy-inline-add">
      <input
        aria-label="添加颜色，回车确认"
        placeholder="+ 添加颜色"
        maxLength={60}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && v.trim()) {
            onAdd(v.trim());
            setV('');
          }
        }}
      />
    </label>
  );
}

function InlineEdit({
  label,
  initial,
  onDone,
  small,
}: {
  label: string;
  initial: string;
  onDone: (v: string | null) => void;
  small?: boolean;
}): ReactNode {
  const [v, setV] = useState(initial);
  const [done, setDone] = useState(false);
  const finish = (ok: boolean) => {
    if (done) return;
    setDone(true);
    onDone(ok ? v.trim() : null);
  };
  return (
    <input
      className={`gy-rename${small ? ' sm' : ''}`}
      style={small ? { width: 200 } : undefined}
      aria-label={label}
      autoFocus
      maxLength={100}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}
