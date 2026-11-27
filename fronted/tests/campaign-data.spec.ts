import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 投流数据回流（PRD §8 验收 A1–A8）。
 * 跑在本机开发后端上（127.0.0.1:18090 的 H2，不是 8088 那套）：要有一个客户里有已经命名的成片（本地演示数据见交付说明）。
 * 测试自己建一个「验收账户」，导入的千川素材 ID 都以 e2e- 开头；开始前把上次留下的 e2e- 记录删掉，重复跑结果一样。
 * A6 的接受 / 忽略 / 已执行有两部分：拦截假接口的完整流转（每次都一样），和真后端上有待处理建议时真处理一条。
 * 设了 QC_SHOTS 时把截图存到那个目录。不调用任何模型、视频接口或千川接口。
 */
const SHOTS = process.env.QC_SHOTS;
const shot = async (page: Page, name: string, fullPage = true) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), fullPage });
};
type Any = Record<string, any>;
const NAME = /^\d{6}-[^-]{2,10}-(图文|短视频|直播切片)-[^-]{2,10}-V\d{1,2}$/;
const E2E_ADV = '1789000000009999';
const DAY = '2026-11-16';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME ?? 'admin');
  await page
    .getByLabel('密码', { exact: true })
    .fill(process.env.E2E_PASSWORD ?? 'change-me-local');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '全部项目', exact: true })).toBeVisible();
}
async function api(page: Page, method: string, url: string, data?: unknown) {
  const { token } = await (await page.request.get('/api/auth/csrf')).json();
  const r = await page.request.fetch(`/api${url}`, {
    method,
    data,
    headers: { 'X-CSRF-TOKEN': token },
  });
  expect(r.ok(), `${method} ${url}: ${await r.text()}`).toBeTruthy();
  return r.json();
}
/** 找有命名成片的客户；删掉上次验收留下的 e2e- 记录；建好（或找到）验收账户 */
async function setup(page: Page) {
  const clients: Any[] = await api(page, 'GET', '/clients');
  for (const c of clients) {
    const lib = await api(page, 'GET', `/clients/${c.id}/video-library`);
    const named = (lib.videos as Any[]).filter((v) => v.standardName);
    if (named.length < 3) continue;
    for (const v of lib.videos as Any[]) {
      const d = await api(page, 'GET', `/clients/${c.id}/video-library/${v.id}`);
      for (const r of d.records)
        if (String(r.materialId ?? '').startsWith('e2e-'))
          await api(
            page,
            'DELETE',
            `/clients/${c.id}/jobs/${v.id}/performance/${r.id}?revision=${r.revision}`,
          );
    }
    const accs: Any[] = (await api(page, 'GET', `/clients/${c.id}/analytics/accounts`)).items;
    let acc = accs.find((a) => a.advertiserId === E2E_ADV);
    if (!acc)
      acc = await api(page, 'POST', `/clients/${c.id}/analytics/accounts`, {
        name: '验收账户',
        advertiserId: E2E_ADV,
      });
    else if (acc.status !== 'ACTIVE')
      acc = await api(page, 'PUT', `/clients/${c.id}/analytics/accounts/${acc.id}`, {
        name: acc.name,
        advertiserId: acc.advertiserId,
        status: 'ACTIVE',
        revision: acc.revision,
      });
    if (c.id !== (await page.evaluate(() => localStorage.getItem('shangzhen-client'))))
      await page.getByLabel('切换客户').selectOption(c.id);
    const fresh = await api(page, 'GET', `/clients/${c.id}/video-library`);
    return { client: c, clients, videos: fresh.videos as Any[], account: acc as Any };
  }
  return null;
}

