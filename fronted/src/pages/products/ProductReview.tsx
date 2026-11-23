import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft } from 'lucide-react';
import { fileUrl, put } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Chip, EmptyState, Notice } from '../../gy/ui';
import {
  analysisImages,
  evidenceImages,
  isUnverified,
  useRefreshLibrary,
  type Analysis,
  type Report,
} from './data';
import { useProduct } from './useProduct';

const DONE = '（已补充）';

/** 新增商品第三步：核对分析结果。逐条确认，补充缺的信息，保存为草稿或确认保存。 */
export default function ProductReview() {
  const { id = '' } = useParams();
  const { client, notify } = useWorkspace();
  const navigate = useNavigate();
  const refresh = useRefreshLibrary();
  const { product, analysis, setAnalysis, endpoint, anchor, isPending } = useProduct(id);
  const [report, setReport] = useState<Report | null>(null);
  const [brief, setBrief] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState<Set<string> | null>(null);
  const [img, setImg] = useState(0);
  const [adding, setAdding] = useState<'pitch' | 'pain' | null>(null);
  const [filling, setFilling] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const a = analysis.data;
  useEffect(() => {
    if (a?.report && !report) {
      setReport(structuredClone(a.report));
      setBrief(a.brief ?? '');
    }
  }, [a, report]);
  useEffect(() => {
    if (product?.info && confirmed === null) setConfirmed(new Set(product.info.confirmed));
  }, [product, confirmed]);

  const back = (
    <button type="button" className="gy-backlink" onClick={() => navigate(`/products/${anchor}`)}>
      <ChevronLeft size={14} aria-hidden="true" />
      返回商品详情
    </button>
  );
  if (isPending || analysis.isPending)
    return (
      <div className="gy-page gy-new">
        {back}
        <span className="gy-muted">正在加载分析结果…</span>
      </div>
    );
  if (!product || !a?.report || !report)
    return (
      <div className="gy-page gy-new">
        {back}
        <Card>
          <EmptyState
            title={
              ['QUEUED', 'RUNNING'].includes(a?.status ?? '')
                ? '还在分析，完成后就能核对'
                : '还没有可以核对的分析结果'
            }
          >
            <Btn variant="primary" onClick={() => navigate(`/products/${anchor}`)}>
              去商品详情
            </Btn>
          </EmptyState>
        </Card>
      </div>
    );

  const done = confirmed ?? new Set<string>();
  const images = product.images;
  const srcIds = analysisImages(a, images);
  const provable = report.provable_points ?? [];
  const proven = provable.filter((x) => !isUnverified(x.evidence));
  const unproven = provable.filter((x) => isUnverified(x.evidence));
  const keys = {
    a: proven.map((x) => `provable|${x.claim}`),
    b: [
      ...(report.pitch_lines ?? []).map((t) => `pitch|${t}`),
      ...unproven.map((x) => `provable|${x.claim}`),
    ],
    c: (report.pain_points ?? []).map((t) => `pain|${t}`),
  };
  const all = [...keys.a, ...keys.b, ...keys.c];
  const missing = (report.confirm ?? []).filter((t) => !t.endsWith(DONE)).length;
  const okCount = all.filter((k) => done.has(k)).length;
  const left = all.length - okCount;
  const toggle = (k: string) => {
    const next = new Set(done);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setConfirmed(next);
  };
  const okAll = (list: string[]) => setConfirmed(new Set([...done, ...list]));
  const ok = (k: string) => (
    <button
      type="button"
      className="gy-ok"
      aria-pressed={done.has(k)}
      aria-label={done.has(k) ? '取消确认这一条' : '确认这一条'}
      onClick={() => toggle(k)}
    >
      <Check size={14} />
    </button>
  );
  const current = srcIds[Math.min(img, srcIds.length - 1)];
  const view = (report.image_views ?? []).find((v) => String(v.image) === String(img + 1));
  const uses = provable.filter((x) =>
    evidenceImages(x.evidence, srcIds.length).includes(img + 1),
  ).length;
  const evb = (ev: string) =>
    evidenceImages(ev, srcIds.length).map((n) => (
      <button
        key={n}
        type="button"
        aria-label={`看图片${n}`}
        aria-pressed={n - 1 === img}
        onClick={() => setImg(n - 1)}
      >
        <img src={fileUrl(client.id, srcIds[n - 1])} alt="" />
      </button>
    ));
  const secs = [
    ['rv-a', '看得到的卖点', proven.length],
    ['rv-b', '卖点文案', (report.pitch_lines ?? []).length + unproven.length],
    ['rv-c', '用户痛点', (report.pain_points ?? []).length],
    ['rv-d', '不能夸大', (report.exaggeration_risks ?? []).length],
    ['rv-e', '待补充', (report.confirm ?? []).length],
    ['rv-f', '人群与广告类型', (report.fit_types ?? []).length + (report.audience ? 1 : 0)],
  ] as const;
  const edit = (next: Report) => {
    setReport(next);
    setDirty(true);
  };
  const save = async (reviewed: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (dirty) {
        const result = await put<Analysis>(`${endpoint}/analysis`, {
          revision: a.revision,
          brief,
          report,
        });
        setAnalysis(result);
        setDirty(false);
      }
      await put(`${endpoint}/review`, { confirmed: all.filter((k) => done.has(k)), reviewed });
      await refresh();
      notify(reviewed ? `${product.group.productName}已核对保存` : '已存为草稿，之后可以接着核对');
      navigate(`/products/${anchor}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const head = (anchorId: string, title: string, sub: string, list?: string[]) => (
    <div className="hd" id={anchorId}>
      <h3>{title}</h3>
      <span className="gy-row">
        <small>{sub}</small>
        {list && list.length > 0 && (
          <Btn variant="ghost" size="xs" onClick={() => okAll(list)}>
            本节全部确认
          </Btn>
        )}
      </span>
    </div>
  );

  return (
    <div className="gy-page gy-new">
      {back}
      <Card className="gy-rvbar">
        <div className="gy-strip" aria-label={`已上传 ${images.length} 张图`}>
          {images.slice(0, 6).map((x) => (
            <span key={x.id}>
              <img src={fileUrl(client.id, x.id)} alt="" />
            </span>
          ))}
        </div>
        <div>
          <h2>{product.group.productName}</h2>
          <div className="gy-meta2">
            <span>{product.group.sku ? `SKU ${product.group.sku}` : 'SKU 未设置'}</span>
            {report.category && <span>{report.category}（自动识别）</span>}
            <span>
              {images.length} 张图 ·{' '}
              {a.analyzedAt
                ? new Date(a.analyzedAt).toLocaleString('zh-CN', { hour12: false })
                : '刚刚'}
              分析
            </span>
          </div>
        </div>
        <div className="gy-prog">
          <span>
            已确认{' '}
            <b>
              {okCount} / {all.length}
            </b>{' '}
            条
          </span>
          <div className="gy-track">
            <i style={{ width: `${all.length ? (okCount / all.length) * 100 : 0}%` }} />
          </div>
        </div>
      </Card>
      {a.stale && (
        <Notice tone="warn">
          商品图片或名称在分析之后改过，核对时留意；也可以回到详情重新分析。
        </Notice>
      )}
      <div className="gy-rv2">
        <Card className="gy-rvview">
          {current ? (
            <>
              <div
                className="gy-vimg"
                role="img"
                aria-label={`图片${img + 1}`}
                style={{ cursor: 'default' }}
              >
                <img src={fileUrl(client.id, current)} alt="" />
              </div>
              <div className="gy-vthumbs">
                {srcIds.map((x, i) => (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={i === img}
                    aria-label={`图片${i + 1}`}
                    onClick={() => setImg(i)}
                    style={{ width: 50, height: 50 }}
                  >
                    <img src={fileUrl(client.id, x)} alt="" />
                  </button>
                ))}
              </div>
              <div className="cap">
                <b>图片{img + 1}</b> {view?.view ?? '没有这张图的说明'}
              </div>
              <div className="uses">
                {uses
                  ? `这张图是 ${uses} 条卖点的依据。点卖点旁边的小图，可以切到对应图片。`
                  : '没有卖点用这张图做依据。'}
              </div>
            </>
          ) : (
            <span className="gy-muted">没有图片</span>
          )}
        </Card>
        <div className="gy-rvlist">
          <nav className="gy-jump" aria-label="跳到">
            {secs.map(([sid, t, n]) => (
              <Chip
                key={sid}
                count={n}
                onClick={() =>
                  document
                    .getElementById(sid)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                {t}
              </Chip>
            ))}
          </nav>
          <Card className="gy-rsec">
            {head('rv-a', '看得到的卖点', '每条都能在图片里找到', keys.a)}
            {proven.map((x, i) => (
              <div className="gy-item review" key={i}>
                <span className="txt">
                  {x.claim}
                  <small>{x.how}</small>
                </span>
                <span className="gy-ev">{evb(x.evidence)}</span>
                {ok(`provable|${x.claim}`)}
              </div>
            ))}
            {!proven.length && <span className="gy-muted">没有图片里看得到的卖点</span>}
          </Card>
          <Card className="gy-rsec">
            {head('rv-b', '卖点文案', '排前面的优先用', keys.b)}
            {(report.pitch_lines ?? []).map((t, i) => (
              <div className="gy-item review" key={`p${i}`}>
                <span className="txt">{t}</span>
                <span className="gy-ev" />
                {ok(`pitch|${t}`)}
              </div>
            ))}
            {unproven.map((x, i) => (
              <div className="gy-item review need" key={`u${i}`}>
                <span className="txt">
                  {x.claim}
                  <small>{x.how}</small>
                </span>
                <span className="gy-ev guess">待验证</span>
                {ok(`provable|${x.claim}`)}
              </div>
            ))}
            {adding === 'pitch' ? (
              <AddLine
                label="新的卖点文案"
                onDone={(v) => (
                  setAdding(null),
                  v && edit({ ...report, pitch_lines: [...(report.pitch_lines ?? []), v] })
                )}
              />
            ) : (
              <button type="button" className="gy-addrow" onClick={() => setAdding('pitch')}>
                + 添加卖点
              </button>
            )}
          </Card>
          <Card className="gy-rsec">
            {head('rv-c', '用户痛点', '图片里看不出来，是推断', keys.c)}
            {(report.pain_points ?? []).map((t, i) => (
              <div className="gy-item review" key={i}>
                <span className="txt">{t}</span>
                <span className="gy-ev guess">推断</span>
                {ok(`pain|${t}`)}
              </div>
            ))}
            {adding === 'pain' ? (
              <AddLine
                label="新的用户痛点"
                onDone={(v) => (
                  setAdding(null),
                  v && edit({ ...report, pain_points: [...(report.pain_points ?? []), v] })
                )}
              />
            ) : (
              <button type="button" className="gy-addrow" onClick={() => setAdding('pain')}>
                + 添加痛点
              </button>
            )}
          </Card>
          <Card className="gy-rsec">
            {head(
              'rv-d',
              '不能夸大的说法',
              `${(report.exaggeration_risks ?? []).length} 条，做视频时会避开`,
            )}
            {(report.exaggeration_risks ?? []).map((x, i) => (
              <div className="gy-warnbox" key={i}>
                <b>{x.point}</b>
                {x.why}
              </div>
            ))}
          </Card>
          <Card className="gy-rsec">
            {head('rv-e', '需要补充的信息', `还差 ${missing} 项，问客户或看详情页`)}
            {(report.confirm ?? []).map((t, i) =>
              filling === i ? (
                <AddLine
                  key={i}
                  label={`补充：${t}`}
                  placeholder={`${t}（填已确认的内容）`}
                  onDone={(v) => {
                    setFilling(null);
                    if (!v) return;
                    edit({
                      ...report,
                      confirm: (report.confirm ?? []).map((x, n) =>
                        n === i ? `${t}：${v}${DONE}`.slice(0, 600) : x,
                      ),
                    });
                  }}
                />
              ) : t.endsWith(DONE) ? (
                <div className="gy-item" key={i}>
                  <span className="txt">{t.slice(0, -DONE.length)}</span>
                  <span className="gy-pill ok">已补充</span>
                </div>
              ) : (
                <div className="gy-item need" key={i}>
                  <span className="txt">{t}</span>
                  <Btn size="xs" onClick={() => setFilling(i)}>
                    补充
                  </Btn>
                </div>
              ),
            )}
            {!(report.confirm ?? []).length && <span className="gy-muted">没有要补充的信息</span>}
            {dirty && <span className="gy-fine">补充的内容会随核对一起保存在分析结果里。</span>}
          </Card>
          <Card className="gy-rsec">
            {head('rv-f', '人群与广告类型', '')}
            {report.audience && (
              <div className="gy-pcard">
                <b>目标人群</b>
                <p>{report.audience}</p>
              </div>
            )}
            {(report.fit_types ?? []).map((f, i) => (
              <div className="gy-pcard" key={i}>
                <b>{f.type}</b>
                <p>{f.why}</p>
              </div>
            ))}
          </Card>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Card className="gy-actbar">
        <span className="gy-muted">
          {left ? (
            <>
              还有 <b>{left} 条</b>没确认
            </>
          ) : (
            '都确认了'
          )}
          {missing ? `，需要补充 ${missing} 项信息` : ''}。没确认完可以先存为草稿，之后接着核对。
        </span>
        <div className="gy-row">
          <Btn busy={busy} onClick={() => void save(false)}>
            保存为草稿
          </Btn>
          <Btn variant="primary" busy={busy} onClick={() => void save(true)}>
            确认并保存商品
          </Btn>
        </div>
      </Card>
    </div>
  );
}

function AddLine({
  label,
  placeholder,
  onDone,
}: {
  label: string;
  placeholder?: string;
  onDone: (v: string | null) => void;
}) {
  const [v, setV] = useState('');
  return (
    <div className="gy-erow">
      <input
        className="gy-input"
        aria-label={label}
        autoFocus
        maxLength={600}
        value={v}
        placeholder={placeholder ?? '输入后回车'}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) onDone(v.trim() || null);
          if (e.key === 'Escape') onDone(null);
        }}
      />
      <Btn size="xs" variant="primary" onClick={() => onDone(v.trim() || null)}>
        好
      </Btn>
    </div>
  );
}
