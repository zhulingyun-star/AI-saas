import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { jobUrl, post, put } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Notice } from '../../gy/ui';
import { adCheck, type AdContext } from '../../adcheck';
import { AdText } from './StepStoryboard';
import { TopBar, type StepProps } from './parts';
import {
  changedSegments,
  elapsed,
  formatRR,
  pairSegments,
  shortTime,
  stageOf,
  STAGES,
  versionRunning,
  versionState,
  type Flow,
  type Segment,
  type Verdict,
  type Version,
} from './data';

/** 接力的四个入口：换开头 / 换场景 / 换人群 / 换价格说法 */
const RELAY = [
  ['hook', '换开头'],
  ['scene', '换场景'],
  ['persona', '换人群'],
  ['price', '换价格说法'],
] as const;
type RelayKind = (typeof RELAY)[number][0];
const PRICE_NO = '商品资料里还没有价格，先去商品库补上真实价格和活动，AI 不会自己编';
const HOOK_ORDER = [
  '痛点型',
  '对比型',
  '悬念型',
  '结果前置型',
  '人群锁定型',
  '反常识型',
  '身份代入型',
];
export function relayText(flow: Flow, kind: RelayKind) {
  const persona = flow.product.personas.find((p) => p.name === flow.settings.personaName);
  if (kind === 'hook') {
    const now = flow.reference.hook;
    const alt = [...(persona?.hooks ?? []), ...HOOK_ORDER].find((h) => h && h !== now) ?? '对比型';
    return `开头从「${now || '现在的开头'}」换成「${alt}」：重写前 3 秒的画面和第一句台词，后面的镜头和卖点不动`;
  }
  if (kind === 'scene') return '换一个拍摄场景：人物、商品和台词都不变，只换拍摄地方和光线';
  if (kind === 'persona') {
    const alt = flow.product.personas.find((p) => p.name !== flow.settings.personaName);
    return alt
      ? `换给「${alt.name}」看：开头和台词按他们的说法改${alt.worry ? `（他们在意：${alt.worry}）` : ''}，商品卖点不变`
      : '换给另一群人看：开头和台词按他们的说法改，商品卖点不变';
  }
  return '换一种讲价格的方式：只用商品资料里写的价格和活动，别的不动';
}

type Pending = { segments: Segment[]; note: string; basedOn: string | null; msg: string };
type Editing = {
  id: string;
  ask: string;
  segments: Segment[];
  relay?: string;
  aiNote?: string;
  error?: string;
};

