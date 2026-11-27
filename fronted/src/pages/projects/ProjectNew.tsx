import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, CircleAlert, Film, MessagesSquare, Sparkles, Users } from 'lucide-react';
import { post, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Notice, PageHead } from '../../gy/ui';
import { folderPath, orderedFolders } from '../../gy/folders';
import { ReferencePicker } from '../references';
import { clock, sec, thumbUrl, useReferenceLibrary } from '../references/data';
import type { StoryboardState } from '../../storyboard';
import {
  analysisLabel,
  needsReview,
  useLibrary,
  type Analysis,
  type ProductItem,
} from '../products/data';
import ProductPicker from './ProductPicker';
import { ProductButton, RatioPicker, ReferenceRow } from './parts';
import {
  formatRR,
  MODE_LABEL,
  useProjectLibrary,
  useRefreshProjects,
  type Mode,
  type ProjectItem,
} from './data';

/** 新建页能选的：复刻、简易。框架模式不再从这里新建，老的框架模式项目照常打开（ModeDetail）。 */
type NewMode = Extract<Mode, 'REMAKE' | 'ONE_CLICK'>;
/** [key, 标题, 描述, tag, Icon, soon] */
const MODES: [NewMode | 'PRO' | 'STORY', string, string, string, typeof Film, boolean][] = [
  ['REMAKE', '复刻', '照参考视频的结构和节奏，换成你的商品。', '主推', Film, false],
  ['ONE_CLICK', '简易', '资料齐了，自动出方向、分镜和成片。', '', Sparkles, false],
  ['PRO', '专业', '和 AI 对话出方向和分镜，细调镜头数和时长。', '即将开放', MessagesSquare, true],
  ['STORY', '故事', '用人物和情节讲故事，商品自然出场。', '即将开放', Users, true],
];
const MODE_PARAM: Record<string, NewMode> = {
  remake: 'REMAKE',
  oneclick: 'ONE_CLICK',
  'one-click': 'ONE_CLICK',
};
const factsOf = (a?: Analysis) =>
  a?.report
    ? [
        a.report.appearance ? `外观：${a.report.appearance}` : '',
        a.report.material ? `质感（请核对）：${a.report.material}` : '',
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 8000)
    : '';

/** 新建项目：选商品、创作方式、（复刻）参考视频、画幅分辨率、文件夹、名称、商品事实。右侧固定摘要。
 *  商品已核对时商品事实直接用商品分析里的，只显示一行；没核对才显示文本框和勾选。 */
