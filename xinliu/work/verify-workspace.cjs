const { chromium, executablePath, BASE_URL } = require('./browser-runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.resolve(__dirname, '../outputs/production-workbench');
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-gpu']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = BASE_URL + '/';
    const snapshot = async name => {
      await page.evaluate(() => document.querySelector('.toast')?.classList.remove('visible'));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(root, name), fullPage: false });
    };
    await page.goto(base + '#queue');
    assert.equal(await page.locator('nav[aria-label="主导航"] .navbutton').count(), 6);
    await page.getByRole('heading', { name: '工作队列', exact: true }).waitFor();
    await snapshot('新版-空白工作队列.png');
    await page.getByRole('button', { name: '载入示例客户' }).click();
    await page.locator('.queue-table').waitFor();
    assert.equal(await page.locator('.queue-table th').count(), 7);
    assert.equal(await page.locator('.stats').count(), 0);
    await snapshot('新版-工作队列.png');
    await page.locator('#workspaceQuery').fill('不存在的任务');
    await page.getByRole('heading', { name: '当前没有匹配任务' }).waitFor();
    await page.getByRole('button', { name: '重置筛选', exact: true }).first().click();
    await page.locator('[data-action="workspace-scope"][data-value="全部任务"]').click();
    await page.locator('[data-action="workspace-page"][data-direction="1"]').click();
    assert.equal(await page.evaluate(() => viewState.tablePage), 2);
    await page.locator('#workspaceSelectPage').check();
    assert.equal(await page.evaluate(() => viewState.selectedJobs.size), 12);
    await page.getByRole('button', { name: '设置截止', exact: true }).click();
    await page.locator('#workspaceDueDate').fill('2026-11-15');
    await page.getByRole('button', { name: '保存截止日期' }).click();
    assert.equal(await page.evaluate(() => client().jobs.filter(job => job.dueDate === '2026-11-15').length), 12);
    await page.getByRole('button', { name: '分配负责人', exact: true }).click();
    await page.locator('#assignOwner').selectOption('周乔');
    await page.getByRole('button', { name: '确认分配' }).click();
    assert.equal(await page.evaluate(() => client().jobs.filter(job => viewState.selectedJobs.has(job.id)).every(job => job.reviewer === '周乔')), true);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.locator('[data-action="workspace-scope"][data-value="待处理"]').click();
    await page.locator('[data-action="workspace-open-job"]').first().click();
    await page.locator('.studio-steps').waitFor();
    await page.locator('[data-action="studio-stage"][data-stage="1"]').click();
    assert.equal(await page.locator('.workspace-formats .choice').count(), 4);
    const advanced = page.locator('[data-workspace-details="advanced"]');
    assert.equal(await advanced.getAttribute('open'), null);
    await page.getByRole('button', { name: '全部拍法 9' }).click();
    assert.equal(await page.locator('.workspace-formats .choice').count(), 9);
    await page.locator('[data-field="format"][data-value="真人口播"]').click();
    await page.getByRole('button', { name: '收起', exact: true }).click();
    await page.locator('#hook').selectOption('利益点先说');
    assert.equal(await page.evaluate(() => state.config.hook), '利益点先说');
    await page.locator('[data-workspace-details="advanced"] summary').click();
    await page.locator('#camera').selectOption('固定机位');
    assert.equal(await page.evaluate(() => state.config.camera), '固定机位');
    assert.equal(await page.locator('[data-workspace-details="advanced"]').getAttribute('open'), '');
    await page.locator('[data-workspace-details="advanced"] summary').click();
    await page.locator('.resource-strip [data-kind="models"]').click();
    await page.getByRole('dialog', { name: '选择出镜人' }).waitFor();
    await page.locator('#workspacePickerQuery').fill('周言');
    assert.equal(await page.locator('.resource-drawer .picker-row .btn[data-kind="models"]').count(), 1);
    await page.locator('.resource-drawer [data-action="workspace-pick-resource"][data-id="zhou"]').click();
    assert.equal(await page.evaluate(() => state.config.modelId), 'zhou');
    assert.equal(await page.evaluate(() => location.hash), '#studio');
    await page.locator('.resource-strip [data-kind="voices"]').click();
    await page.locator('.resource-drawer [data-action="workspace-pick-resource"][data-id="direct"]').click();
    assert.equal(await page.evaluate(() => state.config.voiceId), 'direct');
    await page.locator('.resource-strip [data-kind="wardrobe"]').click();
    await page.getByRole('button', { name: '管理', exact: true }).click();
    await page.getByRole('heading', { name: '资源中心', exact: true }).waitFor();
    await page.locator('[data-action="toggle-garment"][data-id="tee-demo"]').click();
    await page.locator('[data-action="toggle-garment"][data-id="shoe-demo"]').click();
    await page.locator('#lookName').fill('轻羽通勤搭配');
    await page.getByRole('button', { name: '保存搭配单' }).click();
    await page.getByRole('button', { name: '返回当前制作', exact: true }).click();
    assert.equal(await page.evaluate(() => viewState.stage), 1);
    assert.equal(await page.evaluate(() => selectedLook().name), '轻羽通勤搭配');
    await page.locator('.resource-strip [data-kind="models"]').click();
    await page.getByRole('button', { name: '返回制作', exact: true }).click();
    await snapshot('新版-单条制作.png');
    await page.locator('[data-action="studio-stage"][data-stage="0"]').click();
    await page.locator('#claims').fill('客户明确确认：只展示版型与外观');
    await page.locator('[data-action="workspace-picker"][data-kind="assets"]').click();
    await page.locator('.resource-drawer [data-action="workspace-pick-resource"][data-id="tee"]').click();
    assert.equal(await page.evaluate(() => state.config.claims), '客户明确确认：只展示版型与外观');
    const facts = page.locator('#factsConfirmed');
    if (!await facts.isChecked()) await facts.check();
    await page.locator('[data-action="studio-stage"][data-stage="2"]').click();
    assert.equal(await page.locator('#workspaceShotEdit textarea[data-shot-field="visual"]').count(), 1);
    const visual = page.locator('#workspaceShotEdit [data-shot-field="visual"]');
    await visual.fill('用户修改：先看真实商品，不增加未确认效果');
    await page.locator('[data-action="workspace-shot"][data-index="1"]').click();
    await page.locator('[data-action="workspace-shot"][data-index="0"]').click();
    assert.equal(await page.locator('#workspaceShotEdit [data-shot-field="visual"]').inputValue(), '用户修改：先看真实商品，不增加未确认效果');
    await page.locator('[data-lock-shot="0"]').check();
    await page.getByRole('button', { name: '重排草稿' }).click();
    assert.equal(await page.evaluate(() => getShots()[0].visual), '用户修改：先看真实商品，不增加未确认效果');
    await page.getByRole('button', { name: '调整时长与镜头数' }).click();
    await page.locator('#workspaceDuration').selectOption('20');
    await page.locator('#workspaceShotCount').selectOption('4');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    assert.equal(await page.evaluate(() => state.config.duration), 20);
    assert.equal(await page.evaluate(() => getShots().length), 4);
    await snapshot('新版-逐镜编辑.png');
    await page.locator('[data-action="studio-stage"][data-stage="3"]').click();
    await page.locator('[data-field="subtitle"][data-value="黄字重点"]').click();
    assert.equal(await page.locator('#hook').count(), 0);
    await page.locator('[data-action="studio-stage"][data-stage="1"]').click();
    await page.getByRole('button', { name: '套用客户预设' }).click();
    const previousProduct = await page.evaluate(() => state.config.productId);
    await page.locator('[data-action="workspace-use-preset"]').first().click();
    assert.equal(await page.evaluate(() => state.config.productId), previousProduct);
    assert.equal(await page.evaluate(() => state.config.claims), '客户明确确认：只展示版型与外观');
    assert(await page.evaluate(() => Boolean(state.config.presetName)));
    await page.goto(base + '#batch');
    await page.locator('[data-action="batch-toggle"][data-dimension="hooks"][data-value="利益点先说"]').click();
    const beforeJobs = await page.evaluate(() => client().jobs.length);
    const expected = await page.evaluate(() => workspaceCombinations(viewState.batch).length);
    assert.equal(await page.locator('[data-dimension="products"]').count(), 0);
    await snapshot('新版-单变量排产.png');
    await page.getByRole('button', { name: '创建这批产单' }).click();
    assert.equal(await page.evaluate(() => client().jobs.length), beforeJobs + expected);
    assert.equal(await page.evaluate(() => client().ledger.length), 0);
    await page.goto(base + '#batch');
    await page.locator('[data-action="workspace-batch-mode"][data-mode="people"]').click();
    const alternateModel = await page.evaluate(() => state.config.modelId === 'lin' ? 'zhou' : 'lin');
    await page.locator(`[data-action="batch-toggle"][data-dimension="models"][data-value="${alternateModel}"]`).click();
    const variants = await page.evaluate(() => workspaceCombinations(viewState.batch));
    assert(variants.length >= 2);
    assert.equal(await page.locator('[data-dimension="hooks"]').count(), 0);
    await page.getByRole('button', { name: '创建这批产单' }).click();
    assert.equal(await page.evaluate(() => client().jobs[0].shots[0].visual), await page.evaluate(() => getShots()[0].visual));
    await page.goto(base + '#batch');
    await page.locator('[data-action="workspace-batch-mode"][data-mode="products"]').click();
    await page.locator('[data-action="batch-toggle"][data-dimension="products"][data-value="tee"]').click();
    await page.getByRole('button', { name: '创建这批产单' }).click();
    const teeJob = await page.evaluate(() => client().jobs.find(job => job.config?.productId === 'tee' && !job.demo));
    assert.equal(teeJob.config.factsConfirmed, false);
    assert.equal(teeJob.config.price, '');
    assert.deepEqual(teeJob.config.assets, []);
    await page.goto(base + '#resources');
    assert.equal(await page.locator('[role="tablist"][aria-label="资源分类"] [role="tab"]').count(), 5);
    await page.locator('[data-action="workspace-resource-tab"][data-tab="models"]').click();
    await page.locator('#modelGender').selectOption('男');
    assert.equal(await page.locator('.talent-card').count(), 1);
    await page.locator('[data-action="workspace-resource-tab"][data-tab="voices"]').click();
    await page.getByRole('button', { name: '上传真人口播' }).waitFor();
    const wav = Buffer.alloc(44 + 16000);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(16000, 40);
    await page.getByRole('button', { name: '上传真人口播' }).click();
    await page.locator('#voiceAudio').setInputFiles({ name: '精简版音频验证.wav', mimeType: 'audio/wav', buffer: wav });
    await page.waitForFunction(() => client().voices.some(voice => voice.name === '精简版音频验证.wav'));
    await page.locator('audio[data-file]').waitFor();
    await page.locator('[data-action="workspace-resource-tab"][data-tab="assets"]').click();
    await page.getByRole('button', { name: '上传素材', exact: false }).first().click();
    await page.locator('#assetFiles').setInputFiles(path.join(root, 'media/shirt.jpg'));
    await page.waitForFunction(() => client().assets.some(asset => asset.name === 'shirt.jpg' && asset.fileId));
    await page.locator('[data-action="workspace-resource-tab"][data-tab="reference"]').click();
    await page.locator('#referenceVideoUpload').waitFor();
    await page.locator('#activeClient').selectOption('lumi');
    assert.equal(await page.evaluate(() => client().jobs.length), 0);
    await page.goto(base + '#studio');
    await page.locator('[data-action="next-stage"]').click();
    await page.getByRole('alert').waitFor();
    await page.locator('#factsConfirmed').check();
    await page.locator('[data-action="next-stage"]').click();
    await page.locator('#hook').waitFor();
    await page.locator('#activeClient').selectOption('qingyu');
    await page.reload();
    assert.equal(await page.evaluate(() => client().jobs.some(job => job.dueDate === '2026-11-15')), true);
    for (const width of [1500, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 960 });
      for (const view of ['home', 'queue', 'studio', 'batch', 'resources', 'models', 'wardrobe', 'voices', 'reference', 'data', 'preferences', 'settings']) {
        await page.goto(base + '#' + view);
        const bounds = await page.evaluate(() => ({ available: innerWidth, content: document.documentElement.scrollWidth }));
        assert(bounds.content <= bounds.available + 2, `${view} overflow at ${width}: ${bounds.content}`);
      }
    }
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto(base + '#studio');
    await page.locator('[data-action="studio-stage"][data-stage="1"]').click();
    await page.locator('.resource-strip [data-kind="models"]').click();
    await snapshot('新版-资源选择面板.png');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.kind), 'models');
    assert.deepEqual(errors, []);
    const report = {
      status: 'passed',
      checks: [
        '六项主导航和五类资源页签',
        '空白与日常工作队列',
        '任务搜索、状态、分页和本页全选',
        '批量负责人及截止日期持久化',
        '常用四种拍法与全部九种拍法',
        '高级设置可展开且修改后保持展开',
        '模特和声音侧边选择不跳出制作',
        '穿搭管理后回到原素材原阶段',
        '未失焦输入在资源选择前保存',
        '单镜编辑、切换与锁定',
        '时长与镜头数统一确认',
        '客户预设不覆盖当前商品事实',
        '开场、人员和多SKU独立变量',
        '批量排产零模型消费',
        '跨SKU清除价格和实拍引用',
        '客户隔离与事实确认校验',
        '资源页签中真实音频和商品图片上传',
        '12个页面在4种宽度下不横向溢出',
        '选择面板Escape关闭及焦点恢复'
      ],
      errors,
      scope: '本地交互验证，不含真实生成和服务端权限'
    };
    fs.writeFileSync(path.join(root, '精简改版验证.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
