import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fileUrl, jobUrl, post, put, request } from '../api';
import { useCampaignProducts } from './CampaignProductsPanel';
import { ErrorState, Field, Modal, useAction, useWorkspace } from './UI';
import type { StoryboardState } from '../storyboard';
import type { Asset } from '../types';

interface Draft { relation: string; reason: string; approach: string; lines: { id: string; start: number; end: number; original: string; text: string }[]; overlays: { id: string; start: number; end: number; original: string; text: string; enabled: boolean }[]; overlaysOn: boolean; duration: number; notes: string; confirmed: boolean }
interface State { id?: string; revision: number; status: string; phase: string; error: string; stale: boolean; enabled: boolean; videoEnabled: boolean; targetDuration?: number; draft?: Draft; prompt?: string; taskKind?: string; partialPrompt?: string; streamedChars?: number; referenceImages?: Asset[] }
interface Render { id: string; status: string; progress: number; message: string; hasOutput: boolean; createdAt: string; prompt: string; resolution: string }
export default function RemakeCopy({ campaignId, assetId, stage = 'copy', onStage, onNavigation, onReference }: { campaignId: string; assetId: string; stage?: 'copy' | 'prompt'; onStage?: (stage: 'copy' | 'prompt') => void; onReference?: () => void; onNavigation?: (state: { dirty: boolean; promptReady: boolean }) => void }) {
  const { client } = useWorkspace(), action = useAction(), cache = useQueryClient();
  const products = useCampaignProducts(campaignId);
  const [anchor, setAnchor] = useState(''), [overlays, setOverlays] = useState(false), [resolution, setResolution] = useState('480p');
  const reference = useQuery<StoryboardState>({ queryKey: [client.id, assetId, 'storyboard'], queryFn: () => request(`/clients/${client.id}/assets/${assetId}/storyboard`) });
  const [draft, setDraft] = useState<Draft | null>(null), [revision, setRevision] = useState(0), [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<'copy' | 'prompt' | 'render' | null>(null);
  const [promptText, setPromptText] = useState(''), [promptDirty, setPromptDirty] = useState(false);
  const [preview, setPreview] = useState<{ id: string; index: number } | null>(null);
  const hydrate = useRef<State | null>(null);
  useEffect(() => { if (!anchor && products.data?.products.length === 1) setAnchor(products.data.products[0].anchorId); }, [products.data, anchor]);
  const endpoint = `/clients/${client.id}/campaigns/${campaignId}/remake/${assetId}/${anchor}`, queryKey = [client.id, campaignId, assetId, anchor, 'remake-copy'];
  const query = useQuery<State>({ queryKey, queryFn: () => request(endpoint), enabled: !!anchor, refetchInterval: q => ['QUEUED', 'RUNNING'].includes(q.state.data?.status ?? '') ? 2000 : false, refetchIntervalInBackground: true });
  const renders = useQuery<Render[]>({ queryKey: [...queryKey, 'renders'], queryFn: () => request(endpoint + '/renders'), enabled: !!anchor && stage === 'prompt', refetchInterval: q => q.state.data?.some(r => ['QUEUED', 'RUNNING'].includes(r.status)) ? 3000 : false, refetchIntervalInBackground: true });
  const videoPending = renders.data?.some(r => ['QUEUED', 'RUNNING', 'BLOCKED'].includes(r.status)) ?? false;
  const data = query.data, running = ['QUEUED', 'RUNNING'].includes(data?.status ?? ''), busy = action.busy || running;
  const duration = reference.data?.report ? Math.ceil(reference.data.report.duration) : data?.targetDuration ?? 0;
  const wrongDuration = !!draft && duration > 0 && draft.duration !== duration;
  const canPrompt = !!draft?.confirmed && !dirty && !wrongDuration && !data?.stale;
  useEffect(() => { onNavigation?.({ dirty: dirty || promptDirty, promptReady: canPrompt }); }, [dirty, promptDirty, canPrompt, onNavigation]);
  useEffect(() => { if (!promptDirty) setPromptText(data?.prompt ?? ''); }, [data?.prompt, promptDirty]);
  useEffect(() => { if (data && !dirty && data !== hydrate.current) { hydrate.current = data; setDraft(data.draft ? structuredClone(data.draft) : null); setRevision(data.revision); if (data.draft) setOverlays(data.draft.overlaysOn); } }, [data, dirty]);
  useEffect(() => { if (!dirty && !promptDirty) return; const leave = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, [dirty, promptDirty]);
  function change(next: Draft) { setDraft({ ...next, confirmed: false }); setDirty(true); }
  async function save() { if (!draft) return; const result = await put<State>(endpoint, { revision, draft }); cache.setQueryData(queryKey, result); setDirty(false); setRevision(result.revision); }
  async function savePrompt() { const result = await put<State>(endpoint + '/prompt', { revision, prompt: promptText }); cache.setQueryData(queryKey, result); setPromptDirty(false); setRevision(result.revision); }
  return <>
    <div className="remake-top-actions" role="toolbar" aria-label="当前步骤操作">
      <button disabled={dirty || promptDirty} onClick={stage === 'copy' ? onReference : () => onStage?.('copy')}>{stage === 'copy' ? '返回参考分镜' : '返回台词与花字替换'}</button>
      <div className="row">
        {stage === 'copy' ? <>
          {draft && <label className="checkbox-line"><input type="checkbox" checked={draft.confirmed} disabled={busy || data?.stale || wrongDuration} onChange={e => { setDraft({ ...draft, confirmed: e.target.checked }); setDirty(true); }} />已核对台词、商品事实及勾选的花字</label>}
          <button disabled={!anchor || busy || !data?.enabled || duration < 4 || duration > 30} onClick={() => setConfirm('copy')}>{draft ? '重新生成替换文案' : '生成替换文案'}</button>
          <button disabled={busy || !dirty || data?.stale || wrongDuration} onClick={() => void action.run(save, '替换文案已保存')}>保存替换文案</button>
          <button className="primary" disabled={!canPrompt || busy} onClick={() => onStage?.('prompt')}>下一步：视频提示词</button>
        </> : <>
          <button disabled={busy || promptDirty || !canPrompt || !data?.enabled} onClick={() => setConfirm('prompt')}>{data?.prompt ? '重新生成视频提示词' : '生成视频提示词'}</button>
          <button disabled={busy || !promptDirty || !canPrompt || !promptText.trim()} onClick={() => void action.run(savePrompt, '提示词已保存')}>保存提示词</button>
          <button className="primary" disabled={busy || promptDirty || videoPending || !canPrompt || !data?.prompt || !data?.videoEnabled} onClick={() => setConfirm('render')}>{videoPending ? '视频生成中' : renders.data?.length ? '再生成一版视频' : '确认提示词，生成视频'}</button>
        </>}
      </div>
    </div>
    <section className="panel padded remake-copy" aria-label={stage === 'copy' ? '台词与花字替换' : '视频制作'}>
    <h2>{stage === 'copy' ? '台词与花字替换' : '视频制作'}</h2>
    {products.error && <ErrorState error={products.error} />}
    {reference.error && <ErrorState error={reference.error} />}
    {stage === 'copy' && <>
    <div className="project-product-options">{products.data?.products.map(p => { const image = p.assets.find(a => a.id === a.metadata.coverAssetId) ?? p.assets.find(a => a.mime.startsWith('image/')); return <button key={p.anchorId} disabled={busy || dirty} aria-pressed={anchor === p.anchorId} className={anchor === p.anchorId ? 'is-selected' : ''} onClick={() => { setAnchor(p.anchorId); setDraft(null); hydrate.current = null; setDirty(false); }}>
      {image && <img src={fileUrl(client.id, image.id)} alt="" />}<strong>{String(p.assets[0]?.metadata.productName || p.assets[0]?.name || '商品')}</strong><small>SKU：{p.assets[0]?.sku || '未设置'}</small>
    </button>; })}</div>
    <div className="row remake-copy-controls"><Field label="成片时长（秒）"><input type="number" value={duration || ''} readOnly /></Field><span className="caption">原片 {reference.data?.report?.duration.toFixed(2) ?? '…'} 秒，向上取整</span>
      <label className="checkbox-line"><input type="checkbox" checked={overlays} disabled={busy} onChange={e => { setOverlays(e.target.checked); if (draft) change({ ...draft, overlaysOn: e.target.checked }); }} />替换并生成后期花字</label>
    </div>
    <div className="remake-source-columns">
      <section aria-label="提取的原片台词"><h3>原片台词</h3>{reference.isPending ? <p>读取原片台词…</p> : !reference.data?.report?.dialogue.length ? <p>原片没有提取到台词</p> : reference.data.report.dialogue.map(l => <article key={l.id}><small>{l.start.toFixed(2)}–{l.end.toFixed(2)}秒 · {l.source === 'subtitle' ? '字幕' : l.source === 'audio' ? '音频' : '人工'}</small><p>{l.text}</p></article>)}</section>
      <section aria-label="提取的原片花字"><h3>原片后期花字</h3>{reference.isPending ? <p>读取原片花字…</p> : !reference.data?.report?.shots.some(s => s.text.trim()) ? <p>原片没有提取到后期花字</p> : reference.data.report.shots.filter(s => s.text.trim()).map(s => <article key={s.id}><small>{s.start.toFixed(2)}–{s.end.toFixed(2)}秒</small><p>{s.text}</p></article>)}<p className="caption">仅供对照；勾选替换后才生成新花字。</p></section>
    </div>
    </>}
    {query.error && <ErrorState error={query.error} />}{action.error && <ErrorState error={new Error(action.error)} />}{data?.error && <p className="error-box">{data.error}</p>}
    {running && <div className="read-progress-panel"><strong role="status">{data?.phase || '正在生成…'}</strong><div className="read-progress-track" role="progressbar" aria-label="文案生成进度"><span /></div><p>{data?.streamedChars ? `已接收 ${data.streamedChars} 字，正在持续接收…` : '等待生成服务开始返回内容…'}</p></div>}
    {data?.stale && <p className="hint">商品资料或参考分镜已变化，请重新生成替换文案。原稿保留供查看。</p>}
    {wrongDuration && <p className="hint">旧稿为 {draft?.duration} 秒，原片需要 {duration} 秒。请返回第二步重新生成替换文案，旧稿保留供对照。</p>}
    {stage === 'copy' && draft && <>
      <div className="remake-relation"><strong>{draft.relation}</strong><p>{draft.reason}</p><p>{draft.approach}</p></div>
      <fieldset className="read-fields" disabled={busy || data?.stale || wrongDuration}>
        <h3>台词对照</h3><div className="remake-copy-table">{draft.lines.length === 0 ? <p>原片没有台词，可保持纯画面。</p> : draft.lines.map((l, i) => <article key={l.id}><div><small>原片 {l.start.toFixed(2)}–{l.end.toFixed(2)}秒</small><p>{l.original}</p></div><Field label={`我们商品的第${i + 1}句台词`}><textarea maxLength={300} rows={2} value={l.text} onChange={e => change({ ...draft, lines: draft.lines.map(x => x.id === l.id ? { ...x, text: e.target.value } : x) })} /></Field></article>)}</div>
        {draft.overlaysOn && <><h3>花字对照</h3>{!draft.overlays.length && <p>参考片没有可替换的后期花字。</p>}{draft.overlays.map((o, i) => <article className="remake-overlay-row" key={o.id}><label className="checkbox-line"><input type="checkbox" checked={o.enabled} onChange={e => change({ ...draft, overlays: draft.overlays.map(x => x.id === o.id ? { ...x, enabled: e.target.checked } : x) })} />使用第{i + 1}条花字</label><p>原片：{o.original}</p><Field label={`我们商品的第${i + 1}条花字`}><input maxLength={100} value={o.text} onChange={e => change({ ...draft, overlays: draft.overlays.map(x => x.id === o.id ? { ...x, text: e.target.value } : x) })} /></Field></article>)}</>}
        <Field label="需要核对的内容"><textarea rows={2} maxLength={2000} value={draft.notes} onChange={e => change({ ...draft, notes: e.target.value })} /></Field>
      </fieldset>
    </>}
    {stage === 'prompt' && <>
      <p>成片 {duration || '…'} 秒 · 竖屏 9:16</p>
      <div className="remake-reference-images" aria-label="本次商品参考图">{(data?.referenceImages ?? products.data?.products.find(p => p.anchorId === anchor)?.assets.filter(a => a.mime.startsWith('image/')) ?? []).map((image, index) => <button key={image.id} type="button" aria-label={`查看商品图片${index + 1}`} onClick={() => setPreview({ id: image.id, index })}><img src={fileUrl(client.id, image.id)} alt={`商品图片${index + 1}`} /><span>图片{index + 1}</span></button>)}</div>
      {!canPrompt && !running && <p className="hint">先在第二步核对并保存替换文案，再生成视频提示词。</p>}
      {data?.partialPrompt && !data.prompt && <div className="remake-prompt-stream"><Field label={running ? '视频提示词 · 实时生成中' : '已接收的提示词 · 未完成校验'}><textarea rows={16} readOnly value={data.partialPrompt} /></Field><p className="caption">{running ? '内容持续更新，完整接收并校验后可编辑和生成视频。' : '此内容可能不完整，不会直接用于视频生成。'}</p></div>}
      <div className="remake-prompt"><Field label="视频提示词"><textarea rows={16} maxLength={5000} value={promptText} disabled={busy || !canPrompt} placeholder="生成后可修改提示词，保存后再生成视频。" onChange={e => { setPromptText(e.target.value); setPromptDirty(true); }} /></Field><div className="row"><span>{promptText.length} / 5000 字{promptDirty ? ' · 未保存' : ''}</span><Field label="视频清晰度"><select value={resolution} onChange={e => setResolution(e.target.value)}><option>480p</option><option>720p</option><option>1080p</option></select></Field></div></div>
      {renders.error && <ErrorState error={renders.error} />}
      {!!renders.data?.length && <section className="remake-versions" aria-label="生成的视频版本"><h3>视频版本</h3>{renders.data.map((r, i, all) => <article key={r.id}><strong>第 {all.length - i} 版 · {r.resolution} · {r.createdAt.replace('T', ' ')}</strong><p>{r.message}</p>{['QUEUED', 'RUNNING'].includes(r.status) && <progress max={100} value={r.progress} aria-label="视频生成进度" />}{r.hasOutput && <video controls preload="metadata" src={jobUrl(client.id, r.id)} />}<details><summary>此版本使用的提示词</summary><pre>{r.prompt}</pre></details><Link className="button" to={`/queue?campaign=${campaignId}&job=${r.id}`}>查看任务 / 审片</Link></article>)}</section>}
    </>}
    {confirm && <Modal title={confirm === 'render' ? '确认生成视频' : confirm === 'prompt' ? '确认生成视频提示词' : '确认生成替换文案'} onClose={() => { if (!action.busy) setConfirm(null); }}>
      <p>{confirm === 'render' ? `将生成${duration}秒、${resolution}竖屏视频，按供应商实际价格计费。自己的商品图片将通过限时链接用于此次生成。` : confirm === 'prompt' ? '将根据保存并确认的文案与自己的商品图生成视频提示词，可能产生费用。' : '将读取商品图与分析、参考片拆解，自动判断商品用法并生成替换文案，可能产生费用。重新生成会替换当前稿件。'}</p>
      <button className="primary" disabled={busy} onClick={() => void action.run(async () => {
        if (confirm === 'render') { await post(endpoint + '/render', { revision, confirmed: true, resolution }); await Promise.all([cache.invalidateQueries({ queryKey: [client.id, 'jobs'] }), query.refetch(), renders.refetch()]); setConfirm(null); }
        else { const accepted = await post<State>(endpoint + '/' + confirm, { revision, confirmed: true, overlays, duration }); cache.setQueryData(queryKey, accepted); setDirty(false); setConfirm(null); }
      })}>确认并继续</button>
      {action.error && <ErrorState error={new Error(action.error)} />}
    </Modal>}
    {preview && <Modal title={`商品图片${preview.index + 1}`} onClose={() => setPreview(null)}><img className="remake-reference-preview" src={fileUrl(client.id, preview.id)} alt={`商品图片${preview.index + 1}大图`} /></Modal>}
  </section></>;
}
