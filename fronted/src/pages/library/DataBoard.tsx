import type { ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChartNoAxesCombined, Download, Upload } from 'lucide-react';
import { fileUrl, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, EmptyState, Notice, PageHead, Tabs } from '../../gy/ui';
import {
  base,
  FILTER_KEYS,
  num,
  qs,
  rate,
  refundTone,
  roi,
  roiTone,
  yuan,
  type MaterialBoard,
  type MaterialRow,
  type ProductRow,
} from './campaign';
import { WinView } from './Insights';
import AccountsTab from './Accounts';

const TABS = ['素材维度', '商品维度', '账户维度', '哪种赢了'] as const;
type Tab = (typeof TABS)[number];
const PATH: Record<Tab, string> = {
  素材维度: '/library/data/materials',
  商品维度: '/library/data/products',
  账户维度: '/library/data/accounts',
  哪种赢了: '/library/data/win',
};
export type BoardKey = 'materials' | 'products' | 'accounts' | 'win';
const TAB_OF: Record<BoardKey, Tab> = {
  materials: '素材维度',
  products: '商品维度',
  accounts: '账户维度',
  win: '哪种赢了',
};

/** 投流看板：素材 / 商品 / 账户三个维度 + 哪种赢了。数据只来自导入或手填的真实记录。 */
export default function DataBoard({ tab }: { tab: BoardKey }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const keep = (t: Tab) => {
    // 切维度时带上日期和账户筛选
    const p: Record<string, string> = {};
    for (const k of ['start', 'end', 'accountId']) if (params.get(k)) p[k] = params.get(k)!;
    return PATH[t] + (t === '哪种赢了' ? '' : qs(p));
  };
  return (
    <div className="gy-page gy-new">
      <PageHead title="投流看板" description="千川素材的真实投放数据，净成交和整体成交对照看。">
        <Btn onClick={() => navigate('/library/data/import')}>
          <Upload size={14} aria-hidden="true" />
          导入数据
        </Btn>
      </PageHead>
      <Tabs tabs={TABS} value={TAB_OF[tab]} label="看板维度" onChange={(t) => navigate(keep(t))} />
      {tab === 'materials' && <Materials />}
      {tab === 'products' && <Products />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'win' && <WinView embedded />}
    </div>
  );
}

/** URL 里的筛选参数 */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const set = (patch: Record<string, string>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  const filter = Object.fromEntries(FILTER_KEYS.map((k) => [k, get(k)])) as Record<
    (typeof FILTER_KEYS)[number],
    string
  >;
  return { get, set, filter, params };
}

