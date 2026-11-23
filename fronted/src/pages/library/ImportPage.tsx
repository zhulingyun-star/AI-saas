import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Download, FileSpreadsheet } from 'lucide-react';
import { post, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Chip, Notice, PageHead } from '../../gy/ui';
import { TopBar } from '../projects/parts';
import { shortTime } from '../projects/data';
import { fmtN, useRefreshVideos, useVideoLibrary } from './data';

interface PreviewRow {
  row: number;
  name: string;
  code: string;
  dateFrom: string;
  dateTo: string;
  values: Record<string, number | null>;
  status: 'OK' | 'ERROR' | 'UNMATCHED' | 'SKIPPED';
  by: string;
  jobId?: string | null;
  video?: { id: string; projectName: string; no: number; code: string } | null;
  messages: string[];
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
  counts: { ok: number; error: number; unmatched: number; skipped: number };
  videos: { id: string; projectName: string; no: number; code: string }[];
}
interface Result {
  imported: number;
  skipped: number;
  videos: number;
  errors: { row: number; name: string; messages: string[] }[];
}
const BY: Record<string, string> = {
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
  '投放用名',
  '视频编号',
  '日期',
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
          skipped: number;
          errors: number;
          by: string;
          at: string;
        }[]
      >(`/clients/${client.id}/performance-imports`),
  });

  const run = async (
    body: { name: string; text: string },
    map: Record<string, number> | null,
    asg: Record<string, string>,
  ) => {
    setBusy(true);
    setErr('');
    try {
      const p = await post<Preview>(`/clients/${client.id}/performance-imports/preview`, {
        fileName: body.name,
        text: body.text,
        mapping: map,
        assign: asg,
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
      const r = await post<Result>(`/clients/${client.id}/performance-imports`, {
        fileName: file.name,
        text: file.text,
        mapping,
        assign,
        confirmed: true,
      });
      setResult(r);
      setPreview(null);
      setFile(null);
      await refresh();
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
        (v) => [v.adName, v.code].map(esc).join(',') + ','.repeat(TEMPLATE_HEAD.length - 2),
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
  const fmtCell = (r: PreviewRow) => `${fmtN(r.values.impressions)} / ${fmtN(r.values.clicks)}`;

  return (
    <div className="gy-page gy-new">
      <button type="button" className="gy-backlink" onClick={() => navigate('/library')}>
        <ChevronLeft size={14} aria-hidden="true" />
        返回资产库
      </button>
      <PageHead
        title="导入投放表格"
        description="把投放后台导出的素材报表（CSV）导进来，按投放用名或视频编号对上资产库里的成片，按日期追加，不会覆盖已经填的。"
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
          {p.counts.error ? ` · ${p.counts.error} 行有问题（不导入，下面写了原因）` : ''}
          {p.counts.skipped ? ` · 跳过 ${p.counts.skipped} 行` : ''}
          {p.missing.length ? (
            <b className="gy-warn-t"> · 先把缺的列对上</b>
          ) : left ? (
            <b className="gy-warn-t"> · {left} 行没对上，手动指认或跳过以后才能导入</b>
          ) : null}
        </TopBar>
      )}
      {err && <Notice tone="error">{err}</Notice>}
      {result && (
        <Notice
          tone="success"
          title={`已导入 ${result.imported} 行，对应 ${result.videos} 条成片${result.skipped ? `，跳过 ${result.skipped} 行` : ''}`}
          actions={
            <Btn size="xs" variant="primary" onClick={() => navigate('/library?perf=1')}>
              去看填了数据的成片
            </Btn>
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
              <span className="key">投放用名或视频编号（至少一个）</span>
              <span className="key">日期（一天，或「2026-11-15 至 2026-11-21」一段）</span>
              <span className="key">曝光</span>
              <span className="key">点击</span>
              {[
                '3 秒留存',
                '完播率',
                '商品点击',
                '成交单数',
                '千次曝光成交额',
                '投产比',
                '负反馈率',
                '备注',
              ].map((c) => (
                <span key={c}>{c}</span>
              ))}
              <span className="auto">点击率、转化率不用填，自动算</span>
            </div>
            <span className="gy-fine">
              列名不一样也能认（比如「展示数」「素材名称」「消耗回报率」），认不出来的可以在下一步手动对。百分比写
              38% 或 38 都行。
            </span>
            <h3>怎么对上是哪条成片</h3>
            <ol className="gy-implist">
              <li>
                先按「投放用名」对：成片详情里能一键复制，最后一段是视频编号，例如{' '}
                {videos[0] ? (
                  <code className="gy-adnm">{videos[0].adName}</code>
                ) : (
                  '新百伦鞋子_对比型_通勤上班族_通勤路上_15秒_v1_ab12cd34'
                )}
              </li>
              <li>
                对不上再按「视频编号」对（成片详情里能看到）；名字改过但最后还带着编号的也能对上
              </li>
              <li>都对不上的行，要你手动指认是哪条成片，或者跳过</li>
              <li>同一条成片的日期不能重叠：已经填过的那几天不会重复导入，会在预览里写明</li>
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
            <span className="gy-fine">
              Excel 文件先「另存为 → CSV」；选了文件只会先预览，不会马上导入
            </span>
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
              <table className="gy-imptbl">
                <thead>
                  <tr>
                    <th>文件</th>
                    <th>时间</th>
                    <th>导入</th>
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
                      <td>{h.imported} 行</td>
                      <td>{h.skipped} 行</td>
                      <td>{h.errors} 行</td>
                      <td>{h.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                      <th>曝光 / 点击</th>
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
                                {r.video.projectName} · 第 {r.video.no} 版
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
                                {p.videos.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.projectName} · 第 {v.no} 版（{v.code}）
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
                              {label}
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