/** 第 4 步 出片：每版一张卡（新的在上），单独审片，改这一版再出，两版并排对比，基于某一版再做一条。 */
export default function StepOutput({ flow, reload, go }: StepProps) {
  const { client, notify } = useWorkspace();
  const versions = flow.versions;
  const [pending, setPending] = useState<Pending | null>(null);
  const [edit, setEdit] = useState<Editing | null>(null);
  const [cmp, setCmp] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const running = versions.find(versionRunning);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  const ctx: AdContext = {
    hasPrice: flow.product.analysis.hasPrice,
    risks: flow.product.analysis.risks,
  };
  const nextNo = (versions[0]?.no ?? 0) + 1;
  const rr = formatRR(flow.settings);
  const prevOf = (v: Version) => versions.find((x) => x.no < v.no);
  const latestDone = versions.find((v) => v.hasOutput) ?? versions.find((v) => !versionRunning(v));

  const runIt = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submit = () =>
    pending &&
    void runIt(async () => {
      const v = await post<Version>(`/clients/${client.id}/projects/${flow.project.id}/versions`, {
        segments: pending.segments,
        note: pending.note,
        basedOn: pending.basedOn,
        confirmed: true,
      });
      setPending(null);
      setEdit(null);
      setCmp([]);
      await reload();
      notify(
        v.status === 'BLOCKED'
          ? `第 ${v.no} 版已记下，但视频接口没启用，没有发出生成请求`
          : `第 ${v.no} 版已提交出片`,
      );
    });
  const openEdit = (v: Version, relay?: RelayKind) => {
    setPending(null);
    setEdit({
      id: v.id,
      ask: relay ? relayText(flow, relay) : '',
      segments: v.segments.filter((s) => s.key !== 'avoid').map((s) => ({ ...s })),
      relay: relay
        ? `接力 · ${RELAY.find(([k]) => k === relay)![1]} · 基于「第 ${v.no} 版」`
        : undefined,
    });
  };
  const rewrite = (v: Version) =>
    edit &&
    void runIt(async () => {
      if (!edit.ask.trim()) throw new Error('先写一句要怎么改');
      try {
        const r = await post<{ segments: Segment[]; note: string }>(
          `/clients/${client.id}/projects/${flow.project.id}/versions/rewrite`,
          { basedOn: v.id, instruction: edit.ask.trim() },
        );
        setEdit({ ...edit, segments: r.segments, aiNote: r.note, error: undefined });
        const changed = changedSegments(r.segments, v.segments).map((s) => s.title);
        setPending({
          segments: r.segments,
          note: r.note,
          basedOn: v.id,
          msg: `AI 按“${edit.ask.trim()}”改好了出片词${changed.length ? `（改了 ${changed.join('、')}）` : ''}，照它出第 ${nextNo} 版（${rr}）`,
        });
      } catch (e) {
        setEdit({ ...edit, error: (e as Error).message });
      }
    });
  const renderEdited = (v: Version) => {
    if (!edit) return;
    const changed = changedSegments(edit.segments, v.segments).map((s) => s.title);
    if (!changed.length) return notify('还没改任何一段');
    setPending({
      segments: edit.segments,
      note: edit.aiNote
        ? `${edit.aiNote}；又改了 ${changed.join('、')}`
        : `直接改了 ${changed.join('、')}`,
      basedOn: v.id,
      msg: `照改好的出片词（改了 ${changed.join('、')}）出第 ${nextNo} 版（${rr}）`,
    });
  };
  const verdict = (v: Version, patch: Partial<Verdict>) =>
    void runIt(async () => {
      const cur = v.verdict;
      await put(`/clients/${client.id}/jobs/${v.id}/verdict`, {
        rating: 'rating' in patch ? patch.rating : (cur?.rating ?? null),
        reason: 'reason' in patch ? patch.reason : (cur?.reason ?? ''),
        use: 'use' in patch ? patch.use : (cur?.use ?? null),
        revision: cur?.revision ?? 0,
      });
      await reload();
    });
  const cancel = (v: Version) =>
    void runIt(async () => {
      await post(`/clients/${client.id}/jobs/${v.id}/cancel`, {});
      await reload();
      notify(`第 ${v.no} 版已取消`);
    });

  // 置顶操作条
  let bar: ReactNode;
  if (!flow.storyboard.confirmed && !versions.length)
    bar = (
      <TopBar
        actions={
          <Btn variant="primary" onClick={() => go(3)}>
            去确认分镜
          </Btn>
        }
      >
        分镜还没确认，确认以后才能出片。
      </TopBar>
    );
  else if (pending)
    bar = (
      <TopBar
        actions={
          <>
            <Btn variant="ghost" disabled={busy} onClick={() => setPending(null)}>
              取消
            </Btn>
            <Btn variant="primary" busy={busy} onClick={submit}>
              确认出片
            </Btn>
          </>
        }
      >
        <b>确认：</b>
        {pending.msg}，会调用视频生成。
      </TopBar>
    );
  else if (running)
    bar = (
      <TopBar
        actions={
          <Btn disabled={busy} onClick={() => cancel(running)}>
            取消这一版
          </Btn>
        }
      >
        第 {running.no} 版正在出片 · {STAGES[Math.max(0, stageOf(running))]} · 已等待{' '}
        <span className="num">{elapsed(running.createdAt, now)}</span>，可以先离开页面
      </TopBar>
    );
  else if (!versions.length)
    bar = (
      <TopBar
        actions={
          <Btn
            variant="primary"
            onClick={() =>
              setPending({
                segments: flow.draftSegments,
                note: '',
                basedOn: null,
                msg: `按已确认的分镜出第 1 版（${rr} · ${flow.targetDuration} 秒）`,
              })
            }
          >
            出第一版
          </Btn>
        }
      >
        分镜已确认。下面是按分镜拼好的出片词，看一下就能出第一版。
      </TopBar>
    );
  else
    bar = (
      <TopBar
        actions={
          latestDone && (
            <Btn variant="primary" onClick={() => openEdit(latestDone)}>
              改最新一版再出
            </Btn>
          )
        }
      >
        已出 {versions.length} 版 · 可投放{' '}
        {versions.filter((v) => v.verdict?.use === 'USABLE').length}{' '}
        版。每版都能单独审片；要改就点某一版的「改这一版再出」。
      </TopBar>
    );

  const pair =
    cmp.length === 2 ? cmp.map((id) => versions.find((v) => v.id === id)!).filter(Boolean) : [];

  return (
    <>
      {bar}
      {err && <Notice tone="error">{err}</Notice>}
      {!flow.videoEnabled && (
        <Notice tone="warn" title="视频接口没启用">
          现在出片只会把这一版的出片词和设置记下来，不会真的发出生成请求；配置好视频接口以后再出。
        </Notice>
      )}
      {flow.storyboard.confirmed && !versions.length && (
        <Card className="gy-pjs">
          <h3>
            第 1 版的出片词<small>按已确认的分镜拼出来的，{flow.draftSegments.length} 段</small>
          </h3>
          <SegmentList segments={flow.draftSegments} ctx={ctx} />
        </Card>
      )}
      {pair.length === 2 && (
        <ComparePanel
          a={pair[0].no < pair[1].no ? pair[0] : pair[1]}
          b={pair[0].no < pair[1].no ? pair[1] : pair[0]}
          onSwap={() => setCmp([cmp[1], cmp[0]])}
          swapped={pair[0].no > pair[1].no}
          onClose={() => setCmp([])}
          onUse={(v) => verdict(v, { use: 'USABLE' })}
          ctx={ctx}
        />
      )}
      {versions.length > 0 && (
        <div className="gy-vhead">
          <b>已出的片子</b>
          <span className="gy-muted">
            {versions.length} 版 · 最新的在上面{versions.length >= 2 ? ' · 勾两版可以并排对比' : ''}
          </span>
          {versions.length >= 2 && cmp.length < 2 && (
            <Btn size="xs" onClick={() => setCmp([versions[1].id, versions[0].id])}>
              对比最新两版
            </Btn>
          )}
        </div>
      )}
      {versions.map((v) => {
        const prev = prevOf(v);
        const changed = changedSegments(v.segments, prev?.segments)
          .filter((s) => s.key !== 'avoid' && !v.note.includes(s.title))
          .map((s) => s.title);
        const [state, tone] = versionState(v);
        const stage = stageOf(v);
        const isEdit = edit?.id === v.id;
        const hits = v.segments.reduce((n, s) => n + adCheck(s.text, ctx).length, 0);
        return (
          <Card className="gy-ocver" key={v.id} aria-label={`第 ${v.no} 版`}>
            <div className="media">
              {v.hasOutput ? (
                <video
                  src={jobUrl(client.id, v.id)}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`第 ${v.no} 版成片`}
                  className={v.ratio === '16:9' ? 'land' : ''}
                />
              ) : versionRunning(v) ? (
                <div className="gy-vgen" role="status">
                  <span className="sp" aria-hidden="true" />
                  <b>正在出第 {v.no} 版</b>
                  <span className="ph4">
                    {STAGES.map((t, j) => (
                      <span key={t} className={j < stage ? 'd' : j === stage ? 'n' : ''}>
                        {t}
                      </span>
                    ))}
                  </span>
                  <small>
                    已等待 {elapsed(v.createdAt, now)}
                    <br />
                    可以离开页面，出好了会出现在这里
                  </small>
                </div>
              ) : (
                <div className="gy-vgen off">
                  <b>{state}</b>
                  <small>{v.message}</small>
                </div>
              )}
            </div>
            <div className="body">
              <div className="vh2">
                <b>第 {v.no} 版</b>
                {versions.length >= 2 && (
                  <label className="gy-cmpchk">
                    <input
                      type="checkbox"
                      checked={cmp.includes(v.id)}
                      onChange={(e) =>
                        setCmp((cur) =>
                          e.target.checked
                            ? [...cur.filter((x) => x !== v.id), v.id].slice(-2)
                            : cur.filter((x) => x !== v.id),
                        )
                      }
                    />
                    选来对比
                  </label>
                )}
                <small>
                  {shortTime(v.createdAt)} · {formatRR(v)} · {v.duration} 秒
                </small>
                <span
                  className={`gy-pill ${tone === 'ok' ? 'ok' : tone === 'bad' || tone === 'warn' ? 'warn' : 'idle'}`}
                >
                  {state}
                </span>
              </div>
              <div className="gy-vdiff">
                {!prev
                  ? v.note || '首版：按已确认的分镜出片'
                  : `比第 ${prev.no} 版：${v.note || '没写改了什么'}${changed.length ? `（改了 ${changed.join('、')}）` : ''}`}
                {v.carriedReasons.length > 0 && (
                  <>
                    <br />
                    带上了之前“差”的原因：{v.carriedReasons.join('；')}
                  </>
                )}
              </div>
              {(v.status === 'BLOCKED' || v.status === 'FAILED' || v.status === 'CANCELLED') && (
                <span className="gy-fine">{v.message}</span>
              )}
              {v.status === 'BLOCKED' && (
                <span className="gy-row">
                  <Btn size="xs" disabled={busy} onClick={() => cancel(v)}>
                    {v.message.includes('未配置') ? '取消这一版' : '核对过了，取消这一版'}
                  </Btn>
                </span>
              )}
              {v.hasOutput && <Review v={v} busy={busy} onSave={(p) => verdict(v, p)} />}
              {isEdit ? (
                <div className="gy-ocedit">
                  <div className="gy-ocask">
                    {edit.relay && <span className="rl">{edit.relay}</span>}
                    <b>说一句话让 AI 改</b>
                    <span className="gy-row">
                      <input
                        className="gy-input"
                        aria-label="一句话说要怎么改"
                        value={edit.ask}
                        placeholder="例：第 5 镜改成上脚特写；开头再快一点"
                        onChange={(e) => setEdit({ ...edit, ask: e.target.value })}
                      />
                      <Btn
                        size="xs"
                        variant="primary"
                        busy={busy}
                        disabled={!flow.aiEnabled}
                        title={flow.aiEnabled ? undefined : '文字模型没配置，AI 暂时改不了'}
                        onClick={() => rewrite(v)}
                      >
                        按这句改
                      </Btn>
                    </span>
                    {!flow.aiEnabled && (
                      <small className="gy-muted">
                        文字模型没配置，AI 暂时改不了；可以直接改下面的段落。
                      </small>
                    )}
                    {edit.error && <Notice tone="error">{edit.error}</Notice>}
                    {edit.aiNote && (
                      <small className="gy-muted">AI 改好了，下面标橙的是改过的段落。</small>
                    )}
                  </div>
                  <span className="gy-fine">
                    或者直接改某一段（只改要改的那段，其余不动）。想长期改镜头和台词，回「分镜」改。
                  </span>
                  <div className="gy-ocsecs">
                    {edit.segments.map((s, j) => {
                      const was = v.segments.find((x) => x.key === s.key)?.text;
                      return (
                        <details
                          className={`gy-ocsec${was !== s.text ? ' chg' : ''}`}
                          key={s.key}
                          open={j === 0}
                        >
                          <summary>{s.title}</summary>
                          <textarea
                            className="gy-textarea"
                            aria-label={`第 ${v.no} 版出片词 · ${s.title}`}
                            rows={Math.min(8, Math.ceil(s.text.length / 60) + 1)}
                            value={s.text}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                segments: edit.segments.map((x, k) =>
                                  k === j ? { ...x, text: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </details>
                      );
                    })}
                  </div>
                  <span className="gy-row end">
                    <Btn
                      size="xs"
                      variant="ghost"
                      onClick={() => (setEdit(null), setPending(null))}
                    >
                      取消
                    </Btn>
                    <Btn size="xs" variant="primary" onClick={() => renderEdited(v)}>
                      照改好的词出片
                    </Btn>
                  </span>
                </div>
              ) : (
                <>
                  <details className="gy-ocsec">
                    <summary>
                      这一版的出片词 · {v.segments.length} 段
                      {changed.length ? ' · 和上一版不同的段落标橙' : ''}
                      {hits > 0 && (
                        <span className="gy-adcnt">
                          {' '}
                          · {hits} 处可能违规的说法（只标出来，不改也能出）
                        </span>
                      )}
                    </summary>
                    <SegmentList segments={v.segments} prev={prev?.segments} ctx={ctx} />
                  </details>
                  <span className="gy-row">
                    {!versionRunning(v) && (
                      <Btn size="xs" onClick={() => openEdit(v)}>
                        改这一版再出
                      </Btn>
                    )}
                    <Btn
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        void navigator.clipboard
                          ?.writeText(v.segments.map((s) => s.text).join('\n\n'))
                          .then(() => notify('出片词已复制'))
                          .catch(() => notify('浏览器不让复制，可以展开后手动选'))
                      }
                    >
                      复制出片词
                    </Btn>
                    {versionRunning(v) && (
                      <Btn size="xs" disabled={busy} onClick={() => cancel(v)}>
                        取消这一版
                      </Btn>
                    )}
                    <Link className="gy-link" to={`/queue?job=${v.id}`}>
                      在生成任务里看
                    </Link>
                  </span>
                  {v.hasOutput && (
                    <div className="gy-rlrow">
                      <span>基于这条再做一条</span>
                      {RELAY.map(([k, t]) => {
                        const off = k === 'price' && !flow.product.analysis.hasPrice;
                        return (
                          <Btn
                            key={k}
                            size="xs"
                            variant="ghost"
                            disabled={off}
                            title={off ? PRICE_NO : undefined}
                            onClick={() => openEdit(v, k)}
                          >
                            {t}
                          </Btn>
                        );
                      })}
                      {!flow.product.analysis.hasPrice && (
                        <small>换价格说法要先在商品库补真实价格</small>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        );
      })}
    </>
  );
}

function SegmentList({
  segments,
  prev,
  ctx,
}: {
  segments: Segment[];
  prev?: Segment[];
  ctx: AdContext;
}) {
  return (
    <div className="gy-ocprm">
      {segments.map((s) => {
        const chg = !!prev && prev.find((p) => p.key === s.key)?.text !== s.text;
        return (
          <div className={`gy-pseg${chg ? ' chg' : ''}`} key={s.key}>
            <span className="pst">{s.title}</span>
            <AdText text={s.text} hits={adCheck(s.text, ctx)} />
          </div>
        );
      })}
    </div>
  );
}

/** 单独审片：好 / 差（必填原因，下一版会带上）/ 可投放 / 不用了 */
function Review({
  v,
  busy,
  onSave,
}: {
  v: Version;
  busy: boolean;
  onSave: (p: Partial<Verdict>) => void;
}) {
  const cur = v.verdict;
  const [bad, setBad] = useState(false);
  const [reason, setReason] = useState(cur?.reason ?? '');
  useEffect(() => setReason(cur?.reason ?? ''), [cur?.reason]);
  const showReason = bad || cur?.rating === 'BAD';
  return (
    <div className="gy-ocrev">
      <span className="gy-seg" role="group" aria-label={`第 ${v.no} 版的评价`}>
        <button
          type="button"
          aria-pressed={cur?.rating === 'GOOD'}
          disabled={busy}
          onClick={() => {
            setBad(false);
            onSave({ rating: cur?.rating === 'GOOD' ? null : 'GOOD', reason: '' });
          }}
        >
          好
        </button>
        <button
          type="button"
          aria-pressed={cur?.rating === 'BAD' || bad}
          disabled={busy}
          onClick={() => setBad(true)}
        >
          差
        </button>
      </span>
      {showReason && (
        <span className="gy-row reason">
          <input
            className="gy-input"
            aria-label={`第 ${v.no} 版差在哪`}
            maxLength={300}
            value={reason}
            placeholder="差在哪（必填），下一版会带上"
            onChange={(e) => setReason(e.target.value)}
          />
          <Btn
            size="xs"
            disabled={
              busy || !reason.trim() || (cur?.rating === 'BAD' && reason.trim() === cur.reason)
            }
            onClick={() => {
              setBad(false);
              onSave({ rating: 'BAD', reason: reason.trim() });
            }}
          >
            保存原因
          </Btn>
        </span>
      )}
      {cur?.use === 'USABLE' ? (
        <span className="gy-pill ok">可投放</span>
      ) : (
        <Btn size="xs" disabled={busy} onClick={() => onSave({ use: 'USABLE' })}>
          标记可投放
        </Btn>
      )}
      {cur?.use === 'DISCARDED' ? (
        <Btn size="xs" variant="ghost" disabled={busy} onClick={() => onSave({ use: null })}>
          恢复（已标不用了）
        </Btn>
      ) : (
        <Btn size="xs" variant="ghost" disabled={busy} onClick={() => onSave({ use: 'DISCARDED' })}>
          不用了
        </Btn>
      )}
    </div>
  );
}

/** 两版并排：一起播放（右边静音）、左右互换、按段对齐列出不同的出片词 */
function ComparePanel({
  a,
  b,
  swapped,
  onSwap,
  onClose,
  onUse,
  ctx,
}: {
  a: Version;
  b: Version;
  swapped: boolean;
  onSwap: () => void;
  onClose: () => void;
  onUse: (v: Version) => void;
  ctx: AdContext;
}) {
  const { client } = useWorkspace();
  const left = swapped ? b : a;
  const right = swapped ? a : b;
  const refs = useRef<(HTMLVideoElement | null)[]>([]);
  const rows = pairSegments(left.segments, right.segments);
  const diff = rows.filter((r) => r.left !== r.right);
  const same = rows.filter((r) => r.left === r.right);
  const col = (v: Version, k: number) => {
    const [state, tone] = versionState(v);
    return (
      <div className="vcol">
        <div className="vh2">
          <b>第 {v.no} 版</b>
          <small>
            {shortTime(v.createdAt)} · {formatRR(v)}
          </small>
          <span className={`gy-pill ${tone === 'ok' ? 'ok' : 'idle'}`}>{state}</span>
        </div>
        {v.hasOutput ? (
          <video
            ref={(el) => {
              refs.current[k] = el;
            }}
            src={jobUrl(client.id, v.id)}
            controls
            playsInline
            preload="metadata"
            muted={k === 1}
            aria-label={`对比：第 ${v.no} 版`}
          />
        ) : (
          <div className="gy-vgen off">
            <b>{state}</b>
            <small>这一版没有成片</small>
          </div>
        )}
        <small className="sum">
          {v.note || '首版'}
          {v.verdict?.rating
            ? ` · 评价：${v.verdict.rating === 'GOOD' ? '好' : `差（${v.verdict.reason}）`}`
            : ''}
        </small>
        {v.hasOutput && v.verdict?.use !== 'USABLE' && (
          <Btn size="xs" variant="primary" onClick={() => onUse(v)}>
            选这版去投放
          </Btn>
        )}
      </div>
    );
  };
  return (
    <Card className="gy-vcmp" aria-label="版本对比">
      <div className="vch">
        <b>
          对比 第 {left.no} 版 和 第 {right.no} 版
        </b>
        <span className="gy-muted">
          出片词 {rows.length} 段里有 {diff.length} 段不同
        </span>
        <span className="gy-row">
          <Btn
            size="xs"
            onClick={() =>
              refs.current.forEach((el) => {
                if (!el) return;
                el.currentTime = 0;
                void el.play().catch(() => undefined);
              })
            }
          >
            两版一起播放
          </Btn>
          <Btn size="xs" variant="ghost" onClick={onSwap}>
            左右互换
          </Btn>
          <Btn size="xs" variant="ghost" onClick={onClose}>
            关闭对比
          </Btn>
        </span>
      </div>
      <div className="vpair">
        {col(left, 0)}
        {col(right, 1)}
      </div>
      <div className="vdtab">
        <div className="vdh">
          <span />
          <span>第 {left.no} 版的出片词</span>
          <span>第 {right.no} 版的出片词</span>
        </div>
        {diff.length ? (
          diff.map((r) => (
            <div className="vdr" key={r.key}>
              <span className="vdt">{r.title}</span>
              <div className={r.left ? 'dold' : 'dnone'}>
                {r.left ? <AdText text={r.left} hits={adCheck(r.left, ctx)} /> : '（没有这一段）'}
              </div>
              <div className={r.right ? 'dnew' : 'dnone'}>
                {r.right ? (
                  <AdText text={r.right} hits={adCheck(r.right, ctx)} />
                ) : (
                  '（没有这一段）'
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="gy-muted" style={{ padding: 10 }}>
            两版的出片词完全一样（只是重新生成了一次）
          </div>
        )}
        {same.length > 0 && (
          <details className="vsame">
            <summary>另外 {same.length} 段两版一样</summary>
            {same.map((r) => (
              <div className="vdr same" key={r.key}>
                <span className="vdt">{r.title}</span>
                <div className="both">{r.left}</div>
              </div>
            ))}
          </details>
        )}
      </div>
    </Card>
  );
}
