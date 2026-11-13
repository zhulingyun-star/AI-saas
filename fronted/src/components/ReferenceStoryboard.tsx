import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fileUrl, post, put, request } from '../api';
import { ErrorState, Field, Modal, useAction, useWorkspace } from './UI';
import { applyReadSuggestion, mergeReadShots, splitReadShot, type ReadShot, type StoryboardReport, type StoryboardState } from '../storyboard';
import type { ReferenceMark } from '../remake';

export default function ReferenceStoryboard({ assetId, onUse }: { assetId: string; onUse: (marks: ReferenceMark[], duration: number) => void }) {
  const { client } = useWorkspace(), action = useAction();
  const endpoint = `/clients/${client.id}/assets/${assetId}/storyboard`;
  const query = useQuery<StoryboardState>({ queryKey: [client.id, assetId, 'storyboard'], queryFn: () => request(endpoint), refetchInterval: q => ['QUEUED', 'RUNNING'].includes(q.state.data?.status ?? '') ? 2500 : false });
  const [draft, setDraft] = useState<StoryboardReport | null>(null), [revision, setRevision] = useState(-1), [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState(0), [tab, setTab] = useState<'shots' | 'dialogue' | 'overall'>('shots');
  const [position, setPosition] = useState(0), [confirm, setConfirm] = useState<{ shotId?: string; slow: boolean } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const data = query.data, busy = action.busy || ['QUEUED', 'RUNNING'].includes(data?.status ?? '');
  useEffect(() => {
    if (data && !dirty && data.revision !== revision) { setDraft(data.report ? structuredClone(data.report) : null); setRevision(data.revision); setSelected(i => Math.min(i, (data.report?.shots.length ?? 1) - 1)); }
  }, [data, dirty, revision]);
  useEffect(() => { if (!dirty) return; const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, [dirty]);
  const shot = draft?.shots[selected];
  const suggestions = draft?.suggestions.filter(s => s.shotId === shot?.id && s.targetStart === shot.start && s.targetEnd === shot.end) ?? [];
  function edit(next: StoryboardReport) { setDraft(next); setDirty(true); }
  function field(key: keyof ReadShot, value: string) { if (draft) edit({ ...draft, shots: draft.shots.map((s, i) => i === selected ? { ...s, [key]: value } : s) }); }
  async function save() {
    if (!draft) return;
    const result = await put<StoryboardState>(endpoint, { revision, report: draft });
    setDirty(false); setRevision(result.revision); setDraft(result.report ?? null); await query.refetch();
  }
  function seek(at: number) { if (video.current) video.current.currentTime = at; }
  return <section className="reference-storyboard panel padded">
    <div className="row between"><h2>参考片分镜</h2><div className="row">
      <button disabled={busy || dirty || !data?.enabled} onClick={() => setConfirm({ slow: false })}>{draft ? '重新分析整片' : 'AI 读取视频'}</button>
      {draft && <button className="primary" disabled={busy || !dirty} onClick={() => void action.run(save, '分镜已保存')}>保存分镜</button>}
    </div></div>
    {query.error && <ErrorState error={query.error} retry={() => void query.refetch()} />}
    {action.error && <ErrorState error={new Error(action.error)} />}
    {data?.error && <p className="error-box">{data.error}</p>}
    {data && !data.enabled && <p className="hint">尚未配置视频分析模型，可使用下方人工拆解。</p>}
    {busy && <p role="status">{data?.status === 'QUEUED' ? '已排队' : '正在处理'}：整片读取 / 无字幕音频补词 / 短镜补读。任务已保存，可稍后返回。</p>}
    {dirty && <p className="hint">有未保存修改。先保存，再补读或重新分析。<button onClick={() => { setDirty(false); setRevision(-1); }}>放弃本地修改，读取已保存版</button></p>}
    <div className="read-workbench">
      <div className="read-player">
        <video ref={video} src={fileUrl(client.id, assetId)} controls preload="metadata" onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} />
        <div className="row between"><span>{position.toFixed(2)} 秒</span>{shot && <button onClick={() => seek(shot.start)}>定位当前镜头</button>}</div>
      </div>
      <div className="read-editor">
        {!draft ? <p className="muted">点击“AI 读取视频”生成可编辑分镜。字幕优先，无字幕语音区间再读音频。</p> : <>
          <nav className="product-view-tabs" aria-label="分镜信息分类">{([['shots', '画面与镜头'], ['dialogue', '台词与字幕'], ['overall', '全片结构与声音']] as const).map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
          <fieldset disabled={busy} className="read-fields">
          {tab === 'shots' && <>
            <div className="read-thumbnails">{draft.shots.map((s, i) => <button key={s.id} aria-pressed={selected === i} aria-label={`选择镜头${i + 1}`} onClick={() => { setSelected(i); seek(s.start); }}>
              <img loading="lazy" src={`/api${endpoint}/thumbnail?at=${((s.start + s.end) / 2).toFixed(3)}`} alt={`镜头${i + 1}缩略图`} />
              <strong>镜头{i + 1}</strong><small>{s.start.toFixed(2)}–{s.end.toFixed(2)}s</small>
            </button>)}</div>
            {shot && <>
              <div className="row read-shot-actions"><button disabled={selected === draft.shots.length - 1} onClick={() => void action.run(async () => edit(mergeReadShots(draft, selected)))}>与后一镜合并</button><button onClick={() => void action.run(async () => edit(splitReadShot(draft, selected, position)))}>在播放位置拆分</button>
                <button disabled={dirty || !data?.enabled} onClick={() => setConfirm({ shotId: shot.id, slow: false })}>补读此镜头</button><button disabled={dirty || !data?.enabled} onClick={() => setConfirm({ shotId: shot.id, slow: true })}>慢放复核</button>
              </div>
              <div className="read-field-grid">{([['action', '构图、主体与动作'], ['camera', '机位 / 运镜'], ['transition', '与前镜衔接'], ['effects', '镜内特效 / 速度'], ['text', '花字 / 画面文字'], ['review', '切点证据 / 待核对']] as const).map(([key, label]) => <Field key={key} label={label}><textarea rows={key === 'action' ? 4 : 2} maxLength={2000} value={shot[key]} onChange={e => field(key, e.target.value)} /></Field>)}</div>
              {suggestions.length > 0 && <div className="read-suggestions"><h3>补读建议 · 不自动覆盖</h3>{suggestions.map((suggestion, i) => <article key={i}><strong>{suggestion.slow ? '3倍慢放复核' : '原速补读'} · 包含前后画面</strong><p>{suggestion.action}</p><p>机位：{suggestion.camera} · 衔接：{suggestion.transition}</p><p>特效：{suggestion.effects} · 花字：{suggestion.text}</p><p>{suggestion.review}</p><button onClick={() => void action.run(async () => edit(applyReadSuggestion(draft, suggestion)))}>采用这份建议</button></article>)}</div>}
            </>}
          </>}
          {tab === 'dialogue' && <>
            <div className="row between"><p>对白字幕优先；花字不当台词。修改后来源标为“人工”。</p><button onClick={() => edit({ ...draft, dialogue: [...draft.dialogue, { id: crypto.randomUUID(), start: Math.min(position, Math.max(0, draft.duration - .1)), end: Math.min(draft.duration, position + 1), text: '', source: 'manual' }] })}>添加台词</button></div>
            <div className="read-dialogue">{draft.dialogue.map((line, i) => <article key={line.id}>
              <div className="row"><button onClick={() => seek(line.start)}>播放第{i + 1}句</button><span className="pill">{({ subtitle: '字幕', audio: '音频', manual: '人工' })[line.source]}</span></div>
              <div className="read-line-times">{(['start', 'end'] as const).map(key => <Field key={key} label={`第${i + 1}句${key === 'start' ? '开始' : '结束'}（秒）`}><input type="number" min={0} max={draft.duration} step={.01} value={line[key]} onChange={e => edit({ ...draft, dialogue: draft.dialogue.map(l => l.id === line.id ? { ...l, [key]: Number(e.target.value), source: 'manual' } : l) })} /></Field>)}</div>
              <Field label={`第${i + 1}句台词`}><textarea rows={2} maxLength={2000} value={line.text} onChange={e => edit({ ...draft, dialogue: draft.dialogue.map(l => l.id === line.id ? { ...l, text: e.target.value, source: 'manual' } : l) })} /></Field>
              <button onClick={() => edit({ ...draft, dialogue: draft.dialogue.filter(l => l.id !== line.id) })}>删除此句</button>
            </article>)}</div>
          </>}
          {tab === 'overall' && <><Field label="整片结构 / 节奏"><textarea rows={5} maxLength={3000} value={draft.summary} onChange={e => edit({ ...draft, summary: e.target.value })} /></Field><Field label="背景音乐 / 音效 / 卡点"><textarea rows={5} maxLength={2000} value={draft.music} onChange={e => edit({ ...draft, music: e.target.value })} /></Field><p>原片时长：{draft.duration.toFixed(3)}秒。候选镜头数量不代表已确认的真实切镜数量。</p></>}
          </fieldset>
        </>}
      </div>
    </div>
    {draft && <div className="row between"><span>{draft.shots.length} 个分镜区间 · {draft.dialogue.length} 句台词</span><button disabled={busy || dirty || draft.shots.length > 20} onClick={() => onUse(draft.shots.map(s => ({ time: s.start, visual: [s.action, `机位：${s.camera}`, `衔接：${s.transition}`, `特效：${s.effects}`].join('\n').slice(0, 600), audio: draft.dialogue.filter(l => l.start < s.end && l.end > s.start).map(l => l.text).join('\n').slice(0, 600), adaptation: '' })), draft.duration)}>带入商品改编{draft.shots.length > 20 ? '（先合并至20镜以内）' : ''}</button></div>}
    {!!data?.calls?.length && <details><summary>本次调用记录</summary>{data.calls.map((c, i) => <p key={i}>{c.phase} · {c.seconds}秒 · {c.http ? `HTTP ${c.http}` : '响应未知'}</p>)}</details>}
    {confirm && <Modal title={confirm.shotId ? '确认补读镜头' : '确认读取整片'} onClose={() => setConfirm(null)}>
      <p>使用 {data?.model}，可能产生供应商费用。</p>
      <p>{confirm.shotId ? `${confirm.slow ? '3倍慢放无声复核' : '原速补读'}，包含前后各约1秒画面；结果仅作为建议。` : '整片原速读取；有无字幕语音时增加一次音频调用；最多自动补读3个短镜头，总计最多5次调用。重新分析会替换已保存的分镜编辑。'}</p>
      <p>遇到超时不会自动重发；供应商是否计费以其账单为准。</p>
      <button className="primary" disabled={busy} onClick={() => void action.run(async () => { await post(endpoint, { revision, confirmed: true, ...confirm }); setConfirm(null); await query.refetch(); })}>确认并开始分析</button>
    </Modal>}
  </section>;
}