/** 筛选栏：日期范围、千川账户、商品、客户空间、创作者。客户空间就是右上角切换的客户，数据按客户隔离。 */
export function FilterBar({
  options,
  show = ['date', 'account', 'product', 'client', 'creator'],
  right,
}: {
  options?: MaterialBoard['options'];
  show?: ('date' | 'account' | 'product' | 'client' | 'creator')[];
  right?: ReactNode;
}) {
  const { client, clients, switchClient } = useWorkspace();
  const { get, set } = useFilters();
  const sel = (key: string, label: string, list: { id: string; name: string }[]) => (
    <label className={`gy-fsel${get(key) ? ' on' : ''}`}>
      {label}
      <select
        aria-label={`按${label}筛选`}
        value={get(key)}
        onChange={(e) => set({ [key]: e.target.value })}
      >
        <option value="">全部</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  const any = FILTER_KEYS.some((k) => get(k));
  return (
    <div className="gy-libbar gy-cpbar" role="group" aria-label="筛选">
      {show.includes('date') && (
        <span className={`gy-fsel gy-fdate${get('start') || get('end') ? ' on' : ''}`}>
          日期
          <input
            type="date"
            aria-label="开始日期"
            value={get('start')}
            max={get('end') || undefined}
            onChange={(e) => set({ start: e.target.value })}
          />
          <span aria-hidden="true">至</span>
          <input
            type="date"
            aria-label="结束日期"
            value={get('end')}
            min={get('start') || undefined}
            onChange={(e) => set({ end: e.target.value })}
          />
        </span>
      )}
      {show.includes('account') && sel('accountId', '千川账户', options?.accounts ?? [])}
      {show.includes('product') && sel('product', '商品', options?.products ?? [])}
      {show.includes('client') && (
        <label className="gy-fsel">
          客户空间
          <select
            aria-label="按客户空间筛选"
            value={client.id}
            onChange={(e) => switchClient?.(e.target.value)}
          >
            {(clients ?? [client]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {show.includes('creator') && sel('creator', '创作者', options?.creators ?? [])}
      {any && (
        <Btn
          size="xs"
          variant="ghost"
          onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))}
        >
          清除筛选
        </Btn>
      )}
      {right && <span className="gy-cpbar-right">{right}</span>}
    </div>
  );
}

const COLS: [string, string, 'num' | 'text'][] = [
  ['standardName', '素材信息', 'text'],
  ['productName', '商品', 'text'],
  ['creator', '创作者', 'text'],
  ['netRoi', '净成交 ROI', 'num'],
  ['netGmv', '净成交金额', 'num'],
  ['netOrders', '净成交订单', 'num'],
  ['netSettleRate', '净结算率', 'num'],
  ['refundRate1h', '1 小时退款率', 'num'],
  ['overallRoi', '整体支付 ROI', 'num'],
  ['totalGmv', '整体成交金额', 'num'],
  ['totalCost', '整体消耗', 'num'],
  ['dataDays', '数据天数', 'num'],
];
const SORTABLE = new Set([
  'standardName',
  'netRoi',
  'netGmv',
  'netOrders',
  'netSettleRate',
  'refundRate1h',
  'overallRoi',
  'totalGmv',
  'totalCost',
  'dataDays',
]);

export function Thumb({ coverId, ratio }: { coverId?: string | null; ratio?: string }) {
  const { client } = useWorkspace();
  return (
    <span className={`gy-cpthumb${ratio === '16:9' ? ' land' : ''}`} aria-hidden="true">
      {coverId ? <img src={fileUrl(client.id, coverId)} alt="" /> : null}
    </span>
  );
}
export function NameCell({ name }: { name?: string | null }) {
  return name ? (
    <code className="gy-stdname">{name}</code>
  ) : (
    <span className="gy-unnamed">未规范化</span>
  );
}

/** 素材维度：6 个汇总卡 + 12 列明细（排序、分页 50 条一页）+ 导出 */
function Materials() {
  const { client } = useWorkspace();
  const navigate = useNavigate();
  const { get, set, filter } = useFilters();
  const sort = get('sort') || 'netGmv';
  const order = get('order') || 'desc';
  const page = Number(get('page') || 1);
  const query = qs({ ...filter, sort, order, page });
  const q = useQuery({
    queryKey: [client.id, 'analytics', 'materials', query],
    queryFn: () => request<MaterialBoard>(`${base(client.id)}/materials${query}`),
    placeholderData: (prev) => prev,
  });
  const d = q.data;
  const S = d?.summary;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const exportHref = `/api${base(client.id)}/materials/export${qs({ ...filter, sort, order })}`;
  const onlyJob = get('job');
  const cards: [string, string, boolean?][] = [
    ['总消耗', yuan(S?.totalCost)],
    ['净成交金额', yuan(S?.netGmv), true],
    ['净成交订单', num(S?.netOrders)],
    ['平均净 ROI', roi(S?.avgNetRoi), true],
    ['平均 1 小时退款率', rate(S?.avgRefundRate1h)],
    ['素材数', num(S?.materialCount)],
  ];
  const head = (key: string, label: string, kind: 'num' | 'text') => {
    const on = sort === key;
    const aria = on ? (order === 'asc' ? 'ascending' : 'descending') : undefined;
    return (
      <th key={key} className={kind === 'num' ? 'n' : ''} aria-sort={aria}>
        {SORTABLE.has(key) ? (
          <button
            type="button"
            className={`gy-sorth${on ? ' on' : ''}`}
            onClick={() => set({ sort: key, order: on && order === 'desc' ? 'asc' : 'desc' })}
          >
            {label}
            <span aria-hidden="true">{on ? (order === 'asc' ? '↑' : '↓') : ''}</span>
          </button>
        ) : (
          label
        )}
      </th>
    );
  };
  const cell = (r: MaterialRow, key: string) => {
    switch (key) {
      case 'standardName':
        return (
          <td key={key} className="who">
            <Link
              to={`/library/${r.jobId}`}
              className="gy-cpwho"
              aria-label={`看成片：${r.standardName ?? r.title}`}
            >
              <Thumb coverId={r.coverId} ratio={r.ratio} />
              <span>
                <NameCell name={r.standardName} />
                <small>{r.title}</small>
              </span>
            </Link>
          </td>
        );
      case 'productName':
        return (
          <td key={key} className="pd">
            {r.productName ?? '—'}
          </td>
        );
      case 'creator':
        return <td key={key}>{r.creator ?? '—'}</td>;
      case 'netRoi':
        return (
          <td key={key} className={`n k ${roiTone(r.netRoi)}`}>
            {roi(r.netRoi)}
          </td>
        );
      case 'overallRoi':
        return (
          <td key={key} className="n">
            {roi(r.overallRoi)}
          </td>
        );
      case 'refundRate1h':
        return (
          <td key={key} className={`n ${refundTone(r.refundRate1h)}`}>
            {rate(r.refundRate1h)}
          </td>
        );
      case 'netSettleRate':
        return (
          <td key={key} className="n">
            {rate(r.netSettleRate)}
          </td>
        );
      case 'netOrders':
      case 'dataDays':
        return (
          <td key={key} className="n">
            {num(r[key])}
          </td>
        );
      default:
        return (
          <td key={key} className="n">
            {yuan(r[key as 'netGmv'])}
          </td>
        );
    }
  };
  return (
    <>
      <FilterBar
        options={d?.options}
        right={
          <a
            className={`gy-btn secondary xs${d?.total ? '' : ' disabled'}`}
            href={exportHref}
            download
            aria-disabled={!d?.total}
          >
            <Download size={13} aria-hidden="true" />
            导出 CSV
          </a>
        }
      />
      {onlyJob && (
        <Notice
          tone="info"
          title="只看一条成片"
          actions={
            <Btn size="xs" variant="ghost" onClick={() => set({ job: '' })}>
              看全部
            </Btn>
          }
        />
      )}
      {q.error && <Notice tone="error">{(q.error as Error).message}</Notice>}
      {q.isPending || !d ? (
        <span className="gy-muted">正在加载…</span>
      ) : !d.total && !Object.values(filter).some(Boolean) ? (
        <EmptyBoard />
      ) : (
        <>
          <div className="gy-cpsum" role="group" aria-label="汇总">
            {cards.map(([label, value, key]) => (
              <div key={label} className={`t${key ? ' k' : ''}`}>
                <small>{label}</small>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <Card className="gy-pjs">
            <div className="gy-cptbl-wrap">
              <table className="gy-cptbl" aria-label="素材明细">
                <thead>
                  <tr>{COLS.map(([k, l, kind]) => head(k, l, kind))}</tr>
                </thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={r.jobId}>{COLS.map(([k]) => cell(r, k))}</tr>
                  ))}
                  {!d.items.length && (
                    <tr>
                      <td colSpan={COLS.length} className="gy-muted">
                        没有符合筛选的素材
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="gy-cppager">
              <span className="gy-muted">
                共 {d.total} 条 · 第 {d.page} / {pages} 页
              </span>
              <span className="gy-row">
                <Btn
                  size="xs"
                  disabled={d.page <= 1}
                  onClick={() => set({ page: String(d.page - 1) })}
                >
                  上一页
                </Btn>
                <Btn
                  size="xs"
                  disabled={d.page >= pages}
                  onClick={() => set({ page: String(d.page + 1) })}
                >
                  下一页
                </Btn>
              </span>
            </div>
            <span className="gy-fine">
              净成交 = 成交 − 退款。净 ROI ≥ 3 标绿，&lt; 1 标红；1 小时退款率 &gt; 30% 标红。
            </span>
          </Card>
        </>
      )}
      {d && !d.total && Object.values(filter).some(Boolean) && (
        <span className="gy-row">
          <Btn onClick={() => navigate('/library/data/materials')}>看全部</Btn>
        </span>
      )}
    </>
  );
}

export function EmptyBoard() {
  const navigate = useNavigate();
  return (
    <EmptyState title="还没有投流数据" icon={<ChartNoAxesCombined size={22} />}>
      <span>从千川导出素材报表，导进来就能看。</span>
      <span className="gy-row">
        <Btn variant="primary" onClick={() => navigate('/library/data/import')}>
          导入数据
        </Btn>
        <Btn onClick={() => navigate('/library/data/accounts?view=manage')}>添加千川账户</Btn>
      </span>
    </EmptyState>
  );
}

/** 商品维度：只给 3 列（商品、关联素材数、素材合计净成交），不展示商品级消耗和 ROI */
function Products() {
  const { client } = useWorkspace();
  const navigate = useNavigate();
  const { filter } = useFilters();
  const query = qs({
    start: filter.start,
    end: filter.end,
    accountId: filter.accountId,
    creator: filter.creator,
  });
  const q = useQuery({
    queryKey: [client.id, 'analytics', 'products', query],
    queryFn: () => request<{ items: ProductRow[] }>(`${base(client.id)}/products${query}`),
  });
  const items = q.data?.items ?? [];
  return (
    <>
      <Notice tone="info">
        商品整体效果包含非本系统生产素材的贡献，相关指标暂不展示。请查看素材维度了解平台生产素材的真实表现。
      </Notice>
      <FilterBar
        show={['date', 'client']}
        right={
          <a
            className="gy-btn secondary xs"
            href={`/api${base(client.id)}/products/export${query}`}
            download
          >
            <Download size={13} aria-hidden="true" />
            导出 CSV
          </a>
        }
      />
      {q.error && <Notice tone="error">{(q.error as Error).message}</Notice>}
      {q.isPending ? (
        <span className="gy-muted">正在加载…</span>
      ) : !items.length ? (
        <EmptyBoard />
      ) : (
        <Card className="gy-pjs">
          <div className="gy-cptbl-wrap">
            <table className="gy-cptbl" aria-label="商品明细">
              <thead>
                <tr>
                  <th>商品</th>
                  <th className="n">关联素材数</th>
                  <th className="n">素材合计净成交金额</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr
                    key={r.productId ?? 'none'}
                    className={r.productId ? 'go' : ''}
                    onClick={() =>
                      r.productId &&
                      navigate(`/library/data/materials${qs({ ...filter, product: r.productId })}`)
                    }
                  >
                    <td className="who">
                      {r.productId ? (
                        <Link
                          className="gy-cpwho"
                          to={`/library/data/materials${qs({ ...filter, product: r.productId })}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Thumb coverId={r.coverId} />
                          <b>{r.productName}</b>
                        </Link>
                      ) : (
                        <span className="gy-cpwho">
                          <Thumb />
                          <b>{r.productName}</b>
                        </span>
                      )}
                    </td>
                    <td className="n">{r.materialCount}</td>
                    <td className="n k">{yuan(r.netGmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
