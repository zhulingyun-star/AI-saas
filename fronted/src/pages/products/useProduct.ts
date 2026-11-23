import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { useLibrary, type Analysis } from './data';

/** 单个商品：所在的商品组、库信息和分析结果（分析进行中时每 2 秒刷新）。 */
export function useProduct(anchorId: string) {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const lib = useLibrary();
  const product = lib.products.find((p) => p.group.assets.some((a) => a.id === anchorId));
  const anchor = product?.anchorId ?? anchorId;
  const key = [client.id, 'product-analysis', anchor];
  const analysis = useQuery({
    queryKey: key,
    queryFn: () => request<Analysis>(`/clients/${client.id}/product-groups/${anchor}/analysis`),
    enabled: !!product,
    refetchInterval: (q) =>
      ['QUEUED', 'RUNNING'].includes(q.state.data?.status ?? '') ? 2000 : false,
  });
  return {
    ...lib,
    product,
    anchor,
    analysis,
    setAnalysis: (a: Analysis) => cache.setQueryData(key, a),
    endpoint: `/clients/${client.id}/product-groups/${anchor}`,
  };
}
