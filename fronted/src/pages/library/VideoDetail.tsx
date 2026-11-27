import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { jobUrl, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Notice, PageHead } from '../../gy/ui';
import { formatRR, MODE_LABEL, shortTime, type Verdict } from '../projects/data';
import { PRICE_NO, RELAY, Review } from '../projects/StepOutput';
import {
  hookLabel,
  personaLabel,
  reviewState,
  sceneLabel,
  videoName,
  type VideoDetail as Detail,
} from './data';
import PerfPanel from './PerfPanel';
import { CampaignBlock, NamingRow } from './CampaignBlock';
import { CopyName } from './parts';

/** 回到项目的出片步；框架模式带上方向，让对应的那条出片线显示出来 */
export function projectLink(
  v: Pick<Detail, 'projectFlow' | 'projectPath' | 'direction' | 'mode'>,
  extra = '',
) {
  if (!v.projectFlow) return v.projectPath;
  const dir = v.mode === 'FRAMEWORK' && v.direction ? `&dir=${v.direction.id}` : '';
  return `${v.projectPath}?step=4${dir}${extra}`;
}

/** 成片详情：视频、审片（和项目详情同一份）、投放数据、接力、来源、出片词 */
export default function VideoDetail() {
  const { id = '' } = useParams();
  const { client, notify } = useWorkspace();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const key = [client.id, 'video', id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => request<Detail>(`/clients/${client.id}/video-library/${id}`),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const apply = (next: Detail) => {
    cache.setQueryData(key, next);
    void cache.invalidateQueries({ queryKey: [client.id, 'video-library'] });
  };
  const back = (
    <button type="button" className="gy-backlink" onClick={() => navigate('/library')}>
      <ChevronLeft size={14} aria-hidden="true" />
      返回资产库
    </button>
  );
  if (q.isPending)
    return (
      <div className="gy-page gy-new">
        {back}
        <span className="gy-muted">正在加载成片…</span>
      </div>
    );
  const v = q.data;
  if (!v)
    return (
      <div className="gy-page gy-new">
        {back}
        <Notice tone="error" title="打不开这条成片">
          {(q.error as Error | null)?.message ?? '它可能已经不在了。'}
        </Notice>
      </div>
    );
  const [state, tone] = reviewState(v);
  const verdict = (patch: Partial<Verdict>) => {
    setBusy(true);
    setErr('');
    const cur = v.verdict;
    put(`/clients/${client.id}/jobs/${v.id}/verdict`, {
      rating: 'rating' in patch ? patch.rating : (cur?.rating ?? null),
      reason: 'reason' in patch ? patch.reason : (cur?.reason ?? ''),
      use: 'use' in patch ? patch.use : (cur?.use ?? null),
      revision: cur?.revision ?? 0,
    })
      .then(async () => {
        await q.refetch();
        void cache.invalidateQueries({ queryKey: [client.id, 'video-library'] });
        void cache.invalidateQueries({ queryKey: [client.id, 'project-flow'] });
      })
      .catch(async (e: Error) => {
        setErr(e.message);
        await q.refetch();
      })
      .finally(() => setBusy(false));
  };
  const copy = (text: string, done: string) =>
    void navigator.clipboard
      ?.writeText(text)
      .then(() => notify(done))
      .catch(() => notify('浏览器不让复制，可以手动选中复制'));
  const relayOff = !v.projectFlow
    ? '这个项目在旧的制作页里，不能从这里接力'
    : !v.hasOutput
      ? '这一版还没出好'
      : '';

  return (
    <div className="gy-page gy-new">
      {back}
      <PageHead
        title={videoName(v)}
        description={`${v.product?.name ?? '商品不在了'} · ${shortTime(v.createdAt)} 生成 · ${MODE_LABEL[v.mode] ?? '其他'}`}
      >
        <Btn onClick={() => navigate(projectLink(v))}>回到项目</Btn>
        {v.hasOutput && (
          <>
            <a className="gy-btn secondary" href={jobUrl(client.id, v.id, 'srt', true)}>
              下载字幕
            </a>
            <a className="gy-btn primary" href={jobUrl(client.id, v.id, 'mp4', true)}>
              下载视频
            </a>
          </>
        )}
      </PageHead>
      {err && <Notice tone="error">{err}</Notice>}
      <div className="gy-vdet">
        <Card className="gy-vplayer">
          {v.hasOutput ? (
            <video
              src={jobUrl(client.id, v.id)}
              controls
              playsInline
              preload="metadata"
              aria-label={`成片：${videoName(v)}`}
              className={v.ratio === '16:9' ? 'land' : ''}
            />
          ) : (
            <div className="gy-vgen off">
              <b>{state}</b>
              <small>{v.message}</small>
            </div>
          )}
          <dl className="gy-kv">
            <dt>时长</dt>
            <dd>
              {v.duration} 秒 · {formatRR(v)}
            </dd>
            <dt>审片</dt>
            <dd>
              <span
                className={`gy-pill ${tone === 'ok' ? 'ok' : tone === 'wait' ? 'warn' : 'idle'}`}
              >
                {state}
              </span>
              {v.verdict?.rating === 'BAD' && v.verdict.reason ? ` 差在：${v.verdict.reason}` : ''}
            </dd>
            <dt>视频编号</dt>
            <dd>{v.code}</dd>
            <dt>命名</dt>
            <dd>
              <NamingRow v={v} apply={apply} />
            </dd>
          </dl>
        </Card>
        <div className="gy-vcol">
          {v.hasOutput && (
            <Card className="gy-pjs">
              <h3>
                审片<small>和项目里这一版的审片是同一份</small>
              </h3>
              <Review v={v} busy={busy} onSave={verdict} />
            </Card>
          )}
          <CampaignBlock jobId={v.id} />
          <PerfPanel v={v} apply={apply} reload={q.refetch} />
          <Card className="gy-pjs">
            <h3>基于这条再做一条</h3>
            <div className="gy-rlgrid">
              {RELAY.map(([k, t]) => {
                const off = relayOff || (k === 'price' && !v.hasPrice ? PRICE_NO : '');
                return (
                  <button
                    key={k}
                    type="button"
                    className="gy-rlbtn"
                    disabled={!!off}
                    title={off || undefined}
                    onClick={() => navigate(projectLink(v, `&relay=${k}&from=${v.id}`))}
                  >
                    <b>{t}</b>
                    <small>
                      {off && k === 'price' && !relayOff ? '要先在商品库补真实价格' : RELAY_TIP[k]}
                    </small>
                  </button>
                );
              })}
            </div>
            {relayOff ? (
              <span className="gy-fine">{relayOff}。</span>
            ) : (
              !v.hasPrice && <span className="gy-fine">「换价格说法」先灰着：{PRICE_NO}。</span>
            )}
          </Card>
          <Card className="gy-pjs">
            <h3>来源</h3>
            <dl className="gy-kv">
              <dt>商品</dt>
              <dd>
                {v.product ? (
                  <Link to={`/products/${v.product.anchorId}`}>{v.product.name}</Link>
                ) : (
                  '商品不在了'
                )}
              </dd>
              <dt>项目</dt>
              <dd>
                <Link to={projectLink(v)}>{v.projectName}</Link>
              </dd>
              <dt>创作方式</dt>
              <dd>{MODE_LABEL[v.mode] ?? '其他'}</dd>
              {v.direction && (
                <>
                  <dt>方向</dt>
                  <dd>
                    {v.direction.letter ? `方向 ${v.direction.letter} · ` : ''}
                    {v.direction.title || '没起名的方向'}
                  </dd>
                </>
              )}
              {v.reference && (
                <>
                  <dt>参考视频</dt>
                  <dd>
                    <Link to={`/references/${v.reference.assetId}`}>{v.reference.name}</Link>
                  </dd>
                </>
              )}
              <dt>版本</dt>
              <dd>
                第 {v.no} 版{v.jobNo !== v.no ? `（项目里第 ${v.jobNo} 次出片）` : ''}
              </dd>
              <dt>开头类型</dt>
              <dd>{hookLabel(v)}</dd>
              <dt>人群</dt>
              <dd>{personaLabel(v)}</dd>
              <dt>场景</dt>
              <dd>{sceneLabel(v)}</dd>
              <dt>这一版改了什么</dt>
              <dd>{v.note || '—'}</dd>
              <dt>标准命名</dt>
              <dd>
                {v.standardName ? (
                  <code className="gy-stdname">{v.standardName}</code>
                ) : (
                  <span className="gy-unnamed">未规范化</span>
                )}{' '}
                <CopyName name={v.standardName} />
                <small className="gy-fine" style={{ display: 'block' }}>
                  上传千川时用它命名，导入数据时自动对上。
                </small>
              </dd>
              <dt>投放用名</dt>
              <dd>
                <code className="gy-adnm">{v.adName}</code>{' '}
                <Btn size="xs" variant="ghost" onClick={() => copy(v.adName, '投放用名已复制')}>
                  复制
                </Btn>
                <small className="gy-fine" style={{ display: 'block' }}>
                  旧的命名方式，导入时也认。
                </small>
              </dd>
            </dl>
          </Card>
          <Card className="gy-pjs">
            <h3>
              出片词<small>{v.segments.length} 段 · 出这一版时用的</small>
              <Btn
                size="xs"
                variant="ghost"
                onClick={() => copy(v.segments.map((x) => x.text).join('\n\n'), '出片词已复制')}
              >
                复制出片词
              </Btn>
            </h3>
            <div className="gy-ocprm">
              {v.segments.map((x) => (
                <div className="gy-pseg" key={x.key}>
                  <span className="pst">{x.title}</span>
                  <span>{x.text}</span>
                </div>
              ))}
              {!v.segments.length && <span className="gy-muted">这一版没有记下出片词</span>}
            </div>
            {v.carriedReasons.length > 0 && (
              <span className="gy-fine">带上了之前“差”的原因：{v.carriedReasons.join('；')}</span>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
const RELAY_TIP: Record<string, string> = {
  hook: '前 3 秒换一种开头',
  scene: '换个拍摄地方',
  persona: '换给另一群人看',
  price: '换一种讲价格的方式',
};
