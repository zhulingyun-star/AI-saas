import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Download, FileSpreadsheet } from 'lucide-react';
import { post, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Chip, Notice, PageHead } from '../../gy/ui';
import { TopBar } from '../projects/parts';
import { shortTime } from '../projects/data';
import { fmtN, useRefreshVideos, useVideoLibrary } from './data';
import { useAccounts, useRefreshAnalytics, yuan } from './campaign';
import { todayCN } from './PerfPanel';

interface PreviewRow {
  row: number;
  name: string;
  code: string;
  materialId?: string;
  update?: boolean;
  dateFrom: string;
  dateTo: string;
  values: Record<string, number | null>;
  status: 'OK' | 'ERROR' | 'UNMATCHED' | 'SKIPPED';
  by: string;
  jobId?: string | null;
  video?: VideoBrief | null;
  messages: string[];
}
interface VideoBrief {
  id: string;
  projectName: string;
  no: number;
  code: string;
  standardName?: string | null;
}
interface Preview {
  fileName: string;
  columns: { index: number; name: string; field?: string | null }[];
  mapping: Record<string, number>;
  fields: { key: string; label: string }[];
  missing: string[];
  sample: string[][];
  totalRows: number;
  rows: PreviewRow[];
  counts: { ok: number; error: number; unmatched: number; skipped: number; update: number };
  videos: VideoBrief[];
  account?: { id: string; name: string; advertiserId: string } | null;
  rangeFrom?: string | null;
  rangeTo?: string | null;
}
interface Result {
  imported: number;
  updated: number;
  suggestions: number;
  skipped: number;
  videos: number;
  errors: { row: number; name: string; messages: string[] }[];
}
const BY: Record<string, string> = {
  MATERIAL_ID: '按素材 ID 对上（导过）',
  STANDARD: '按命名对上',
  STANDARD_PREFIX: '按命名对上（带后缀）',
  STANDARD_REVERSE: '按命名开头对上',
  NAME: '按投放用名对上',
  CODE: '按视频编号对上',
  NAME_CODE: '按名字里的视频编号对上',
  MANUAL: '手动指认',
};
const STATUS: Record<PreviewRow['status'], [string, string]> = {
  OK: ['能导入', 'ok'],
  ERROR: ['有问题，不导入', 'bad'],
  UNMATCHED: ['没对上', 'warn'],
  SKIPPED: ['跳过', 'idle'],
};
const TEMPLATE_HEAD = [
  '素材名称',
  '视频编号',
  '日期',
  '消耗',
  '成交金额',
  '成交订单数',
  '退款金额',
  '退款订单数',
  '1小时退款率',
  '曝光',
  '点击',
  '3秒留存',
  '完播率',
  '商品点击',
  '成交单数',
  '千次曝光成交额',
  '投产比',
  '负反馈率',
  '备注',
];

/** 读表格文件：先按 UTF-8 读，读不通再按 GBK（Excel 存的中文 CSV 常是 GBK） */
async function readText(file: File) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gbk').decode(buf);
  }
}

