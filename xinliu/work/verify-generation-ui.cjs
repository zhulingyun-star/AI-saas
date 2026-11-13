const { chromium, executablePath, BASE_URL } = require('./browser-runtime.cjs');
const { createBackend } = require('../backend/server.cjs');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

async function main() {
  const root = path.resolve(__dirname, '../outputs/production-workbench');
  let creates = 0; let fixtureOrigin;
  const fixture = http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/tasks' && request.method === 'POST') {
      let body = ''; for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body); assert.match(payload.content[0].text, /服饰鞋包/); assert.equal(payload.duration, 4); assert.equal(payload.resolution, '480p'); assert.equal(payload.generate_audio, false); assert.equal(payload.content.filter(item => item.type === 'image_url').length, 2);
      creates++; response.end(JSON.stringify({ id: 'fixture-ui-1', status: 'queued' })); return;
    }
    if (request.url === '/tasks/fixture-ui-1') { response.end(JSON.stringify({ id: 'fixture-ui-1', status: 'succeeded', content: { video_url: fixtureOrigin + '/result.webm' } })); return; }
    if (request.url === '/result.webm') { response.setHeader('Content-Type', 'video/webm'); response.end(fs.readFileSync(path.join(root, '服饰细节_本地粗剪_非AI生成.webm'))); return; }
    response.statusCode = 404; response.end('{}');
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
  process.env.XINLIU_UI_FIXTURE_KEY = 'fixture-not-real-key';
  const backend = createBackend({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-ui-test-')), allowFixture: true, providers: { video: { protocol: 'ark-video', baseUrl: fixtureOrigin, createPath: '/tasks', statusPath: '/tasks/{id}', keyEnv: 'XINLIU_UI_FIXTURE_KEY', model: 'fixture-ui-video', supportsImageDataUri: true, supportedAspects: ['9:16'], supportedResolutions: ['480p'], minDuration: 4, maxDuration: 15, capabilities: ['commerce'], allowedResultOrigins: [fixtureOrigin], price: { creditsPerSecond: 1 } } } });
  const origin = await backend.start();
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1080 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/#home');
    assert.match(await page.title(), /心流/);
    assert.equal(await page.locator('.brandmark span').first().innerText(), '心流');
    await page.getByRole('button', { name: '直接做视频' }).click();
    await page.locator('#draftMedia').setInputFiles({ name: 'new-product.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
    await page.waitForFunction(() => product().name === 'new-product.png');
    assert.equal(await page.evaluate(() => product().sku), '');
    await page.evaluate(() => {
      client().assets.push({ id: 'test-product', name: '测试商品', sku: 'TEST-01', category: '服饰鞋包', kind: '图片', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' });
      const first = client().assets.find(item => item.id === 'test-product');
      client().assets.push({ ...first, id: 'test-angle', name: '第二角度' }, { ...first, id: 'unselected-product', name: '未选商品' });
      flowChooseProduct('test-product'); state.config.assets.push('test-angle');
      state.config.modelId = 'none'; state.config.voiceId = ''; saveDraft(); render();
    });
    assert.equal(await page.evaluate(() => state.config.duration), 4);
    assert.equal(await page.evaluate(() => state.config.outputSpec.resolution), '480p');
    assert.equal(await page.evaluate(() => flowProject().shots.length), 1);
    await page.locator('#flowClaims').fill('客户确认：领口与外观，未确认性能不承诺');
    await page.getByRole('button', { name: '看本条方案' }).click();
    await page.locator('#flowApprove').check();
    await page.getByRole('button', { name: '确认并创建 1 条产单' }).click();
    await page.getByRole('heading', { name: '制作与检查', exact: true }).waitFor();
    await page.getByRole('button', { name: '准备视频出片', exact: true }).click();
    await page.locator('#generationAssetRights').check();
    await page.getByRole('button', { name: '上传素材并准备报价（不生成）' }).click();
    await page.getByRole('dialog', { name: '确认本次模型调用费用' }).waitFor();
    assert.equal(creates, 0);
    await page.getByRole('button', { name: '确认调用模型（可能扣费）' }).click();
    assert.match(await page.locator('#generationError').innerText(), /费用授权/);
    assert.equal(creates, 0);
    await page.locator('#generationSpendApproved').check();
    await page.getByRole('button', { name: '确认调用模型（可能扣费）' }).click();
    await page.getByRole('dialog', { name: '真实后端任务' }).waitFor();
    assert.equal(creates, 1);
    await page.getByRole('button', { name: '查询上游状态（不重新生成）' }).click();
    await page.getByRole('button', { name: '带入当前作品待审片' }).waitFor();
    assert.equal(creates, 1);
    await page.getByRole('button', { name: '带入当前作品待审片' }).click();
    await page.waitForFunction(() => client().projects.find(item => item.id === state.config.draftId)?.result?.source === '后端供应商结果');
    assert.equal(creates, 1);
    assert.equal(await page.evaluate(() => flowProject().result.outdated), false);
    await page.waitForFunction(() => document.getElementById('flowResultVideo')?.readyState >= 1);
    await page.evaluate(() => { document.querySelector('.toast')?.classList.remove('visible'); window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(root, '心流-出片接口联调示例.png') });
    // Changing accepted output settings invalidates the plan and preserves its previous version.
    await page.evaluate(() => { navigate('studio'); state.config.duration = 10; flowRestructureShots(flowProject(), 3, 10); saveDraft(); navigate('brief'); });
    await page.locator('#flowApprove').check();
    await page.getByRole('button', { name: '确认并创建 1 条产单' }).click();
    await page.evaluate(() => navigate('studio'));
    await page.locator('.generation-capability > summary').click();
    await page.getByRole('button', { name: '使用4秒低成本规格', exact: true }).click();
    await page.getByRole('button', { name: '应用并重新编辑方案' }).click();
    assert.equal(await page.evaluate(() => state.config.duration), 4);
    assert.equal(await page.evaluate(() => flowProject().shots.length), 1);
    assert.equal(await page.evaluate(() => flowProject().planChanged), true);
    assert.equal(await page.evaluate(() => flowProject().history[0].config.duration), 10);
    assert.equal(creates, 1);
    assert.deepEqual(errors, []);
    const report = { status: 'passed', checks: ['心流名称', '默认4秒480p无声单镜', '新商品不继承旧SKU', '多个已选商品参考传给模型且不包含未选素材', '短片规格保留历史并要求重新确认', '真实服务端素材上传', '报价不调用模型', '未授权不提交', '授权后一次模拟调用', '查单不重生成', '结果转存回到对应作品', '无页面错误'], authority: '仅本地HTTP模拟供应商；不证明Seedance出片效果，不消耗真实模型积分', fixtureCalls: creates, pageErrors: errors };
    fs.writeFileSync(path.join(root, '出片接口联调验证.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close(); await backend.close(); await new Promise(resolve => fixture.close(resolve)); delete process.env.XINLIU_UI_FIXTURE_KEY;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