test.describe('投流数据回流（本机开发后端）', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await login(page);
  });

  test('A1 命名：卡片显示标准命名、复制命名；同商品同人同日版本递增；只能改简称 / 形式 / 版本', async ({
    page,
  }) => {
    const s = await setup(page);
    test.skip(!s, '本机开发库里没有已命名的成片');
    const { client, videos } = s!;
    const named = videos.filter((v) => v.standardName);
    for (const v of named) expect(v.standardName).toMatch(NAME);
    // 同一天、同一商品简称、同一创作者：V1、V2…
    const series = new Map<string, number[]>();
    for (const v of named) {
      const [d, p, , c, ver] = v.standardName.split('-');
      const k = `${d}-${p}-${c}`;
      series.set(k, [...(series.get(k) ?? []), Number(ver.slice(1))]);
    }
    const multi = [...series.values()].find((x) => x.length > 1);
    expect(multi, '至少有一组同一天同一人的成片').toBeTruthy();
    expect([...multi!].sort((a, b) => a - b)).toEqual(
      multi!.map((_, i) => i + 1).sort((a, b) => a - b),
    );
    await page.goto('/library');
    const first = named[0];
    const card = page
      .locator('.gy-vcard')
      .filter({ has: page.getByText(first.standardName, { exact: true }) });
    await expect(card).toHaveCount(1);
    await card.getByRole('button', { name: `复制命名 ${first.standardName}` }).click();
    await expect(page.getByRole('status').filter({ hasText: '命名已复制' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first.standardName);
    if (videos.some((v) => !v.standardName))
      await expect(page.locator('.gy-vcard .gy-unnamed').first()).toBeVisible();
    await shot(page, '01-library-cards-naming.png', false);
    // 详情：改商品简称和版本，改完再改回去
    const target = named[named.length - 1];
    await page.goto(`/library/${target.id}`);
    const kv = page.locator('.gy-vplayer');
    await expect(kv).toContainText(target.standardName);
    await kv.getByRole('button', { name: '改命名' }).click();
    const box = page.getByRole('group', { name: '改命名' });
    await expect(box).toContainText('不能改');
    await box.getByLabel('商品简称').fill('验收简称');
    await box.getByLabel('版本').fill('9');
    await box.getByRole('button', { name: '保存' }).click();
    const [d, , form, c] = target.standardName.split('-');
    await expect(kv).toContainText(`${d}-验收简称-${form}-${c}-V9`);
    await shot(page, '02-detail-naming.png', false);
    await kv.getByRole('button', { name: '改命名' }).click();
    await box.getByLabel('商品简称').fill(target.naming.productShort);
    await box.getByLabel('版本').fill(String(target.naming.version));
    await box.getByRole('button', { name: '保存' }).click();
    await expect(kv).toContainText(target.standardName);
    const again = await api(page, 'GET', `/clients/${client.id}/video-library/${target.id}`);
    expect(again.standardName).toBe(target.standardName);
  });

  test('A2 导入：选账户和日期，预览匹配状态、手动关联、错误行；确认入库；再导一次是更新', async ({
    page,
  }) => {
    const s = await setup(page);
    test.skip(!s, '本机开发库里没有已命名的成片');
    const { client, videos, account } = s!;
    // 用较早生成的成片（最新的两条留给旧的导入用例）
    const named = videos.filter((v) => v.standardName && v.createdAt.slice(0, 10) <= DAY);
    test.skip(named.length < 2, '要两条 11-16 以前生成的已命名成片');
    const [x, y] = named;
    const other = videos.find(
      (v) => v.id !== x.id && v.id !== y.id && v.createdAt.slice(0, 10) <= DAY,
    )!;
    const csv = [
      '素材ID,素材名称,日期,消耗,成交金额,成交订单数,支付ROI,退款金额,退款订单数,1小时退款率,智能优惠券金额',
      `e2e-1,${x.standardName},${DAY},320,1300,26,4.06,100,2,12%,10`,
      `e2e-2,${y.standardName}_副本,${DAY},210,400,8,1.9,40,1,8%,`,
      `e2e-3,对不上的素材名,${DAY},90,120,3,1.33,0,0,5%,`,
      `e2e-4,${x.standardName},${DAY},abc,10,1,,0,0,,`,
    ].join('\n');
    const file = {
      name: '千川素材分析_验收.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('﻿' + csv, 'utf-8'),
    };
    await page.goto('/library/data/import');
    await expect(page.getByRole('heading', { name: '导入投放表格' })).toBeVisible();
    await page.getByLabel('千川账户').selectOption(account.id);
    await page.getByLabel('数据开始日期').fill(DAY);
    await page.getByLabel('数据结束日期').fill(DAY);
    await page.getByLabel('选择投放表格文件').setInputFiles(file);
    const bar = page.getByRole('toolbar', { name: '这一步的操作' });
    await expect(bar).toContainText('4 行 · 能导入 2 行');
    await expect(bar).toContainText('1 行有问题');
    await expect(bar).toContainText('1 行没对上');
    await expect(page.getByLabel('「千川素材 ID」用表格里的哪一列')).toHaveValue('0');
    await expect(page.getByLabel('「消耗（元）」用表格里的哪一列')).toHaveValue('3');
    await expect(page.getByRole('row', { name: '第 2 行' })).toContainText('按命名对上');
    await expect(page.getByRole('row', { name: '第 3 行' })).toContainText('按命名对上（带后缀）');
    await expect(page.getByRole('row', { name: '第 4 行' })).toContainText('没对上');
    await expect(page.getByRole('row', { name: '第 5 行' })).toContainText(
      '「消耗（元）」不是数字',
    );
    await expect(page.getByRole('row', { name: '第 2 行' })).toContainText('¥320 / ¥1,300');
    const confirm = bar.getByRole('button', { name: /导入能导入的/ });
    await expect(confirm).toBeDisabled();
    await shot(page, '05-import-preview.png');
    // 没对上的手动关联到一条成片
    await page.getByLabel('搜成片').fill(other.code);
    await page.getByLabel('第 4 行是哪条成片').selectOption(other.id);
    await expect(page.getByRole('row', { name: '第 4 行' })).toContainText('手动指认');
    await expect(bar).toContainText('能导入 3 行');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    const done = page.locator('.gy-notice.success');
    await expect(done).toContainText('已导入 3 行');
    await expect(done).toContainText('第 5 行');
    await shot(page, '06-import-result.png');
    const d = await api(page, 'GET', `/clients/${client.id}/video-library/${x.id}`);
    const rec = d.records.find((r: Any) => r.materialId === 'e2e-1');
    expect(rec.cost).toBe(320);
    expect(rec.netGmv).toBe(1200);
    expect(rec.netOrders).toBe(24);
    expect(rec.accountId).toBe(account.id);
    // 同一个文件再导一次：同一素材同一天是更新，不新增
    await page.getByLabel('选择投放表格文件').setInputFiles(file);
    // 上次手动关联的素材 ID 记住了是哪条成片
    await expect(bar).toContainText('其中更新 3 行');
    await expect(page.getByRole('row', { name: '第 2 行' })).toContainText('更新这一天');
    await expect(page.getByRole('row', { name: '第 4 行' })).toContainText('按素材 ID 对上');
    await bar.getByRole('button', { name: /导入能导入的/ }).click();
    await expect(done).toContainText('已导入 0 行，更新 3 行');
    const after = await api(page, 'GET', `/clients/${client.id}/video-library/${x.id}`);
    expect(after.records.filter((r: Any) => r.materialId === 'e2e-1')).toHaveLength(1);
  });

  test('A3 素材看板：12 列、6 个汇总卡、排序、筛选、分页，净 / 整体 ROI 对照和高亮', async ({
    page,
  }) => {
    const s = await setup(page);
    test.skip(!s, '本机开发库里没有已命名的成片');
    const { client } = s!;
    const board = await api(page, 'GET', `/clients/${client.id}/analytics/materials`);
    test.skip(!board.total, '本机开发库里没有千川数据');
    await page.goto('/library/data');
    await expect(page).toHaveURL(/\/library\/data\/materials/);
    await expect(page.getByRole('heading', { name: '投流看板' })).toBeVisible();
    const sum = page.getByRole('group', { name: '汇总' });
    for (const t of [
      '总消耗',
      '净成交金额',
      '净成交订单',
      '平均净 ROI',
      '平均 1 小时退款率',
      '素材数',
    ])
      await expect(sum).toContainText(t);
    await expect(sum).toContainText(String(board.summary.materialCount));
    const table = page.getByRole('table', { name: '素材明细' });
    await expect(table.locator('thead th')).toHaveCount(12);
    for (const h of [
      '素材信息',
      '净成交 ROI',
      '净成交金额',
      '净成交订单',
      '净结算率',
      '1 小时退款率',
      '整体支付 ROI',
      '整体成交金额',
      '整体消耗',
      '数据天数',
    ])
      await expect(table.locator('thead')).toContainText(h);
    await expect(table.locator('tbody tr')).toHaveCount(Math.min(50, board.total));
    // 默认按净成交金额降序；第一行和接口一致
    await expect(table.locator('tbody tr').first()).toContainText(
      board.items[0].standardName ?? '未规范化',
    );
    // 高亮：净 ROI ≥ 3 绿、< 1 红；1 小时退款率 > 30% 红
    for (const r of board.items as Any[]) {
      const row = table
        .locator('tbody tr')
        .filter({ hasText: r.standardName ?? r.title })
        .first();
      if (r.netRoi != null && r.netRoi >= 3) await expect(row.locator('td.good')).toHaveCount(1);
      if (r.netRoi != null && r.netRoi < 1)
        await expect(row.locator('td.bad').first()).toBeVisible();
      if (r.refundRate1h != null && r.refundRate1h > 30)
        await expect(row.locator('td.bad').first()).toBeVisible();
    }
    expect(
      board.items.some((r: Any) => r.netRoi >= 3) || board.items.some((r: Any) => r.netRoi < 1),
    ).toBeTruthy();
    await shot(page, '07-materials-board.png');
    // 排序：点「净成交 ROI」升序
    await table.getByRole('button', { name: /净成交 ROI/ }).click();
    await table.getByRole('button', { name: /净成交 ROI/ }).click();
    await expect(page).toHaveURL(/sort=netRoi&order=asc/);
    const asc = await api(
      page,
      'GET',
      `/clients/${client.id}/analytics/materials?sort=netRoi&order=asc`,
    );
    await expect(table.locator('tbody tr').first()).toContainText(
      asc.items[0].standardName ?? '未规范化',
    );
    await expect(table.locator('thead th[aria-sort="ascending"]')).toContainText('净成交 ROI');
    // 筛选：千川账户、创作者
    const acc =
      board.options.accounts.find((a: Any) => a.advertiserId !== E2E_ADV) ??
      board.options.accounts[0];
    await page.getByLabel('按千川账户筛选').selectOption(acc.id);
    const byAcc = await api(
      page,
      'GET',
      `/clients/${client.id}/analytics/materials?accountId=${acc.id}`,
    );
    await expect(page.getByText(`共 ${byAcc.total} 条 · 第 1 / 1 页`)).toBeVisible();
    await page.getByRole('button', { name: '清除筛选' }).click();
    const cr = board.options.creators[0];
    await page.getByLabel('按创作者筛选').selectOption(cr.id);
    const byCr = await api(
      page,
      'GET',
      `/clients/${client.id}/analytics/materials?creator=${cr.id}`,
    );
    await expect(table.locator('tbody tr')).toHaveCount(byCr.total);
    for (const r of byCr.items as Any[]) expect(r.creator).toBe(cr.name);
    // 分页：每页 50 条（接口按 size 也能分）
    const p2 = await api(page, 'GET', `/clients/${client.id}/analytics/materials?size=2&page=2`);
    expect(p2.items.length).toBeLessThanOrEqual(2);
    expect(p2.page).toBe(2);
    // 点素材跳成片详情
    await page.getByRole('button', { name: '清除筛选' }).click();
    await table.locator('tbody tr').first().getByRole('link').click();
    await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  });

  test('A4 商品看板：只有 3 列和顶部提示，点商品带着筛选去素材看板', async ({ page }) => {
    const s = await setup(page);
    test.skip(!s, '本机开发库里没有已命名的成片');
    const { client } = s!;
    const prods = await api(page, 'GET', `/clients/${client.id}/analytics/products`);
    test.skip(!prods.items.length, '本机开发库里没有千川数据');
    await page.goto('/library/data/products');
    await expect(
      page.getByText(
        '商品整体效果包含非本系统生产素材的贡献，相关指标暂不展示。请查看素材维度了解平台生产素材的真实表现。',
      ),
    ).toBeVisible();
    const table = page.getByRole('table', { name: '商品明细' });
    await expect(table.locator('thead th')).toHaveCount(3);
    await expect(table.locator('thead')).not.toContainText('ROI');
    await expect(table.locator('thead')).not.toContainText('消耗');
    await shot(page, '08-products-board.png');
    const first = prods.items.find((x: Any) => x.productId);
    await table.getByRole('link', { name: first.productName }).click();
    await expect(page).toHaveURL(
      new RegExp(`/library/data/materials\\?product=${first.productId}`),
    );
    await expect(page.getByLabel('按商品筛选')).toHaveValue(first.productId);
    const only = await api(
      page,
      'GET',
      `/clients/${client.id}/analytics/materials?product=${first.productId}`,
    );
    expect(only.total).toBe(first.materialCount);
  });

  test('账户维度：管理（添加、改、停用）和数据看板', async ({ page }) => {
    const s = await setup(page);
    test.skip(!s, '本机开发库里没有已命名的成片');
    await page.goto('/library/data/accounts');
    const board = page.getByRole('table', { name: '账户数据' });
    await expect(board.locator('thead th')).toHaveCount(7);
    await expect(board).toContainText('验收账户');
    await shot(page, '09b-accounts-board.png');
    await page.getByRole('tab', { name: '账户管理' }).click();
    const list = page.getByRole('table', { name: '千川账户' });
    await expect(list).toContainText(E2E_ADV);
    // 广告主 ID 不对 / 重复：给出原因
    await page.getByRole('button', { name: '添加账户' }).first().click();
    const dlg = page.getByRole('dialog', { name: '添加千川账户' });
    await dlg.getByLabel('账户名称').fill('重复的账户');
    await dlg.getByLabel('千川广告主 ID').fill('abc');
    await dlg.getByRole('button', { name: '保存' }).click();
    await expect(dlg.getByRole('alert')).toContainText('6 到 30 位数字');
    await dlg.getByLabel('千川广告主 ID').fill(E2E_ADV);
    await dlg.getByRole('button', { name: '保存' }).click();
    await expect(dlg.getByRole('alert')).toContainText('已经在客户');
    await dlg.getByRole('button', { name: '取消' }).click();
    await shot(page, '09-accounts-manage.png');
    // 停用再启用
    const row = list.locator('tbody tr').filter({ hasText: E2E_ADV });
    await row.getByRole('button', { name: '停用' }).click();
    await expect(row).toContainText('已停用');
    await row.getByRole('button', { name: '启用' }).click();
    await expect(row.getByText('启用', { exact: true })).toBeVisible();
  });

  test('A5 成片详情：有数据显示「投放表现」和近 7 天净 ROI 走势，没数据不显示', async ({
    page,
  }) => {
    const s = await setup(page);
    test.skip(!s, '本机开发库里没有已命名的成片');
    const { client, videos } = s!;
    let withData: Any | null = null,
      without: Any | null = null;
    for (const v of videos) {
      const st = await api(page, 'GET', `/clients/${client.id}/jobs/${v.id}/campaign-stats`);
      if (st.hasData && !withData && st.trend.filter((x: Any) => x.netRoi != null).length >= 2)
        withData = v;
      if (!st.hasData && !without) without = v;
    }
    test.skip(!withData, '没有带千川数据的成片');
    await page.goto(`/library/${withData!.id}`);
    const block = page.getByLabel('投放表现');
    await expect(block).toBeVisible();
    for (const t of ['累计消耗', '净成交金额', '净 ROI', '平均 1 小时退款率', '近 7 天净 ROI'])
      await expect(block).toContainText(t);
    await expect(block.locator('svg.gy-roitrend circle').first()).toBeVisible();
    await block.scrollIntoViewIfNeeded();
    await shot(page, '10-detail-campaign.png', false);
    await block.getByRole('link', { name: '查看完整数据 →' }).click();
    await expect(page).toHaveURL(new RegExp(`/library/data/materials\\?job=${withData!.id}`));
    await expect(page.getByRole('table', { name: '素材明细' }).locator('tbody tr')).toHaveCount(1);
    if (without) {
      await page.goto(`/library/${without.id}`);
      await expect(page.locator('#perf')).toBeVisible();
      await expect(page.getByLabel('投放表现')).toHaveCount(0);
    }
  });

  test('A6 投放建议（真后端）：都是「建议…」，不出现「自动」；有待处理的就真处理一条', async ({
    page,
  }) => {
    const s = await setup(page);
    test.skip(!s, '本机开发库里没有已命名的成片');
    const { client } = s!;
    const list = await api(page, 'GET', `/clients/${client.id}/analytics/suggestions?status=ALL`);
    await page.goto('/library/data/suggestions');
    await expect(page.getByRole('heading', { name: '投放建议' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('自动停投');
    await expect(page.locator('body')).not.toContainText('自动加预算');
    for (const x of list.items as Any[]) expect(x.reason).toMatch(/^建议/);
    const pending = (list.items as Any[]).filter((x) => x.status === 'PENDING');
    // 左栏角标 = 待处理条数
    if (pending.length)
      await expect(
        page.getByRole('navigation', { name: '资产库' }).getByLabel(`${pending.length} 条待处理`),
      ).toBeVisible();
    await shot(page, '11-suggestions.png');
    await page.getByRole('tab', { name: '规则' }).click();
    await expect(page.getByLabel(/^规则：/)).toHaveCount(4);
    for (const n of ['高退款预警', '高 ROI 加码', '低效止损', '结算率异常'])
      await expect(page.getByLabel(`启用「${n}」`)).toBeChecked();
    await shot(page, '12-suggestion-rules.png');
    test.skip(!pending.length, '没有待处理的建议，流转由下面的假接口用例和后端测试覆盖');
    await page.getByRole('tab', { name: /待处理/ }).click();
    const one = pending[pending.length - 1];
    const card = page
      .getByLabel(`${one.typeLabel}：${one.job.standardName ?? one.job.title}`)
      .first();
    await card.getByRole('button', { name: '接受' }).click();
    await expect(page.getByRole('status').filter({ hasText: '已接受' })).toBeVisible();
    const after = await api(
      page,
      'GET',
      `/clients/${client.id}/analytics/suggestions?status=ACCEPTED`,
    );
    expect(after.items.some((x: Any) => x.id === one.id)).toBeTruthy();
  });

  test('A7 导出：和当前筛选一致的 CSV，UTF-8 带 BOM', async ({ page }) => {
    const s = await setup(page);
    test.skip(!s, '本机开发库里没有已命名的成片');
    const { client } = s!;
    const board = await api(page, 'GET', `/clients/${client.id}/analytics/materials`);
    test.skip(!board.total, '本机开发库里没有千川数据');
    const acc =
      board.options.accounts.find((a: Any) => a.advertiserId !== E2E_ADV) ??
      board.options.accounts[0];
    await page.goto(`/library/data/materials?accountId=${acc.id}&sort=netRoi&order=asc`);
    const want = await api(
      page,
      'GET',
      `/clients/${client.id}/analytics/materials?accountId=${acc.id}&sort=netRoi&order=asc`,
    );
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: '导出 CSV' }).click(),
    ]);
    const buf = fs.readFileSync((await dl.path())!);
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = buf.toString('utf-8').replace(/^﻿/, '').trim().split(/\r\n/);
    expect(lines[0]).toContain('"素材命名"');
    expect(lines[0]).toContain('"净成交ROI"');
    expect(lines).toHaveLength(want.total + 1);
    want.items.forEach((r: Any, i: number) =>
      expect(lines[i + 1]).toContain(r.standardName ?? '未规范化'),
    );
    expect(dl.suggestedFilename()).toMatch(/^素材投放数据_.*\.csv$/);
  });

  test('A8 多客户：切到另一个客户空间，看不到这个客户的数据', async ({ page }) => {
    const s = await setup(page);
    test.skip(!s, '本机开发库里没有已命名的成片');
    const { client, clients } = s!;
    const other = clients.find((c: Any) => c.id !== client.id);
    test.skip(!other, '只有一个客户');
    const mine = await api(page, 'GET', `/clients/${client.id}/analytics/materials`);
    const theirs = await api(page, 'GET', `/clients/${other.id}/analytics/materials`);
    const mineIds = new Set((mine.items as Any[]).map((x) => x.jobId));
    for (const x of theirs.items as Any[]) expect(mineIds.has(x.jobId)).toBeFalsy();
    expect((theirs.options.accounts as Any[]).some((a) => a.advertiserId === E2E_ADV)).toBeFalsy();
    await page.goto('/library/data/materials');
    await page.getByLabel('按客户空间筛选').selectOption(other.id);
    await expect(page.getByLabel('切换客户')).toHaveValue(other.id);
    if (!theirs.total) {
      await expect(page.getByText('还没有投流数据')).toBeVisible();
      await shot(page, '13-empty-other-client.png', false);
    }
    await page.goto('/library/data/accounts');
    await expect(page.getByText(E2E_ADV)).toHaveCount(0);
    await page.getByLabel('切换客户').selectOption(client.id);
  });

  test('390 宽：看板、导入、建议不横向溢出', async ({ page }) => {
    const s = await setup(page);
    test.skip(!s, '本机开发库里没有已命名的成片');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of [
      '/library/data/materials',
      '/library/data/products',
      '/library/data/accounts',
      '/library/data/import',
      '/library/data/suggestions',
    ]) {
      await page.goto(url);
      await page.waitForTimeout(500);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(over, url).toBeLessThanOrEqual(1);
    }
    await page.goto('/library/data/materials');
    await expect(page.getByRole('group', { name: '汇总' })).toBeVisible();
    await shot(page, '14-materials-390.png');
  });
});

