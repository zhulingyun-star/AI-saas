import { test, expect } from '@playwright/test';
import path from 'node:path';

test('replace copy, keep overlays off, confirm prompt, submit only after review', async ({ page }, info) => {
  let state: any = { revision: 0, status: 'EMPTY', phase: '', error: '', stale: false, enabled: true, videoEnabled: true };
  let submits = 0;
  let history: any[] = [];
  const copy = { relation: '跨品类', reason: '护肤品与鞋用途不同', approach: '按鞋面细节重建动作', duration: 19, overlaysOn: false, confirmed: false, notes: '缓震待确认',
    lines: [{ id: 'line1', start: 0, end: 2, original: '原片台词', text: '看看鞋面的拼接' }], overlays: [{ id: 'shot1', start: 0, end: 2, original: '提亮', text: '', enabled: false }] };
  await page.route('**/api/**', async route => {
    const u = new URL(route.request().url()), p = u.pathname, method = route.request().method();
    const json = (value: unknown) => route.fulfill({ json: structuredClone(value) });
    if (p.endsWith('/auth/me')) return json({ username: 'admin' });
    if (p.endsWith('/auth/csrf')) return json({ token: 'test', headerName: 'X-CSRF-TOKEN' });
    if (p === '/api/clients') return json([{ id: 'c', name: '客户', category: '鞋包' }]);
    if (p === '/api/system') return json({ aiMode: 'openai' });
    if (p.endsWith('/campaigns')) return json([{ id: 'p', name: '二创项目', brief: '', archived: false }]);
    if (p.endsWith('/campaigns/p/products')) return json({ revision: 0, products: [{ anchorId: 'product', assets: [{ id: 'product', name: 'shoe.png', kind: 'PRODUCT', mime: 'image/png', sku: '', metadata: { productName: '灰色鞋子' } }], analysis: {} }] });
    if (p.endsWith('/assets')) return json([{ id: 'ref', name: '参考片.mp4', kind: 'REFERENCE', mime: 'video/mp4', metadata: {} }]);
    if (p.endsWith('/assets/product/file')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#aaa"/></svg>' });
    if (p.endsWith('/file')) return route.fulfill({ contentType: 'video/mp4', path: path.resolve('tests/fixtures/remake-test.mp4') });
    if (p.endsWith('/storyboard')) return json({ status: 'COMPLETED', revision: 2, model: 'hidden', enabled: true, error: '', calls: [], report: { duration: 18.773, shots: [{ id: 'shot1', start: 0, end: 18.773, action: '参考动作', camera: '固定', transition: '开头', effects: '', text: '提亮', review: '' }], dialogue: [{ id: 'line1', start: 0, end: 2, text: '原片台词', source: 'subtitle' }], summary: '', music: '', suggestions: [] } });
    if (p.endsWith('/thumbnail')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    if (p.endsWith('/remake/ref/product/copy') && method === 'POST') { const body = route.request().postDataJSON(); expect(body.overlays).toBe(false); expect(body.duration).toBe(19); state = { ...state, revision: 1, status: 'READY', draft: copy }; return json(state); }
    if (p.endsWith('/remake/ref/product/prompt') && method === 'PUT') { state = { ...state, revision: state.revision + 1, prompt: route.request().postDataJSON().prompt }; return json(state); }
    if (p.endsWith('/remake/ref/product/prompt') && method === 'POST') { expect(state.draft.confirmed).toBe(true); state = { ...state, revision: state.revision + 1, status: 'READY', prompt: '已确认商品的视频提示词' }; return json(state); }
    if (p.endsWith('/remake/ref/product/render') && method === 'POST') { submits++; expect(state.prompt).toBeTruthy(); expect(route.request().postDataJSON().resolution).toBe('480p'); history.unshift({ id: 'job'+submits, status: 'COMPLETED', progress: 100, message: '测试完成', hasOutput: false, createdAt: '2026-11-13T10:00:00', prompt: state.prompt, resolution: '480p' }); state.revision++; return json({ projectId: 'work', job: { id: 'job'+submits } }); }
    if (p.endsWith('/remake/ref/product/renders')) return json(history);
    if (p.endsWith('/remake/ref/product') && method === 'PUT') { const body = route.request().postDataJSON(); state = { ...state, revision: state.revision + 1, draft: body.draft, prompt: '' }; return json(state); }
    if (p.endsWith('/remake/ref/product')) return json(state);
    if (p.endsWith('/jobs')) return json([]);
    return json([]);
  });
  await page.goto('/projects/p/remake?reference=ref');
  await page.getByRole('button', { name: '下一步：台词与花字替换' }).click();
  await expect(page.getByRole('region', { name: '提取的原片台词' })).toContainText('原片台词');
  await expect(page.getByRole('region', { name: '提取的原片花字' })).toContainText('提亮');
  await expect(page.getByRole('heading', { name: '台词与花字替换' })).toBeVisible();
  await expect(page.getByLabel('替换并生成后期花字')).not.toBeChecked();
  await page.getByRole('button', { name: '生成替换文案', exact: true }).click();
  await page.getByRole('button', { name: '确认并继续' }).click();
  await expect(page.getByText('跨品类', { exact: true })).toBeVisible();
  await expect(page.getByLabel('我们商品的第1句台词')).toHaveValue('看看鞋面的拼接');
  await expect(page.getByRole('heading', { name: '花字对照' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '下一步：视频提示词' })).toBeDisabled();
  await expect(page.getByRole('region', { name: '提取的原片台词' })).toContainText('原片台词');
  await expect(page.getByRole('region', { name: '提取的原片花字' })).toContainText('提亮');
  await expect(page.getByLabel('成片时长（秒）')).toHaveValue('19');
  await expect(page.getByLabel('成片时长（秒）')).toHaveAttribute('readonly', '');
  await page.getByLabel('我们商品的第1句台词').fill('灰色鞋面层次清晰');
  await page.getByLabel('已核对台词、商品事实及勾选的花字').check();
  await page.getByRole('button', { name: '保存替换文案' }).click();
  await page.reload();
  await expect(page.getByLabel('我们商品的第1句台词')).toHaveValue('灰色鞋面层次清晰');
  await page.getByRole('button', { name: '下一步：视频提示词' }).click();
  await expect(page).toHaveURL(/stage=prompt/);
  await expect(page.getByRole('heading', { name: '台词与花字替换', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '视频制作', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '生成视频提示词' }).click();
  await page.getByRole('button', { name: '确认并继续' }).click();
  await expect(page.getByRole('textbox', { name: '视频提示词', exact: true })).toHaveValue('已确认商品的视频提示词');
  await expect(page.getByRole('button', { name: '确认提示词，生成视频' })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('copy-review.png'), fullPage: true });
  expect(submits).toBe(0);
  await page.getByRole('button', { name: '确认提示词，生成视频' }).click();
  await expect(page.getByRole('dialog')).toContainText('商品图片将通过限时链接');
  await page.getByRole('button', { name: '确认并继续' }).click();
  expect(submits).toBe(1);
  await expect(page).toHaveURL(/stage=prompt/);
  await page.getByRole('textbox', { name: '视频提示词', exact: true }).fill('用户手改后生成第二版');
  await expect(page.getByRole('button', { name: '再生成一版视频' })).toBeDisabled();
  await page.getByRole('button', { name: '保存提示词', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '视频提示词', exact: true })).toHaveValue('用户手改后生成第二版');
  await page.getByRole('button', { name: '再生成一版视频' }).click();
  await page.getByRole('button', { name: '确认并继续' }).click();
  await expect(page.getByRole('region', { name: '生成的视频版本' })).toContainText('第 2 版');
  expect(history[0].prompt).toBe('用户手改后生成第二版');
  expect(history[1].prompt).toBe('已确认商品的视频提示词');
  await page.screenshot({ path: info.outputPath('video-production.png'), fullPage: true });
});
