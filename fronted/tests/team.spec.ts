import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { CHECK_STAGES, missingStages, stagesFor } from '../src/convcheck';

/**
 * 团队管理（成员与权限、新增成员、角色与权限、工作负荷）和分镜「转化结构」按时长检查。
 * 跑在本机开发后端上（127.0.0.1:18090 的 H2，不是 8088 那套），不调用任何模型或视频接口。
 * 测试开通的账号叫 e2e-时间戳，密码是测试里临时生成的，只在这个本机开发库里用；测试结束时把账号停用。
 * 「工作负荷空状态」一张用 page.route 拦截成空数据（只测页面怎么显示）。设了 IMPL5_SHOTS 时顺便截图。
 */
const SHOTS = process.env.IMPL5_SHOTS;
const shot = async (page: Page, name: string, fullPage = true) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), fullPage });
};
type Any = Record<string, any>;
const ADMIN = process.env.E2E_USERNAME ?? 'admin';
const ADMIN_PW = process.env.E2E_PASSWORD ?? 'change-me-local';

async function login(page: Page, username = ADMIN, password = ADMIN_PW) {
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '进入工作空间' }).click();
  await expect(page.getByRole('heading', { name: '全部项目', exact: true })).toBeVisible();
}
async function logout(page: Page) {
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('button', { name: '进入工作空间' })).toBeVisible();
}
async function api(page: Page, method: string, url: string, data?: unknown, ok = true) {
  const { token } = await (await page.request.get('/api/auth/csrf')).json();
  const r = await page.request.fetch(`/api${url}`, {
    method,
    data,
    headers: { 'X-CSRF-TOKEN': token },
  });
  if (ok) expect(r.ok(), `${method} ${url}: ${await r.text()}`).toBeTruthy();
  return { status: r.status(), body: (await r.json().catch(() => ({}))) as Any };
}

test.describe('转化结构按时长检查（纯函数）', () => {
  test('15 秒 5 镜：有开头、给出方案、建立信任和一个收尾阶段就不提示', () => {
    // 本机后端 15 秒本地模板的 5 镜，和设计稿 15 秒默认分镜
    expect(
      missingStages(['抓住注意力', '建立需求', '给出方案', '建立信任', '推动下单'], stagesFor(15)),
    ).toEqual([]);
    expect(
      missingStages(['抓住注意力', '给出方案', '建立信任', '建立信任', '促进决定'], stagesFor(15)),
    ).toEqual([]);
    // 真缺了还是会提示，收尾三选一写在一起
    expect(
      missingStages(['抓住注意力', '给出方案', '给出方案', '建立信任', '建立信任'], stagesFor(15)),
    ).toEqual(['打消顾虑 / 促进决定 / 推动下单']);
    expect(missingStages(['建立需求', '给出方案', '建立信任', '推动下单'], stagesFor(15))).toEqual([
      '抓住注意力',
    ]);
  });
  test('30 秒和没有骨架（视频二创）不变：7 个阶段都查', () => {
    expect(stagesFor(30)).toEqual(CHECK_STAGES[30]);
    expect(stagesFor(undefined)).toHaveLength(7);
    expect(
      missingStages(['抓住注意力', '建立需求', '给出方案', '建立信任', '推动下单'], stagesFor(30)),
    ).toEqual(['打消顾虑', '促进决定']);
    expect(missingStages(['抓住注意力', '给出方案'], stagesFor())).toHaveLength(5);
  });
});

