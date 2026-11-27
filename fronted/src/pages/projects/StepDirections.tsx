import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, RotateCcw } from 'lucide-react';
import { post, put } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Chip, Notice } from '../../gy/ui';
import { HOOK_TYPES } from '../references/data';
import { adCheck, AD_CAT_LABEL, type AdContext } from '../../adcheck';
import { AdText } from './StepStoryboard';
import { TopBar, type Step } from './parts';
import {
  LETTERS,
  pickedDirections,
  sourceLabel,
  type DirectionData,
  type DirectionRow,
  type ModeFlow,
} from './data';

export interface ModeStepProps {
  flow: ModeFlow;
  apply: (next: ModeFlow) => void;
  go: (s: Step, dir?: string) => void;
}
const hookTip = (h: string) => HOOK_TYPES.find(([x]) => x === h)?.[1] ?? '';
const PRICE_NO = '商品资料里没有价格，先去商品库补上';

/** 一个方向卡：开头类型、前 3 秒怎么拍 / 怎么说、结构、卖点、场景和其余格子 */
export function DirectionCard({
  d,
  letter,
  picked,
  onToggle,
  onEdit,
  onRegen,
  busy,
  ctx,
  multi,
}: {
  d: DirectionRow;
  letter?: string;
  picked?: boolean;
  onToggle?: () => void;
  onEdit?: () => void;
  onRegen?: () => void;
  busy?: boolean;
  ctx: AdContext;
  multi?: boolean;
}) {
  const x = d.data;
  const hits = adCheck(x.openLine, ctx);
  return (
    <div className={`gy-dircard${picked ? ' on' : ''}`} aria-label={`方向：${x.title}`}>
      {onToggle ? (
        <button
          type="button"
          className="pick"
          aria-pressed={!!picked}
          aria-label={`${picked ? '取消选择' : '选择'}方向「${x.title}」`}
          onClick={onToggle}
        >
          <span className={`rd${multi ? ' sq' : ''}`} aria-hidden="true">
            {picked && letter ? letter : ''}
          </span>
          <b>{x.title}</b>
        </button>
      ) : (
        <div className="pick static">
          {letter && <span className="rd sq on">{letter}</span>}
          <b>{x.title}</b>
        </div>
      )}
      <span className="srcs">
        {sourceLabel(d.source) && <i className="local">{sourceLabel(d.source)}</i>}
        {d.edited && <i className="ed">已改过</i>}
        {d.versionCount > 0 && <i>已出 {d.versionCount} 版</i>}
      </span>
      <div className="open">
        <span className="hk">
          开头 3 秒 · <b>{x.hook}</b>
          <small>{hookTip(x.hook)}</small>
        </span>
        <span>画面：{x.openVisual || <em>还没写</em>}</span>
        <span>
          台词：
          {x.openLine ? (
            <>
              「<AdText text={x.openLine} hits={hits} />」
            </>
          ) : (
            <em>还没写，点「改格子」补上</em>
          )}
        </span>
        {hits.length > 0 && (
          <small className="gy-adwarn">
            开头台词里有 {hits.length} 处可能违规的说法（{AD_CAT_LABEL[hits[0].cat]}）
          </small>
        )}
      </div>
      <dl>
        <dt>结构</dt>
        <dd>{x.structure || '—'}</dd>
        <dt>卖点</dt>
        <dd>{x.points.length ? x.points.join('；') : '—'}</dd>
        <dt>场景</dt>
        <dd>{x.scene || '—'}</dd>
      </dl>
      <span className="dchips">
        {[
          `${x.duration} 秒`,
          x.contentType,
          x.tempo,
          x.people,
          x.voice,
          x.look,
          x.ending,
          x.personaName ? `给「${x.personaName}」看` : '',
        ]
          .filter(Boolean)
          .map((t) => (
            <i key={t}>{t}</i>
          ))}
      </span>
      {/* LOCAL 方向的 why 是后端写死的一段来历说明，不显示，只留卡片上的「模板」标签 */}
      {x.why && d.source !== 'LOCAL' && <span className="fit">{x.why}</span>}
      {d.productChanged && <small className="gy-adwarn">按换之前的商品写的</small>}
      {(onEdit || onRegen) && (
        <span className="gy-row acts">
          {onEdit && (
            <Btn size="xs" variant="ghost" disabled={busy} onClick={onEdit}>
              <Pencil size={12} aria-hidden="true" />
              改格子
            </Btn>
          )}
          {onRegen && (
            <Btn size="xs" variant="ghost" disabled={busy} onClick={onRegen}>
              <RotateCcw size={12} aria-hidden="true" />
              重出这一套
            </Btn>
          )}
        </span>
      )}
    </div>
  );
}

