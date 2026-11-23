import { test, expect } from '@playwright/test';
import path from 'node:path';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME ?? 'admin');
  await page
    .getByLabel('密码', { exact: true })
    .fill(process.env.E2E_PASSWORD ?? 'change-me-local');
  await page.getByRole('button', { name: '进入工作空间' }).click();
  await expect(page.getByRole('heading', { name: '全部项目', exact: true })).toBeVisible();
});

test('delivery project → work → shot edit → MP4 → review and fixed delivery count', async ({
  page,
}) => {
  const title = '新版验收作品 ' + Date.now(),
    campaign = '新版交付项目 ' + Date.now();
  await page.goto('/assets');
  await page.getByRole('button', { name: '上传素材', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles(path.resolve('public/demo/shirt.jpg'));
  await dialog.getByRole('button', { name: '上传到客户空间' }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/campaigns');
  await page.getByRole('button', { name: '新建交付项目', exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('项目名称').fill(campaign);
  await dialog.getByLabel('目标交付数量').fill('3');
  await dialog.getByRole('button', { name: '保存项目', exact: true }).click();
  await expect(dialog).toBeHidden();
  const campaignRow = page.getByRole('row').filter({ hasText: campaign });
  await campaignRow.getByRole('link', { name: '进入项目' }).click();
  await page.getByRole('link', { name: '在此项目做视频' }).click();
  await page.getByLabel('作品名称').fill(title);
  await page.getByLabel('商品 SKU').fill('E2E-NEW');
  await page.locator('summary').filter({ hasText: '品类与拍法' }).click();
  await page.getByLabel('成片时长 / 秒').fill('5');
  await page
    .getByLabel('本条要讲的已确认卖点')
    .fill('白色基础T恤，展示商品外观与版型，面料成分待确认。');
  await page.getByText('商品资料与参考授权已核对', { exact: true }).click();
  await page.getByRole('button', { name: '看本条方案', exact: true }).click();
  await expect(page.locator('.plan-shots article')).toHaveCount(5);
  await page.getByLabel('默认画面素材').selectOption({ label: 'shirt.jpg' });
  const unchanged = await page.locator('.plan-shots article').nth(1).innerText();
  await page.getByRole('button', { name: '改这镜', exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('台词 / 旁白').fill('这一镜只展示领口细节。');
  await dialog.getByRole('button', { name: '保存本镜修改' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.plan-shots article').nth(1)).toHaveText(unchanged, {
    useInnerText: true,
  });
  await page.getByRole('button', { name: '确认方案，进入制作' }).click();
  await page.getByRole('button', { name: '确认并提交 1 条任务' }).click();
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row.getByText('待审核', { exact: true })).toBeVisible({ timeout: 90000 });
  await row.getByRole('button', { name: '查看与审片' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('审核决定').selectOption('DELIVERED');
  await dialog.getByLabel('意见说明').fill('实际文件与商品画面核对完成，确认本版交付。');
  await dialog.getByRole('button', { name: '保存审核意见' }).click();
  await expect(dialog.getByText('已交付', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('link', { name: 'MP4 粗剪' }).click();
  const download = await downloadPromise;
  await download.saveAs(test.info().outputPath('delivery.mp4'));
  expect(download.suggestedFilename()).toMatch(/\.mp4$/);
  const srt = await page.request.get(
    (await dialog.getByRole('link', { name: 'SRT 字幕' }).getAttribute('href'))!,
  );
  expect(await srt.text()).toContain('这一镜只展示领口细节。');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.goto('/campaigns');
  await expect(page.getByRole('row').filter({ hasText: campaign })).toContainText('1 / 3');
});

test('sample gallery filter favorite and replace product without inheriting facts', async ({
  page,
}) => {
  await page.goto('/gallery');
  await page.getByLabel('样片品类').selectOption('美妆个护');
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  const star = page.getByRole('button', { name: '收藏 质地先入镜，步骤接着讲' });
  if ((await star.getAttribute('aria-pressed')) === 'true') await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('样片范围').selectOption('favorites');
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  await page.getByRole('button', { name: '查看并套用' }).click();
  await page.getByRole('link', { name: '换成我的商品' }).click();
  await expect(page.getByLabel('作品名称')).toHaveValue('');
  await expect(page.getByLabel('本条要讲的已确认卖点')).toHaveValue('');
  await expect(page.getByLabel('商品资料与参考授权已核对')).not.toBeChecked();
  await page.getByLabel('作品名称').fill('样片套用验收 ' + Date.now());
  await page.getByLabel('本条要讲的已确认卖点').fill('展示真实包装，质地需要实拍，功效待确认。');
  await page.getByLabel('商品资料与参考授权已核对').check();
  await page.getByRole('button', { name: '看本条方案' }).click();
  await expect(page.locator('.plan-shots article')).toHaveCount(4);
  await expect(page.locator('.plan-shots')).toContainText('实拍质地');
});

test('contact assignment and batch drafts persist independently of generation jobs', async ({
  page,
}) => {
  const contact = '剪辑联系人 ' + Date.now();
  // 分工联系人是以前的页面，新版团队管理占了 /team，它挪到 /team/contacts
  await page.goto('/team/contacts');
  await page.getByRole('button', { name: '新增分工联系人' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('联系人姓名').fill(contact);
  await dialog.getByLabel('负责环节').selectOption('剪辑');
  await dialog.getByRole('button', { name: '保存联系人' }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/content');
  await page.getByRole('button', { name: '分工', exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('下一步责任人').fill(contact);
  await dialog.getByLabel('接力阶段').selectOption('EDIT');
  await dialog.getByLabel('时间码 / 问题 / 保留内容').fill('00:03 调整字幕，保留商品画面。');
  await dialog.getByRole('button', { name: '保存接力状态' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: contact })).toContainText('待剪辑');
  await page.goto('/batch');
  await page.locator('.check-list input').first().check();
  await page.getByRole('button', { name: '创建 2 条内容草稿' }).click();
  await expect(page.getByRole('heading', { name: '内容制作', exact: true })).toBeVisible();
  await expect(page.locator('main')).toContainText('痛点直给');
});

test('all sections, responsive layout and customer isolation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const route of [
    '/',
    '/content',
    '/gallery',
    '/tasks',
    '/studio',
    '/batch',
    '/queue',
    '/review',
    '/assets',
    '/models',
    '/wardrobe',
    '/voices',
    '/reference',
    '/analytics',
    '/presets',
    '/team',
  ]) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        route + ' @ ' + width,
      ).toBeTruthy();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const selector = page.getByLabel('切换客户');
  const first = await selector.inputValue();
  const other = await selector
    .locator('option')
    .evaluateAll(
      (options, first) =>
        options.map((o) => (o as HTMLOptionElement).value).find((v) => v !== first),
      first,
    );
  await selector.selectOption(other!);
  await expect(page.locator('main')).not.toContainText('新版交付项目');
  await page.reload();
  await expect(page.getByLabel('切换客户')).toHaveValue(other!);
  await page.getByLabel('切换客户').selectOption(first);
  expect(errors).toEqual([]);
  await expect(page.locator('main')).not.toContainText('Invalid Date');
  await page.screenshot({ path: test.info().outputPath('projects.png'), fullPage: true });
});

test('CSV import and customer rules', async ({ page }) => {
  await page.goto('/analytics');
  await page.locator('input[type=file]').setInputFiles(path.resolve('public/report-template.csv'));
  await expect(page.getByRole('cell', { name: 'sample-material-001', exact: true })).toBeVisible();
  await expect(page.locator('.stats')).toContainText('5.00');
  await page.goto('/presets');
  await page.getByRole('button', { name: '新增客户规则' }).click();
  const dialog = page.getByRole('dialog'),
    rule = '新版规则 ' + Date.now();
  await dialog.getByLabel('预设名称').fill(rule);
  await dialog.getByLabel('明确的客户规则').fill('不使用未经品牌确认的价格和功效。');
  await dialog.getByRole('button', { name: '保存预设' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByLabel('启用 ' + rule).click();
  await expect(page.getByLabel('启用 ' + rule)).not.toBeChecked();
});

test('reference extraction and manual breakdown persist', async ({ page }) => {
  await page.goto('/assets');
  await page.getByRole('button', { name: '上传素材', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog
    .locator('input[type=file]')
    .setInputFiles(path.resolve('../production-workbench/真实本地粗剪示例.webm'));
  await dialog.locator('select[name=kind]').selectOption('REFERENCE');
  await dialog.getByRole('button', { name: '上传到客户空间' }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/reference');
  await page.getByLabel('选择客户视频').selectOption({ label: '真实本地粗剪示例.webm' });
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: '抽取当前帧' }).click();
  await expect(page.getByAltText('从真实参考视频抽取的当前帧')).toBeVisible();
  await page.getByRole('button', { name: '标记当前切点' }).click();
  await page.getByLabel('画面 / 商品职责').fill('商品特写');
  await page.getByLabel('当前商品如何改编').fill('替换为自有商品，保留短镜头结构');
  await page.getByRole('button', { name: '保存拆解' }).click();
  await expect(page.getByRole('status')).toHaveText('参考拆解已保存到真实素材');
  await page.reload();
  await page.getByLabel('选择客户视频').selectOption({ label: '真实本地粗剪示例.webm' });
  await expect(page.getByLabel('当前商品如何改编')).toHaveValue('替换为自有商品，保留短镜头结构');
  const clientId = await page.getByLabel('切换客户').inputValue();
  const works = await (await page.request.get(`/api/clients/${clientId}/projects`)).json();
  const source = works.find(
    (p: { shots: { locked: boolean }[] }) => p.shots.length > 1 && !p.shots[0].locked,
  );
  expect(source).toBeTruthy();
  await page.getByLabel('带入已有作品').selectOption(source.id);
  await page.getByLabel('改编方式').selectOption('single');
  await page.getByRole('button', { name: '替换目标这一镜' }).click();
  await expect(page.getByRole('status')).toHaveText('本镜改编已保存，其他镜头与台词保持原样');
  const after = await (
    await page.request.get(`/api/clients/${clientId}/projects/${source.id}`)
  ).json();
  expect(after.shots.slice(1)).toEqual(source.shots.slice(1));
  expect(after.shots[0]).toEqual({ ...source.shots[0], visual: '替换为自有商品，保留短镜头结构' });
  expect(after.config.referenceLinks.at(-1).source.time).toBe(0);
});

test('scene variants create drafts without adding generation jobs', async ({ page }) => {
  await page.goto('/content');
  await page.getByRole('link', { name: '打开作品', exact: true }).first().click();
  await page.getByRole('button', { name: '场景变体', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('新场景（每行一个）').fill('变体验收办公室\n变体验收窗边');
  await dialog.getByRole('button', { name: '创建变体草稿' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('main')).toContainText('变体验收办公室');
  await expect(page.locator('main')).toContainText('变体验收窗边');
});

test('real revision conflict preserves local edits and can save a copy', async ({ page }) => {
  await page.goto('/content');
  await page.getByRole('link', { name: '打开作品', exact: true }).first().click();
  await page.locator('.stepper button').first().click();
  const workId = page.url().split('/studio/')[1].split('?')[0];
  const clientId = await page.getByLabel('切换客户').inputValue();
  const source = await (
    await page.request.get(`/api/clients/${clientId}/projects/${workId}`)
  ).json();
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const updated = await page.request.put(`/api/clients/${clientId}/projects/${workId}`, {
    data: { ...source, name: (source.name + ' · 另一版本').slice(0, 150) },
    headers: { [csrf.headerName]: csrf.token },
  });
  expect(updated.ok()).toBeTruthy();
  await page
    .getByLabel('本条要讲的已确认卖点')
    .fill('冲突验收：保留本地编辑，绝不自动覆盖服务端。');
  await page.getByRole('button', { name: '保存作品', exact: true }).click();
  await expect(page.getByText('项目已更新，请重新打开后再保存', { exact: true })).toBeVisible();
  await expect(page.getByLabel('本条要讲的已确认卖点')).toHaveValue(
    '冲突验收：保留本地编辑，绝不自动覆盖服务端。',
  );
  await page.getByRole('button', { name: '另存作品副本' }).click();
  await expect(page.getByRole('status')).toHaveText('本地改动已另存为作品副本');
  expect(page.url()).not.toContain(workId);
});
