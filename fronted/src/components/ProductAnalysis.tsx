import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { post, put, request, fileUrl } from '../api';
import { Field, ErrorState, Modal } from './UI';

const textFields = [
  ['category', '商品品类'], ['summary', '商品概述'], ['appearance', '外观结构'], ['material', '材质与质感'],
  ['usage', '使用场景'], ['operation', '正确用法'], ['styling', '搭配建议'], ['audience', '建议受众'], ['tone', '画面调性'],
] as const;
const listFields = [['colors', '颜色'], ['pain_points', '需求与痛点（建议）'], ['pitch_lines', '口播参考'], ['confirm', '待确认资料']] as const;
const rowFields = [
  { key: 'showcase_points', label: '可展示细节', fields: [['part', '部位'], ['where', '位置'], ['what', '可见特征']] },
  { key: 'provable_points', label: '卖点与证据', fields: [['claim', '主张'], ['evidence', '依据 / 待验证'], ['how', '验证或展示方式']] },
  { key: 'image_views', label: '图片角度对照', fields: [['image', '图片编号'], ['view', '角度与可见部位']] },
  { key: 'fit_types', label: '广告讲法建议', fields: [['type', '讲法'], ['why', '理由']] },
  { key: 'exaggeration_risks', label: '避免夸大的说法', fields: [['point', '说法'], ['why', '依据与替代表述']] },
];
type Report = Record<string, string | string[] | Record<string, string>[]>;
type Analysis = { status: string; brief: string; revision: number; report?: Report; stale: boolean; model: string; error?: string; analyzedAt?: string; sources?: { assets: { id: string; mime: string }[] } };