// ---------------------------------------------------------------------------
// A6 流转（拦截的假接口：数字是测试里编的，只测页面上接受 / 忽略 / 已执行和状态切换）
test('A6 投放建议（假接口）：接受 → 已执行、忽略；状态页签跟着变', async ({ page }) => {
  const C = 'c';
  const items: Any[] = [
    {
      id: 's1',
      type: 'STOP',
      typeLabel: '建议停投',
      ruleName: '高退款预警',
      reason: '建议停投：1 小时退款率 38%，存在素材 / 人群错配风险',
    },
    {
      id: 's2',
      type: 'INCREASE_BUDGET',
      typeLabel: '建议加预算',
      ruleName: '高 ROI 加码',
      reason: '建议加预算：净 ROI 4.2 表现稳定，可复制 / 追投',
    },
  ].map((x, i) => ({
    ...x,
    ruleKey: x.type,
    status: 'PENDING',
    revision: 0,
    dataThrough: '2026-11-25',
    createdAt: '2026-11-26T01:00:00',
    snapshot: {
      totalCost: 1200,
      netGmv: 3000 + i,
      netRoi: 2.5,
      netOrders: 30,
      netSettleRate: 80,
      refundRate1h: 38,
      dataDays: 5,
    },
    job: {
      id: `j${i}`,
      standardName: `261105-测试商品-短视频-欣怡-V${i + 1}`,
      title: `测试项目 · 第 ${i + 1} 版`,
    },
  }));
  const decided: string[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (v: unknown, status = 200) => route.fulfill({ status, json: v });
    if (p === '/api/auth/me') return json({ username: 'admin', role: 'BUYER' });
    if (p === '/api/auth/csrf') return json({ token: 't', headerName: 'X-CSRF-TOKEN' });
    if (p === '/api/clients') return json([{ id: C, name: '测试客户', category: '服饰' }]);
    if (p.endsWith('/analytics/suggestions')) {
      const counts: Any = { pending: 0, accepted: 0, rejected: 0, done: 0 };
      for (const x of items) counts[x.status.toLowerCase()]++;
      return json({ items, counts });
    }
    const m = p.match(/\/analytics\/suggestions\/([^/]+)\/decide$/);
    if (m) {
      const body = req.postDataJSON();
      const x = items.find((i) => i.id === m[1])!;
      decided.push(`${x.id}:${body.action}:${body.revision}`);
      x.status = String(body.action).toUpperCase();
      x.revision++;
      x.decidedBy = 'admin';
      x.decidedAt = '2026-11-26T02:00:00';
      return json(x);
    }
    if (p.endsWith('/analytics/overview'))
      return json({
        pendingSuggestions: items.filter((x) => x.status === 'PENDING').length,
        accounts: 1,
        hasData: true,
      });
    if (p.endsWith('/video-library')) return json({ videos: [], pendingVersions: 0, hooks: [] });
    return json({});
  });
  await page.goto('/library/data/suggestions');
  await expect(page.getByRole('tab', { name: '待处理 2' })).toBeVisible();
  const stop = page.getByLabel('建议停投：261105-测试商品-短视频-欣怡-V1');
  await expect(stop).toContainText('建议停投：1 小时退款率 38%');
  await expect(stop).toContainText('¥1,200');
  await stop.getByRole('button', { name: '接受' }).click();
  await expect(page.getByRole('tab', { name: '待处理 1' })).toBeVisible();
  await page
    .getByLabel('建议加预算：261105-测试商品-短视频-欣怡-V2')
    .getByRole('button', { name: '忽略' })
    .click();
  await expect(page.getByRole('tab', { name: '待处理 0' })).toBeVisible();
  await expect(page.getByText('没有待处理的建议')).toBeVisible();
  await page.getByRole('tab', { name: '已接受 1' }).click();
  await page
    .getByLabel('建议停投：261105-测试商品-短视频-欣怡-V1')
    .getByRole('button', { name: '标记已执行' })
    .click();
  await expect(page.getByRole('tab', { name: '已执行 1' })).toBeVisible();
  await page.getByRole('tab', { name: '已执行 1' }).click();
  await expect(page.getByLabel('建议停投：261105-测试商品-短视频-欣怡-V1')).toContainText(
    '已执行 · admin',
  );
  await expect(
    page.getByLabel('建议停投：261105-测试商品-短视频-欣怡-V1').getByRole('button'),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: '已忽略 1' }).click();
  await expect(page.getByLabel('建议加预算：261105-测试商品-短视频-欣怡-V2')).toContainText(
    '已忽略',
  );
  expect(decided).toEqual(['s1:accepted:0', 's2:rejected:0', 's1:done:1']);
  await expect(page.locator('body')).not.toContainText('自动');
});
