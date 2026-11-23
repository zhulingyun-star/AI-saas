import { useMemo, useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { post, put } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Dialog, Notice } from '../../gy/ui';
import { sec, SHOT_TASKS, thumbUrl } from '../references/data';
import {
  AD_CAT_LABEL,
  adCheck,
  applyFix,
  fixValue,
  ignoreKey,
  liveHits,
  splitHits,
  type AdContext,
  type AdHit,
} from '../../adcheck';
import { TopBar, type StepProps } from './parts';
import type { Flow, StoryShot } from './data';

type Edit = Pick<StoryShot, 'id' | 'camera' | 'visual' | 'lines' | 'task'>;
const toEdit = (s: StoryShot): Edit => ({
  id: s.id,
  camera: s.camera,
  visual: s.visual,
  lines: [...s.lines],
  task: s.task,
});
const scopeOf = (shotId: string, line: number) => `${shotId}:${line}`;
export const taskClass = (t: string) => `tk${Math.max(0, SHOT_TASKS.indexOf(t as never))}`;

/** 一段文字，命中的说法高亮；可点开看原因、替换或忽略（只读的地方不传 onFix）。 */
export function AdText({
  text,
  hits,
  onFix,
  onIgnore,
  label,
}: {
  text: string;
  hits: AdHit[];
  onFix?: (h: AdHit, value: string) => void;
  onIgnore?: (h: AdHit) => void;
  label?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const cur = hits.find((h) => h.at === open);
  return (
    <span className="gy-adtext">
      {splitHits(text, hits).map((p, i) =>
        p.hit ? (
          onFix ? (
            <button
              key={i}
              type="button"
              className={`gy-adw ${p.hit.cat}`}
              aria-expanded={open === p.hit.at}
              aria-label={`${label ?? ''}可能违规的说法「${p.hit.word}」，点开看原因`}
              title={`${AD_CAT_LABEL[p.hit.cat]}：${p.hit.why}`}
              onClick={() => setOpen(open === p.hit!.at ? null : p.hit!.at)}
            >
              {p.text}
            </button>
          ) : (
            <mark
              key={i}
              className={`gy-adw ${p.hit.cat}`}
              title={`${AD_CAT_LABEL[p.hit.cat]}：${p.hit.why}`}
            >
              {p.text}
            </mark>
          )
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
      {cur && onFix && (
        <span className="gy-adpop" role="dialog" aria-label={`「${cur.word}」为什么可能违规`}>
          <span className="gy-adtag">{AD_CAT_LABEL[cur.cat]}</span>
          <span>{cur.why}</span>
          <span className="gy-row">
            <FixButton hit={cur} onFix={(h, v) => (setOpen(null), onFix(h, v))} />
            {onIgnore && (
              <Btn size="xs" variant="ghost" onClick={() => (setOpen(null), onIgnore(cur))}>
                没问题，忽略
              </Btn>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
function FixButton({ hit, onFix }: { hit: AdHit; onFix: (h: AdHit, v: string) => void }) {
  const v = fixValue(hit.fix[0]);
  if (v === null) return <span className="gy-fine">{hit.fix[0]}</span>;
  return (
    <Btn size="xs" onClick={() => onFix(hit, v)}>
      {v ? `换成「${v}」` : '删掉'}
    </Btn>
  );
}

/** 转化结构：按时间排的每镜任务，缺哪个任务只提示，不拦着确认 */
export function ConvBar({ shots, tasks }: { shots: StoryShot[]; tasks: string[] }) {
  const total = shots.length ? shots[shots.length - 1].end : 0;
  const missing = SHOT_TASKS.filter((t) => !tasks.includes(t));
  return (
    <Card className="gy-pjs gy-cvbar">
      <h3>
        转化结构<small>每一镜在帮观众往下单走哪一步 · 只是提示，不拦着你确认</small>
      </h3>
      <div
        className="gy-cvtrack"
        role="img"
        aria-label={`按时间排的镜头任务：${shots.map((_, i) => `镜头 ${i + 1} ${tasks[i] || '还没标'}`).join('，')}`}
      >
        {shots.map((s, i) => (
          <span
            key={s.id}
            className={tasks[i] ? taskClass(tasks[i]) : 'none'}
            style={{ flex: `${Math.max(0.3, s.end - s.start).toFixed(2)} 1 0` }}
            title={`镜头 ${i + 1} · ${sec(s.start)}–${sec(s.end)} 秒 · ${tasks[i] || '还没标'}`}
          >
            <b>{tasks[i] || '还没标'}</b>
            <small>
              镜头 {i + 1} · {sec(s.start)}–{sec(s.end)}s
            </small>
          </span>
        ))}
      </div>
      <div className="gy-cvaxis">
        <span>0 秒</span>
        <span>{sec(total)} 秒</span>
      </div>
      <div className="gy-cvmiss">
        {missing.length ? (
          missing.map((t) => <span key={t}>还没有「{t}」的镜头</span>)
        ) : (
          <span className="ok">7 个任务都有镜头了</span>
        )}
      </div>
    </Card>
  );
}

/** 第 3 步 分镜：每镜左右对照「原视频 | 改成」，可编辑并保存；顶部转化结构和广告用语检查。 */
export default function StepStoryboard({ flow, apply, go }: StepProps) {
  const { client, notify } = useWorkspace();
  const sb = flow.storyboard;
  const shots = sb.shots;
  const [draft, setDraft] = useState<Edit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [adOpen, setAdOpen] = useState(false);
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set(flow.ignores));
  const [reset, setReset] = useState(false);
  const ctx: AdContext = useMemo(
    () => ({ hasPrice: flow.product.analysis.hasPrice, risks: flow.product.analysis.risks }),
    [flow.product.analysis],
  );
  const editing = draft !== null;
  const view: Edit[] = draft ?? shots.map(toEdit);
  const tasks = view.map((x) => x.task);
  const items = view.flatMap((s, i) =>
    s.lines.map((t, j) => ({
      lab: `镜头 ${i + 1} · 第 ${j + 1} 句`,
      text: t,
      scope: scopeOf(s.id, j),
      shot: i,
      line: j,
    })),
  );
  const all = items.flatMap((it) =>
    liveHits(it.text, ctx, it.scope, ignored).map((h) => ({ ...h, it })),
  );
  const missingVisual = view.map((s, i) => (s.visual.trim() ? 0 : i + 1)).filter(Boolean);

  const save = async (edits: Edit[], confirmed: boolean, done: string) => {
    setBusy(true);
    setErr('');
    try {
      const next = await put<Flow>(`/clients/${client.id}/projects/${flow.project.id}/storyboard`, {
        revision: sb.revision,
        shots: edits,
        confirmed,
      });
      apply(next);
      setDraft(null);
      notify(done);
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const replaceIn = (shot: number, line: number, h: AdHit, v: string) => {
    const base = (draft ?? shots.map(toEdit)).map((x) => ({ ...x, lines: [...x.lines] }));
    base[shot].lines[line] = applyFix(base[shot].lines[line], h, v);
    if (editing) setDraft(base);
    else void save(base, sb.confirmed, v ? `已换成「${v}」` : `已删掉「${h.word}」`);
  };
  const ignore = async (scope: string, text: string, h: AdHit) => {
    const key = ignoreKey(scope, text, h);
    setIgnored((cur) => new Set([...cur, key]));
    try {
      const keys = await post<string[]>(
        `/clients/${client.id}/projects/${flow.project.id}/ad-ignores`,
        {
          key,
        },
      );
      setIgnored(new Set(keys));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const setShot = (i: number, patch: Partial<Edit>) =>
    setDraft((cur) => cur!.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const aiDraft = async () => {
    setBusy(true);
    setErr('');
    try {
      apply(
        await post<Flow>(`/clients/${client.id}/projects/${flow.project.id}/storyboard/draft`, {
          revision: sb.revision,
        }),
      );
      notify('AI 按商品写好了改成，逐镜看一遍再确认');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const bar = editing ? (
    <TopBar
      actions={
        <>
          <Btn variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
            取消
          </Btn>
          <Btn
            variant="primary"
            busy={busy}
            onClick={() =>
              void save(
                draft!,
                false,
                sb.confirmed ? '分镜已保存，改过以后要重新确认' : '分镜已保存',
              )
            }
          >
            保存
          </Btn>
        </>
      }
    >
      正在编辑分镜：改成的机位、画面和台词都能改，台词可以加减。
      {all.length > 0 && <span className="gy-adwarn">还有 {all.length} 处可能违规的说法</span>}
    </TopBar>
  ) : (
    <TopBar
      actions={
        <>
          {!sb.confirmed && (
            <Btn
              disabled={busy || !flow.aiEnabled}
              title={
                flow.aiEnabled ? '让 AI 按商品写每一镜的改成' : '文字模型没配置，AI 暂时写不了'
              }
              onClick={() => void aiDraft()}
            >
              <Sparkles size={14} aria-hidden="true" />让 AI 写改成
            </Btn>
          )}
          <Btn disabled={busy} onClick={() => setDraft(shots.map(toEdit))}>
            编辑分镜
          </Btn>
          {sb.confirmed ? (
            <Btn variant="primary" onClick={() => go(4)}>
              去出片
            </Btn>
          ) : (
            <Btn
              variant="primary"
              busy={busy}
              disabled={missingVisual.length > 0}
              onClick={() =>
                void save(shots.map(toEdit), true, '分镜已确认，可以出片了').then(
                  (ok) => ok && go(4),
                )
              }
            >
              确认分镜，去出片
            </Btn>
          )}
        </>
      }
    >
      {sb.confirmed ? (
        <>
          分镜已确认 · {shots.length} 个镜头 · {shots.reduce((n, s) => n + s.lines.length, 0)}{' '}
          句台词。改了以后要重新确认。
        </>
      ) : missingVisual.length ? (
        <>
          还有 <b>{missingVisual.length} 镜</b>没写改成什么画面（镜头 {missingVisual.join('、')}
          ），写完才能确认。
        </>
      ) : (
        <>逐镜看一遍改成的画面和台词，没问题就确认。</>
      )}
      {all.length > 0 && (
        <span className="gy-adwarn">还有 {all.length} 处可能违规的说法没处理</span>
      )}
    </TopBar>
  );

  return (
    <>
      {bar}
      {err && <Notice tone="error">{err}</Notice>}
      {sb.stale && (
        <Notice
          tone="warn"
          title="参考视频重新拆解过，这份分镜是按旧的拆解做的"
          actions={
            <Btn size="xs" onClick={() => setReset(true)}>
              按新拆解重做
            </Btn>
          }
        >
          可以先不管继续用；重做会按新的镜头重新开始，写过的改成会清空。
        </Notice>
      )}
      <Card className={`gy-pjs gy-adsum ${all.length ? 'bad' : 'ok'}`} id="adsum">
        <div className="hd">
          <span className="ico" aria-hidden="true">
            {all.length ? '!' : '✓'}
          </span>
          <b>{all.length ? `台词里有 ${all.length} 处可能违规的说法` : '台词检查通过'}</b>
          <small>
            {all.length
              ? '只是提醒，不拦着你确认'
              : '没发现极限词、治病功效、说死的承诺、没依据的价格，也没碰到商品分析里不能说的话'}
          </small>
          {all.length > 0 && (
            <Btn size="xs" aria-expanded={adOpen} onClick={() => setAdOpen(!adOpen)}>
              {adOpen ? '收起' : '逐条看'}
            </Btn>
          )}
        </div>
        {adOpen && all.length > 0 && (
          <div className="gy-adlist">
            {all.map((h) => (
              <div className="gy-adrow" key={`${h.it.scope}|${h.at}|${h.word}`}>
                <span className="where">{h.it.lab}</span>
                <span className="ctx">
                  <AdText text={h.it.text} hits={[h]} />
                </span>
                <span className="why">
                  <span className="gy-adtag">{AD_CAT_LABEL[h.cat]}</span>
                  <small>{h.why}</small>
                </span>
                <span className="gy-row">
                  <FixButton hit={h} onFix={(x, v) => replaceIn(h.it.shot, h.it.line, x, v)} />
                  <Btn
                    size="xs"
                    variant="ghost"
                    onClick={() => void ignore(h.it.scope, h.it.text, h)}
                  >
                    没问题，忽略
                  </Btn>
                  <Btn
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      document
                        .getElementById(`shot-${h.it.shot + 1}`)
                        ?.scrollIntoView({ block: 'center' })
                    }
                  >
                    定位
                  </Btn>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <ConvBar shots={shots} tasks={tasks} />
      <Card className="gy-pjs">
        <h3>
          分镜<small>左边是参考视频原来的样子，右边是改成你的商品 · 这一步不会出现成片画面</small>
        </h3>
        <div className="gy-sbhead" aria-hidden="true">
          <span />
          <span>原视频</span>
          <span>改成</span>
        </div>
        {view.map((s, i) => {
          const o = shots[i];
          return (
            <div className="gy-sbshot" id={`shot-${i + 1}`} key={s.id}>
              <div className="h">
                <span className="fr">
                  <img
                    src={thumbUrl(client.id, flow.reference.assetId, (o.start + o.end) / 2)}
                    alt={`参考视频镜头 ${i + 1}`}
                    loading="lazy"
                  />
                </span>
                <b>镜头 {i + 1}</b>
                <small>
                  {sec(o.start)}–{sec(o.end)} 秒
                </small>
              </div>
              <div className="col orig">
                <dl>
                  <dt>机位</dt>
                  <dd>{o.origCamera || '—'}</dd>
                  <dt>画面</dt>
                  <dd>{o.origVisual || '—'}</dd>
                  <dt>原台词</dt>
                  <dd>
                    {o.origLines.length ? o.origLines.map((l) => `「${l}」`).join('') : '没有台词'}
                  </dd>
                </dl>
              </div>
              <div className="col new">
                {editing ? (
                  <div className="gy-sbedit">
                    <label>
                      机位
                      <input
                        className="gy-input"
                        maxLength={200}
                        aria-label={`镜头 ${i + 1} 改成的机位`}
                        value={s.camera}
                        onChange={(e) => setShot(i, { camera: e.target.value })}
                      />
                    </label>
                    <label>
                      画面
                      <textarea
                        className="gy-textarea"
                        rows={3}
                        maxLength={1000}
                        aria-label={`镜头 ${i + 1} 改成的画面`}
                        value={s.visual}
                        placeholder="这一镜怎么拍你的商品：谁、在哪、做什么动作、拍到商品哪里"
                        onChange={(e) => setShot(i, { visual: e.target.value })}
                      />
                    </label>
                    <div className="lines">
                      <span>新台词</span>
                      {s.lines.map((l, j) => {
                        const hs = adCheck(l, ctx);
                        return (
                          <div className="ln" key={j}>
                            <span className="gy-row">
                              <input
                                className="gy-input"
                                maxLength={120}
                                aria-label={`镜头 ${i + 1} 第 ${j + 1} 句台词`}
                                value={l}
                                onChange={(e) =>
                                  setShot(i, {
                                    lines: s.lines.map((x, k) => (k === j ? e.target.value : x)),
                                  })
                                }
                              />
                              <button
                                type="button"
                                className="gy-icon-btn"
                                aria-label={`删掉镜头 ${i + 1} 第 ${j + 1} 句台词`}
                                onClick={() =>
                                  setShot(i, { lines: s.lines.filter((_, k) => k !== j) })
                                }
                              >
                                <Trash2 size={13} />
                              </button>
                            </span>
                            {l.trim() &&
                              (hs.length ? (
                                <span className="gy-adlive bad" role="status">
                                  {hs.length} 处可能违规：
                                  {hs.map((h) => (
                                    <span className="hit" key={h.at}>
                                      <mark className={`gy-adw ${h.cat}`}>{h.word}</mark>
                                      <small>{AD_CAT_LABEL[h.cat]}</small>
                                      <FixButton hit={h} onFix={(x, v) => replaceIn(i, j, x, v)} />
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="gy-adlive ok">✓ 没发现可能违规的说法</span>
                              ))}
                          </div>
                        );
                      })}
                      {s.lines.length < 8 && (
                        <button
                          type="button"
                          className="gy-addline"
                          onClick={() => setShot(i, { lines: [...s.lines, ''] })}
                        >
                          <Plus size={13} aria-hidden="true" />
                          加一句台词
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <dl>
                    <dt>机位</dt>
                    <dd>{s.camera || <em>还没写</em>}</dd>
                    <dt>画面</dt>
                    <dd>
                      {s.visual || (
                        <em className="miss">还没写：点「编辑分镜」写这一镜怎么拍你的商品</em>
                      )}
                    </dd>
                    <dt>新台词</dt>
                    <dd className="nl">
                      {s.lines.length ? (
                        s.lines.map((l, j) => (
                          <span key={j} className="q">
                            「
                            <AdText
                              text={l}
                              label={`镜头 ${i + 1} 第 ${j + 1} 句：`}
                              hits={liveHits(l, ctx, scopeOf(s.id, j), ignored)}
                              onFix={(h, v) => replaceIn(i, j, h, v)}
                              onIgnore={(h) => void ignore(scopeOf(s.id, j), l, h)}
                            />
                            」
                          </span>
                        ))
                      ) : (
                        <em>这一镜没有台词</em>
                      )}
                    </dd>
                  </dl>
                )}
                <div className="gy-tkrow">
                  <span>这一镜的任务</span>
                  {editing ? (
                    <select
                      className="gy-select"
                      aria-label={`镜头 ${i + 1} 的任务`}
                      value={s.task}
                      onChange={(e) => setShot(i, { task: e.target.value })}
                    >
                      <option value="">还没标</option>
                      {SHOT_TASKS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  ) : s.task ? (
                    <i className={`gy-tkb ${taskClass(s.task)}`}>{s.task}</i>
                  ) : (
                    <em>还没标（参考视频库里也没标）</em>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </Card>
      {reset && (
        <Dialog
          title="按新拆解重做分镜"
          onClose={() => !busy && setReset(false)}
          footer={
            <>
              <Btn variant="ghost" disabled={busy} onClick={() => setReset(false)}>
                取消
              </Btn>
              <Btn
                variant="primary"
                busy={busy}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    try {
                      apply(
                        await post<Flow>(
                          `/clients/${client.id}/projects/${flow.project.id}/storyboard/reset`,
                          { revision: sb.revision },
                        ),
                      );
                      setReset(false);
                      notify('已按新的拆解重做分镜');
                    } catch (e) {
                      setErr((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                重做
              </Btn>
            </>
          }
        >
          <p>会按参考视频最新的镜头重新开始，之前写的改成会清空，已经出过的版本不受影响。</p>
        </Dialog>
      )}
    </>
  );
}
