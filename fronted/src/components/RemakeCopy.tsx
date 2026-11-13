import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fileUrl, post, put, request } from '../api';
import { useCampaignProducts } from './CampaignProductsPanel';
import { ErrorState, Field, Modal, useAction, useWorkspace } from './UI';

interface Draft { relation: string; reason: string; approach: string; lines: { id: string; start: number; end: number; original: string; text: string }[]; overlays: { id: string; start: number; end: number; original: string; text: string; enabled: boolean }[]; overlaysOn: boolean; duration: number; notes: string; confirmed: boolean }
interface State { id?: string; revision: number; status: string; phase: string; error: string; stale: boolean; enabled: boolean; videoEnabled: boolean; draft?: Draft; prompt?: string }
export default function RemakeCopy({ campaignId, assetId }: { campaignId: string; assetId: string }) {
  const { client } = useWorkspace(), action = useAction(), cache = useQueryClient(), navigate = useNavigate();
  const products = useCampaignProducts(campaignId);
  const [anchor, setAnchor] = useState(''), [overlays, setOverlays] = useState(false), [duration, setDuration] = useState(15), [resolution, setResolution] = useState('480p');
  const [draft, setDraft] = useState<Draft | null>(null), [revision, setRevision] = useState(0), [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<'copy' | 'prompt' | 'render' | null>(null);
  const hydrate = useRef<State | null>(null);
  useEffect(() => { if (!anchor && products.data?.products.length === 1) setAnchor(products.data.products[0].anchorId); }, [products.data, anchor]);
  const endpoint = `/clients/${client.id}/campaigns/${campaignId}/remake/${assetId}/${anchor}`, queryKey = [client.id, campaignId, assetId, anchor, 'remake-copy'];
  const query = useQuery<State>({ queryKey, queryFn: () => request(endpoint), enabled: !!anchor, refetchInterval: q => ['QUEUED', 'RUNNING'].includes(q.state.data?.status ?? '') ? 2000 : false, refetchIntervalInBackground: true });
  const data = query.data, running = ['QUEUED', 'RUNNING'].includes(data?.status ?? ''), busy = action.busy || running;
  useEffect(() => { if (data && !dirty && data !== hydrate.current) { hydrate.current = data; setDraft(data.draft ? structuredClone(data.draft) : null); setRevision(data.revision); if (data.draft) { setOverlays(data.draft.overlaysOn); setDuration(data.draft.duration); } } }, [data, dirty]);
  useEffect(() => { if (!dirty) return; const leave = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, [dirty]);
  function change(next: Draft) { setDraft({ ...next, confirmed: false }); setDirty(true); }
  async function save() { if (!draft) return; const result = await put<State>(endpoint, { revision, draft }); cache.setQueryData(queryKey, result); setDirty(false); setRevision(result.revision); }
  return <section className="panel padded remake-copy" aria-label="台词与花字替换">
    <h2>台词与花字替换</h2>
    {products.error && <ErrorState error={products.error} />}
    <div className="project-product-options">{products.data?.products.map(p => { const image = p.assets.find(a => a.id === a.metadata.coverAssetId) ?? p.assets.find(a => a.mime.startsWith('image/')); return <button key={p.anchorId} disabled={busy || dirty} aria-pressed={anchor === p.anchorId} className={anchor === p.anchorId ? 'is-selected' : ''} onClick={() => { setAnchor(p.anchorId); setDraft(null); hydrate.current = null; setDirty(false); }}>
      {image && <img src={fileUrl(client.id, image.id)} alt="" />}<strong>{String(p.assets[0]?.metadata.productName || p.assets[0]?.name || '商品')}</strong><small>SKU：{p.assets[0]?.sku || '未设置'}</small>
    </button>; })}</div>
    <div className="row remake-copy-controls"><Field label="成片时长（秒）"><input type="number" min={4} max={30} value={duration} disabled={busy} onChange={e => { const value = Number(e.target.value); setDuration(value); if (draft) change({ ...draft, duration: value }); }} /></Field>
      <label className="checkbox-line"><input type="checkbox" checked={overlays} disabled={busy} onChange={e => { setOverlays(e.target.checked); if (draft) change({ ...draft, overlaysOn: e.target.checked }); }} />替换并生成后期花字</label>
      <button className="primary" disabled={!anchor || busy || !data?.enabled || !Number.isInteger(duration) || duration < 4 || duration > 30} onClick={() => setConfirm('copy')}>{draft ? '重新生成替换文案' : '生成替换文案'}</button>
    </div>
    {query.error && <ErrorState error={query.error} />}{action.error && <ErrorState error={new Error(action.error)} />}{data?.error && <p className="error-box">{data.error}</p>}
    {running && <div className="read-progress-panel"><strong role="status">{data?.phase || '正在生成…'}</strong><div className="read-progress-track" role="progressbar" aria-label="文案生成进度"><span /></div><p>完成后自动显示，无需刷新。</p></div>}
    {data?.stale && <p className="hint">商品资料或参考分镜已变化，请重新生成替换文案。原稿保留供查看。</p>}
    {draft && <>
      <div className="remake-relation"><strong>{draft.relation}</strong><p>{draft.reason}</p><p>{draft.approach}</p></div>
      <fieldset className="read-fields" disabled={busy || data?.stale}>
        <h3>台词对照</h3><div className="remake-copy-table">{draft.lines.length === 0 ? <p>原片没有台词，可保持纯画面。</p> : draft.lines.map((l, i) => <article key={l.id}><div><small>原片 {l.start.toFixed(2)}–{l.end.toFixed(2)}秒</small><p>{l.original}</p></div><Field label={`我们商品的第${i + 1}句台词`}><textarea maxLength={300} rows={2} value={l.text} onChange={e => change({ ...draft, lines: draft.lines.map(x => x.id === l.id ? { ...x, text: e.target.value } : x) })} /></Field></article>)}</div>
        {draft.overlaysOn && <><h3>花字对照</h3>{!draft.overlays.length && <p>参考片没有可替换的后期花字。</p>}{draft.overlays.map((o, i) => <article className="remake-overlay-row" key={o.id}><label className="checkbox-line"><input type="checkbox" checked={o.enabled} onChange={e => change({ ...draft, overlays: draft.overlays.map(x => x.id === o.id ? { ...x, enabled: e.target.checked } : x) })} />使用第{i + 1}条花字</label><p>原片：{o.original}</p><Field label={`我们商品的第${i + 1}条花字`}><input maxLength={100} value={o.text} onChange={e => change({ ...draft, overlays: draft.overlays.map(x => x.id === o.id ? { ...x, text: e.target.value } : x) })} /></Field></article>)}</>}
        <Field label="需要核对的内容"><textarea rows={2} maxLength={2000} value={draft.notes} onChange={e => change({ ...draft, notes: e.target.value })} /></Field>
        <label className="checkbox-line"><input type="checkbox" checked={draft.confirmed} onChange={e => { setDraft({ ...draft, confirmed: e.target.checked }); setDirty(true); }} />已核对台词、商品事实及勾选的花字</label>
        <div className="row"><button className="primary" disabled={!dirty} onClick={() => void action.run(save, '替换文案已保存')}>保存替换文案</button><button disabled={dirty || !draft.confirmed || !data?.enabled} onClick={() => setConfirm('prompt')}>生成视频提示词</button></div>
      </fieldset>
    </>}
    {!!data?.prompt && !dirty && <div className="remake-prompt"><h3>视频提示词</h3><pre>{data.prompt}</pre><div className="row"><Field label="视频清晰度"><select value={resolution} onChange={e => setResolution(e.target.value)}><option>480p</option><option>720p</option><option>1080p</option></select></Field><button className="primary" disabled={busy || data.stale || !draft?.confirmed || !data.videoEnabled} onClick={() => setConfirm('render')}>确认提示词，生成视频</button></div></div>}
    {confirm && <Modal title={confirm === 'render' ? '确认生成视频' : confirm === 'prompt' ? '确认生成视频提示词' : '确认生成替换文案'} onClose={() => { if (!action.busy) setConfirm(null); }}>
      <p>{confirm === 'render' ? `将生成${duration}秒、${resolution}竖屏视频，按供应商实际价格计费。自己的商品图片将通过限时链接用于此次生成。` : confirm === 'prompt' ? '将根据保存并确认的文案与自己的商品图生成视频提示词，可能产生费用。' : '将读取商品图与分析、参考片拆解，自动判断商品用法并生成替换文案，可能产生费用。重新生成会替换当前稿件。'}</p>
      <button className="primary" disabled={busy} onClick={() => void action.run(async () => {
        if (confirm === 'render') { const result = await post<{ job: { id: string } }>(endpoint + '/render', { revision, confirmed: true, resolution }); await cache.invalidateQueries({ queryKey: [client.id, 'jobs'] }); setConfirm(null); navigate(`/queue?campaign=${campaignId}&job=${result.job.id}`); }
        else { const accepted = await post<State>(endpoint + '/' + confirm, { revision, confirmed: true, overlays, duration }); cache.setQueryData(queryKey, accepted); setDirty(false); setConfirm(null); }
      })}>确认并继续</button>
      {action.error && <ErrorState error={new Error(action.error)} />}
    </Modal>}
  </section>;
}
