import { useMemo, useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { post, put } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Dialog, Notice } from '../../gy/ui';
import { sec } from '../references/data';
import {
  AD_CAT_LABEL,
  adCheck,
  applyFix,
  ignoreKey,
  liveHits,
  type AdContext,
  type AdHit,
} from '../../adcheck';
import { AdSummary, AdText, ConvBar, FixButton, taskClass } from './StepStoryboard';
import { TopBar } from './parts';
import {
  LETTERS,
  pickedDirections,
  type DirectionRow,
  type ModeFlow,
  type StoryShot,
} from './data';
import type { ModeStepProps } from './StepDirections';

type Edit = { id: string; visual: string; lines: string[]; task: string };
const toEdit = (s: StoryShot): Edit => ({
  id: s.id,
  visual: s.visual,
  lines: [...s.lines],
  task: s.task,
});
const scopeOf = (dir: string, shot: string, line: number) => `${dir}:${shot}:${line}`;
const reverted = (s: StoryShot) =>
  s.visual !== s.origVisual || JSON.stringify(s.lines) !== JSON.stringify(s.origLines);

/** 方向切换条：A / B / C（+ 出片步的「对比几个方向」）；数字是这个方向的分镜台词里还没处理的可能违规说法 */
export function DirTabs({
  flow,
  cur,
  onPick,
  compare,
  onCompare,
  badge,
}: {
  flow: ModeFlow;
  cur: string;
  onPick: (id: string) => void;
  compare?: boolean;
  onCompare?: () => void;
  badge?: (d: DirectionRow) => React.ReactNode;
}) {
  const picked = pickedDirections(flow);
  return (
    <div className="gy-dtabs" role="tablist" aria-label="方向">
      {onCompare && (
        <button type="button" role="tab" aria-selected={!!compare} onClick={onCompare}>
          对比 {picked.length} 个方向
        </button>
      )}
      {picked.map((d, k) => (
        <button
          key={d.id}
          type="button"
          role="tab"
          aria-selected={!compare && cur === d.id}
          onClick={() => onPick(d.id)}
        >
          <b>{LETTERS[k]}</b>
          {d.data.title}
          {badge?.(d)}
        </button>
      ))}
    </div>
  );
}

