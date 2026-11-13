import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fileUrl, request, put } from '../api';
import { productGroups } from '../productGroups';
import type { Asset } from '../types';
import { Modal, ErrorState, Loading, useData, useWorkspace } from './UI';

export interface CampaignProducts {
  revision: number;
  products: { anchorId: string; assets: Asset[]; analysis: { status: string; stale: boolean; report?: Record<string, unknown>; brief?: string } }[];
}
export function useCampaignProducts(campaignId: string) {
  const { client } = useWorkspace();
  return useQuery({ queryKey: [client.id, 'campaign-products', campaignId],
    queryFn: () => request<CampaignProducts>(`/clients/${client.id}/campaigns/${campaignId}/products`), enabled: !!campaignId });
}
export default function CampaignProductsPanel({ campaignId, archived, onReady }: { campaignId: string; archived: boolean; onReady: (ready: boolean) => void }) {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const selected = useCampaignProducts(campaignId);
  const resources = useData<Asset[]>('assets');
  const groups = productGroups(resources.data ?? []);
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onReady(!!selected.data?.products.length && !selected.error); }, [selected.data, selected.error, onReady]);
  function showPicker() {
    setIds(selected.data?.products.map(p => p.anchorId) ?? []);
    setRevision(selected.data?.revision ?? 0); setError(''); setOpen(true);
  }
  return <section className="panel campaign-products-panel" aria-label="项目商品资源">
    <div className="row between"><h2>项目商品资源</h2><button className="primary" disabled={archived || selected.isPending || !!selected.error} onClick={showPicker}>{selected.data?.products.length ? '管理绑定商品' : '选择商品'}</button></div>
    {selected.isPending ? <Loading /> : selected.error ? <ErrorState error={selected.error} retry={() => void selected.refetch()} /> : !selected.data?.products.length ?
      <p className="hint" role="status">请先绑定商品，才能进行下一步。点击“选择商品”，从资源中心选取整个商品组。</p>
      : <>
        <p className="caption">已关联完整商品素材与分析资料。资源中心更新后，重新进入项目可读取最新内容。</p>
        <div className="campaign-product-cards">{selected.data.products.map(p => {
          const group = productGroups(p.assets)[0]; if (!group) return null;
          return <article key={p.anchorId} className="campaign-product-card">
            {group.cover.mime.startsWith('image/') ? <img src={fileUrl(client.id, group.cover.id)} alt={group.productName} /> : <span>商品素材</span>}
            <div><h3>{group.productName}</h3><p>SKU：{group.sku || '未设置'} · {p.assets.length} 份素材</p>
              <p className="caption">{p.analysis.report ? p.analysis.stale ? '已保存分析 · 资料变更，需核对' : '已包含商品分析及保存的修改' : '尚无分析结果'}</p>
              {!!p.analysis.report?.summary && <p className="caption">{String(p.analysis.report.summary)}</p>}
              <Link className="button" to={`/assets?campaign=${campaignId}&product=${p.anchorId}`}>查看商品素材与分析</Link>
            </div>
          </article>;
        })}</div>
      </>}
    {open && <Modal title="从资源中心绑定商品" onClose={() => { if (!busy) setOpen(false); }}>
      <p className="caption">按商品组选择，包含所有素材、封面、名称、SKU、标签和已保存的分析结果。可选多个商品。</p>
      <input aria-label="搜索可绑定商品" placeholder="商品名称或 SKU" value={search} onChange={e => setSearch(e.target.value)} />
      {resources.isPending ? <Loading /> : resources.error ? <ErrorState error={resources.error} /> : <div className="campaign-product-picker">
        {groups.filter(g => `${g.productName} ${g.sku}`.toLowerCase().includes(search.toLowerCase())).map(g => {
          const matches = ids.filter(id => g.assets.some(a => a.id === id));
          return <label key={g.key} className={matches.length ? 'is-selected' : ''}>
            <input type="checkbox" aria-label={`绑定 ${g.productName}`} checked={!!matches.length} disabled={busy} onChange={e => setIds(current => e.target.checked ? [...current, g.assets[0].id] : current.filter(id => !g.assets.some(a => a.id === id)))} />
            {g.cover.mime.startsWith('image/') && <img src={fileUrl(client.id, g.cover.id)} alt="" />}
            <div><strong>{g.productName}</strong><p>SKU：{g.sku || '未设置'} · {g.assets.length} 份素材</p></div>
          </label>;
        })}
        {!groups.length && <p>资源中心还没有商品。<Link to={`/assets?campaign=${campaignId}`}>去上传商品素材</Link></p>}
      </div>}
      {error && <ErrorState error={new Error(error)} />}
      <div className="row between"><span>已选 {ids.length} 个商品</span><button className="primary" disabled={busy || resources.isPending || !!resources.error} onClick={async () => {
        setBusy(true); setError('');
        try {
          const result = await put<CampaignProducts>(`/clients/${client.id}/campaigns/${campaignId}/products`, { anchorIds: ids, revision });
          cache.setQueryData([client.id, 'campaign-products', campaignId], result);
          await cache.invalidateQueries({ queryKey: [client.id, 'campaigns'] }); setOpen(false);
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>{busy ? '正在保存…' : '保存商品绑定'}</button></div>
    </Modal>}
  </section>;
}
