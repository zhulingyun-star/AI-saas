import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Notice } from '../../gy/ui';
import { rate, roi, roiTone, refundTone, yuan, type CampaignStats } from './campaign';
import { CopyName } from './parts';
import type { VideoDetail } from './data';

/** 资产库成片详情里的「投放表现」：累计消耗 / 净成交 / 净 ROI / 平均退款率 + 最近 7 天净 ROI 走势。没有千川数据就整块不显示。 */
export function CampaignBlock({ jobId }: { jobId: string }) {
  const { client } = useWorkspace();
  const q = useQuery({
    queryKey: [client.id, 'analytics', 'job', jobId],
    queryFn: () => request<CampaignStats>(`/clients/${client.id}/jobs/${jobId}/campaign-stats`),
  });
  const d = q.data;
  if (!d?.hasData || !d.summary) return null;
  const S = d.summary;
  const tiles: [string, string, string?][] = [
    ['累计消耗', yuan(S.totalCost)],
    ['净成交金额', yuan(S.netGmv)],
    ['净 ROI', roi(S.netRoi), roiTone(S.netRoi)],
    ['平均 1 小时退款率', rate(S.refundRate1h), refundTone(S.refundRate1h)],
  ];
  return (
    <Card className="gy-pjs" aria-label="投放表现">
      <h3>
        投放表现
        <small>
          {S.from === S.to ? S.from : `${S.from} 至 ${S.to}`} · {S.dataDays} 天
        </small>
        <Link className="gy-sglink" to={`/library/data/materials?job=${jobId}`}>
          查看完整数据 →
        </Link>
      </h3>
      <div className="gy-pftiles">
        {tiles.map(([k, v, tone]) => (
          <div key={k} className={`t${k === '净 ROI' ? ' k' : ''}${tone ? ` ${tone}` : ''}`}>
            <small>{k}</small>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="gy-pfhd">
        <b>近 7 天净 ROI</b>
        <small>截至 {d.through?.slice(5)}</small>
      </div>
      <RoiTrend points={d.trend ?? []} />
    </Card>
  );
}

/** 手写 SVG 折线：只画有数据的天，断开的天不连线；不到 2 个点就只写数字 */
function RoiTrend({ points }: { points: NonNullable<CampaignStats['trend']> }) {
  const has = points.filter((p) => p.netRoi != null);
  if (has.length < 2)
    return (
      <div className="gy-fine">
        {has.length
          ? `${has[0].date.slice(5)} 净 ROI ${roi(has[0].netRoi)}，再有一天数据就能画走势。`
          : '近 7 天没有按天的数据。'}
      </div>
    );
  const ys = has.map((p) => p.netRoi!);
  const mx = Math.max(...ys, 3),
    mn = Math.min(...ys, 0),
    top = mx + (mx - mn) * 0.15,
    bot = Math.max(0, mn - (mx - mn) * 0.15);
  const W = 720,
    H = 130;
  const X = (i: number) => 44 + (i * (W - 64)) / (points.length - 1);
  const Y = (y: number) => 10 + ((top - y) / (top - bot || 1)) * (H - 36);
  // 连续的天连成一段
  const segs: string[][] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p.netRoi == null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else cur.push(`${X(i).toFixed(1)},${Y(p.netRoi).toFixed(1)}`);
  });
  if (cur.length) segs.push(cur);
  return (
    <svg
      className="gy-pftrend gy-roitrend"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`近 7 天净 ROI：${points.map((p) => `${p.date.slice(5)} ${p.netRoi == null ? '无数据' : roi(p.netRoi)}`).join('，')}`}
    >
      <line x1="44" x2={W - 16} y1={Y(top)} y2={Y(top)} />
      <line x1="44" x2={W - 16} y1={Y(bot)} y2={Y(bot)} />
      {top > 3 && bot < 3 && <line className="ref good" x1="44" x2={W - 16} y1={Y(3)} y2={Y(3)} />}
      {top > 1 && bot < 1 && <line className="ref bad" x1="44" x2={W - 16} y1={Y(1)} y2={Y(1)} />}
      <text x="38" y={Y(top) + 4} textAnchor="end">
        {top.toFixed(1)}
      </text>
      <text x="38" y={Y(bot) + 4} textAnchor="end">
        {bot.toFixed(1)}
      </text>
      {segs.map((s, i) => (s.length > 1 ? <polyline key={i} points={s.join(' ')} /> : null))}
      {points.map((p, i) =>
        p.netRoi == null ? null : (
          <circle key={p.date} cx={X(i)} cy={Y(p.netRoi)} r="3.5" className={roiTone(p.netRoi)}>
            <title>
              {p.date.slice(5)} 净 ROI {roi(p.netRoi)} · 消耗 {yuan(p.cost)} · 净成交{' '}
              {yuan(p.netGmv)}
            </title>
          </circle>
        ),
      )}
      {points.map((p, i) => (
        <text key={`t${p.date}`} x={X(i)} y={H - 6} textAnchor="middle" className="d">
          {p.date.slice(5)}
        </text>
      ))}
    </svg>
  );
}

