import { test, expect } from '@playwright/test';

test('analysis can run in background, be edited, and remain after reopening', async ({ page }, testInfo) => {
  const asset = { id: 'one', clientId: 'client', name: 'shoe.png', kind: 'PRODUCT', sku: '', tags: '', mime: 'image/png', sizeBytes: 3, metadata: { productName: '测试鞋子', productGroupId: 'group' }, createdAt: '2026-11-13T00:00:00' };
  let analysis: Record<string, unknown> = { status: 'EMPTY', brief: '', revision: 0, stale: false, model: 'test-vision' };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const fulfill = (json: unknown) => route.fulfill({ json });
    if (path.endsWith('/auth/me')) return fulfill({ username: 'test' });
    if (path.endsWith('/auth/csrf')) return fulfill({ token: 'test', headerName: 'X-CSRF-TOKEN' });
    if (path === '/api/clients') return fulfill([{ id: 'client', name: '客户', category: '鞋子' }]);
    if (path.endsWith('/assets')) return fulfill([asset]);
    if (path.endsWith('/file')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#edf0e8"/></svg>' });
    if (path.endsWith('/analysis')) {
      if (route.request().method() === 'POST') {
        analysis = { status: 'QUEUED', brief: route.request().postDataJSON().brief, revision: 0, stale: false, model: 'test-vision' };
        return fulfill(analysis);
      }
      if (route.request().method() === 'PUT') {
        analysis = { ...analysis, ...route.request().postDataJSON(), revision: 2 };
        return fulfill(analysis);
      }
      if (analysis.status === 'QUEUED') analysis = { ...analysis, status: 'COMPLETED', revision: 1,
        analyzedAt: '2026-11-13T10:00:00Z', sources: { assets: [asset] },
        report: { summary: '灰色鞋子', appearance: '灰色网眼鞋面', material: '可见织物纹理，成分待确认',
          showcase_points: [{ part: '鞋面', where: '顶部', what: '网眼纹理' }], image_views: [{ image: '1', view: '侧面' }],
          provable_points: [{ claim: '灰白配色', evidence: '图片1可见', how: '侧面展示' }], confirm: ['成分待确认'] } };
      return fulfill(analysis);
    }
    return fulfill({});
  });
  await page.goto('/assets/');
  await page.getByRole('button', { name: '查看商品 测试鞋子', exact: true }).click();
  await page.getByRole('tab', { name: '广告分析', exact: true }).click();
  const section = page.getByRole('region', { name: '商品广告分析' });
  await section.getByLabel('补充商品说明').fill('复古灰白运动鞋');
  await section.getByRole('button', { name: '分析商品', exact: true }).click();
  await expect(section.getByText('灰色网眼鞋面', { exact: true })).toBeVisible({ timeout: 10000 });
  await section.getByRole('button', { name: '编辑分析' }).click();
  await section.getByRole('textbox', { name: '外观结构', exact: true }).fill('手动确认的网眼鞋面');
  await page.getByRole('tab', { name: '商品素材', exact: true }).click();
  await expect(section).toBeHidden();
  await page.getByRole('tab', { name: '广告分析', exact: true }).click();
  await expect(section.getByRole('textbox', { name: '外观结构', exact: true })).toHaveValue('手动确认的网眼鞋面');
  await section.getByRole('tab', { name: '细节与卖点' }).click();
  await section.getByRole('button', { name: '添加可展示细节' }).click();
  await section.getByRole('textbox', { name: '可展示细节2部位' }).fill('鞋跟');
  await section.getByRole('textbox', { name: '可展示细节2位置' }).fill('后部');
  await section.getByRole('textbox', { name: '可展示细节2可见特征' }).fill('灰色包边');
  await section.getByRole('button', { name: '保存分析修改' }).click();
  await expect(section.getByText('分析修改已保存到此商品')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '查看商品 测试鞋子', exact: true }).click();
  await page.getByRole('tab', { name: '广告分析', exact: true }).click();
  await expect(section.getByText('手动确认的网眼鞋面', { exact: true })).toBeVisible();
  await section.getByRole('tab', { name: '细节与卖点' }).click();
  await section.getByRole('button', { name: '下一条分析' }).click();
  await expect(section.getByText('灰色包边', { exact: true })).toBeVisible();
  await section.getByRole('tab', { name: '图片对照' }).click();
  await expect(section.locator('.analysis-image-thumb img')).toHaveAttribute('src', '/api/clients/client/assets/one/file');
  await section.getByRole('button', { name: '放大图片1' }).click();
  const preview = page.getByRole('dialog', { name: '图片1', exact: true });
  await expect(preview.locator('img')).toBeVisible();
  await preview.getByRole('button', { name: '关闭', exact: true }).click();
  await section.getByRole('button', { name: '重新分析', exact: true }).click();
  await expect(section.getByRole('button', { name: '确认重新分析' })).toBeVisible();
  await section.getByRole('button', { name: '取消', exact: true }).click();
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('product-analysis.png') });
});