export default function ProductAnalysis({ clientId, anchorId, onImage, onChanged }: {
  clientId: string; anchorId: string; onImage: (assetId: string) => void; onChanged: () => void;
}) {
  const cache = useQueryClient();
  const queryKey = [clientId, 'product-analysis', anchorId];
  const endpoint = `/clients/${clientId}/product-groups/${anchorId}/analysis`;
  const data = useQuery({ queryKey, queryFn: () => request<Analysis>(endpoint),
    refetchInterval: (query) => ['QUEUED', 'RUNNING'].includes(query.state.data?.status ?? '') ? 2000 : false,
  });
  const [brief, setBrief] = useState('');
  const [dirtyBrief, setDirtyBrief] = useState(false);
  const [draft, setDraft] = useState<Report | null>(null);
  const [editRevision, setEditRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRedo, setConfirmRedo] = useState(false);
  const [preview, setPreview] = useState<{ id: string; label: string } | null>(null);
  const [sectionView, setSectionView] = useState('overview');
  const [fieldView, setFieldView] = useState('appearance');
  const [itemIndex, setItemIndex] = useState(0);
  const [showBrief, setShowBrief] = useState(false);
  useEffect(() => { if (data.data && !dirtyBrief) setBrief(data.data.brief); }, [data.data, dirtyBrief]);
  const running = ['QUEUED', 'RUNNING'].includes(data.data?.status ?? '');
  const report = draft ?? data.data?.report;
  const update = (field: string, value: Report[string]) => setDraft(current => current && ({ ...current, [field]: value }));
  const run = async () => {
    setBusy(true); setError(''); setNotice(''); setConfirmRedo(false);
    try {
      const result = await post<Analysis>(endpoint, { brief });
      cache.setQueryData(queryKey, result); setDirtyBrief(false); onChanged();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await put<Analysis>(endpoint, { revision: editRevision, brief, report: draft });
      cache.setQueryData(queryKey, result); setDirtyBrief(false); setDraft(null); setNotice('分析修改已保存到此商品');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const categories = [
    { key: 'overview', label: '商品概览', fields: [...textFields, ['colors', '颜色'], ['confirm', '待确认资料']] },
    { key: 'details', label: '细节与卖点', fields: rowFields.filter(r => ['showcase_points', 'provable_points'].includes(r.key)).map(r => [r.key, r.label]) },
    { key: 'images', label: '图片对照', fields: [['image_views', '图片角度对照']] },
    { key: 'ideas', label: '广告建议', fields: [['pain_points', '需求与痛点（建议）'], ['pitch_lines', '口播参考'], ['fit_types', '广告讲法建议'], ['exaggeration_risks', '避免夸大的说法']] },
  ];
  const category = categories.find(c => c.key === sectionView)!;
  const field = category.fields.find(f => f[0] === fieldView) ?? category.fields[0];
  const fieldKey = field[0];
  const rowSchema = rowFields.find(r => r.key === fieldKey);
  const isList = listFields.some(([key]) => key === fieldKey);
  const values = report && (rowSchema || isList) ? (report[fieldKey] ?? []) as (string | Record<string, string>)[] : [];
  const index = Math.min(itemIndex, Math.max(0, values.length - 1));
  const selectField = (key: string) => { setFieldView(key); setItemIndex(0); };
  const renderValue = (value: string, label: string, change: (value: string) => void, max: number) => draft
    ? <textarea aria-label={label} value={value} maxLength={max} onChange={e => change(e.target.value)} />
    : <PagedText key={fieldKey + label + index} text={value || '暂无信息'} />;
  return <section className="product-analysis" aria-label="商品广告分析">
    <div className="analysis-command-bar">
      <div><h3>商品广告分析</h3><span className="caption">{data.data?.analyzedAt ? `保存于 ${new Date(data.data.analyzedAt).toLocaleString()}` : '分析整组图片，建立可编辑的商品资料'}</span></div>
      <div className="row">
        <button type="button" onClick={() => setShowBrief(!showBrief)}>{showBrief ? '返回分析结果' : '补充说明'}</button>
        {data.data?.report && !draft && <button type="button" disabled={busy || running} onClick={() => {
          setDraft(structuredClone(data.data!.report!)); setEditRevision(data.data!.revision); setNotice('');
        }}>编辑分析</button>}
        {!draft && <button type="button" className="primary" disabled={busy || running || data.isPending || !!data.error} onClick={() => {
          if (data.data?.report) setConfirmRedo(true); else void run();
        }}>{busy || running ? '正在分析…' : data.data?.report ? '重新分析' : '分析商品'}</button>}
      </div>
    </div>
    {confirmRedo && <div className="analysis-inline-message">重新分析会替换当前结果和手动修改。
      <button type="button" onClick={() => void run()}>确认重新分析</button><button type="button" onClick={() => setConfirmRedo(false)}>取消</button>
    </div>}
    {running && <p role="status" className="analysis-inline-message">正在分析整组图片，关闭窗口后仍会继续。</p>}
    {data.data?.stale && <p className="analysis-inline-message">商品资料已变更，请核对旧分析或重新分析。</p>}
    {(error || data.data?.error || data.error) && <ErrorState error={new Error(error || data.data?.error || (data.error as Error)?.message)} />}
    {notice && <p role="status" className="caption">{notice}</p>}
    {showBrief || !report ? <div className="analysis-brief-panel">
      <Field label="补充商品说明"><textarea maxLength={3000} value={brief} disabled={busy || running}
        placeholder="填写已确认的材质、规格、卖点和使用方法，不确定的注明待确认。"
        onChange={e => { setBrief(e.target.value); setDirtyBrief(true); setNotice(''); }} /></Field>
      <p className="caption">分析图片与文字说明；视频和音频暂不参与。调用会使用已配置模型的额度。</p>
      {dirtyBrief && <p className="caption">说明尚未保存，分析时保存；已有结果也可通过“编辑分析 → 保存分析修改”保存。</p>}
    </div> : <>
      <div className="product-view-tabs" role="tablist" aria-label="分析内容分类">
        {categories.map(c => <button type="button" role="tab" key={c.key} aria-selected={sectionView === c.key} onClick={() => {
          setSectionView(c.key); selectField(c.key === 'overview' ? 'appearance' : c.fields[0][0]);
        }}>{c.label}</button>)}
      </div>
      <div className="analysis-reader">
        <nav className="analysis-topics" aria-label="分析字段">
          {category.fields.map(([key, label]) => <button type="button" key={key} aria-pressed={fieldKey === key} onClick={() => selectField(key)}>{label}</button>)}
        </nav>
        <section className="analysis-page" aria-label={field[1]}>
          <div className="row between"><h4>{field[1]}</h4>
            {(rowSchema || isList) && <div className="row analysis-pager">
              <button type="button" aria-label="上一条分析" disabled={index === 0} onClick={() => setItemIndex(index - 1)}>上一条</button>
              <span>{values.length ? index + 1 : 0} / {values.length}</span>
              <button type="button" aria-label="下一条分析" disabled={index >= values.length - 1} onClick={() => setItemIndex(index + 1)}>下一条</button>
            </div>}
          </div>
          <div className="analysis-page-content">
            {rowSchema ? values.length ? <div className={`analysis-row${fieldKey === 'image_views' ? ' analysis-image-row' : ''}`}>
              {rowSchema.fields.map(([key, label]) => {
                const row = values[index] as Record<string, string>;
                const asset = fieldKey === 'image_views' && key === 'image' ? data.data?.sources?.assets.filter(a => a.mime.startsWith('image/'))[Number(row.image) - 1] : null;
                return <div key={key}><span className="caption">{label}</span>
                  {asset && !draft ? <button type="button" className="analysis-image-thumb" aria-label={`放大图片${row.image}`} onClick={() => {
                    onImage(asset.id); setPreview({ id: asset.id, label: `图片${row.image}` });
                  }}><img src={fileUrl(clientId, asset.id)} alt={`图片${row.image}`} /><span>图片{row.image}</span></button>
                    : renderValue(row[key] ?? '', `${field[1]}${index + 1}${label}`, value => update(fieldKey, (values as Record<string, string>[]).map((r, n) => n === index ? { ...r, [key]: value } : r)), 800)}
                </div>;
              })}
            </div> : <p className="muted">暂无信息，可在编辑模式添加。</p>
              : isList ? values.length ? renderValue(String(values[index]), `${field[1]}${index + 1}`, value => update(fieldKey, (values as string[]).map((v, n) => n === index ? value : v)), 600) : <p className="muted">暂无信息</p>
                : renderValue(String(report[fieldKey] ?? ''), field[1], value => update(fieldKey, value), 2000)}
          </div>
          {draft && (rowSchema || isList) && <div className="row">
            <button type="button" disabled={!values.length} onClick={() => update(fieldKey, values.filter((_, n) => n !== index) as Report[string])}>移除此条</button>
            <button type="button" disabled={values.length >= (fieldKey === 'image_views' ? 30 : 12)} onClick={() => {
              update(fieldKey, [...values, rowSchema ? Object.fromEntries(rowSchema.fields.map(([key]) => [key, ''])) : ''] as Report[string]); setItemIndex(values.length);
            }}>添加{field[1]}</button>
          </div>}
        </section>
      </div>
    </>}
    <footer className="analysis-bottom-bar">
      <span className="caption">创意建议与待验证主张不等于已确认事实。</span>
      {draft && <div className="row"><button type="button" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>取消修改</button>
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? '正在保存…' : '保存分析修改'}</button></div>}
    </footer>
    {preview && <Modal title={preview.label} onClose={() => setPreview(null)}>
      <div className="product-gallery-main"><img src={fileUrl(clientId, preview.id)} alt={preview.label} /></div>
    </Modal>}
  </section>;
}

function PagedText({ text }: { text: string }) {
  const [page, setPage] = useState(0);
  const pages = Array.from(text).reduce<string[]>((parts, char, index) => {
    const part = Math.floor(index / 260); parts[part] = (parts[part] ?? '') + char; return parts;
  }, []);
  return <div className="analysis-text"><p>{pages[Math.min(page, pages.length - 1)]}</p>
    {pages.length > 1 && <div className="row"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>上一段</button><span>{page + 1}/{pages.length}</span><button type="button" disabled={page >= pages.length - 1} onClick={() => setPage(page + 1)}>下一段</button></div>}
  </div>;
}