/** 导入投放表格（CSV）：选文件 → 认列、对上成片、逐行检查（预览）→ 确认导入 → 说明哪些行没导、为什么 */
export default function ImportPage() {
  const { client, notify } = useWorkspace();
  const navigate = useNavigate();
  const refresh = useRefreshVideos();
  const { videos } = useVideoLibrary();
  const refreshAnalytics = useRefreshAnalytics();
  const accounts = useAccounts();
  const activeAccounts = (accounts.data?.items ?? []).filter((a) => a.status === 'ACTIVE');
  const [accountId, setAccountId] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [find, setFind] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number> | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [show, setShow] = useState<'all' | 'problem' | 'ok'>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const history = useQuery({
    queryKey: [client.id, 'performance-imports'],
    queryFn: () =>
      request<
        {
          id: string;
          fileName: string;
          totalRows: number;
          imported: number;
          updated?: number;
          skipped: number;
          errors: number;
          by: string;
          at: string;
          account?: string | null;
          rangeFrom?: string | null;
          rangeTo?: string | null;
        }[]
      >(`/clients/${client.id}/performance-imports`),
  });

  const run = async (
    body: { name: string; text: string },
    map: Record<string, number> | null,
    asg: Record<string, string>,
    acc = accountId,
    rg = range,
  ) => {
    setBusy(true);
    setErr('');
    try {
      const p = await post<Preview>(`/clients/${client.id}/analytics/import/preview`, {
        fileName: body.name,
        text: body.text,
        mapping: map,
        assign: asg,
        accountId: acc || null,
        rangeFrom: rg.from || null,
        rangeTo: rg.to || rg.from || null,
      });
      setPreview(p);
      setMapping(p.mapping);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setResult(null);
    if (/\.(xlsx|xls|numbers)$/i.test(f.name)) {
      setErr('现在只能读 CSV：在 Excel 里「另存为 → CSV（逗号分隔）」再导入。');
      return;
    }
    if (f.size > 2_000_000) {
      setErr('表格太大了（最多约 2MB），分几次导入。');
      return;
    }
    const text = await readText(f);
    const body = { name: f.name, text };
    setFile(body);
    setAssign({});
    setMapping(null);
    await run(body, null, {});
  };
  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping(null);
    setAssign({});
    setErr('');
    if (fileRef.current) fileRef.current.value = '';
  };
  const confirm = async () => {
    if (!file || !preview) return;
    setBusy(true);
    setErr('');
    try {
      const r = await post<Result>(`/clients/${client.id}/analytics/import/confirm`, {
        fileName: file.name,
        text: file.text,
        mapping,
        assign,
        accountId: accountId || null,
        rangeFrom: range.from || null,
        rangeTo: range.to || range.from || null,
        confirmed: true,
      });
      setResult(r);
      setPreview(null);
      setFile(null);
      await refresh();
      await refreshAnalytics();
      await history.refetch();
      notify(`已导入 ${r.imported} 行投放数据`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const template = () => {
    const esc = (x: string) => (/[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
    const lines = [
      TEMPLATE_HEAD.join(','),
      ...videos.map(
        (v) =>
          [v.standardName ?? v.adName, v.code].map(esc).join(',') +
          ','.repeat(TEMPLATE_HEAD.length - 2),
      ),
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '投放数据模板.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const p = preview;
  const left = p ? p.counts.unmatched : 0;
  const rows = p
    ? p.rows.filter((r) =>
        show === 'all' ? true : show === 'ok' ? r.status === 'OK' : r.status !== 'OK',
      )
    : [];
  const money = !!p && ('cost' in p.mapping || 'gmv' in p.mapping);
  const fmtCell = (r: PreviewRow) =>
    money
      ? `${yuan(r.values.cost)} / ${yuan(r.values.gmv)}`
      : `${fmtN(r.values.impressions)} / ${fmtN(r.values.clicks)}`;
  const options = (p?.videos ?? []).filter(
    (v) =>
      !find.trim() ||
      `${v.standardName ?? ''} ${v.projectName} ${v.code}`
        .toLowerCase()
        .includes(find.trim().toLowerCase()),
  );
  const vLabel = (v: VideoBrief) =>
    v.standardName
      ? `${v.standardName}（${v.code}）`
      : `${v.projectName} · 第 ${v.no} 版（${v.code}）`;
  const reRun = (acc: string, rg: { from: string; to: string }) => {
    if (file) void run(file, mapping, assign, acc, rg);
  };

  return (
    <div className="gy-page gy-new">
      <button type="button" className="gy-backlink" onClick={() => navigate('/library')}>
        <ChevronLeft size={14} aria-hidden="true" />
        返回资产库
      </button>
      <PageHead
        title="导入投放表格"
        description="导入千川素材报表（CSV），按成片命名对上。同一素材同一天再导会更新。"
      >
        {!p && (
          <Btn onClick={template} disabled={!videos.length}>
            <Download size={14} aria-hidden="true" />
            下载填写模板
          </Btn>
        )}
      </PageHead>
      {p && (
        <TopBar
          actions={
            <>
              <Btn variant="ghost" disabled={busy} onClick={reset}>
                换个文件
              </Btn>
              <Btn
                variant="primary"
                busy={busy}
                disabled={!!p.missing.length || left > 0 || p.counts.ok === 0}
                onClick={() => void confirm()}
              >
                导入能导入的 {p.counts.ok} 行
              </Btn>
            </>
          }
        >
          <b>{p.fileName}</b> · {p.totalRows} 行 · 能导入 {p.counts.ok} 行
          {p.counts.update ? `（其中更新 ${p.counts.update} 行）` : ''}
          {p.counts.error ? ` · ${p.counts.error} 行有问题（不导入，下面写了原因）` : ''}
          {p.counts.skipped ? ` · 跳过 ${p.counts.skipped} 行` : ''}
          {p.missing.length ? (
            <b className="gy-warn-t"> · 先把缺的列对上</b>
          ) : left ? (
            <b className="gy-warn-t"> · {left} 行没对上，手动指认或跳过以后才能导入</b>
          ) : null}
        </TopBar>
      )}
      <Card className="gy-pjs gy-impset" aria-label="导入设置">
        <div className="gy-impsetrow">
          <label>
            <span>千川账户</span>
            <select
              className="gy-select"
              aria-label="千川账户"
              value={accountId}
              disabled={busy}
              onChange={(e) => {
                setAccountId(e.target.value);
                reRun(e.target.value, range);
              }}
            >
              <option value="">不选（自己的表格）</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}（{a.advertiserId}）
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>数据日期</span>
            <span className="gy-row">
              <input
                className="gy-input"
                type="date"
                aria-label="数据开始日期"
                max={todayCN()}
                value={range.from}
                disabled={busy}
                onChange={(e) => {
                  const next = { ...range, from: e.target.value };
                  setRange(next);
                  reRun(accountId, next);
                }}
              />
              <span aria-hidden="true">至</span>
              <input
                className="gy-input"
                type="date"
                aria-label="数据结束日期"
                min={range.from || undefined}
                max={todayCN()}
                value={range.to}
                disabled={busy}
                onChange={(e) => {
                  const next = { ...range, to: e.target.value };
                  setRange(next);
                  reRun(accountId, next);
                }}
              />
            </span>
          </label>
        </div>
        <span className="gy-fine">
          {activeAccounts.length ? (
            '千川报表选账户；表里没有日期列时，按这里的日期导入。'
          ) : (
            <>
              还没有千川账户，<Link to="/library/data/accounts?view=manage">先添加</Link>
              。自己的表格可以不选。
            </>
          )}
        </span>
      </Card>
      {err && <Notice tone="error">{err}</Notice>}
      {result && (
        <Notice
          tone="success"
          title={`已导入 ${result.imported} 行${result.updated ? `，更新 ${result.updated} 行` : ''}，对应 ${result.videos} 条成片${result.skipped ? `，跳过 ${result.skipped} 行` : ''}`}
          actions={
            <>
              <Btn size="xs" variant="primary" onClick={() => navigate('/library/data/materials')}>
                看投流看板
              </Btn>
              {result.suggestions > 0 && (
                <Btn size="xs" onClick={() => navigate('/library/data/suggestions')}>
                  {result.suggestions} 条新建议
                </Btn>
              )}
            </>
          }
        >
          {result.errors.length ? (
            <span className="gy-imperrs">
              {result.errors.length} 行有问题，没有导入：
              {result.errors.map((e) => (
                <span key={e.row}>
                  第 {e.row} 行{e.name ? `（${e.name}）` : ''}：{e.messages.join('；')}
                </span>
              ))}
            </span>
          ) : (
            '每一行都导进去了。'
          )}
        </Notice>
      )}
      {!p && (
        <>
          <Card className="gy-pjs">
            <h3>表格里要有这些列</h3>
            <div className="gy-impcols">
              <span className="key">素材名称、视频编号或素材 ID（至少一个）</span>
              <span className="key">日期（或在上面选日期）</span>
              <span className="key">消耗、成交金额，或曝光、点击</span>
              {[
                '成交订单数',
                '支付 ROI',
                '退款金额',
                '退款订单数',
                '1 小时退款率',
                '智能优惠券',
                '3 秒留存',
                '完播率',
                '商品点击',
                '千次曝光成交额',
                '负反馈率',
                '备注',
              ].map((c) => (
                <span key={c}>{c}</span>
              ))}
              <span className="auto">净成交、净 ROI、点击率不用填，自动算</span>
            </div>
            <span className="gy-fine">
              列名不一样也能认（比如「展示数」「素材名称」「消耗回报率」），认不出来的可以在下一步手动对。百分比写
              38% 或 38 都行。
            </span>
            <h3>怎么对上是哪条成片</h3>
            <ol className="gy-implist">
              <li>
                先按成片命名对：卡片上点「复制命名」，上传千川时用它命名，例如{' '}
                <code className="gy-adnm">
                  {videos.find((v) => v.standardName)?.standardName ??
                    '251126-儿童家居服-短视频-欣怡-V1'}
                </code>
                ；千川加了后缀、或名字只剩前一截也能对上
              </li>
              <li>导过的素材 ID 会记住是哪条成片</li>
              <li>再按旧的投放用名、视频编号对</li>
              <li>都对不上的行，手动指认或跳过</li>
              <li>同一账户、同一素材、同一天再导入就更新那一条，不重复</li>
            </ol>
          </Card>
          <label
            className="gy-impdrop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pick(e.dataTransfer.files?.[0]);
            }}
          >
            <FileSpreadsheet size={22} aria-hidden="true" />
            <b>把 CSV 表格拖到这里，或者点这里选文件</b>
            <span className="gy-fine">Excel 文件先「另存为 → CSV」</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv"
              aria-label="选择投放表格文件"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          {busy && <span className="gy-muted">正在读表格…</span>}
          {!!history.data?.length && (
            <Card className="gy-pjs">
              <h3>
                最近导入<small>最多显示 20 次</small>
              </h3>
              <div className="gy-imptbl-wrap">
                <table className="gy-imptbl">
                  <thead>
                    <tr>
                      <th>文件</th>
                      <th>时间</th>
                      <th>账户</th>
                      <th>导入</th>
                      <th>更新</th>
                      <th>跳过</th>
                      <th>有问题</th>
                      <th>谁导的</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.map((h) => (
                      <tr key={h.id}>
                        <td>{h.fileName}</td>
                        <td>{shortTime(h.at)}</td>
                        <td>{h.account ?? '—'}</td>
                        <td>{h.imported} 行</td>
                        <td>{h.updated ?? 0} 行</td>
                        <td>{h.skipped} 行</td>
                        <td>{h.errors} 行</td>
                        <td>{h.by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      {p && file && (
        <>
          <Card className="gy-pjs">
            <h3>
              认出来的列<small>认错了就在这里改，改完会重新检查</small>
            </h3>
            {p.missing.length > 0 && (
              <Notice tone="warn" title="还缺这些列">
                {p.missing.join('、')}
              </Notice>
            )}
            <div className="gy-impmap">
              {p.fields.map((f) => (
                <label key={f.key}>
                  <span>{f.label}</span>
                  <select
                    className="gy-select"
                    aria-label={`「${f.label}」用表格里的哪一列`}
                    value={mapping?.[f.key] ?? -1}
                    disabled={busy}
                    onChange={(e) => {
                      const next = { ...(mapping ?? {}) };
                      const i = Number(e.target.value);
                      if (i < 0) delete next[f.key];
                      else next[f.key] = i;
                      setMapping(next);
                      void run(file, next, assign);
                    }}
                  >
                    <option value={-1}>不用</option>
                    {p.columns.map((c) => (
                      <option key={c.index} value={c.index}>
                        {c.name || `第 ${c.index + 1} 列`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {p.columns.some((c) => !c.field) && (
              <span className="gy-fine">
                没用上的列：
                {p.columns
                  .filter((c) => !c.field)
                  .map((c) => c.name || `第 ${c.index + 1} 列`)
                  .join('、')}
                （点击率、转化率会按曝光、点击、成交单数重新算，不用表里的）
              </span>
            )}
          </Card>
          {!p.missing.length && (
            <Card className="gy-pjs">
              <h3>
                逐行检查<small>行号是表格里的行（第 1 行是表头）</small>
              </h3>
              {p.counts.unmatched + p.counts.error > 0 && (
                <input
                  className="gy-input gy-impfind"
                  aria-label="搜成片"
                  placeholder="搜成片：命名、项目或视频编号（手动指认时用）"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                />
              )}
              <div className="gy-row" role="group" aria-label="显示哪些行">
                <Chip pressed={show === 'all'} count={p.rows.length} onClick={() => setShow('all')}>
                  全部
                </Chip>
                <Chip
                  pressed={show === 'problem'}
                  count={p.counts.error + p.counts.unmatched + p.counts.skipped}
                  onClick={() => setShow('problem')}
                >
                  有问题、没对上、跳过的
                </Chip>
                <Chip pressed={show === 'ok'} count={p.counts.ok} onClick={() => setShow('ok')}>
                  能导入的
                </Chip>
              </div>
              <div className="gy-imptbl-wrap">
                <table className="gy-imptbl">
                  <thead>
                    <tr>
                      <th>行</th>
                      <th>表格里的名字 / 编号</th>
                      <th>日期</th>
                      <th>{money ? '消耗 / 成交' : '曝光 / 点击'}</th>
                      <th>对上的成片</th>
                      <th>结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const [label, tone] = STATUS[r.status];
                      const canAssign =
                        r.status === 'UNMATCHED' ||
                        r.by === 'MANUAL' ||
                        r.status === 'SKIPPED' ||
                        (r.status === 'ERROR' && !r.jobId);
                      return (
                        <tr
                          key={r.row}
                          className={r.status === 'OK' ? '' : `st-${r.status.toLowerCase()}`}
                          aria-label={`第 ${r.row} 行`}
                        >
                          <td>{r.row}</td>
                          <td className="nm">
                            <code>{r.name || '—'}</code>
                            {r.code && <small>编号 {r.code}</small>}
                            {r.materialId && <small>素材 ID {r.materialId}</small>}
                          </td>
                          <td className="nw">
                            {r.dateFrom
                              ? r.dateTo && r.dateTo !== r.dateFrom
                                ? `${r.dateFrom} 至 ${r.dateTo}`
                                : r.dateFrom
                              : '—'}
                          </td>
                          <td className="nw">{fmtCell(r)}</td>
                          <td>
                            {r.video && (
                              <span className="gy-impok">
                                {r.video.standardName ??
                                  `${r.video.projectName} · 第 ${r.video.no} 版`}
                                <small>{BY[r.by] ?? ''}</small>
                              </span>
                            )}
                            {canAssign && (
                              <select
                                className="gy-select"
                                aria-label={`第 ${r.row} 行是哪条成片`}
                                value={assign[String(r.row)] ?? ''}
                                disabled={busy}
                                onChange={(e) => {
                                  const next = { ...assign };
                                  if (e.target.value) next[String(r.row)] = e.target.value;
                                  else delete next[String(r.row)];
                                  setAssign(next);
                                  void run(file, mapping, next);
                                }}
                              >
                                <option value="">选一条成片…</option>
                                {options.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {vLabel(v)}
                                  </option>
                                ))}
                                <option value="skip">跳过这一行</option>
                              </select>
                            )}
                          </td>
                          <td>
                            <span
                              className={`gy-dot ${tone === 'ok' ? 'ok' : tone === 'bad' ? 'bad' : tone === 'warn' ? 'check' : 'none'}`}
                            >
                              {r.status === 'OK' && r.update ? '更新这一天' : label}
                            </span>
                            {r.messages.map((m) => (
                              <small key={m} className="gy-imperr">
                                {m}
                              </small>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                    {!rows.length && (
                      <tr>
                        <td colSpan={6} className="gy-muted">
                          这一类没有行
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
