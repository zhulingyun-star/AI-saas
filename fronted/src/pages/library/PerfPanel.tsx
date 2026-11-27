import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ApiError, post, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Notice } from '../../gy/ui';
import { dateRange, fix, fmtN, md, pct, type PerfRecord, type VideoDetail } from './data';

type Key =
  | 'dateFrom'
  | 'dateTo'
  | 'impressions'
  | 'clicks'
  | 'retain3s'
  | 'finishRate'
  | 'productClicks'
  | 'orders'
  | 'gpm'
  | 'roi'
  | 'negativeRate'
  | 'note';
type Draft = Record<Key, string>;
/** 表单字段：key、名称、类型（date / int / num / auto）、必填 */
const FORM: [Key | 'ctr' | 'cvr', string, 'date' | 'int' | 'num' | 'auto', boolean?][] = [
  ['dateFrom', '开始日期', 'date', true],
  ['dateTo', '结束日期', 'date'],
  ['impressions', '曝光', 'int', true],
  ['clicks', '点击', 'int', true],
  ['ctr', '点击率（自动算）', 'auto'],
  ['retain3s', '3 秒留存（%）', 'num'],
  ['finishRate', '完播率（%）', 'num'],
  ['productClicks', '商品点击', 'int'],
  ['orders', '成交单数', 'int'],
  ['cvr', '转化率（自动算）', 'auto'],
  ['gpm', '千次曝光成交额（元）', 'num'],
  ['roi', '投产比', 'num'],
  ['negativeRate', '负反馈率（%）', 'num'],
];
const TILES: [
  keyof NonNullable<VideoDetail['perf']>,
  string,
  (x?: number | null) => string,
  boolean?,
][] = [
  ['impressions', '曝光', fmtN],
  ['clicks', '点击', fmtN],
  ['ctr', '点击率 · 自动算', (x) => pct(x, 2), true],
  ['retain3s', '3 秒留存', (x) => pct(x)],
  ['finishRate', '完播率', (x) => pct(x)],
  ['productClicks', '商品点击', fmtN],
  ['orders', '成交单数', fmtN],
  ['cvr', '转化率 · 自动算', (x) => pct(x, 2), true],
  ['gpm', '千次曝光成交额', (x) => (x == null ? '—' : `${x.toFixed(1)} 元`)],
  ['roi', '投产比', (x) => fix(x), true],
  ['negativeRate', '负反馈率', (x) => pct(x, 2)],
];
export const todayCN = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const s = (x?: number | null) => (x == null ? '' : String(x));
function draftOf(r?: PerfRecord): Draft {
  const day = todayCN();
  return {
    dateFrom: r?.from ?? day,
    dateTo: r?.to ?? day,
    impressions: s(r?.impressions),
    clicks: s(r?.clicks),
    retain3s: s(r?.retain3s),
    finishRate: s(r?.finishRate),
    productClicks: s(r?.productClicks),
    orders: s(r?.orders),
    gpm: s(r?.gpm),
    roi: s(r?.roi),
    negativeRate: s(r?.negativeRate),
    note: r?.note ?? '',
  };
}
const num = (v: string) => (v.trim() === '' ? null : Number(v));

