import { test, expect } from '@playwright/test';
import type { Asset } from '../src/types';
import { productGroups } from '../src/productGroups';

const fixture = (id: string, metadata: Record<string, unknown> = { productName: '新百伦鞋子' }): Asset => ({
  id, clientId: 'test-client', name: `${id}.png`, kind: 'PRODUCT', sku: '', tags: '',
  mime: 'image/png', sizeBytes: 1024, metadata, createdAt: `2026-11-13T10:00:0${id}`,
});

test('stable group IDs distinguish same-name products and legacy assets remain grouped', () => {
  expect(productGroups([fixture('2'), fixture('1')])[0].assets.map(a => a.id)).toEqual(['1', '2']);
  expect(productGroups([fixture('1', { productName: '同名', productGroupId: 'a' }), fixture('2', { productName: '同名', productGroupId: 'b' })])).toHaveLength(2);
});

test('one product card, complete gallery, shared name/SKU and reload', async ({ page }, testInfo) => {
  let assets = [fixture('3'), fixture('2'), fixture('1')];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const json = (data: unknown) => route.fulfill({ json: data });
    if (path.endsWith('/auth/me')) return json({ username: 'test-user' });
    if (path.endsWith('/auth/csrf')) return json({ token: 'test-csrf', headerName: 'X-CSRF-TOKEN' });
    if (path === '/api/clients') return json([{ id: 'test-client', name: '验证客户', category: '服饰' }]);
    if (path.endsWith('/analysis')) return json({ status: 'EMPTY', brief: '', revision: 0, stale: false });
    if (path.endsWith('/cover')) {
      const body = route.request().postDataJSON();
      assets = assets.map(a => ({ ...a, metadata: { ...a.metadata, coverAssetId: body.assetId } }));
      return json(assets);
    }
    if (path.includes('/product-groups/')) {
      const body = route.request().postDataJSON();
      assets = assets.map(a => ({ ...a, sku: body.sku, metadata: { ...a.metadata, productName: body.productName, productGroupId: 'persisted-group' } }));
      return json(assets);
    }
    if (path.endsWith('/assets')) return json(assets);
    if (path.endsWith('/file')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="#dde7d1"/><rect x="5" y="5" width="290" height="590" fill="none" stroke="#354a28" stroke-width="10"/><text x="35" y="45" font-size="25">TOP</text><text x="35" y="570" font-size="25">BOTTOM</text></svg>' });
    return json({});
  });
  await page.goto('/assets/');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText('新百伦鞋子');
  await expect(page.locator('.product-card')).toContainText('SKU：未设置');
  await page.getByRole('button', { name: '查看商品 新百伦鞋子', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '商品详情与素材' });
  await expect(dialog.locator('.product-gallery-strip button')).toHaveCount(3);
  await dialog.getByRole('button', { name: '图片2', exact: true }).click();
  await expect(dialog.locator('.product-gallery-main img')).toHaveAttribute('src', /\/2\/file$/);
  await expect(dialog.locator('.product-gallery-main img')).toHaveCSS('object-fit', 'contain');
  await dialog.locator('[name=productName]').fill('新百伦 992');
  await dialog.locator('[name=sku]').fill('NB-992');
  await dialog.getByRole('button', { name: '保存商品信息' }).click();
  await expect(dialog.locator('.product-details-heading')).toContainText('NB-992');
  await dialog.getByRole('button', { name: '设为商品封面', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '当前封面', exact: true })).toBeDisabled();
  await expect(dialog.locator('.product-gallery-strip button').nth(1)).toContainText('图片2 · 封面');
  await page.screenshot({ path: testInfo.outputPath('product-details.png') });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText('新百伦 992');
  await expect(page.locator('.product-card')).toContainText('NB-992');
  await expect(page.locator('.product-cover img')).toHaveAttribute('src', /\/2\/file$/);
  await page.screenshot({ path: testInfo.outputPath('product-card.png') });
  await page.getByRole('button', { name: '添加素材', exact: true }).click();
  await expect(page.getByRole('dialog').locator('[name=productName]')).toHaveValue('新百伦 992');
  await expect(page.getByRole('dialog').locator('[name=sku]')).toHaveValue('NB-992');
});

test('multiple selected files submit one shared product ID with optional SKU', async ({ page }) => {
  const uploads: string[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { username: 'test-user' } });
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'test', headerName: 'X-CSRF-TOKEN' } });
    if (path === '/api/clients') return route.fulfill({ json: [{ id: 'test-client', name: '验证客户', category: '服饰' }] });
    if (path.endsWith('/assets') && route.request().method() === 'POST') {
      uploads.push(route.request().postDataBuffer()!.toString());
      return route.fulfill({ json: fixture(String(uploads.length)) });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/assets/');
  await page.getByRole('button', { name: '新建商品素材组', exact: true }).first().click();
  await page.locator('input[type=file]').setInputFiles(['one.png', 'two.png'].map(name => ({
    name, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfWQAAAAASUVORK5CYII=', 'base64'),
  })));
  await page.locator('[name=productName]').fill('一次上传一个商品');
  await page.getByRole('button', { name: '上传 2 份素材' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(uploads).toHaveLength(2);
  const ids = uploads.map(body => /name="productGroupId"\r\n\r\n([^\r]+)/.exec(body)?.[1]);
  expect(ids[0]).toBeTruthy();
  expect(ids[0]).toEqual(ids[1]);
  for (const body of uploads) expect(body).toContain('一次上传一个商品');
});