const FORMS = ['短视频', '图文', '直播切片'];

/** 标准命名一行：显示 + 复制；能改的人可以改商品简称、内容形式、版本（名字本身不能随便改） */
export function NamingRow({ v, apply }: { v: VideoDetail; apply: (next: VideoDetail) => void }) {
  const { client, notify } = useWorkspace();
  const n = v.naming;
  const [edit, setEdit] = useState<{ productShort: string; form: string; version: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!n) return <span className="gy-unnamed">未规范化</span>;
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    setErr('');
    try {
      const next = await put<VideoDetail>(`/clients/${client.id}/jobs/${v.id}/naming`, {
        productShort: edit.productShort,
        form: edit.form,
        version: edit.version.trim() ? Number(edit.version) : null,
        revision: n.revision,
      });
      apply(next);
      setEdit(null);
      notify('命名已更新');
    } catch (e) {
      setErr(
        (e as Error).message + (e instanceof ApiError && e.status === 409 ? '（刷新后再改）' : ''),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="gy-namerow">
      {v.standardName ? (
        <code className="gy-stdname">{v.standardName}</code>
      ) : (
        <span className="gy-unnamed">未规范化</span>
      )}
      <CopyName name={v.standardName} />
      {!edit && n.creator && (
        <Btn
          size="xs"
          variant="ghost"
          onClick={() =>
            setEdit({
              productShort: n.productShort ?? '',
              form: n.form || '短视频',
              version: n.version ? String(n.version) : '',
            })
          }
        >
          改命名
        </Btn>
      )}
      {!v.standardName && n.problem && <small className="gy-fine">{n.problem}</small>}
      {edit && (
        <span className="gy-nameedit" role="group" aria-label="改命名">
          <label>
            <span>商品简称</span>
            <input
              className="gy-input"
              maxLength={10}
              aria-label="商品简称"
              value={edit.productShort}
              onChange={(e) => setEdit({ ...edit, productShort: e.target.value })}
            />
          </label>
          <label>
            <span>内容形式</span>
            <select
              className="gy-select"
              aria-label="内容形式"
              value={edit.form}
              onChange={(e) => setEdit({ ...edit, form: e.target.value })}
            >
              {FORMS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            <span>版本</span>
            <input
              className="gy-input"
              type="number"
              min={1}
              max={99}
              placeholder="自动"
              aria-label="版本"
              value={edit.version}
              onChange={(e) => setEdit({ ...edit, version: e.target.value })}
            />
          </label>
          <span className="gy-row">
            <Btn size="xs" variant="ghost" onClick={() => setEdit(null)}>
              取消
            </Btn>
            <Btn size="xs" variant="primary" busy={busy} onClick={() => void save()}>
              保存
            </Btn>
          </span>
          <small className="gy-fine">
            日期 {n.date} 和创作者 {n.creator} 不能改。
          </small>
          {err && <Notice tone="error">{err}</Notice>}
        </span>
      )}
    </span>
  );
}
