import type { Asset } from './types';

export interface ProductGroup {
  key: string;
  groupId: string;
  productName: string;
  sku: string;
  assets: Asset[];
  cover: Asset;
}

export function productGroups(assets: Asset[]): ProductGroup[] {
  const groups = new Map<string, Asset[]>();
  for (const asset of assets.filter((item) => item.kind === 'PRODUCT')) {
    const name = String(asset.metadata.productName ?? '').trim();
    const groupId = String(asset.metadata.productGroupId ?? '');
    const key = groupId ? `group:${groupId}` : asset.sku.trim() ? `sku:${asset.sku.trim()}`
      : name ? `name:${name.toLowerCase()}` : `asset:${asset.id}`;
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }
  return Array.from(groups, ([key, members]) => {
    const assets = [...members].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const coverId = assets.find((a) => a.metadata.coverAssetId)?.metadata.coverAssetId;
    const cover = assets.find((a) => a.id === coverId && a.mime.startsWith('image/')) ?? assets.find((a) => a.mime.startsWith('image/')) ?? assets[0];
    return {
      key, assets, cover,
      groupId: String(assets[0].metadata.productGroupId ?? ''),
      sku: assets[0].sku,
      productName: String(assets.find((a) => a.metadata.productName)?.metadata.productName || assets[0].sku || '未命名商品'),
    };
  });
}

export function assetLabel(asset: Asset, assets: Asset[]): string {
  const type = asset.mime.split('/')[0];
  const prefix = type === 'image' ? '图片' : type === 'video' ? '视频' : '音频';
  return `${prefix}${assets.slice(0, assets.indexOf(asset) + 1).filter((a) => a.mime.split('/')[0] === type).length}`;
}
