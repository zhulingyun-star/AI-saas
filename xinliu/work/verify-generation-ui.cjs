const { chromium } = require('./ui-runtime/node_modules/playwright-core');
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
      assert.match(JSON.parse(body).prompt, /服饰鞋包/);
      creates++; response.end(JSON.stringify({ id: 'fixture-ui-1', status: 'queued' })); return;
    }
    if (request.url === '/tasks/fixture-ui-1') { response.end(JSON.stringify({ id: 'fixture-ui-1', status: 'succeeded', output: { video_url: fixtureOrigin + '/result.webm' } })); return; }
    if (request.url === '/result.webm') { response.setHeader('Content-Type', 'video/webm'); response.end(fs.readFileSync(path.join(root, '服饰细节_本地粗剪_非AI生成.webm'))); return; }
    response.statusCode = 404; response.end('{}');
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
  process.env.XINLIU_UI_FIXTURE_KEY = 'fixture-not-real-key';
  const backend = createBackend({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-ui-test-')), allowFixture: true, providers: { video: { protocol: 'xinliu-bridge', baseUrl: fixtureOrigin, createPath: '/tasks', statusPath: '/tasks/{id}', keyEnv: 'XINLIU_UI_FIXTURE_KEY', model: 'fixture-ui-video', supportsImageDataUri: true, supportedAspects: ['9:16'], supportedResolutions: ['1080p'], maxDuration: 30, capabilities: ['commerce'], allowedResultOrigins: [fixtureOrigin], price: { creditsPerSecond: 1 } } } });
  const origin = await backend.start();
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1080 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/#home');
    assert.match(await page.title(), /心流/);
    assert.equal(await page.locator('.brandmark span').first().innerText(), '心流');
    await page.getByRole('button', { name: '直接做视频' }).click();
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
    await page.evaluate(() => navigate('gallery'));
    await page.getByRole('heading', { name: '样片广场', exact: true }).waitFor();
    for (const category of ['食品饮料', '家居百货', '3C数码', '宠物用品']) {
      await page.locator('#flowCategory').selectOption(category);
      await page.waitForFunction(() => [...document.querySelectorAll('.flow-recipe-cover img')].length > 0 && [...document.querySelectorAll('.flow-recipe-cover img')].every(image => image.complete && image.naturalWidth > 0));
    }
    await page.locator('#flowCategory').selectOption('全部品类');
    await page.evaluate(() => { document.querySelector('.toast')?.classList.remove('visible'); window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(root, '心流-品类样片预览.png') });
    assert.deepEqual(errors, []);
    const report = { status: 'passed', checks: ['心流名称', '四品类原创示意无缺图', '真实服务端素材上传', '报价不调用模型', '未授权不提交', '授权后一次模拟调用', '查单不重生成', '结果转存回到对应作品', '无页面错误'], authority: '仅本地HTTP模拟供应商；不证明Seedance出片效果，不消耗真实模型积分', fixtureCalls: creates, pageErrors: errors };
    fs.writeFileSync(path.join(root, '出片接口联调验证.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close(); await backend.close(); await new Promise(resolve => fixture.close(resolve)); delete process.env.XINLIU_UI_FIXTURE_KEY;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