/** 一条成片的投放数据：手填（一天或一段日期）、改、删；累计、按天点击率、该换新了的每个信号。只显示真实填的数字。 */
export default function PerfPanel({
  v,
  apply,
  reload,
}: {
  v: VideoDetail;
  apply: (next: VideoDetail) => void;
  reload: () => Promise<unknown>;
}) {
  const { client, notify } = useWorkspace();
  const [form, setForm] = useState<{ id: string | null; revision: number; draft: Draft } | null>(
    null,
  );
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const rows = v.records;
  const run = async (fn: () => Promise<VideoDetail>, done: string) => {
    setBusy(true);
    setErr('');
    try {
      apply(await fn());
      notify(done);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await reload();
        setForm(null);
        setConfirmDel(null);
        setErr(`${e.message}（已经刷新成最新的，再改一次就行）`);
      } else setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const base = `/clients/${client.id}/jobs/${v.id}/performance`;
  const save = () =>
    form &&
    void run(
      async () => {
        const d = form.draft;
        const body = {
          dateFrom: d.dateFrom,
          dateTo: d.dateTo || d.dateFrom,
          impressions: num(d.impressions),
          clicks: num(d.clicks),
          retain3s: num(d.retain3s),
          finishRate: num(d.finishRate),
          productClicks: num(d.productClicks),
          orders: num(d.orders),
          gpm: num(d.gpm),
          roi: num(d.roi),
          negativeRate: num(d.negativeRate),
          note: d.note,
          ...(form.id ? { revision: form.revision } : {}),
        };
        const next = form.id
          ? await put<VideoDetail>(`${base}/${form.id}`, body)
          : await post<VideoDetail>(base, body);
        setForm(null);
        return next;
      },
      form.id
        ? '已改好这一条'
        : `已保存 ${dateRange(form.draft.dateFrom, form.draft.dateTo || form.draft.dateFrom)} 的投放数据`,
    );
  const remove = (r: PerfRecord) =>
    void run(
      async () => {
        const next = await request<VideoDetail>(`${base}/${r.id}?revision=${r.revision}`, {
          method: 'DELETE',
        });
        setConfirmDel(null);
        return next;
      },
      `已删掉 ${dateRange(r.from, r.to)} 这一条`,
    );

  const d = form?.draft;
  const ctr = d && num(d.impressions) ? ((num(d.clicks) ?? 0) / num(d.impressions)!) * 100 : null;
  const cvr =
    d && num(d.clicks) && num(d.orders) != null ? (num(d.orders)! / num(d.clicks)!) * 100 : null;
  const formCard = form && d && (
    <div
      className="gy-pfform"
      aria-label={form.id ? '改这条投放数据' : '填一条投放数据'}
      role="group"
    >
      <div className="gy-pfhd">
        <span>
          <b>{form.id ? `改 ${dateRange(d.dateFrom, d.dateTo)} 这一条` : '填一条投放数据'}</b>
          <small>
            按天填最准；同一条成片的日期不能重叠。
          </small>
        </span>
        <span className="gy-row">
          <Btn size="xs" variant="ghost" disabled={busy} onClick={() => setForm(null)}>
            取消
          </Btn>
          <Btn size="xs" variant="primary" busy={busy} onClick={save}>
            保存这一条
          </Btn>
        </span>
      </div>
      <div className="gy-pfgrid4">
        {FORM.map(([k, label, type, req]) => (
          <label key={k}>
            <span>
              {label}
              {req && <em> *</em>}
            </span>
            {type === 'auto' ? (
              <span className="auto">{k === 'ctr' ? pct(ctr, 2) : pct(cvr, 2)}</span>
            ) : (
              <input
                className="gy-input"
                type={type === 'date' ? 'date' : 'number'}
                min={type === 'date' ? v.madeOn : 0}
                max={type === 'date' ? todayCN() : undefined}
                step={type === 'int' ? 1 : 'any'}
                inputMode={type === 'date' ? undefined : type === 'int' ? 'numeric' : 'decimal'}
                aria-label={label}
                value={d[k as Key]}
                onChange={(e) => setForm({ ...form, draft: { ...d, [k]: e.target.value } })}
              />
            )}
          </label>
        ))}
      </div>
      <label className="gy-pfnote">
        <span>备注（选填）</span>
        <textarea
          className="gy-textarea"
          rows={2}
          maxLength={300}
          aria-label="备注"
          placeholder="例：这天加了预算；换了定向；直播间同时在播"
          value={d.note}
          onChange={(e) => setForm({ ...form, draft: { ...d, note: e.target.value } })}
        />
      </label>
    </div>
  );

  const S = v.perf;
  const sig = v.signals;
  const tired = sig?.filter((x) => x.hit) ?? [];
  return (
    <Card className="gy-pjs" id="perf">
      <h3>
        投放数据<small>{rows.length ? `${rows.length} 条记录` : '还没有'}</small>
        {rows.length > 0 && !form && v.hasOutput && (
          <Btn size="xs" onClick={() => setForm({ id: null, revision: 0, draft: draftOf() })}>
            <Plus size={13} aria-hidden="true" />
            再填一条
          </Btn>
        )}
      </h3>
      {err && <Notice tone="error">{err}</Notice>}
      {formCard}
      {!rows.length && !form && (
        <div className="gy-pfempty">
          <b>还没填投放数据</b>
          {v.hasOutput ? (
            <>
              <span className="gy-row">
                <Btn
                  size="xs"
                  variant="primary"
                  onClick={() => setForm({ id: null, revision: 0, draft: draftOf() })}
                >
                  <Plus size={13} aria-hidden="true" />
                  填数据
                </Btn>
                <span className="gy-fine">
                  投放时用下面「来源」里的投放用名命名，导入表格时能自动对上
                </span>
              </span>
            </>
          ) : (
            <span>这一版还没出好，出好了才能填。</span>
          )}
        </div>
      )}
      {S && (
        <>
          {tired.length > 0 ? (
            <div className="gy-tiredbox" role="status">
              <b>该换新了</b>
              <span>按下面三个信号查了一遍，这条碰到了 {tired.length} 个：</span>
              <ul>
                {sig!.map((x) => (
                  <li key={x.key} className={x.hit ? 'hit' : 'ok'}>
                    <i aria-hidden="true">{x.hit ? '!' : '✓'}</i>
                    <b>{x.title}</b>
                    <span>{x.detail}</span>
                  </li>
                ))}
              </ul>
              <span>可以用下面「基于这条再做一条」接力，先换开头或换人群。</span>
            </div>
          ) : sig ? (
            <div className="gy-fine">
              该换新了的信号：
              {sig.length ? sig.map((x) => x.title).join('、') : '这几条记录里还没有能判断的数字'}
              {sig.length ? '，目前都没碰到。' : '。'}
            </div>
          ) : (
            <div className="gy-fine">至少要 3 条有曝光的记录，才能判断该不该换新。</div>
          )}
          <div className="gy-pfhd">
            <b>累计</b>
            <small>
              {dateRange(S.from, S.to)} · {S.records} 条记录 · 比例按曝光加权
            </small>
          </div>
          <div className="gy-pftiles">
            {TILES.map(([k, label, f, key]) => (
              <div key={k} className={`t${key ? ' k' : ''}`}>
                <small>{label}</small>
                <b>{f(S[k] as number | null | undefined)}</b>
              </div>
            ))}
          </div>
          <div className="gy-pfhd">
            <b>点击率走势</b>
            <small>每条记录一个点</small>
          </div>
          <Trend rows={[...rows].reverse()} />
          <div className="gy-pftbl">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>曝光</th>
                  <th>点击率</th>
                  <th>3 秒留存</th>
                  <th>转化率</th>
                  <th>投产比</th>
                  <th>负反馈</th>
                  <th>来源 / 备注</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{dateRange(r.from, r.to)}</td>
                    <td>{fmtN(r.impressions)}</td>
                    <td>{r.impressions ? pct((r.clicks / r.impressions) * 100, 2) : '—'}</td>
                    <td>{pct(r.retain3s)}</td>
                    <td>
                      {r.orders != null && r.clicks ? pct((r.orders / r.clicks) * 100, 2) : '—'}
                    </td>
                    <td>{fix(r.roi)}</td>
                    <td>{pct(r.negativeRate, 2)}</td>
                    <td className="nt">
                      {r.source === 'IMPORT' ? '表格导入' : '手填'}
                      {r.note ? ` · ${r.note}` : ''}
                    </td>
                    <td className="ops">
                      {confirmDel === r.id ? (
                        <>
                          <Btn size="xs" danger busy={busy} onClick={() => remove(r)}>
                            确定删
                          </Btn>
                          <Btn size="xs" variant="ghost" onClick={() => setConfirmDel(null)}>
                            不删
                          </Btn>
                        </>
                      ) : (
                        <>
                          <Btn
                            size="xs"
                            variant="ghost"
                            aria-label={`改 ${dateRange(r.from, r.to)} 这一条`}
                            onClick={() =>
                              setForm({ id: r.id, revision: r.revision, draft: draftOf(r) })
                            }
                          >
                            改
                          </Btn>
                          <Btn
                            size="xs"
                            variant="ghost"
                            aria-label={`删 ${dateRange(r.from, r.to)} 这一条`}
                            onClick={() => setConfirmDel(r.id)}
                          >
                            删
                          </Btn>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/** 按记录的点击率折线（只画真实记录，少于 2 条不画） */
function Trend({ rows }: { rows: PerfRecord[] }) {
  const pts = rows.filter((r) => r.impressions > 0);
  if (pts.length < 2) return <div className="gy-fine">至少要两条有曝光的记录才画得出走势。</div>;
  const ys = pts.map((r) => (r.clicks / r.impressions) * 100);
  const mx = Math.max(...ys),
    mn = Math.min(...ys),
    pad = (mx - mn) * 0.25 || 0.3,
    top = mx + pad,
    bot = Math.max(0, mn - pad);
  const W = 720,
    H = 120;
  const X = (i: number) => 44 + (i * (W - 60)) / (pts.length - 1);
  const Y = (y: number) => 10 + ((top - y) / (top - bot)) * (H - 34);
  const lb = (r: PerfRecord) => md(r.to);
  return (
    <svg
      className="gy-pftrend"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`按记录的点击率：${pts.map((r, i) => `${lb(r)} ${ys[i].toFixed(1)}%`).join('，')}`}
    >
      <line x1="44" x2={W - 16} y1={Y(top)} y2={Y(top)} />
      <line x1="44" x2={W - 16} y1={Y(bot)} y2={Y(bot)} />
      <text x="38" y={Y(top) + 4} textAnchor="end">
        {top.toFixed(1)}%
      </text>
      <text x="38" y={Y(bot) + 4} textAnchor="end">
        {bot.toFixed(1)}%
      </text>
      <polyline points={ys.map((y, i) => `${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')} />
      {ys.map((y, i) => (
        <circle key={i} cx={X(i)} cy={Y(y)} r="3">
          <title>
            {dateRange(pts[i].from, pts[i].to)} 点击率 {y.toFixed(2)}%
          </title>
        </circle>
      ))}
      <text x={X(0)} y={H - 4}>
        {lb(pts[0])}
      </text>
      <text x={X(pts.length - 1)} y={H - 4} textAnchor="end">
        {lb(pts[pts.length - 1])}
      </text>
    </svg>
  );
}