function CellRow({
  label,
  value,
  options,
  onChange,
  disabledWhy,
  hint,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabledWhy?: (v: string) => string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="gy-cellrow">
      <span className="cn">{label}</span>
      <span className="cops" role="group" aria-label={label}>
        {options.map((o) => {
          const why = disabledWhy?.(o) ?? '';
          return (
            <button
              key={o}
              type="button"
              aria-pressed={value === o}
              title={why || undefined}
              className={why ? 'warn' : ''}
              onClick={() => onChange(o)}
            >
              {o}
            </button>
          );
        })}
      </span>
      {hint && <span className="chint">{hint}</span>}
    </div>
  );
}

/** 改格子：开头类型、前 3 秒、结构、卖点、场景、时长、人群和其余格子 */
export function DirectionForm({
  value,
  origin,
  onChange,
  flow,
  ctx,
}: {
  value: DirectionData;
  origin: DirectionData;
  onChange: (v: DirectionData) => void;
  flow: ModeFlow;
  ctx: AdContext;
}) {
  const o = flow.options;
  const set = (patch: Partial<DirectionData>) => onChange({ ...value, ...patch });
  const lineHits = adCheck(value.openLine, ctx);
  const changed = JSON.stringify(value) !== JSON.stringify(origin);
  const persona = flow.product.personas.find((p) => p.name === value.personaName);
  return (
    <Card className="gy-pjs gy-dirform" editing>
      <h3>
        改「{origin.title}」的格子
        {changed && (
          <Btn size="xs" variant="ghost" onClick={() => onChange({ ...origin })}>
            <RotateCcw size={12} aria-hidden="true" />
            恢复原文
          </Btn>
        )}
      </h3>
      <div className="gy-dirgrid">
        <label>
          方向名
          <input
            className="gy-input"
            maxLength={30}
            value={value.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label>
          给谁看
          <select
            className="gy-select"
            value={value.personaName}
            onChange={(e) => set({ personaName: e.target.value })}
          >
            <option value="">没指定</option>
            {flow.product.personas.map((p) => (
              <option key={p.id ?? p.name} value={p.name}>
                {p.name}
              </option>
            ))}
            {value.personaName && !persona && (
              <option value={value.personaName}>{value.personaName}（商品库里已经没有）</option>
            )}
          </select>
        </label>
      </div>
      <CellRow
        label="时长"
        value={`${value.duration} 秒`}
        options={o.durations.map((d) => `${d} 秒`)}
        onChange={(v) => set({ duration: parseInt(v, 10) })}
        hint="15 秒约 5 镜，30 秒约 7 镜"
      />
      <CellRow
        label="开头类型"
        value={value.hook}
        options={o.hooks}
        onChange={(v) => set({ hook: v })}
        disabledWhy={(v) => (v === '价格型' && !flow.product.analysis.hasPrice ? PRICE_NO : '')}
        hint={
          <>
            <b>{value.hook}</b>：{hookTip(value.hook)}
            {value.hook === '价格型' && !flow.product.analysis.hasPrice && <em> · {PRICE_NO}</em>}
            {persona?.hooks?.length && !persona.hooks.includes(value.hook) ? (
              <em>
                {' '}
                · 「{persona.name}」常用 {persona.hooks.join('、')}
              </em>
            ) : null}
          </>
        }
      />
      <div className="gy-dirgrid">
        <label className="wide">
          前 3 秒怎么拍
          <input
            className="gy-input"
            maxLength={300}
            value={value.openVisual}
            placeholder="一句话：谁、在哪、做什么动作、拍到商品哪里"
            onChange={(e) => set({ openVisual: e.target.value })}
          />
        </label>
        <label className="wide">
          前 3 秒怎么说（开口第一句）
          <input
            className="gy-input"
            maxLength={60}
            value={value.openLine}
            onChange={(e) => set({ openLine: e.target.value })}
          />
          {value.openLine.trim() &&
            (lineHits.length ? (
              <span className="gy-adlive bad" role="status">
                {lineHits.length} 处可能违规：
                {lineHits.map((h) => (
                  <span className="hit" key={h.at}>
                    <mark className={`gy-adw ${h.cat}`}>{h.word}</mark>
                    <small>{AD_CAT_LABEL[h.cat]}</small>
                  </span>
                ))}
              </span>
            ) : (
              <span className="gy-adlive ok">✓ 没发现可能违规的说法</span>
            ))}
        </label>
        <label className="wide">
          结构
          <input
            className="gy-input"
            maxLength={200}
            value={value.structure}
            placeholder="例：说出麻烦 → 亮出商品 → 细节证明 → 引导看详情"
            onChange={(e) => set({ structure: e.target.value })}
          />
        </label>
        {[0, 1, 2].map((i) => (
          <label key={i}>
            卖点 {i + 1}
            <input
              className="gy-input"
              maxLength={40}
              value={value.points[i] ?? ''}
              onChange={(e) => {
                const pts = [0, 1, 2].map((k) =>
                  k === i ? e.target.value : (value.points[k] ?? ''),
                );
                set({ points: pts.filter((p, k) => p || k < pts.length - 1).slice(0, 3) });
              }}
            />
          </label>
        ))}
        <label>
          场景
          <input
            className="gy-input"
            maxLength={60}
            value={value.scene}
            placeholder="例：通勤路上"
            onChange={(e) => set({ scene: e.target.value })}
          />
        </label>
      </div>
      <CellRow
        label="内容类型"
        value={value.contentType}
        options={o.contentTypes}
        onChange={(v) => set({ contentType: v })}
      />
      <CellRow
        label="节奏"
        value={value.tempo}
        options={o.tempos}
        onChange={(v) => set({ tempo: v })}
      />
      <CellRow
        label="人物"
        value={value.people}
        options={o.people}
        onChange={(v) => set({ people: v })}
      />
      <CellRow
        label="声音"
        value={value.voice}
        options={o.voices}
        onChange={(v) => set({ voice: v })}
        disabledWhy={(v) =>
          v === '人物对白' && value.people === '无人出镜' ? '没人出镜就没有对白' : ''
        }
      />
      <CellRow
        label="片种"
        value={value.look}
        options={o.looks}
        onChange={(v) => set({ look: v })}
      />
      <CellRow
        label="收尾"
        value={value.ending}
        options={o.endings}
        onChange={(v) => set({ ending: v })}
      />
    </Card>
  );
}

/** 编辑方向时提交前去掉空卖点 */
export const cleanData = (d: DirectionData): DirectionData => ({
  ...d,
  points: d.points.map((p) => p.trim()).filter(Boolean),
});

/** 第 2 步 方向（框架模式）：选人群和时长 → 出 3 套方向 → 改格子 / 重出一套 → 选 1~3 个，顶部确认后写分镜 */
export default function StepDirections({ flow, apply, go }: ModeStepProps) {
  const { client, notify } = useWorkspace();
  const pid = flow.project.id;
  const personas = flow.product.personas;
  const [persona, setPersona] = useState(flow.settings.personaName);
  const [duration, setDuration] = useState(flow.settings.duration || 15);
  const saved = pickedDirections(flow).map((d) => d.id);
  const [pick, setPick] = useState<string[]>(saved);
  const [multi, setMulti] = useState(saved.length > 1);
  const [editing, setEditing] = useState<{ id: string; data: DirectionData } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const savedKey = saved.join(',');
  useEffect(() => setPick(savedKey ? savedKey.split(',') : []), [savedKey]);
  const ctx: AdContext = useMemo(
    () => ({ hasPrice: flow.product.analysis.hasPrice, risks: flow.product.analysis.risks }),
    [flow.product.analysis],
  );
  const run = async (fn: () => Promise<ModeFlow | void>, done?: string) => {
    setBusy(true);
    setErr('');
    try {
      const next = await fn();
      if (next) apply(next);
      if (done) notify(done);
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const dirs = flow.directions;
  const byId = (id: string) => dirs.find((d) => d.id === id);
  const toggle = (id: string) =>
    setPick((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : multi
          ? cur.length >= 3
            ? cur
            : [...cur, id]
          : [id],
    );
  const generate = () =>
    run(
      () =>
        post<ModeFlow>(`/clients/${client.id}/projects/${pid}/directions/generate`, {
          revision: flow.revision,
          personaName: persona,
          duration,
        }),
      '出好了 3 套方向',
    );
  const allBoards = pick.length > 0 && pick.every((id) => byId(id)?.board.saved);
  const unchanged = pick.join(',') === savedKey;
  const confirm = () =>
    unchanged && allBoards
      ? go(3, pick[0])
      : void run(async () => {
          const next = await post<ModeFlow>(
            `/clients/${client.id}/projects/${pid}/directions/confirm`,
            {
              revision: flow.revision,
              ids: pick,
            },
          );
          apply(next);
          go(3, pick[0]);
        }, `已选 ${pick.length} 个方向，每个方向写好了一份分镜`);
  const editRow = editing ? byId(editing.id) : undefined;
  const editHits = editing ? adCheck(editing.data.openLine, ctx).length : 0;

  const bar = editing ? (
    <TopBar
      actions={
        <>
          <Btn variant="ghost" disabled={busy} onClick={() => setEditing(null)}>
            取消
          </Btn>
          <Btn
            variant="primary"
            busy={busy}
            onClick={() =>
              void run(async () => {
                const next = await put<ModeFlow>(
                  `/clients/${client.id}/projects/${pid}/directions/${editing.id}`,
                  { revision: editRow?.revision ?? 0, direction: cleanData(editing.data) },
                );
                setEditing(null);
                return next;
              }, '方向已保存')
            }
          >
            保存这个方向
          </Btn>
        </>
      }
    >
      正在改「{editRow?.data.title}」的格子。
      {editHits > 0 && <span className="gy-adwarn">开头台词还有 {editHits} 处可能违规的说法</span>}
    </TopBar>
  ) : !dirs.length ? (
    <TopBar
      actions={
        <Btn variant="primary" busy={busy} onClick={() => void generate()}>
          出 3 套方向
        </Btn>
      }
    >
      选好给谁看和时长，出 3 套方向。
    </TopBar>
  ) : (
    <TopBar
      actions={
        <>
          <Btn busy={busy} onClick={() => void generate()}>
            再出 3 套
          </Btn>
          <Btn variant="primary" busy={busy} disabled={!pick.length} onClick={confirm}>
            {unchanged && allBoards
              ? '去分镜'
              : pick.length > 1
                ? `确认 ${pick.length} 个方向，各写一份分镜`
                : '确认这个方向，写分镜'}
          </Btn>
        </>
      }
    >
      {pick.length ? (
        <>
          已选 {pick.length} 个：
          {pick.map((id, k) => `${LETTERS[k]} ${byId(id)?.data.title ?? ''}`).join('、')}
          {!unchanged && savedKey && '（和之前选的不一样）'}
        </>
      ) : multi ? (
        '选 2~3 个方向'
      ) : (
        '选一个方向'
      )}
    </TopBar>
  );

  const risks = flow.product.analysis.risks.map((r) => r.point).filter(Boolean);
  return (
    <>
      {bar}
      {err && <Notice tone="error">{err}</Notice>}
      <Card className="gy-pjs">
        <h3>
          出方向前先定
          <Link className="gy-link" to={`/products/${flow.product.anchorId}`}>
            去商品库改人群
          </Link>
        </h3>
        <div className="gy-cellrow">
          <span className="cn">给谁看</span>
          {personas.length ? (
            <span className="gy-hooks" role="group" aria-label="给谁看">
              <Chip pressed={!persona} onClick={() => setPersona('')}>
                {flow.aiEnabled ? '交给 AI 挑' : '不指定'}
              </Chip>
              {personas.map((p) => (
                <Chip
                  key={p.id ?? p.name}
                  pressed={persona === p.name}
                  title={[
                    p.pain && `在烦：${p.pain}`,
                    p.hooks?.length ? `常用开头：${p.hooks.join('、')}` : '',
                  ]
                    .filter(Boolean)
                    .join('；')}
                  onClick={() => setPersona(p.name)}
                >
                  {p.name}
                </Chip>
              ))}
            </span>
          ) : (
            <span className="gy-muted">这个商品还没有人群。</span>
          )}
        </div>
        <div className="gy-cellrow">
          <span className="cn">时长</span>
          <span className="gy-seg" role="group" aria-label="时长">
            {flow.options.durations.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={duration === d}
                onClick={() => setDuration(d)}
              >
                {d} 秒
              </button>
            ))}
          </span>
          <span className="chint">15 秒约 5 个镜头，30 秒约 7 个镜头</span>
        </div>
        {risks.length > 0 && (
          <div className="gy-avoid">
            <b>写方向时会避开：</b>
            {risks.join('；')}
          </div>
        )}
      </Card>
      {dirs.length > 0 && (
        <Card className="gy-pjs">
          <h3>
            {multi ? '选 2~3 个方向同时测' : '选一个方向'}
            <small>
              {dirs.length} 套
            </small>
            <label className="gy-mtog">
              <input
                type="checkbox"
                checked={multi}
                onChange={(e) => {
                  setMulti(e.target.checked);
                  if (!e.target.checked) setPick((cur) => cur.slice(0, 1));
                }}
              />
              同时测几个方向
            </label>
          </h3>
          <div className="gy-dirgridc">
            {dirs.map((d) => {
              const at = pick.indexOf(d.id);
              return (
                <DirectionCard
                  key={d.id}
                  d={d}
                  letter={at >= 0 && multi ? LETTERS[at] : at >= 0 ? '✓' : undefined}
                  picked={at >= 0}
                  multi={multi}
                  ctx={ctx}
                  busy={busy}
                  onToggle={() => toggle(d.id)}
                  onEdit={() => {
                    setEditing({ id: d.id, data: { ...d.data, points: [...d.data.points] } });
                    window.setTimeout(
                      () =>
                        document.querySelector('.gy-dirform')?.scrollIntoView?.({ block: 'start' }),
                      50,
                    );
                  }}
                  onRegen={() =>
                    void run(
                      () =>
                        post<ModeFlow>(
                          `/clients/${client.id}/projects/${pid}/directions/${d.id}/regenerate`,
                          { revision: d.revision },
                        ),
                      `「${d.data.title}」重出了一套`,
                    )
                  }
                />
              );
            })}
          </div>
          {multi && pick.length >= 3 && <span className="gy-fine">最多同时测 3 个方向。</span>}
        </Card>
      )}
      {editing && editRow && (
        <DirectionForm
          value={editing.data}
          origin={editRow.origin}
          flow={flow}
          ctx={ctx}
          onChange={(data) => setEditing({ ...editing, data })}
        />
      )}
    </>
  );
}