/** 第 3 步 分镜（框架模式每个方向一份；一键成片是自动写的那一份，可以改、不用确认） */
export default function StepDirBoard({
  flow,
  apply,
  go,
  dir,
  setDir,
}: ModeStepProps & { dir: string; setDir: (id: string) => void }) {
  const { client, notify } = useWorkspace();
  const pid = flow.project.id;
  const oneClick = flow.mode === 'ONE_CLICK';
  const picked = pickedDirections(flow);
  const d = picked.find((x) => x.id === dir) ?? picked[0];
  const [draft, setDraft] = useState<Edit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set(flow.ignores));
  const [rewrite, setRewrite] = useState(false);
  const ctx: AdContext = useMemo(
    () => ({ hasPrice: flow.product.analysis.hasPrice, risks: flow.product.analysis.risks }),
    [flow.product.analysis],
  );
  const hitsOf = (x: DirectionRow) =>
    x.board.shots.reduce(
      (n, s) =>
        n +
        s.lines.reduce(
          (m, l, j) => m + liveHits(l, ctx, scopeOf(x.id, s.id, j), ignored).length,
          0,
        ),
      0,
    );

  if (!d)
    return (
      <>
        <TopBar
          actions={
            <Btn variant="primary" onClick={() => go(oneClick ? 4 : 2)}>
              {oneClick ? '去出片' : '去选方向'}
            </Btn>
          }
        >
          {oneClick
            ? '还没出过片：点「开始出片」时会按设置自动写方向和分镜。'
            : '还没选方向，选好方向后每个方向写一份分镜。'}
        </TopBar>
        <Card className="gy-pjs gy-lockc">
          <b>还没有分镜</b>
          <span>{oneClick ? '出第一版时自动写' : '先在「方向」里选 1~3 个方向'}</span>
        </Card>
      </>
    );

  const sb = d.board;
  const shots = sb.shots;
  const editing = draft !== null;
  const view: Edit[] = draft ?? shots.map(toEdit);
  const tasks = view.map((x) => x.task);
  const missing = view.map((s, i) => (s.visual.trim() ? 0 : i + 1)).filter(Boolean);
  const items = view.flatMap((s, i) =>
    s.lines.map((t, j) => ({
      lab: `镜头 ${i + 1} · 第 ${j + 1} 句`,
      text: t,
      scope: scopeOf(d.id, s.id, j),
      anchor: `dshot-${i + 1}`,
      fix: (h: AdHit, v: string) => replaceIn(i, j, h, v),
    })),
  );
  const nHits = items.reduce((n, it) => n + liveHits(it.text, ctx, it.scope, ignored).length, 0);

  const save = async (
    edits: Edit[],
    confirmed: boolean,
    done: string,
    after?: (next: ModeFlow) => void,
  ) => {
    setBusy(true);
    setErr('');
    try {
      const next = await put<ModeFlow>(
        `/clients/${client.id}/projects/${pid}/directions/${d.id}/storyboard`,
        { revision: sb.revision, shots: edits, confirmed },
      );
      apply(next);
      setDraft(null);
      notify(done);
      after?.(next);
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  function replaceIn(shot: number, line: number, h: AdHit, v: string) {
    const base = (draft ?? shots.map(toEdit)).map((x) => ({ ...x, lines: [...x.lines] }));
    base[shot].lines[line] = applyFix(base[shot].lines[line], h, v);
    if (editing) setDraft(base);
    else void save(base, sb.confirmed, v ? `已换成「${v}」` : `已删掉「${h.word}」`);
  }
  const ignore = async (scope: string, text: string, h: AdHit) => {
    const key = ignoreKey(scope, text, h);
    setIgnored((cur) => new Set([...cur, key]));
    try {
      setIgnored(
        new Set(await post<string[]>(`/clients/${client.id}/projects/${pid}/ad-ignores`, { key })),
      );
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const setShot = (i: number, patch: Partial<Edit>) =>
    setDraft((cur) => cur!.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const restore = (i: number) => {
    const o = shots[i];
    if (editing) setShot(i, { visual: o.origVisual, lines: [...o.origLines] });
    else {
      const base = shots.map(toEdit);
      base[i] = { ...base[i], visual: o.origVisual, lines: [...o.origLines] };
      void save(
        base,
        oneClick,
        `镜头 ${i + 1} 已恢复成写出来时的原文${!oneClick && sb.confirmed ? '，要重新确认' : ''}`,
      );
    }
  };
  const nextUnconfirmed = (next: ModeFlow) =>
    pickedDirections(next).find((x) => x.id !== d.id && !x.board.confirmed);
  const confirmedCount = picked.filter((x) => x.board.confirmed).length;
  const writer = sb.source === 'AI' ? 'AI 写的' : '本地模板拼的（不是 AI 写的）';

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
                oneClick,
                !oneClick && sb.confirmed ? '分镜已保存，改过以后要重新确认' : '分镜已保存',
              )
            }
          >
            保存
          </Btn>
        </>
      }
    >
      正在编辑「{d.data.title}」的分镜：画面和台词都能改，台词可以加减。
      {nHits > 0 && <span className="gy-adwarn">还有 {nHits} 处可能违规的说法</span>}
    </TopBar>
  ) : oneClick ? (
    <TopBar
      actions={
        <>
          <Btn disabled={busy} onClick={() => setDraft(shots.map(toEdit))}>
            编辑分镜
          </Btn>
          <Btn variant="primary" onClick={() => go(4)}>
            回到出片
          </Btn>
        </>
      }
    >
      出片时自动写的分镜（{writer}）· {shots.length}{' '}
      个镜头。可以改，不用确认；改了以后，下次「再出一版」用改过的。
      {nHits > 0 && <span className="gy-adwarn">还有 {nHits} 处可能违规的说法没处理</span>}
    </TopBar>
  ) : (
    <TopBar
      actions={
        <>
          <Btn disabled={busy} onClick={() => setDraft(shots.map(toEdit))}>
            编辑分镜
          </Btn>
          {sb.confirmed ? (
            <Btn variant="primary" onClick={() => go(4, d.id)}>
              去出片
            </Btn>
          ) : (
            <Btn
              variant="primary"
              busy={busy}
              disabled={missing.length > 0}
              onClick={() =>
                void save(shots.map(toEdit), true, `「${d.data.title}」的分镜已确认`, (next) => {
                  const rest = nextUnconfirmed(next);
                  if (rest) setDir(rest.id);
                  else go(4, pickedDirections(next)[0]?.id ?? d.id);
                })
              }
            >
              {picked.length > 1 && confirmedCount < picked.length - 1
                ? `确认「${d.data.title}」的分镜`
                : '确认分镜，去出片'}
            </Btn>
          )}
        </>
      }
    >
      {picked.length > 1 && (
        <b>
          {confirmedCount}/{picked.length} 份已确认 ·{' '}
        </b>
      )}
      {sb.confirmed ? (
        <>
          「{d.data.title}」的分镜已确认 · {shots.length} 个镜头。改了以后要重新确认。
        </>
      ) : missing.length ? (
        <>
          还有 <b>{missing.length} 镜</b>没写画面（镜头 {missing.join('、')}），写完才能确认。
        </>
      ) : (
        <>逐镜看一遍「{d.data.title}」的画面和台词，没问题就确认。</>
      )}
      {nHits > 0 && <span className="gy-adwarn">还有 {nHits} 处可能违规的说法没处理</span>}
    </TopBar>
  );

  return (
    <>
      {bar}
      {err && <Notice tone="error">{err}</Notice>}
      {picked.length > 1 && (
        <DirTabs
          flow={flow}
          cur={d.id}
          onPick={(id) => {
            if (editing) return notify('先保存或取消正在编辑的分镜');
            setDir(id);
          }}
          badge={(x) => {
            const n = hitsOf(x);
            return (
              <>
                {n > 0 && (
                  <i className="dadn" title={`这个方向的台词里还有 ${n} 处可能违规的说法`}>
                    {n}
                  </i>
                )}
                {x.board.confirmed && <i className="dok">已确认</i>}
              </>
            );
          }}
        />
      )}
      {sb.stale && (
        <Notice
          tone="warn"
          title="方向改过了，分镜还是按改之前的方向写的"
          actions={
            <Btn size="xs" onClick={() => setRewrite(true)}>
              按新方向重写分镜
            </Btn>
          }
        >
          {sb.duration !== d.data.duration
            ? `方向的时长改成了 ${d.data.duration} 秒，这份分镜还是 ${sb.duration} 秒。`
            : '可以先不管继续用；重写会替换现在的分镜。'}
        </Notice>
      )}
      {sb.source === 'LOCAL' && (
        <Notice tone="info" title="这份分镜不是 AI 写的">
          没有配置文字模型，画面和台词是按方向和商品理解拼的本地模板，只填了能从资料里找到的话。逐镜改成你要拍的样子。
        </Notice>
      )}
      <AdSummary
        items={items}
        ctx={ctx}
        ignored={ignored}
        onIgnore={(sc, t, h) => void ignore(sc, t, h)}
      />
      <ConvBar shots={shots} tasks={tasks} skeleton={sb.duration} />
      <Card className="gy-pjs">
        <h3>
          分镜
          <small>
            按「{d.data.title}」写的 ·{' '}
            {d.data.personaName ? `给「${d.data.personaName}」看 · ` : ''}开头：
            {d.data.hook} · {sb.duration} 秒 · {writer} · 这一步不会出现成片画面
          </small>
        </h3>
        {view.map((s, i) => {
          const o = shots[i];
          const changed = editing
            ? s.visual !== o.origVisual || JSON.stringify(s.lines) !== JSON.stringify(o.origLines)
            : reverted(o);
          return (
            <div className="gy-dshot" id={`dshot-${i + 1}`} key={s.id}>
              <div className="h">
                <b>镜头 {i + 1}</b>
                <small>
                  {sec(o.start)}–{sec(o.end)} 秒
                </small>
              </div>
              <div className="tx">
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
                      {flow.options.tasks.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  ) : s.task ? (
                    <i className={`gy-tkb ${taskClass(s.task)}`}>{s.task}</i>
                  ) : (
                    <em>还没标</em>
                  )}
                </div>
                {editing ? (
                  <div className="gy-sbedit">
                    <label>
                      画面
                      <textarea
                        className="gy-textarea"
                        rows={3}
                        maxLength={1000}
                        aria-label={`镜头 ${i + 1} 的画面`}
                        value={s.visual}
                        placeholder="这一镜怎么拍：谁、在哪、做什么动作、拍到商品哪里"
                        onChange={(e) => setShot(i, { visual: e.target.value })}
                      />
                    </label>
                    <div className="lines">
                      <span>台词</span>
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
                      {s.lines.length < 4 && (
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
                    <dt>画面</dt>
                    <dd>
                      {s.visual || <em className="miss">还没写：点「编辑分镜」写这一镜怎么拍</em>}
                    </dd>
                    <dt>台词</dt>
                    <dd className="nl">
                      {s.lines.length ? (
                        s.lines.map((l, j) => (
                          <span key={j} className="q">
                            「
                            <AdText
                              text={l}
                              label={`镜头 ${i + 1} 第 ${j + 1} 句：`}
                              hits={liveHits(l, ctx, scopeOf(d.id, s.id, j), ignored)}
                              onFix={(h, v) => replaceIn(i, j, h, v)}
                              onIgnore={(h) => void ignore(scopeOf(d.id, s.id, j), l, h)}
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
                {changed && (
                  <small className="gy-fine gy-restore">
                    这一镜改过了 ·{' '}
                    <Btn size="xs" variant="ghost" disabled={busy} onClick={() => restore(i)}>
                      <RotateCcw size={12} aria-hidden="true" />
                      恢复成{sb.source === 'AI' ? ' AI ' : '本地模板'}写的原文
                    </Btn>
                  </small>
                )}
              </div>
            </div>
          );
        })}
      </Card>
      {rewrite && (
        <Dialog
          title="按新方向重写分镜"
          onClose={() => !busy && setRewrite(false)}
          footer={
            <>
              <Btn variant="ghost" disabled={busy} onClick={() => setRewrite(false)}>
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
                        await post<ModeFlow>(
                          `/clients/${client.id}/projects/${pid}/directions/${d.id}/storyboard/rewrite`,
                          { revision: sb.revision },
                        ),
                      );
                      setRewrite(false);
                      notify(`已按「${d.data.title}」现在的样子重写分镜`);
                    } catch (e) {
                      setErr((e as Error).message);
                      setRewrite(false);
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                重写
              </Btn>
            </>
          }
        >
          <p>
            会按「{d.data.title}」现在的格子和时长（{d.data.duration} 秒）重新写这份分镜，
            {flow.aiEnabled ? '调用文字模型' : '用本地模板'}；现在写的会被替换
            {oneClick ? '' : '，需要重新确认'}。已经出过的版本不受影响。
          </p>
        </Dialog>
      )}
    </>
  );
}
