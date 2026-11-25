'use strict';

const { chromium, executablePath, BASE_URL } = require('./browser-runtime.cjs');
const { geminiPayload } = require('../backend/model-protocols.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const checks = [];
  const errors = [];
  const external = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1080 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && !request.url().startsWith(BASE_URL + '/')) external.push(request.url());
    });
    const nav = async view => { await page.evaluate(view => navigate(view), view); };
    const tab = async value => { await nav('settings'); await page.locator(`[data-value="${value}"]`).click(); };
    await page.goto(BASE_URL + '/#home');
    assert.match(await page.title(), /光影云/);
    await page.locator('.custom-select-trigger[aria-label="当前团队"]').waitFor();
    const counts = await page.evaluate(() => Object.values(state.clients).map(current => ({ assets: current.assets.length, projects: current.projects.length })));
    await tab('团队列表');
    assert.deepEqual(await page.locator('main>.page-head h1').allTextContents(), ['团队与生产管理', '团队列表']);
    await page.getByRole('button', { name: '新建团队', exact: true }).click();
    await page.locator('#featureTeamForm [name="name"]').fill('美妆专项组');
    await page.locator('#featureTeamForm [name="clients"][value="lumi"]').check();
    await page.locator('#featureTeamForm summary').click();
    await page.locator('#featureTeamForm [name="budget"]').fill('200');
    await page.getByRole('button', { name: '保存团队', exact: true }).click();
    const teamId = await page.evaluate(() => state.teams.find(team => team.name === '美妆专项组').id);
    await page.locator(`[data-action="feature-team-switch"][data-id="${teamId}"]`).click();
    assert.deepEqual(await page.evaluate(() => collabAccessibleClients()), ['lumi']);
    assert.equal(await page.evaluate(() => state.activeClient), 'lumi');
    const selector = page.locator('.custom-select-trigger[aria-label="当前团队"]');
    await selector.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => state.activeTeam), 'default');
    await selector.click();
    await page.keyboard.press('Escape');
    assert.equal(await selector.getAttribute('aria-expanded'), 'false');
    await selector.click();
    await page.getByRole('heading').first().click();
    assert.equal(await selector.getAttribute('aria-expanded'), 'false');
    await page.reload();
    assert.ok(await page.evaluate(id => state.teams.some(team => team.id === id), teamId));
    await tab('团队列表');
    await page.getByRole('button', { name: '新建团队', exact: true }).click();
    await page.locator('#featureTeamForm [name="name"]').fill('待分配组');
    await page.getByRole('button', { name: '保存团队', exact: true }).click();
    const emptyId = await page.evaluate(() => state.teams.find(team => team.name === '待分配组').id);
    await page.locator(`[data-action="feature-team-switch"][data-id="${emptyId}"]`).click();
    await page.getByRole('heading', { name: '当前团队没有可访问客户' }).waitFor();
    await page.locator('.custom-select-trigger[aria-label="当前团队"]').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await tab('团队列表');
    await page.locator(`[data-action="feature-team-remove"][data-id="${emptyId}"]`).click();
    await page.getByRole('button', { name: '确认移除', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => Object.values(state.clients).map(current => ({ assets: current.assets.length, projects: current.projects.length }))), counts);
    assert.ok(await page.locator('[data-action="feature-team-remove"][data-id="default"]').isDisabled());
    await page.evaluate(id => {
      collabState().members.push({ id: 'test-maker', name: '测试制作员', role: 'maker', active: true, clientIds: ['qingyu'], projectIds: ['*'], grants: {} });
      collabState().actorId = 'test-maker'; XLTeam.switch(id);
    }, teamId);
    assert.equal(await page.evaluate(() => state.activeTeam), 'default');
    await page.evaluate(() => { collabState().actorId = 'member-lin'; render(); });
    await page.evaluate(id => {
      state.activeTeam = id;
      collabState().members.push({ id: 'test-guest', name: '外部客户', role: 'guest', active: true, clientIds: ['qingyu'], projectIds: [], grants: {} });
      collabState().actorId = 'test-guest'; navigate('deliveries');
    }, teamId);
    await page.getByRole('heading', { name: '客户交付查看' }).waitFor();
    assert.equal(await page.evaluate(() => collabClientAllowed('qingyu')), true);
    assert.equal(await page.locator('[data-action="feature-team-create"]').count(), 0);
    await page.evaluate(() => { collabState().actorId = 'member-lin'; XLTeam.switch('default'); });
    checks.push('团队创建、切换、持久化、空范围恢复、移除保留资产项目、成员范围与个人权限取交集');
    checks.push('外部客户沿用明确分享的交付入口，不被员工当前团队误拦截');

    await page.evaluate(() => {
      const campaign = collabNewCampaign(state.activeClient, '评价检查');
      collabState().activeByClient[state.activeClient] = campaign.id;
      client().assets.push({ id: 'label-test', name: '商品视频样本', sku: 'SKU-NEW', kind: '视频', category: '服饰鞋包' });
    });
    await nav('labels');
    await page.locator('[data-action="feature-label"][data-id="label-test"]').click();
    await page.locator('#featureMark').selectOption('good');
    await page.getByRole('button', { name: '保存评价', exact: true }).click();
    assert.match(await page.locator('#featureAssetError').innerText(), /原因/);
    await page.locator('#featureAssetForm [name="reason"]').fill('00:02领口特写清楚，保留短句口播');
    await page.locator('#featureAssetForm [name="director"]').selectOption('member-lin');
    await page.locator('#featureAssetForm summary').click();
    await page.locator('#featureAssetForm [name="spec"]').fill('M码');
    await page.locator('#featureAssetForm [name="price"]').fill('129');
    await page.getByRole('button', { name: '保存评价', exact: true }).click();
    assert.equal(await page.evaluate(() => client().assets.find(asset => asset.id === 'label-test').productSpec), 'M码');
    await page.locator('[data-action="feature-label"][data-id="label-test"]').click();
    await page.locator('#featureAssetForm [name="sku"]').fill('OTHER-SKU');
    await page.getByRole('button', { name: '保存评价', exact: true }).click();
    assert.match(await page.locator('#featureAssetError').innerText(), /新增商品素材/);
    assert.equal(await page.evaluate(() => client().assets.find(asset => asset.id === 'label-test').sku), 'SKU-NEW');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.locator('[data-action="collab-notifications"]').click();
    await page.locator('[data-action="feature-notice-read"]').first().click();
    assert.equal(await page.evaluate(() => collabState().notifications[0].read), true);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await tab('打标统计');
    assert.match(await page.locator('main').innerText(), /林川/);
    assert.match(await page.locator('main').innerText(), /100.0%/);
    const before = await page.evaluate(() => compilePrompt());
    await nav('preferences');
    await page.locator('[data-action="feature-knowledge-tab"][data-value="素材提炼"]').click();
    await page.locator('[data-learning-asset="label-test"]').check();
    await page.getByRole('button', { name: '视频AI提炼', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('未配置'));
    await page.getByRole('button', { name: '整理评价（不调用模型）', exact: true }).click();
    assert.equal(await page.evaluate(() => client().knowledge[0].status), '草稿');
    assert.equal(await page.evaluate(() => compilePrompt()), before);
    const ruleId = await page.evaluate(() => client().knowledge[0].id);
    assert.ok(await page.locator(`[data-action="guard-use-knowledge"][data-id="${ruleId}"]`).isDisabled());
    await page.reload();
    assert.equal(await page.evaluate(() => client().assets.find(asset => asset.id === 'label-test').mark), 'good');
    checks.push('评价原因校验、编导归属、单条通知已读、SKU规格保存、知识草稿不静默改Prompt、未配置Gemini不调用');

    await nav('home');
    await page.getByRole('button', { name: '直接做视频', exact: true }).click();
    const facts = await page.evaluate(() => state.config.claims);
    await nav('hotspots');
    await page.getByRole('button', { name: '新增热点', exact: true }).click();
    await page.locator('#featureHotspotForm [name="name"]').fill('开箱反差');
    await page.locator('#featureHotspotForm [name="description"]').fill('先展示包装，再展示细节；不引用原台词');
    await page.locator('#featureHotspotForm [name="source"]').fill('客户已授权的自有内容案例');
    await page.locator('#featureHotspotFormCategory').selectOption('全部品类');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    const hotspotId = await page.evaluate(() => client().hotspots[0].id);
    await page.locator(`[data-action="feature-hotspot-apply"][data-id="${hotspotId}"]`).click();
    assert.equal(await page.evaluate(() => state.config.hotspotSnapshot.id), hotspotId);
    assert.equal(await page.evaluate(() => state.config.claims), facts);
    await page.evaluate(() => { client().hotspots[0].expires = '2000-01-01'; render(); });
    assert.ok(await page.locator(`[data-action="feature-hotspot-apply"][data-id="${hotspotId}"]`).isDisabled());
    checks.push('热点有来源、品类与有效期限制、选用前方案快照、不改商品事实');

    await page.evaluate(async teamId => {
      const input = { config: { ...defaultConfig(), teamId, duration: 4 }, shots: [{ start: 0, end: 4, visual: '测试方案', speech: '测试' }] };
      await generationRequest('/api/tasks', { clientId: state.activeClient, workId: 'fee-test', campaignId: 'fee-project', kind: 'text', input, assets: [], idempotencyKey: 'fee-team-task' });
      delete input.config.teamId;
      await generationRequest('/api/tasks', { clientId: state.activeClient, workId: 'fee-old', campaignId: 'fee-project', kind: 'text', input, assets: [], idempotencyKey: 'fee-legacy-task' });
    }, 'default');
    await tab('团队费用');
    await page.waitForFunction(() => document.getElementById('featureTeamExpenses').textContent.includes('历史任务'));
    const feeText = await page.locator('#featureTeamExpenses').innerText();
    assert.match(feeText, /未报价/);
    assert.match(feeText, /1 条历史任务未记录团队/);
    checks.push('团队费用按任务团队快照归属、历史无团队不误归属、未报价不伪装真实结算');

    for (const width of [1500, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ['home', 'resources', 'labels', 'hotspots', 'preferences', 'drama']) {
        await nav(view);
        assert.ok(await page.locator('main').innerText());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${view} width ${width}`);
      }
      for (const value of ['团队列表', '打标统计', '团队费用']) {
        await tab(value);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${value} width ${width}`);
      }
    }
    await page.setViewportSize({ width: 1500, height: 1080 });
    await tab('团队列表');
    await page.screenshot({ path: path.join(__dirname, 'test-results', 'team-features.png'), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    const payload = geminiPayload({ kind: 'vision', prompt: 'test', input: { config: { videoAnalysis: true } } }, {}, [{ role: 'reference_video', url: 'data:video/webm;base64,GkXfow==' }]);
    assert.equal(payload.contents[0].parts[1].inline_data.mime_type, 'video/webm');
    assert.throws(() => geminiPayload({ kind: 'vision', prompt: 'test', input: { config: { videoAnalysis: true } } }, {}, [{ role: 'reference_video', url: 'blob:invalid' }]), /inline/);
    checks.push('新增页面四宽度无溢出、无脚本错误或外部请求、视频理解inline格式检查');
    console.log(JSON.stringify({ status: 'passed', checks, pageErrors: errors, externalRequests: external, scope: '本地交互、模拟记录与协议校验，不代表真实团队鉴权、模型质量或供应商结算' }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
