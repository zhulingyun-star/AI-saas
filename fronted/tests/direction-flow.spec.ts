import { test, expect, type Page } from '@playwright/test';

/**
 * 框架模式 / 一键成片的新版四步，跑在真后端上（本机开发环境：AI_MODE=local，视频接口没启用）。
 * 本地模式下方向和分镜是按商品理解拼的，界面上只在方向卡和分镜标题旁标一个「模板」，不再有长段说明；出片只记下来，不发出请求。
 * 不调用任何模型或视频接口。
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME ?? 'admin');
  await page
    .getByLabel('密码', { exact: true })
    .fill(process.env.E2E_PASSWORD ?? 'change-me-local');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '全部项目', exact: true })).toBeVisible();
});

type Any = Record<string, any>;
async function api(page: Page, method: string, path: string, data?: unknown) {
  const { token } = await (await page.request.get('/api/auth/csrf')).json();
  const r = await page.request.fetch(`/api${path}`, {
    method,
    data,
    headers: { 'X-CSRF-TOKEN': token },
  });
  expect(r.ok(), `${method} ${path}: ${await r.text()}`).toBeTruthy();
  return r.json();
}
/** 用当前客户里有人群的商品建一个项目（新建本身不出片） */
async function createProject(page: Page, mode: 'FRAMEWORK' | 'ONE_CLICK') {
  const clients: Any[] = await api(page, 'GET', '/clients');
  const client = clients[0].id;
  const lib = await api(page, 'GET', `/clients/${client}/product-library`);
  const products = Object.values(lib.products as Record<string, Any>);
  const product = products.find((p) => p.personaCount > 0) ?? products[0];
  expect(product, '本机开发库里要有商品').toBeTruthy();
  const item = await api(page, 'POST', `/clients/${client}/project-library/projects`, {
    mode,
    productAnchorId: product.anchorId,
    ratio: '9:16',
    resolution: '720p',
    facts: '灰白拼色网眼鞋面，侧面 N 字标识',
    factsConfirmed: true,
    name: `${mode === 'FRAMEWORK' ? '框架验收' : '一键验收'} ${Date.now()}`,
  });
  expect(item.flow).toBe(true);
  expect(item.versions.count).toBe(0);
  return { client, id: item.id as string, personas: product.personaCount as number };
}
const bar = (page: Page) => page.getByRole('toolbar', { name: '这一步的操作' });