test('15 秒框架模式分镜：5 个镜头不再提示缺打消顾虑、促进决定（真后端，本地模板）', async ({
  page,
}) => {
  await login(page);
  const clients: Any[] = (await api(page, 'GET', '/clients')).body as Any[];
  const client = clients[0].id;
  const lib = (await api(page, 'GET', `/clients/${client}/product-library`)).body;
  const products = Object.values(lib.products as Record<string, Any>);
  const product = products.find((p) => p.personaCount > 0) ?? products[0];
  test.skip(!product, '本机开发库里没有商品');
  const item = (
    await api(page, 'POST', `/clients/${client}/project-library/projects`, {
      mode: 'FRAMEWORK',
      productAnchorId: product.anchorId,
      ratio: '9:16',
      resolution: '720p',
      facts: '灰白拼色网眼鞋面，侧面 N 字标识',
      factsConfirmed: true,
      name: `转化结构验收 ${Date.now()}`,
    })
  ).body;
  let flow = (await api(page, 'GET', `/clients/${client}/projects/${item.id}/flow`)).body;
  await api(page, 'POST', `/clients/${client}/projects/${item.id}/directions/generate`, {
    revision: flow.revision,
    duration: 15,
  });
  flow = (await api(page, 'GET', `/clients/${client}/projects/${item.id}/flow`)).body;
  await api(page, 'POST', `/clients/${client}/projects/${item.id}/directions/confirm`, {
    revision: flow.revision,
    ids: [flow.directions[0].id],
  });
  await page.goto(`/p/${item.id}`);
  await expect(page.getByRole('button', { name: /^第 3 步：分镜/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await expect(page.locator('.gy-dshot')).toHaveCount(5);
  await expect(page.getByText('15 秒骨架建议')).toBeVisible();
  const miss = page.locator('.gy-cvmiss');
  await expect(miss).toContainText('15 秒该有的几段都有镜头了');
  await expect(miss).not.toContainText('还没有「打消顾虑」');
  await expect(miss).not.toContainText('还没有「促进决定」');
  await page.locator('.gy-cvbar').scrollIntoViewIfNeeded();
  await shot(page, '07-storyboard-15s-conv-real.png', false);
  // 把收尾那一镜改成「给出方案」：现在真缺收尾了，会提示（只提示，不拦确认）
  await page
    .getByRole('toolbar', { name: '这一步的操作' })
    .getByRole('button', { name: '编辑分镜' })
    .click();
  await page.getByLabel('镜头 5 的任务').selectOption('给出方案');
  await expect(miss).toContainText('还没有「打消顾虑 / 促进决定 / 推动下单」的镜头');
});

test.describe('团队管理（本机开发后端）', () => {
  test('开通成员 → 改角色和负责的客户 → 成员只能进分给他的客户、不能改角色 → 停用后登录不了', async ({
    page,
  }) => {
    const stamp = Date.now().toString(36);
    const username = `e2e-${stamp}`;
    const name = `验收成员${stamp.slice(-4)}`;
    const pw = `e2e-only-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
    await login(page);
    const allClients = (await api(page, 'GET', '/team/members')).body.clients as Any[];
    test.skip(allClients.length < 2, '本机开发库里要有至少两个客户');

    // 成员列表
    await page
      .getByRole('navigation', { name: '主栏目' })
      .getByRole('link', { name: '团队管理' })
      .click();
    await expect(page).toHaveURL(/\/team$/);
    await expect(page.getByRole('heading', { name: '成员与权限' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: '团队主账号' }).first()).toBeVisible();
    await shot(page, '01-members-real.png');

    // 新增成员：确认按钮在顶部操作条
    await page.locator('.gy-ph').getByRole('button', { name: '新增成员' }).click();
    await expect(page).toHaveURL(/\/team\/new$/);
    const bar = page.getByRole('toolbar', { name: '这一步的操作' });
    await expect(bar.getByRole('button', { name: '开通账号' })).toBeDisabled();
    await page.getByLabel('姓名').fill(name);
    await page.getByLabel('登录账号').fill(username);
    await page.getByLabel('初始密码（至少 12 位）').fill(pw);
    await page.getByLabel('再输一次初始密码').fill(pw);
    await page.getByRole('radio', { name: /^内容制作/ }).click();
    await page.getByLabel('添加负责的客户').selectOption(allClients[0].id);
    await expect(page.locator('.gy-tm-cpick')).toContainText(allClients[0].name);
    await shot(page, '02-member-new-real.png');
    await bar.getByRole('button', { name: '开通账号' }).click();

    // 开通后回到列表并打开这个人的抽屉；页面上任何地方都不显示密码
    await expect(page).toHaveURL(new RegExp(`/team\\?m=${username}`));
    const drawer = page.getByRole('dialog', { name: `编辑成员 ${name}` });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('待首次登录');
    expect(await page.content()).not.toContain(pw);
    // 改角色：投手，再加一个客户；保存在抽屉顶部
    await drawer.getByRole('radio', { name: /^投手/ }).click();
    await drawer.getByLabel('添加负责的客户').selectOption(allClients[1].id);
    await shot(page, '03-member-role-edit-real.png', false);
    await drawer
      .getByRole('toolbar', { name: '保存成员设置' })
      .getByRole('button', { name: '保存' })
      .click();
    await expect(drawer).toBeHidden();
    await page.reload();
    const row = page.getByRole('row', { name: `查看成员 ${name}` });
    await expect(row).toContainText('投手');
    await expect(row).toContainText(allClients[0].name);
    await expect(row).toContainText(allClients[1].name);

    // 角色与权限：点卡片标出这一列
    await page
      .getByRole('navigation', { name: '团队管理' })
      .getByRole('link', { name: '角色与权限' })
      .click();
    await page.getByRole('button', { name: /^投手/ }).click();
    await expect(page.locator('.gy-tm-matrix')).toHaveClass(/hl-4/);
    await expect(page.locator('.gy-tm-matrix')).not.toContainText('费用');
    await shot(page, '04-roles-real.png');

    // 工作负荷：按成员 / 按客户（客户归属）
    await page
      .getByRole('navigation', { name: '团队管理' })
      .getByRole('link', { name: '工作负荷' })
      .click();
    await expect(page.getByRole('heading', { name: '工作负荷' })).toBeVisible();
    await expect(page.locator('.gy-tm-kpis')).toContainText('进行中的项目');
    await shot(page, '05-workload-member-real.png');
    await page.getByRole('button', { name: '按客户' }).click();
    await expect(page.getByRole('row').filter({ hasText: allClients[1].name })).toBeVisible();
    await shot(page, '06-workload-client-real.png');

    // 成员登录：只看到分给他的两个客户，右上角是姓名 · 角色；团队页只能看
    await logout(page);
    await login(page, username, pw);
    await expect(page.locator('.gy-username')).toHaveText(`${name} · 投手`);
    const options = await page.getByLabel('切换客户').locator('option').allTextContents();
    expect(options.sort()).toEqual([allClients[0].name, allClients[1].name].sort());
    await expect(page.getByRole('button', { name: '新建客户' })).toHaveCount(0);
    await page.goto('/team');
    await expect(
      page.getByText('可以看团队成员；开通成员、改角色和负责的客户要找管理员'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '新增成员' })).toHaveCount(0);
    // 绕过页面直接请求也会被后端拦下
    const me = (await api(page, 'GET', '/team/members')).body.members.find(
      (m: Any) => m.username === username,
    );
    const denied = await api(
      page,
      'PUT',
      `/team/members/${username}`,
      { displayName: name, role: 'ADMIN', clientIds: [], revision: me.revision },
      false,
    );
    expect(denied.status).toBe(403);
    expect(denied.body.message).toBe('只有管理员能管理团队成员和客户');
    const other = await api(
      page,
      'GET',
      `/clients/${(await api(page, 'GET', '/clients')).body[0].id}/overview`,
    );
    expect(other.status).toBe(200);
    await logout(page);

    // 管理员停用：停用后这个账号登录不了
    await login(page);
    await page.goto(`/team?m=${username}`);
    const d2 = page.getByRole('dialog', { name: `编辑成员 ${name}` });
    await expect(d2).toContainText('正常');
    await d2.getByRole('button', { name: '停用账号' }).click();
    await page
      .getByRole('dialog', { name: `停用 ${name}` })
      .getByRole('button', { name: '停用', exact: true })
      .click();
    await expect(page.getByRole('row', { name: `查看成员 ${name}` })).toContainText('已停用');
    await expect(page.getByRole('dialog', { name: `编辑成员 ${name}` })).toContainText('已停用');
    await page.keyboard.press('Escape');
    await logout(page);
    await page.getByLabel('账号', { exact: true }).fill(username);
    await page.getByLabel('密码', { exact: true }).fill(pw);
    await page.getByRole('button', { name: '进入工作空间' }).click();
    await expect(page.getByText('账号或密码错误')).toBeVisible();
  });

  test('工作负荷空状态和 390 宽成员列表', async ({ page }) => {
    await login(page);
    await page.route('**/api/team/workload', (r) =>
      r.fulfill({
        json: {
          members: [
            {
              username: ADMIN,
              displayName: ADMIN,
              role: 'ADMIN',
              status: 'ACTIVE',
              you: true,
              projects: 0,
              inProgress: 0,
              unreviewed: 0,
              running: 0,
              reviewedThisWeek: 0,
              items: [],
            },
          ],
          clients: [],
          unassignedProjects: 0,
        },
      }),
    );
    await page.goto('/team/workload');
    await expect(page.getByText('你能进的客户里还没有项目')).toBeVisible();
    await shot(page, '08-workload-empty-mock.png');
    await page.unroute('**/api/team/workload');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/team');
    await expect(page.getByRole('heading', { name: '成员与权限' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await shot(page, '09-members-390-real.png');
    for (const route of ['/team/new', '/team/roles', '/team/workload', '/team/contacts']) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        route,
      ).toBe(true);
    }
  });
});