export default function ProjectNew() {
  const { client, notify } = useWorkspace();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [params] = useSearchParams();
  const { products, folders: productFolders, isPending: productsPending } = useLibrary();
  const { refs, folders: refFolders } = useReferenceLibrary();
  const { folders } = useProjectLibrary();
  const refresh = useRefreshProjects();
  const [mode, setMode] = useState<NewMode>(MODE_PARAM[params.get('mode') ?? ''] ?? 'REMAKE');
  const [productKey, setProductKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<ProductItem | null>(null);
  const [refId, setRefId] = useState<string | null>(params.get('reference'));
  const [rr, setRR] = useState({ ratio: '9:16', resolution: '720p' });
  const [folderId, setFolderId] = useState(params.get('folder') ?? '');
  const [name, setName] = useState('');
  const [facts, setFacts] = useState('');
  const [factsFor, setFactsFor] = useState('');
  const [factsOk, setFactsOk] = useState(false);
  const [picker, setPicker] = useState<'product' | 'reference' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // 只有一个商品时直接选上；带着 ?product= 来的选那个
  useEffect(() => {
    if (productKey || productsPending) return;
    const want = params.get('product');
    const hit = want
      ? products.find((p) => p.group.assets.some((a) => a.id === want))
      : products.length === 1
        ? products[0]
        : undefined;
    if (hit) setProductKey(hit.key);
  }, [products, productsPending, productKey, params]);
  useEffect(() => {
    if (folderId && folders.length && !folders.some((f) => f.id === folderId)) setFolderId('');
  }, [folders, folderId]);

  const product =
    products.find((p) => p.key === productKey) ?? (picked?.key === productKey ? picked : undefined);
  const anchor = product?.anchorId ?? '';
  const analysis = useQuery({
    queryKey: [client.id, 'product-analysis', anchor],
    queryFn: () => request<Analysis>(`/clients/${client.id}/product-groups/${anchor}/analysis`),
    enabled: !!anchor,
  });
  const autoFacts = factsOf(analysis.data);
  const ready = !!product && !needsReview(product) && !!autoFacts.trim();
  useEffect(() => {
    if (!anchor || factsFor === anchor || analysis.isPending) return;
    setFacts(autoFacts);
    setFactsFor(anchor);
    setFactsOk(ready);
  }, [anchor, analysis.isPending, autoFacts, factsFor, ready]);

  const ref = refs.find((r) => r.assetId === refId);
  const board = useQuery<StoryboardState>({
    queryKey: [client.id, refId, 'storyboard'],
    queryFn: () => request(`/clients/${client.id}/assets/${refId}/storyboard`),
    enabled: mode === 'REMAKE' && !!refId && !!ref?.storyboard.hasReport,
  });
  const report = board.data?.report;
  const shotLines = useMemo(
    () =>
      (report?.shots ?? []).map((s, i, all) =>
        (report?.dialogue ?? [])
          .filter((l) => {
            const mid = (l.start + l.end) / 2;
            return mid >= s.start && (mid < s.end || (i === all.length - 1 && mid <= s.end));
          })
          .map((l) => l.text)
          .join(' · '),
      ),
    [report],
  );

  const defaultName = product ? `${product.group.productName} · ${MODE_LABEL[mode]}` : '';
  const finalName = name.trim() || defaultName;
  const block = busy
    ? '正在创建…'
    : !product
      ? '先选一个商品'
      : !product.images.length
        ? '这个商品还没有图片，先去商品库上传'
        : mode === 'REMAKE' && !ref
          ? '选一条参考视频'
          : mode === 'REMAKE' && !ref?.storyboard.hasReport
            ? '等参考视频拆解完成'
            : !facts.trim()
              ? analysis.isPending
                ? '正在读取商品分析…'
                : '商品事实不能为空'
              : !factsOk
                ? '勾选“已核对商品事实”'
                : '';
  const create = async () => {
    if (block || !product) return;
    setBusy(true);
    setErr('');
    try {
      const item = await post<ProjectItem>(`/clients/${client.id}/project-library/projects`, {
        mode,
        productAnchorId: product.anchorId,
        referenceAssetId: mode === 'REMAKE' ? refId : null,
        ratio: rr.ratio,
        resolution: rr.resolution,
        folderId: folderId || null,
        name: finalName,
        facts: facts.trim(),
        factsConfirmed: factsOk,
      });
      await Promise.all([
        refresh(),
        cache.invalidateQueries({ queryKey: [client.id, 'projects'] }),
      ]);
      notify(`项目「${item.name}」已创建`);
      navigate(item.flow ? `/p/${item.id}` : item.legacyPath);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const productLines = product
    ? [
        `${product.images.length} 张图 · ${folderPath(productFolders, product.folderId)}`,
        <span
          key="a"
          className={analysisLabel(product)[1] === 'ok' ? '' : 'w'}
        >{`商品分析：${analysisLabel(product)[0]}`}</span>,
      ]
    : ['从商品库里选，也可以在弹窗里新建'];
  return (
    <div className="gy-page gy-new">
      <button type="button" className="gy-backlink" onClick={() => navigate('/')}>
        <ChevronLeft size={14} aria-hidden="true" />
        返回项目列表
      </button>
      <PageHead title="新建项目" />
      <div className="gy-pjnew">
        <div className="gy-pjcol">
          <Card className="gy-pjs">
            <h3>
              <span className={`no${product ? ' ok' : ''}`}>{product ? '✓' : 1}</span>商品
            </h3>
            <ProductButton
              name={product?.group.productName}
              sku={product?.group.sku}
              coverId={
                product?.group.cover.mime.startsWith('image/') ? product.group.cover.id : null
              }
              lines={productLines}
              onClick={() => setPicker('product')}
            />
          </Card>
          <Card className="gy-pjs">
            <h3>
              <span className="no ok">✓</span>创作方式
            </h3>
            <div className="gy-modes" role="radiogroup" aria-label="创作方式">
              {MODES.map(([k, t, d, tag, Icon, soon]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  className="gy-mode"
                  aria-checked={mode === k}
                  disabled={soon}
                  onClick={() => !soon && setMode(k as NewMode)}
                >
                  {tag && <span className={`tag${soon ? '' : ' hot'}`}>{tag}</span>}
                  <span className="ic">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <b>{t}</b>
                  <p>{d}</p>
                </button>
              ))}
            </div>
          </Card>
          {mode === 'REMAKE' ? (
            <Card className="gy-pjs">
              <h3>
                <span className={`no${ref?.storyboard.hasReport ? ' ok' : ''}`}>
                  {ref?.storyboard.hasReport ? '✓' : 3}
                </span>
                参考视频<small>仅参考结构与节奏，不进入成片</small>
              </h3>
              {ref ? (
                <ReferenceRow
                  item={ref}
                  lines={[`来自参考视频库 · ${folderPath(refFolders, ref.folderId)}`]}
                  action={
                    <Btn size="xs" onClick={() => setPicker('reference')}>
                      换一条
                    </Btn>
                  }
                />
              ) : (
                <button type="button" className="gy-pickbox" onClick={() => setPicker('reference')}>
                  <b>选一条参考视频</b>
                  <small>从库里选，或上传新的</small>
                </button>
              )}
              {report && (
                <div className="gy-pjshots" aria-label="参考视频的镜头">
                  {report.shots.map((s, i) => (
                    <div className="sh" key={s.id}>
                      <span className="fr">
                        <img
                          src={thumbUrl(client.id, ref!.assetId, (s.start + s.end) / 2)}
                          alt={`镜头 ${i + 1}`}
                          loading="lazy"
                        />
                        <i>镜头 {i + 1}</i>
                      </span>
                      <span className="tm">
                        {sec(s.start)}–{sec(s.end)} 秒
                      </span>
                      <span className="ln">{shotLines[i] || <em>没有台词</em>}</span>
                    </div>
                  ))}
                </div>
              )}
              {report?.summary && <span className="gy-fine">结构：{report.summary}</span>}
            </Card>
          ) : null}
          <Card className="gy-pjs">
            <h3>
              <span className="no">{mode === 'REMAKE' ? 4 : 3}</span>视频设置
            </h3>
            <div className="gy-set2">
              <span>画面</span>
              <span className="gy-rrline">
                <RatioPicker ratio={rr.ratio} resolution={rr.resolution} onChange={setRR} />
                {mode === 'REMAKE' && rr.ratio === '16:9' && (
                  <small className="gy-muted">参考视频多是竖屏，横屏会重新构图</small>
                )}
              </span>
              <label htmlFor="pj-name">项目名称</label>
              <input
                id="pj-name"
                className="gy-input"
                maxLength={150}
                value={name}
                placeholder={defaultName || '选了商品后自动起名'}
                onChange={(e) => setName(e.target.value)}
              />
              <label htmlFor="pj-folder">放进文件夹</label>
              <select
                id="pj-folder"
                className="gy-select"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              >
                <option value="">未分类</option>
                {orderedFolders(folders).map((f) => (
                  <option key={f.id} value={f.id}>
                    {folderPath(folders, f.id)}
                  </option>
                ))}
              </select>
            </div>
          </Card>
          <Card className="gy-pjs">
            <h3>
              <span className={`no${factsOk ? ' ok' : ''}`}>
                {factsOk ? '✓' : mode === 'REMAKE' ? 5 : 4}
              </span>
              商品事实
              {!ready && <small>视频只用这里的事实</small>}
            </h3>
            {ready && product ? (
              <div className="gy-factwrap">
                <span className="src gy-factok">
                  已就绪（修订 {analysis.data?.revision ?? 0}）
                  <Link to={`/products/${product.anchorId}`}>查看商品分析</Link>
                </span>
              </div>
            ) : (
              <div className="gy-factwrap">
                <span className="src">
                  {!product
                    ? '先选商品'
                    : analysis.isPending
                      ? '正在读取商品分析…'
                      : analysis.data?.report
                        ? `商品分析待核对（修订 ${analysis.data.revision}）`
                        : '暂无商品分析，手动填写'}
                  {product && <Link to={`/products/${product.anchorId}`}>查看商品分析</Link>}
                </span>
                <textarea
                  className="gy-textarea"
                  rows={5}
                  maxLength={8000}
                  aria-label="商品事实"
                  value={facts}
                  disabled={!product}
                  placeholder="只写能证明的外观和卖点"
                  onChange={(e) => {
                    setFacts(e.target.value);
                    setFactsOk(false);
                  }}
                />
                <label className="gy-check">
                  <input
                    type="checkbox"
                    checked={factsOk}
                    disabled={!facts.trim()}
                    onChange={(e) => setFactsOk(e.target.checked)}
                  />
                  已核对商品事实
                </label>
              </div>
            )}
          </Card>
        </div>
        <aside className="gy-card gy-pjsum" aria-label="项目摘要">
          <h3>项目摘要</h3>
          <dl>
            <dt>名称</dt>
            <dd>{finalName || '—'}</dd>
            <dt>商品</dt>
            <dd className={product ? '' : 'no'}>{product?.group.productName ?? '还没选'}</dd>
            <dt>方式</dt>
            <dd>{MODE_LABEL[mode]}</dd>
            {mode === 'REMAKE' && (
              <>
                <dt>参考</dt>
                <dd className={ref?.storyboard.hasReport ? '' : 'no'}>
                  {ref
                    ? `${ref.name}${ref.storyboard.hasReport ? ` · ${ref.storyboard.shotCount ?? 0} 个镜头` : ' · 还不能用'}`
                    : '还没选'}
                </dd>
              </>
            )}
            <dt>时长</dt>
            <dd>
              {mode === 'REMAKE'
                ? ref?.storyboard.hasReport
                  ? `跟参考视频走（${clock(ref.storyboard.duration)}）`
                  : '跟参考视频走'
                : '15 或 30 秒，出片设置里选'}
            </dd>
            <dt>画面</dt>
            <dd>{formatRR(rr)}</dd>
            <dt>文件夹</dt>
            <dd>{folderPath(folders, folderId || null)}</dd>
            <dt>事实</dt>
            <dd className={factsOk ? '' : 'no'}>{factsOk ? '已就绪' : '待核对'}</dd>
          </dl>
          {block && (
            <span className="block" role="status">
              <CircleAlert size={13} aria-hidden="true" />
              {block}
            </span>
          )}
          <Btn variant="primary" wide busy={busy} disabled={!!block} onClick={() => void create()}>
            创建项目
          </Btn>
          {err && <Notice tone="error">{err}</Notice>}
        </aside>
      </div>
      {picker === 'product' && (
        <ProductPicker
          selected={product?.anchorId}
          onClose={() => setPicker(null)}
          onPick={(p) => {
            setPicked(p);
            setProductKey(p.key);
            setPicker(null);
          }}
        />
      )}
      {picker === 'reference' && (
        <ReferencePicker
          selectedId={refId}
          onClose={() => setPicker(null)}
          onPick={(item) => {
            setRefId(item.assetId);
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
