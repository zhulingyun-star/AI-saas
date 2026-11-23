import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Plus, Sparkles } from 'lucide-react';
import { fileUrl } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Chip, EmptyState, Notice, PageHead, SearchBox } from '../../gy/ui';
import {
  analysisLabel,
  folderPath,
  folderScope,
  needsReview,
  shortDate,
  useLibrary,
  type ProductItem,
} from './data';

let nudgeHidden = false;

export default function ProductList() {
  const { client } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { folders, products, isPending, error } = useLibrary();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('全部');
  const [hideNudge, setHideNudge] = useState(nudgeHidden);
  const folder = params.get('folder') ?? 'all';
  const folderObj = folders.find((f) => f.id === folder);
  const scope = folderObj ? folderScope(folders, folderObj.id) : null;
  const inView = products.filter((p) =>
    folder === 'all'
      ? true
      : folder === 'unfiled'
        ? !p.folderId
        : folder === 'pending'
          ? needsReview(p)
          : !!p.folderId && !!scope?.has(p.folderId),
  );
  const categoryOf = (p: ProductItem) => p.info?.analysis?.category || '';
  const cats = Array.from(new Set(inView.map(categoryOf).filter(Boolean)));
  const q = query.trim().toLowerCase();
  const rows = inView.filter(
    (p) =>
      (cat === '全部' || categoryOf(p) === cat) &&
      (!q || `${p.group.productName} ${p.group.sku}`.toLowerCase().includes(q)),
  );
  const title = folderObj
    ? folderPath(folders, folderObj.id)
    : folder === 'unfiled'
      ? '未分类'
      : folder === 'pending'
        ? '分析待核对'
        : '全部商品';
  const nudge = products.find((p) => needsReview(p) && p.info?.analysis?.hasReport);
  const newLink = folderObj ? `/products/new?folder=${folderObj.id}` : '/products/new';
  const open = (p: ProductItem) => navigate(`/products/${p.anchorId}`);

  return (
    <div className="gy-page gy-new">
      <PageHead
        title={title}
        description={
          <>
            {folderObj
              ? `文件夹 · ${inView.length} 个商品。`
              : folder === 'pending'
                ? '分析结果还没核对完、分析失败或还没分析的商品。'
                : ''}
            {client.name}的商品。一个商品一组图片，分析后核对再使用。
          </>
        }
      >
        <Btn variant="primary" onClick={() => navigate(newLink)}>
          <Plus size={14} aria-hidden="true" />
          新增商品
        </Btn>
      </PageHead>
      {nudge && !hideNudge && folder !== 'pending' && (
        <Card className="gy-nudge" role="status">
          <span className="ic">
            <Sparkles size={16} aria-hidden="true" />
          </span>
          <div>
            <b>{nudge.group.productName}的商品分析还没核对完</b>
            <span className="t">
              {[
                nudge.info?.analysis?.confirmCount
                  ? `还有 ${nudge.info.analysis.confirmCount} 项信息要补充`
                  : '',
                nudge.info?.analysis?.unverifiedCount
                  ? `${nudge.info.analysis.unverifiedCount} 条卖点待验证`
                  : '',
                nudge.info?.analysis?.status === 'FAILED'
                  ? '最近一次重新分析失败，现在用的是之前的结果'
                  : '',
                nudge.info?.analysis?.stale ? '商品图片或名称改过，分析可能不准了' : '',
              ]
                .filter(Boolean)
                .join('，') || '看一遍分析结果，确认后就能用来做项目'}
              。
            </span>
          </div>
          <div className="gy-row">
            <Btn
              variant="ghost"
              size="xs"
              onClick={() => {
                nudgeHidden = true;
                setHideNudge(true);
              }}
            >
              稍后
            </Btn>
            <Btn
              variant="primary"
              size="xs"
              onClick={() => navigate(`/products/${nudge.anchorId}/review`)}
            >
              去核对
            </Btn>
          </div>
        </Card>
      )}
      <div className="gy-toolbar">
        <div className="gy-cats" role="group" aria-label="按品类筛选">
          <Chip pressed={cat === '全部'} count={inView.length} onClick={() => setCat('全部')}>
            全部
          </Chip>
          {cats.map((c) => (
            <Chip
              key={c}
              pressed={cat === c}
              count={inView.filter((p) => categoryOf(p) === c).length}
              onClick={() => setCat(c)}
            >
              {c}
            </Chip>
          ))}
        </div>
        <SearchBox
          label="搜索商品"
          placeholder="搜索商品名或 SKU"
          value={query}
          onChange={setQuery}
        />
      </div>
      {error ? (
        <Notice tone="error" title="商品库没加载出来">
          {(error as Error).message}
        </Notice>
      ) : isPending ? (
        <Card pad>
          <span className="gy-muted">正在加载商品…</span>
        </Card>
      ) : !products.length ? (
        <Card>
          <EmptyState title="还没有商品" icon={<Box size={22} />}>
            <span>上传一组商品图，填上名称，系统帮你分析商品信息。</span>
            <Btn variant="primary" onClick={() => navigate(newLink)}>
              <Plus size={14} aria-hidden="true" />
              新增商品
            </Btn>
          </EmptyState>
        </Card>
      ) : (
        <Card className="gy-table-wrap">
          <table className="gy-goods">
            <thead>
              <tr>
                <th>商品</th>
                <th>文件夹</th>
                <th>图片</th>
                <th>识别的品类</th>
                <th>商品分析</th>
                <th className="num">待确认</th>
                <th className="num">关联项目</th>
                <th>更新</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const [label, tone] = analysisLabel(p);
                const updated = [
                  p.info?.analysis?.analyzedAt,
                  ...p.group.assets.map((a) => a.createdAt + 'Z'),
                ]
                  .filter(Boolean)
                  .sort()
                  .pop();
                return (
                  <tr
                    key={p.key}
                    tabIndex={0}
                    aria-label={`查看商品 ${p.group.productName}`}
                    onClick={() => open(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') open(p);
                    }}
                  >
                    <td>
                      <div className="gy-person">
                        <span className="gy-thumb">
                          {p.group.cover.mime.startsWith('image/') && (
                            <img src={fileUrl(client.id, p.group.cover.id)} alt="" loading="lazy" />
                          )}
                        </span>
                        <span className="gy-gname">
                          <b>{p.group.productName}</b>
                          <small>{p.group.sku ? `SKU ${p.group.sku}` : 'SKU 未设置'}</small>
                        </span>
                      </div>
                    </td>
                    <td className="gy-muted" data-label="文件夹">
                      {folderPath(folders, p.folderId)}
                    </td>
                    <td data-label="图片">
                      <span className="gy-mini-imgs">
                        {p.images.slice(0, 4).map((a) => (
                          <span className="gy-mini-img" key={a.id}>
                            <img src={fileUrl(client.id, a.id)} alt="" loading="lazy" />
                          </span>
                        ))}
                        {p.images.length > 4 && (
                          <span className="gy-muted">+{p.images.length - 4}</span>
                        )}
                        {!p.images.length && <span className="gy-muted">没有图片</span>}
                      </span>
                    </td>
                    <td data-label="品类">
                      {p.info?.analysis?.category || <span className="gy-muted">—</span>}
                    </td>
                    <td data-label="商品分析">
                      <span className={`gy-dot ${tone}`}>{label}</span>
                    </td>
                    <td className="num" data-label="待确认">
                      {p.info?.analysis?.confirmCount ? (
                        <b style={{ color: 'var(--gy-warning)', fontWeight: 500 }}>
                          {p.info.analysis.confirmCount}
                        </b>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num" data-label="关联项目">
                      {p.info?.projectCount ?? 0}
                    </td>
                    <td className="gy-muted" data-label="更新">
                      {shortDate(updated)}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="gy-muted" style={{ textAlign: 'center', padding: 40 }}>
                    {inView.length
                      ? '没有找到匹配的商品'
                      : folder === 'pending'
                        ? '没有要核对的商品'
                        : '这个文件夹还没有商品'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
      {!isPending && !!products.length && (
        <p className="gy-goods-foot">
          {client.name}目前有 {products.length} 个商品。点商品进入详情。
        </p>
      )}
    </div>
  );
}
