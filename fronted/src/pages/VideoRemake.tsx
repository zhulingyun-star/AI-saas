import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Header, Field, ErrorState, Loading, Empty, Modal, useAction, useData, useWorkspace } from '../components/UI';
import ProjectVideoStart from '../components/ProjectVideoStart';
import ReferenceStoryboard from '../components/ReferenceStoryboard';
import RemakeCopy from '../components/RemakeCopy';
import { useCampaignProducts } from '../components/CampaignProductsPanel';
import { fileUrl, put, request } from '../api';
import type { Asset, Campaign } from '../types';
import { validateRemake, type ReferenceMark, type RemakeSource } from '../remake';
import type { StoryboardState } from '../storyboard';

export default function VideoRemake() {
  const { id } = useParams();
  const boundProducts = useCampaignProducts(id ?? '');
  const [params, setParams] = useSearchParams();
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const action = useAction();
  const campaigns = useData<Campaign[]>('campaigns');
  const assets = useData<Asset[]>('assets');
  const campaign = campaigns.data?.find(c => c.id === id);
  const videos = assets.data?.filter(a => a.kind === 'REFERENCE' && a.mime.startsWith('video/')) ?? [];
  const sourceId = params.get('reference') ?? '';
  const referenceStorageKey = `remake-reference:${client.id}:${id}`;
  useEffect(() => {
    if (!assets.data) return;
    if (sourceId) {
      if (videos.some(a => a.id === sourceId)) {
        try { localStorage.setItem(referenceStorageKey, sourceId); } catch { /* Storage may be unavailable. */ }
      }
      return;
    }
    let remembered = '';
    try { remembered = localStorage.getItem(referenceStorageKey) ?? ''; } catch { /* Use the only available reference. */ }
    const restore = videos.find(a => a.id === remembered) ?? (videos.length === 1 ? videos[0] : undefined);
    if (restore) setParams(previous => { const next = new URLSearchParams(previous); next.set('reference', restore.id); return next; }, { replace: true });
  }, [assets.data, sourceId, referenceStorageKey, setParams]);
  const [marks, setMarks] = useState<ReferenceMark[]>([]);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [step, setStep] = useState(0);
  const [frame, setFrame] = useState('');
  const [activeMark, setActiveMark] = useState(0);
  const [ready, setReady] = useState<RemakeSource | null>(null);
  const [mediaError, setMediaError] = useState('');
  const [manualEditor, setManualEditor] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const stageParam = params.get('stage');
  const copyStage: 'copy' | 'prompt' = stageParam === 'prompt' ? 'prompt' : 'copy';
  const copyOpen = stageParam === 'copy' || stageParam === 'prompt';
  const [referenceReady, setReferenceReady] = useState(false);
  const [copyNavigation, setCopyNavigation] = useState({ dirty: false, promptReady: false });
  const readState = useQuery<StoryboardState>({ queryKey: [client.id, sourceId, 'storyboard'], queryFn: () => request(`/clients/${client.id}/assets/${sourceId}/storyboard`), enabled: !!sourceId });
  function goToStage(next: 'reference' | 'copy' | 'prompt') { setManualEditor(false); setStep(0); setParams({ reference: sourceId, ...(next === 'reference' ? {} : { stage: next }) }, { replace: true }); window.scrollTo({ top: 0 }); }
  const dragDepth = useRef(0);
  const uploading = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const hydrated = useRef('');
  const selected = videos.find(a => a.id === sourceId);
  useEffect(() => {
    if (!selected || hydrated.current === selected.id) return;
    hydrated.current = selected.id;
    const saved = selected.metadata.marks;
    setManualEditor(Array.isArray(saved) && saved.length > 0);
    setMarks(Array.isArray(saved) ? saved.filter(m => m && typeof m === 'object').map(m => ({ time: Number(m.time), visual: String(m.visual ?? ''), audio: String(m.audio ?? ''), adaptation: String(m.adaptation ?? '') })) : []);
    setDuration(Number(selected.metadata.duration) || 0); setActiveMark(0); setFrame(''); setMediaError('');
  }, [selected]);
  function choose(asset: Asset) {
    if (asset.id === sourceId) return;
    setPosition(0); setStep(0); setReady(null); setManualEditor(false); setReferenceReady(false); setCopyNavigation({ dirty: false, promptReady: false });
    setParams({ reference: asset.id }, { replace: true });
  }
  async function uploadReference(files: File[]) {
    if (uploading.current || action.busy || !files.length) return;
    uploading.current = true;
    try {
      await action.run(async () => {
        if (files.length !== 1) throw new Error('一次上传一条参考视频，请只拖入一个文件');
        const file = files[0];
        const mimeByExtension: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
        const mime = mimeByExtension[file.name.split('.').pop()?.toLowerCase() ?? ''];
        if (!mime) throw new Error('参考视频支持 MP4、MOV 和 WebM 格式');
        if (!file.size) throw new Error('视频文件为空，请重新选择');
        if (file.size > 100 * 1024 * 1024) throw new Error('参考视频不能超过 100MB');
        setUploadName(file.name);
        const body = new FormData(); body.set('kind', 'REFERENCE');
        body.set('file', file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified }));
        const asset = await request<Asset>(`/clients/${client.id}/assets`, { method: 'POST', body });
        await cache.invalidateQueries({ queryKey: [client.id, 'assets'] }); choose(asset);
      }, '参考视频已保存');
    } finally { uploading.current = false; setUploadName(''); }
  }
  async function deleteReference() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    await request(`/clients/${client.id}/assets/${target.id}/reference`, { method: 'DELETE' });
    cache.setQueryData<Asset[]>([client.id, 'assets'], old => old?.filter(a => a.id !== target.id));
    cache.removeQueries({ queryKey: [client.id, target.id, 'storyboard'] });
    if (sourceId === target.id) {
      try { localStorage.removeItem(referenceStorageKey); } catch { /* Keep deletion available without browser storage. */ }
      hydrated.current = ''; setMarks([]); setDuration(0); setPosition(0); setFrame('');
      setReady(null); setStep(0); setManualEditor(false); setActiveMark(0); setMediaError(''); setParams({}, { replace: true });
    }
    setDeleteTarget(null);
    await cache.invalidateQueries({ queryKey: [client.id, 'assets'] });
  }
  const source: RemakeSource = { assetId: sourceId, name: selected?.name ?? '', duration, marks };
  async function saveMarks() {
    if (!selected) throw new Error('请先选择参考视频');
    const error = validateRemake(source); if (error) throw new Error(error);
    const latest = await request<Asset[]>(`/clients/${client.id}/assets`);
    const asset = latest.find(a => a.id === sourceId); if (!asset) throw new Error('参考视频已不存在，请重新选择');
    await put(`/clients/${client.id}/assets/${sourceId}`, { ...asset, metadata: { ...asset.metadata, marks, duration } });
    await cache.invalidateQueries({ queryKey: [client.id, 'assets'] });
  }
  if (campaigns.isPending) return <Loading />;
  if (campaigns.error) return <ErrorState error={campaigns.error} />;
  if (!campaign) return <Empty title="项目不存在" description="返回项目管理选择项目。" />;
  if (campaign.archived) return <Empty title="项目已归档" description="请先恢复项目再制作。"><Link to={`/projects/${id}`}>返回项目</Link></Empty>;
  if (boundProducts.isPending) return <Loading />;
  if (boundProducts.error) return <ErrorState error={boundProducts.error} />;
  if (!boundProducts.data?.products.length) return <Empty title="请先绑定商品" description="先从资源中心绑定商品，才能进行下一步。"><Link className="button primary" to={`/projects/${id}`}>返回项目选择商品</Link></Empty>;
  const current = marks[activeMark];
  return <>
    <Header title="视频二创模式" description={`${campaign.name} · ${campaign.brief || '先拆参考片，再换成自己的商品内容'}`}>
      <Link className="button" to={`/projects/${id}`}>返回项目 / 切换模式</Link>
    </Header>
    <nav className="project-flow remake-step-nav" aria-label="视频二创步骤">
      <button aria-current={!copyOpen ? 'step' : undefined} disabled={copyNavigation.dirty} onClick={() => goToStage('reference')}>① 参考视频与结构拆解</button>
      <button aria-current={copyOpen && copyStage === 'copy' ? 'step' : undefined} disabled={!selected || (!copyOpen && !referenceReady) || !readState.data?.report} onClick={() => goToStage('copy')}>② 台词与花字替换</button>
      <button aria-current={copyOpen && copyStage === 'prompt' ? 'step' : undefined} disabled={!selected || copyNavigation.dirty || !readState.data?.report || (!copyOpen && !referenceReady)} onClick={() => goToStage('prompt')}>③ 视频制作</button>
    </nav>
    <p className="hint">原速读片，字幕优先。候选切点需核对；机位、衔接和特效分别编辑，补读建议由你确认采用。</p>
    {action.error && <ErrorState error={new Error(action.error)} />}
    {assets.error && <ErrorState error={assets.error} />}
    {step === 0 ? <>
      {!copyOpen && <section className={`panel padded reference-upload${dragActive ? ' is-dragging' : ''}`} aria-label="参考视频上传区域" aria-busy={!!uploadName}
        onDragEnter={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current++; if (!action.busy) setDragActive(true); }}
        onDragOver={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.dataTransfer.dropEffect = action.busy ? 'none' : 'copy'; }}
        onDragLeave={event => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragActive(false); }}
        onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragActive(false); void uploadReference(Array.from(event.dataTransfer.files)); }}>
        <div className="row between"><h2>1. 选择参考视频</h2><button disabled={action.busy} onClick={() => input.current?.click()}>{action.busy ? '处理中…' : '上传参考视频'}</button></div>
        <input className="visually-hidden" ref={input} type="file" accept=".mp4,.mov,.webm,video/mp4,video/webm,video/quicktime" disabled={action.busy} onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void uploadReference(files);
        }} />
        <button type="button" className="reference-dropzone" disabled={action.busy} onClick={() => input.current?.click()}>
          <strong>{uploadName ? `正在上传：${uploadName}` : dragActive ? '松开鼠标，上传参考视频' : '将参考视频拖到这里，或点击选择文件'}</strong>
          <span>MP4 / MOV / WebM · 单个文件不超过 100MB</span>
        </button>
        {assets.isPending ? <Loading /> : <div className="remake-video-options">{videos.map(asset => <div className="reference-video-choice" key={asset.id}>
          <button disabled={action.busy} className={sourceId === asset.id ? 'is-selected' : ''} onClick={() => choose(asset)}>{asset.name}</button>
          <button className="reference-delete" disabled={action.busy} aria-label={`删除参考视频 ${asset.name}`} onClick={() => setDeleteTarget(asset)}>删除</button>
        </div>)}</div>}
      </section>}
      {selected && copyOpen ? <><RemakeCopy key={sourceId} campaignId={campaign.id} assetId={sourceId} stage={copyStage} onStage={goToStage} onReference={() => goToStage('reference')} onNavigation={setCopyNavigation} /></> : selected && <><ReferenceStoryboard key={sourceId} assetId={sourceId} onReady={setReferenceReady} onCopy={() => goToStage('copy')} onUse={(next, d) => { setMarks(next); setDuration(d); setActiveMark(0); setManualEditor(true); }} /><button onClick={() => setManualEditor(!manualEditor)}>{manualEditor ? '收起人工改编' : '人工拆解 / 商品改编'}</button></>}
      {selected && manualEditor && <div className="remake-workbench">
        <section className="panel padded">
          <video key={sourceId} ref={video} src={fileUrl(client.id, sourceId)} controls className="reference-video"
            onLoadedMetadata={e => { const d=e.currentTarget.duration; if(Number.isFinite(d))setDuration(d); }}
            onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onError={() => setMediaError('浏览器无法播放此格式，请转换为 H.264 MP4 后上传。')} />
          {mediaError && <ErrorState error={new Error(mediaError)} />}
          <div className="row between"><span>{position.toFixed(1)} / {duration.toFixed(1)} 秒</span><button onClick={() => {
            const v=video.current; if(!v || !v.videoWidth)return;
            const canvas=document.createElement('canvas');canvas.width=480;canvas.height=Math.round(480*v.videoHeight/v.videoWidth);
            canvas.getContext('2d')?.drawImage(v,0,0,canvas.width,canvas.height);setFrame(canvas.toDataURL('image/jpeg'));
          }}>抽取当前帧</button></div>
          {frame && <img className="captured-frame" src={frame} alt="参考视频当前帧" />}
        </section>
        <section className="panel padded">
          <div className="row between"><h2>2. 标记与改编镜头</h2><button disabled={marks.length >= 20 || !duration || !!mediaError} onClick={() => {
            const time=marks.length ? Number(position.toFixed(1)) : 0;
            if(time>=duration || marks.some(m=>m.time===time)) return;
            const next=[...marks,{time,visual:'',audio:'',adaptation:''}].sort((a,b)=>a.time-b.time);
            setMarks(next);setActiveMark(next.findIndex(m=>m.time===time));
          }}>{marks.length ? '标记当前切点' : '从 0 秒开始拆解'}</button></div>
          <div className="product-view-tabs">{marks.map((mark,index)=><button key={index} aria-pressed={activeMark===index} onClick={()=>{setActiveMark(index);if(video.current)video.current.currentTime=mark.time;}}>镜头{index+1} · {mark.time}s</button>)}</div>
          {current ? <>
            <Field label="镜头开始（秒）"><input type="number" min={0} max={duration} step={0.1} disabled={activeMark===0} value={current.time} onChange={e=>setMarks(marks.map((m,i)=>i===activeMark?{...m,time:Number(e.target.value)}:m))}/></Field>
            {([['visual','原片画面与结构'],['audio','原片台词 / 声音（仅供参考）'],['adaptation','当前商品如何改编']] as const).map(([key,label])=><Field key={key} label={label}><textarea rows={3} maxLength={600} value={current[key]} onChange={e=>setMarks(marks.map((m,i)=>i===activeMark?{...m,[key]:e.target.value}:m))}/></Field>)}
            <button onClick={()=>{const next=marks.filter((_,i)=>i!==activeMark);if(next.length)next[0]={...next[0],time:0};setMarks(next);setActiveMark(Math.max(0,activeMark-1));}}>移除此镜</button>
          </> : <p className="muted">播放参考片，在画面转换处标记切点。第一镜从 0 秒开始。</p>}
          <div className="row remake-next"><button disabled={action.busy || !marks.length} onClick={()=>void action.run(saveMarks,'参考拆解已保存')}>保存拆解</button>
            <button className="primary" disabled={action.busy || !marks.length || !!mediaError} onClick={()=>void action.run(async()=>{await saveMarks();setReady(structuredClone(source));setStep(1);})}>下一步：选择商品</button></div>
        </section>
      </div>}
    </> : ready && <><button onClick={()=>setStep(0)}>返回参考视频与拆解</button><p className="hint">参考：{ready.name} · {ready.marks.length} 个镜头。按原片各段占比分配目标时长；原台词不复制，请在分镜页撰写。</p><ProjectVideoStart campaign={campaign} remake={ready}/></>}
    {deleteTarget && <Modal title="删除参考视频" onClose={() => { if (!action.busy) setDeleteTarget(null); }}>
      <p>确认删除「{deleteTarget.name}」？对应的分镜分析和编辑记录也会删除，删除后可重新上传。</p>
      {action.error && <ErrorState error={new Error(action.error)} />}
      <div className="row"><button disabled={action.busy} onClick={() => setDeleteTarget(null)}>取消</button><button className="primary" disabled={action.busy} onClick={() => void action.run(deleteReference, '参考视频已删除')}>{action.busy ? '正在删除…' : '确认删除'}</button></div>
    </Modal>}
  </>;
}