test('框架模式四步：出方向、改格子、多选两个方向、两份分镜、各自出片', async ({ page }) => {
  const { id, personas } = await createProject(page, 'FRAMEWORK');
  await page.goto(`/p/${id}`);
  // 新建后进方向步
  await expect(page.getByRole('button', { name: /^第 2 步：方向/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
  if (personas)
    await page.getByRole('group', { name: '给谁看' }).getByRole('button').nth(1).click();
  await page.getByRole('group', { name: '时长' }).getByRole('button', { name: '15 秒' }).click();
  await bar(page).getByRole('button', { name: '出 3 套方向' }).click();
  const picks = page.getByRole('button', { name: /^选择方向「/ });
  await expect(picks).toHaveCount(3);
  await expect(page.locator('.gy-dircard .srcs i.local', { hasText: '模板' }).first()).toBeVisible();
  await expect(page.getByText('这些方向不是 AI 写的')).toHaveCount(0);
  await expect(page.getByText(/本地模板/)).toHaveCount(0);
  // 改第 1 套的格子：开头类型和开口第一句；极限词实时标出来
  await page.getByRole('button', { name: '改格子' }).first().click();
  await page
    .getByRole('group', { name: '开头类型' })
    .getByRole('button', { name: '悬念型' })
    .click();
  await page.getByLabel(/^前 3 秒怎么说/).fill('这是最好看的一双');
  await expect(page.locator('.gy-dirform .gy-adlive.bad')).toContainText('1 处可能违规');
  await expect(bar(page)).toContainText('开头台词还有 1 处可能违规的说法');
  await bar(page).getByRole('button', { name: '保存这个方向' }).click();
  await expect(page.locator('.gy-dircard').first()).toContainText('已改过');
  await expect(page.locator('.gy-dircard').first()).toContainText('悬念型');
  // 同时测两个方向
  await page.getByLabel('同时测几个方向').check();
  await picks.nth(0).click();
  await page
    .getByRole('button', { name: /^选择方向「/ })
    .nth(1)
    .click();
  await expect(bar(page)).toContainText('已选 2 个：A');
  await bar(page).getByRole('button', { name: '确认 2 个方向，各写一份分镜' }).click();
  // 分镜：两个方向切换，转化结构和骨架建议，台词检查带上了改过的开头
  await expect(page.getByRole('button', { name: /^第 3 步：分镜/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
  const tabs = page.getByRole('tablist', { name: '方向' });
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await expect(page.getByText('15 秒骨架建议')).toBeVisible();
  await expect(page.locator('.gy-dshot')).toHaveCount(5);
  await expect(page.locator('.gy-srctag', { hasText: '模板' })).toBeVisible();
  await expect(page.getByText('这份分镜不是 AI 写的')).toHaveCount(0);
  await expect(page.locator('#adsum')).toContainText('台词里有 1 处可能违规的说法');
  // 改第 2 镜的画面，保存后能恢复成写出来时的原文
  const orig = await page.locator('#dshot-2 dd').first().innerText();
  await bar(page).getByRole('button', { name: '编辑分镜' }).click();
  await page.getByLabel('镜头 2 的画面').fill('双手捧鞋转到侧面，停在 N 字标识');
  await bar(page).getByRole('button', { name: '保存' }).click();
  await expect(page.locator('#dshot-2')).toContainText('双手捧鞋转到侧面');
  await page
    .locator('#dshot-2')
    .getByRole('button', { name: /恢复原文/ })
    .click();
  await expect(page.locator('#dshot-2 dd').first()).toHaveText(orig);
  // 逐个确认：确认 A 后自动切到 B，确认 B 后进出片
  await bar(page)
    .getByRole('button', { name: /确认「.+」的分镜/ })
    .click();
  await expect(tabs.getByRole('tab', { selected: true })).toContainText('B');
  await bar(page).getByRole('button', { name: '确认分镜，去出片' }).click();
  await expect(page.getByRole('button', { name: /^第 4 步：出片/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
  // 出片：每个方向各自出；视频接口没启用，只记下来
  await expect(page.getByText('第 1 版的出片词')).toBeVisible();
  await bar(page).getByRole('button', { name: '出第一版' }).click();
  await expect(bar(page)).toContainText('确认：');
  await bar(page).getByRole('button', { name: '确认出片' }).click();
  await expect(
    page.getByRole('region', { name: '第 1 版' }).or(page.locator('.gy-ocver')),
  ).toHaveCount(1);
  await expect(page.locator('.gy-ocver').first()).toContainText('没有发出');
  await page.getByRole('tablist', { name: '方向' }).getByRole('tab', { name: /^B/ }).click();
  await expect(page.locator('.gy-ocver')).toHaveCount(0);
  await expect(bar(page).getByRole('button', { name: '出第一版' })).toBeVisible();
  await page.getByRole('tab', { name: '对比 2 个方向' }).click();
  await expect(page.locator('.gy-dcmp .col')).toHaveCount(2);
  await expect(page.locator('.gy-dcmp')).not.toContainText('点击率');
  // 列表里的进度
  await page.goto('/');
  await expect(
    page.getByRole('row', { name: new RegExp(`打开项目 框架验收`) }).first(),
  ).toContainText('1 个版本');
});

test('简易：新建只建项目；设置 → 自动写方向和分镜 → 出片，每版记下设置', async ({ page }) => {
  const { id } = await createProject(page, 'ONE_CLICK');
  await page.goto(`/p/${id}`);
  await expect(page.getByRole('button', { name: /^第 4 步：出片/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await expect(page.getByRole('button', { name: /^第 2 步：方向，出片时自动写/ })).toBeVisible();
  const set = page.getByRole('region', { name: '一键成片的设置' }).or(page.locator('.gy-ocset'));
  await set
    .getByRole('group', { name: '出发点' })
    .getByRole('button', { name: '我有文案' })
    .click();
  await expect(bar(page).getByRole('button', { name: '开始出片' })).toBeDisabled();
  await set.locator('textarea').fill('出门不想配鞋？试试这双。灰色拼接，配什么都行！点下面看看。');
  await set.getByRole('group', { name: '时长' }).getByRole('button', { name: '30 秒' }).click();
  await set.getByRole('button', { name: '更多设置' }).click();
  await set
    .getByRole('group', { name: '出镜人物' })
    .getByRole('button', { name: '只出手' })
    .click();
  await bar(page).getByRole('button', { name: '开始出片' }).click();
  await expect(bar(page)).toContainText('按现在的设置重写方向和分镜');
  await bar(page).getByRole('button', { name: '确认出片' }).click();
  const v1 = page.locator('.gy-ocver').first();
  await expect(v1).toContainText('第 1 版');
  await expect(v1.locator('.gy-vtags')).toContainText('照我的文案');
  await expect(v1.locator('.gy-vtags')).toContainText('30 秒');
  await expect(v1.locator('.gy-vtags')).toContainText('只出手');
  // 中间两步可以看、可以改
  await page.getByRole('button', { name: /^第 2 步：方向/ }).click();
  await expect(page.locator('.gy-dircard')).toContainText('只出手');
  await page.getByRole('button', { name: /^第 3 步：分镜/ }).click();
  await expect(page.locator('.gy-dshot')).toHaveCount(7);
  await expect(page.locator('.gy-dshot').first()).toContainText('出门不想配鞋？');
  await bar(page).getByRole('button', { name: '编辑分镜' }).click();
  await page.getByLabel('镜头 3 的画面').fill('双手捧鞋转到侧面');
  await bar(page).getByRole('button', { name: '保存' }).click();
  await expect(page.locator('#dshot-3')).toContainText('双手捧鞋转到侧面');
  await bar(page).getByRole('button', { name: '回到出片' }).click();
  // 设置没变：沿用改过的分镜再出一版
  await bar(page).getByRole('button', { name: '再出一版' }).click();
  await expect(bar(page)).toContainText('用现在的方向和分镜');
  await bar(page).getByRole('button', { name: '确认出片' }).click();
  await expect(page.locator('.gy-ocver')).toHaveCount(2);
  await expect(page.locator('.gy-ocver').first()).toContainText(
    '设置没变，按现在的方向和分镜再出一版',
  );
  // 改时长再出：版本卡写明设置改了什么
  await page
    .locator('.gy-ocset')
    .getByRole('group', { name: '时长' })
    .getByRole('button', { name: '15 秒' })
    .click();
  await bar(page).getByRole('button', { name: '再出一版' }).click();
  await bar(page).getByRole('button', { name: '确认出片' }).click();
  await expect(page.locator('.gy-ocver')).toHaveCount(3);
  await expect(page.locator('.gy-ocver').first()).toContainText('设置比第 2 版：时长 30 → 15 秒');
});
