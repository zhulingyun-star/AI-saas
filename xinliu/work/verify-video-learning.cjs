'use strict';

const { chromium, executablePath } = require('./browser-runtime.cjs');
const { createBackend } = require('../backend/server.cjs');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  let calls = 0;
  let partial = false;
  const fixture = http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.equal(payload.contents[0].parts[1].inline_data.mime_type, 'video/webm');
    assert.match(payload.contents[0].parts[0].text, /商品包装字样/);
    calls++;
    response.end(JSON.stringify({ candidates: [{ finishReason: partial ? 'MAX_TOKENS' : 'STOP', content: { parts: [{ text: JSON.stringify({ hook: '真实可见开场', shots: [], uncertain: ['无法确认功效'] }) }] } }] }));
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${fixture.address().port}`;
  process.env.XINLIU_LEARNING_FIXTURE_KEY = 'mock-not-a-real-key';
  const provider = { protocol: 'gemini-content', baseUrl: origin, createPath: '/generate', keyEnv: 'XINLIU_LEARNING_FIXTURE_KEY', model: 'fixture-video-understanding', supportsVideoDataUri: true, maxInlineVideoBytes: 16 * 1024 * 1024, price: { fixedCredits: 2 } };
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-learning-test-'));
  const backend = createBackend({ port: 0, dataDir, providers: { vision: provider }, allowFixture: true });
  let browser;
  try {
    const base = await backend.start();
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/#preferences');
    await page.evaluate(async () => {
      const bytes = await (await fetch('/服饰细节_本地粗剪_非AI生成.webm')).blob();
      const fileId = await keepFile(new File([bytes], 'local-fixture.webm', { type: 'video/webm' }));
      client().assets.push({ id: 'learn-one', name: '本地视频1', kind: '视频', fileId, mark: 'good', markReason: '真实操作', category: '服饰鞋包' }, { id: 'learn-two', name: '本地视频2', kind: '视频', fileId, mark: 'bad', markReason: '口播过长', category: '服饰鞋包' });
      featureUi.knowledgeTab = '素材提炼'; render();
    });
    const prepare = async ids => {
      await page.evaluate(ids => { featureUi.knowledgeTab = '素材提炼'; viewState.selectedAssets = new Set(ids); navigate('preferences'); }, ids);
      await page.getByRole('button', { name: '视频AI提炼', exact: true }).click();
      await page.getByRole('dialog', { name: '视频理解：准备与费用' }).waitFor();
      await page.getByRole('button', { name: '准备各条估价（不分析）', exact: true }).click();
      assert.match(await page.locator('#featureAnalysisError').innerText(), /授权/);
      await page.locator('#featureAnalysisRights').check();
      await page.getByRole('button', { name: '准备各条估价（不分析）', exact: true }).click();
      await page.getByRole('dialog', { name: '确认视频理解费用' }).waitFor();
    };
    await prepare(['learn-one']);
    assert.equal(calls, 0);
    assert.equal(backend.state.tasks[0].teamId, undefined);
    assert.equal(backend.state.tasks[0].input.config.teamId, 'default');
    await page.getByRole('button', { name: '确认分析（可能收费）', exact: true }).click();
    assert.match(await page.locator('#featureAnalysisError').innerText(), /授权/);
    assert.equal(calls, 0);
    await page.locator('#featureAnalysisSpend').check();
    await page.getByRole('button', { name: '确认分析（可能收费）', exact: true }).click();
    await page.waitForFunction(() => client().knowledge.some(item => item.backendTaskId));
    assert.equal(calls, 1);
    assert.equal(await page.evaluate(() => client().knowledge.find(item => item.backendTaskId).status), '草稿');
    assert.equal(await page.evaluate(() => state.config.knowledgeSnapshots?.length || 0), 0);
    const record = await page.evaluate(() => featureUi.aiPlan.records[0]);
    await page.evaluate(async record => {
      await generationRequest(`/api/tasks/${record.task.id}/submit`, { clientId: state.activeClient, quoteId: record.quote.id, acceptedCredits: record.quote.credits, authorized: true, budgetLimit: record.quote.credits });
    }, record);
    assert.equal(calls, 1);
    partial = true;
    await prepare(['learn-one', 'learn-two']);
    assert.equal(calls, 1);
    await page.locator('#featureAnalysisSpend').check();
    await page.getByRole('button', { name: '确认分析（可能收费）', exact: true }).click();
    await page.waitForFunction(() => !featureUi.aiBusy);
    assert.equal(calls, 2);
    assert.ok(backend.state.tasks.some(task => task.status === 'unknown'));
    assert.equal(await page.evaluate(() => client().knowledge.filter(item => item.backendTaskId).length), 1);
    assert.equal(await page.evaluate(() => featureUi.stop), true);
    const request = async (route, body) => page.evaluate(async ({ route, body }) => {
      const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Xinliu-CSRF': generationUi.csrf }, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    }, { route, body });
    const draft = backend.state.tasks.find(task => task.status === 'draft');
    backend.setProviders({ vision: { ...provider, supportsVideoDataUri: false } });
    const unsupported = await request(`/api/tasks/${draft.id}/quote`, { clientId: draft.clientId });
    assert.equal(unsupported.data.error.code, 'VIDEO_ANALYSIS_UNSUPPORTED');
    backend.setProviders({ vision: { ...provider, maxInlineVideoBytes: 1 } });
    const large = await request(`/api/tasks/${draft.id}/quote`, { clientId: draft.clientId });
    assert.equal(large.data.error.code, 'VIDEO_ANALYSIS_TOO_LARGE');
    assert.equal(calls, 2);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', fixtureCalls: calls, checks: ['真实本地文件上传并转inline视频', '授权与逐条估价之前零模型调用', '未授权拦截', '已提交任务不重发', '候选只保存知识草稿', '不完整响应保留unknown并停止后续', '未声明inline能力与超限文件在报价阶段拦截'], pageErrors: errors, authority: '本地HTTP假供应商，不验证Gemini模型质量、不消耗真实积分' }));
  } finally {
    if (browser) await browser.close();
    await backend.close();
    await new Promise(resolve => fixture.close(resolve));
    delete process.env.XINLIU_LEARNING_FIXTURE_KEY;
    const resolved = path.resolve(dataDir);
    const expectedPrefix = path.resolve(os.tmpdir()) + path.sep + 'xinliu-learning-test-';
    if (!resolved.startsWith(expectedPrefix)) throw new Error('拒绝清理非测试临时目录');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
