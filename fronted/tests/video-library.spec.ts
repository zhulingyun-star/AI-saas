import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * 资产库和投放数据。
 * 第一组用 page.route 拦截的假接口（数字都是测试里编的，只用来测页面逻辑）：筛选、分组、空状态、哪种赢了、该换新了。
 * 第二组跑在本机开发后端上（127.0.0.1:18090 的 H2，不是 8088 那套）：手填一条、改、删；CSV 导入（含错误行、手动指认、跳过）；
 * 从资产库接力跳回项目的出片步。测试写进去的投放记录备注都是「自动验收」，开始和结束都会删掉，不调用任何模型或视频接口。
 * 设了 IMPL4_SHOTS 时顺便把截图存到那个目录。
 */
const SHOTS = process.env.IMPL4_SHOTS;
const shot = async (page: Page, name: string, fullPage = true) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), fullPage });
};

// ---------------------------------------------------------------------------
// 假数据
const C = 'c';
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#bbb"/></svg>';
type Any = Record<string, any>;
const perf = (ctr: number, cvr: number | null, roi: number | null, records = 5): Any => ({
  records,
  from: '2026-11-12',
  to: '2026-11-21',
  impressions: 100000,
  clicks: Math.round(ctr * 1000),
  ctr,
  cvr,
  roi,
  retain3s: 38,
  negativeRate: 0.4,
});
const video = (id: string, x: Any): Any => ({
  id,
  code: id.padEnd(8, '0'),
  projectId: x.projectId ?? 'p1',
  projectName: x.projectName ?? '新百伦鞋子 · 框架模式',
  mode: x.mode ?? 'FRAMEWORK',
  projectFlow: true,
  projectPath: `/p/${x.projectId ?? 'p1'}`,
  no: x.no ?? 1,
  jobNo: x.no ?? 1,
  status: 'REVIEW',
  message: '已生成',
  hasOutput: true,
  createdAt: x.createdAt ?? '2026-11-10T02:00:00',
  updatedAt: '2026-11-10T02:00:00',
  ratio: '9:16',
  resolution: '720p',
  duration: x.duration ?? 15,
  note: '首版：按已确认的分镜出片',
  product: { anchorId: x.anchor ?? 'shoe', name: x.product ?? '新百伦 992', coverId: 'img' },
  reference: x.reference ?? null,
  direction:
    x.direction === null ? null : (x.direction ?? { id: 'd1', title: '放一起对比', letter: 'A' }),
  hook: x.hook ?? '',
  personaName: x.persona ?? '',
  scene: x.scene ?? '',
  contentType: '',
  verdict: x.verdict ?? null,
  hasPrice: false,
  adName: `新百伦992_${x.hook ?? '未标开头'}_${x.persona ?? '未标人群'}_未标场景_15秒_v1_${id}`,
  perf: x.perf ?? null,
  tired: x.tired ?? [],
});
const VIDEOS = [
  video('v1', {
    hook: '对比型',
    persona: '通勤上班族',
    perf: perf(3.2, 2.5, 2.4),
    verdict: { rating: 'GOOD', reason: '', use: 'USABLE', revision: 1, by: 'admin', at: '' },
  }),
  video('v2', { hook: '对比型', persona: '学生', perf: perf(3.0, 2.1, 2.1), no: 2 }),
  video('v3', {
    hook: '痛点型',
    persona: '通勤上班族',
    perf: perf(2.2, 1.9, 1.8),
    tired: ['点击率掉了 30% 以上'],
    direction: { id: 'd2', title: '痛点开场', letter: 'B' },
  }),
  video('v4', {
    hook: '痛点型',
    persona: '学生',
    perf: perf(2.0, null, 1.6),
    mode: 'ONE_CLICK',
    projectName: '新百伦鞋子 · 一键成片',
    projectId: 'p2',
    direction: { id: 'd3', title: '痛点直给', letter: '' },
  }),
  video('v5', {
    mode: 'REMAKE',
    projectName: '新百伦鞋子 · 视频二创',
    projectId: 'p3',
    direction: null,
    reference: { assetId: 'r1', name: '防晒隔离霜' },
    hook: '痛点型',
    duration: 19,
    verdict: {
      rating: 'BAD',
      reason: '第 5 镜颜色偏黄',
      use: null,
      revision: 1,
      by: 'admin',
      at: '',
    },
  }),
  video('v6', {
    hook: '悬念型',
    persona: '学生',
    product: '白 T 恤',
    anchor: 'shirt',
    projectName: '白 T 恤 · 框架模式',
    projectId: 'p4',
    perf: perf(1.6, 0.9, 1.1, 2),
  }),
];
async function mock(page: Page, videos: Any[]) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (v: unknown, status = 200) => route.fulfill({ status, json: v });
    if (p === '/api/auth/me') return json({ username: 'admin' });
    if (p === '/api/auth/csrf') return json({ token: 't', headerName: 'X-CSRF-TOKEN' });
    if (p === '/api/clients')
      return json([{ id: C, name: '轻羽 · 服饰内容组', category: '服饰鞋包' }]);
    if (/\/assets\/[^/]+\/file$/.test(p))
      return route.fulfill({ contentType: 'image/svg+xml', body: svg });
    if (p.endsWith('/video-library')) return json({ videos, pendingVersions: 3, hooks: [] });
    const one = p.match(/\/video-library\/([^/]+)$/);
    if (one) {
      const v = videos.find((x) => x.id === one[1]);
      if (!v) return json({ message: '这条成片不存在' }, 404);
      const tired = v.tired.length > 0;
      return json({
        ...v,
        segments: [{ key: 'style', title: '画面风格', text: '明亮自然光' }],
        carriedReasons: [],
        madeOn: '2026-11-10',
        records: v.perf
          ? Array.from({ length: 7 }, (_, i) => ({
              id: `r${i}`,
              jobId: v.id,
              from: `2026-11-${String(20 - i).padStart(2, '0')}`,
              to: `2026-11-${String(20 - i).padStart(2, '0')}`,
              impressions: 10000,
              clicks: tired ? [150, 150, 150, 250, 300, 300, 300][i] : 320,
              retain3s: 38,
              negativeRate: 0.4,
              orders: 6,
              roi: 2,
              note: '',
              source: 'IMPORT',
              revision: 0,
              updatedBy: 'admin',
              updatedAt: '',
            }))
          : [],
        signals: v.perf
          ? [
              {
                key: 'ctrDrop',
                title: '点击率掉了 30% 以上',
                hit: tired,
                detail: tired
                  ? '最近 7 条记录里，后 3 条平均点击率 1.5%，比前 3 条的 3.0% 低了 50%'
                  : '最近 7 条记录里，后 3 条平均点击率 3.2%，比前 3 条的 3.2% 没有下降',
              },
              {
                key: 'negative',
                title: '负反馈超过 0.8%',
                hit: false,
                detail: '最近 3 条记录的平均负反馈率 0.40%',
              },
              {
                key: 'retain',
                title: '有效播放低于 25%',
                hit: false,
                detail:
                  '最近 3 条记录的 3 秒留存平均 38%（表里没有「有效播放」这一项，先用 3 秒留存看）',
              },
            ]
          : null,
      });
    }
    if (p.endsWith('/performance-imports')) return json([]);
    return json({});
  });
}

test.describe('资产库（拦截的假接口）', () => {
  test('列表：筛选、按分类分组、排序，没数据的显示「还没填投放数据」', async ({ page }) => {
    await mock(page, VIDEOS);
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: '全部成片', exact: true })).toBeVisible();
    const cards = page.locator('.gy-vcard');
    await expect(cards).toHaveCount(6);
    await expect(page.getByRole('link', { name: /新百伦鞋子 · 视频二创 · 第 1 版/ })).toContainText(
      '还没填投放数据',
    );
    await expect(page.getByRole('link', { name: /方向 B · 第 1 版/ })).toContainText('该换新了');
    // 筛选：商品 + 开头类型
    await page.getByLabel('按商品筛选').selectOption('新百伦 992');
    await expect(cards).toHaveCount(5);
    await page.getByLabel('按开头类型筛选').selectOption('痛点型');
    await expect(cards).toHaveCount(3);
    await page.getByLabel('按审片状态筛选').selectOption('待审片');
    await expect(cards).toHaveCount(2);
    await page.getByLabel('按创作方式筛选').selectOption('简易');
    await expect(cards).toHaveCount(1);
    await page.getByLabel('按人群筛选').selectOption('通勤上班族');
    await expect(page.getByText('没有符合筛选的成片')).toBeVisible();
    await page.getByRole('button', { name: '清除筛选' }).click();
    await expect(cards).toHaveCount(6);
    // 排序：点击率高的在前，没填数据的在最后
    await page.getByRole('group', { name: '排序' }).getByRole('button', { name: '点击率' }).click();
    await expect(cards.first()).toContainText('3.2%');
    await expect(cards.last()).toContainText('还没填投放数据');
    await page.getByLabel('只看填了投放数据的').click();
    await expect(page.getByLabel('只看填了投放数据的')).toBeChecked();
    await expect(cards).toHaveCount(5);
    await page.getByLabel('只看填了投放数据的').click();
    await expect(cards).toHaveCount(6);
    // 左栏分类方式：按开头类型分组
    await page
      .getByRole('navigation', { name: '资产库' })
      .getByRole('link', { name: '按开头类型' })
      .click();
    await expect(page.getByRole('heading', { name: '全部成片 · 按开头类型分组' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: '开头类型：痛点型' }).locator('.gy-vcard'),
    ).toHaveCount(3);
    await expect(
      page.getByRole('region', { name: '开头类型：对比型' }).locator('.gy-vcard'),
    ).toHaveCount(2);
    await page
      .getByRole('navigation', { name: '资产库' })
      .getByRole('link', { name: '按方向' })
      .click();
    await expect(page.getByRole('region', { name: '方向：复刻：防晒隔离霜' })).toBeVisible();
    await page
      .getByRole('navigation', { name: '资产库' })
      .getByRole('link', { name: '按审片状态' })
      .click();
    await expect(
      page.getByRole('region', { name: '审片状态：可投放' }).locator('.gy-vcard'),
    ).toHaveCount(1);
    await expect(
      page.getByRole('region', { name: '审片状态：已审片' }).locator('.gy-vcard'),
    ).toHaveCount(1);
    await shot(page, '01-list-grouped-mock.png');
    await page
      .getByRole('navigation', { name: '资产库' })
      .getByRole('link', { name: '全部成片' })
      .click();
    await page.getByLabel('按开头类型筛选').selectOption('对比型');
    await shot(page, '02-list-filtered-mock.png');
    await page.getByRole('link', { name: /方向 A · 第 1 版/ }).click();
    await expect(page).toHaveURL(/\/library\/v1$/);
  });

  test('空状态：没有成片、哪种赢了和该换新了都不编数字', async ({ page }) => {
    await mock(page, []);
    await page.goto('/library');
    await expect(page.getByText('还没有出好的成片')).toBeVisible();
    await expect(page.getByText('现在有 3 版还没出好或没出成功')).toBeVisible();
    await shot(page, '03-empty-list-mock.png');
    await page.goto('/library/win');
    await expect(page.getByText('还没有成片填了投放数据，比不出来')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await shot(page, '04-win-empty-mock.png');
    await page.goto('/library/tired');
    await expect(page.getByText('还没有成片填了投放数据，判断不了')).toBeVisible();
  });

  test('哪种赢了：只用填了数据的成片分组比，条数少的标出来', async ({ page }) => {
    await mock(page, VIDEOS);
    await page.goto('/library/win');
    await expect(page.getByText('5 条有数据的成片（共 6 条）')).toBeVisible();
    const rows = page.locator('.gy-wintbl tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('对比型');
    await expect(rows.first()).toContainText('3.1%'); // (3.2 + 3.0) ÷ 2
    await expect(rows.first()).toContainText('样本太少，仅供参考');
    await expect(page.getByRole('status').filter({ hasText: '平均点击率' })).toContainText(
      '「对比型」开头的平均点击率比「痛点型」开头高一截',
    );
    // 转化率：v4 没填成交单数，不算进去
    await expect(rows.nth(1)).toContainText('痛点型');
    await expect(rows.nth(1)).toContainText('1.9%');
    await page
      .getByRole('group', { name: '比较维度' })
      .getByRole('button', { name: '人群' })
      .click();
    await expect(rows).toHaveCount(2);
    await page
      .getByRole('group', { name: '比较维度' })
      .getByRole('button', { name: '创作方式' })
      .click();
    await expect(rows).toHaveCount(2);
    await page
      .getByRole('group', { name: '比较维度' })
      .getByRole('button', { name: '开头类型' })
      .click();
    await expect(page.getByRole('heading', { name: /该换新了/ })).toBeVisible();
    await shot(page, '05-win-mock.png');
    await page.getByRole('button', { name: /方向 B · 第 1 版/ }).click();
    await expect(page).toHaveURL(/\/library\/v3$/);
  });

  test('该换新了：列出碰到信号的成片，详情里写清每个信号', async ({ page }) => {
    await mock(page, VIDEOS);
    await page.goto('/library/tired');
    await expect(page.locator('.gy-vcard')).toHaveCount(1);
    await expect(page.locator('.gy-vcard')).toContainText('点击率掉了 30% 以上');
    await shot(page, '06-tired-mock.png');
    await page.locator('.gy-vcard').click();
    const box = page.locator('.gy-tiredbox');
    await expect(box).toContainText('这条碰到了 1 个');
    await expect(box).toContainText('低了 50%');
    await expect(box.locator('li.ok')).toHaveCount(2);
    await shot(page, '07-detail-tired-mock.png');
  });
});

// ---------------------------------------------------------------------------
// 真后端
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
const MARK = '自动验收';
/** 找本机开发库里有成片的客户；把之前验收留下的记录删掉 */
async function realVideos(page: Page) {
  const clients: Any[] = await api(page, 'GET', '/clients');
  for (const c of clients) {
    const lib = await api(page, 'GET', `/clients/${c.id}/video-library`);
    if (lib.videos.length) {
      for (const v of lib.videos) {
        const d = await api(page, 'GET', `/clients/${c.id}/video-library/${v.id}`);
        for (const r of d.records)
          if (String(r.note).includes(MARK))
            await api(
              page,
              'DELETE',
              `/clients/${c.id}/jobs/${v.id}/performance/${r.id}?revision=${r.revision}`,
            );
      }
      return { client: c, videos: lib.videos as Any[] };
    }
  }
  return null;
}
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

test.describe('资产库（本机开发后端）', () => {
  test.beforeEach(async ({ page }) => login(page));

  test('手填一条投放数据：必填、自动算点击率、改、删；不编数字', async ({ page }) => {
    const real = await realVideos(page);
    test.skip(!real, '本机开发库里没有出好的成片');
    const { client, videos } = real!;
    if (client.id !== (await page.evaluate(() => localStorage.getItem('shangzhen-client'))))
      await page.getByLabel('切换客户').selectOption(client.id);
    const v = videos[videos.length - 1];
    const d = await api(page, 'GET', `/clients/${client.id}/video-library/${v.id}`);
    await page.goto(`/library/${v.id}`);
    await expect(page.getByRole('heading', { name: new RegExp(`第 ${v.no} 版`) })).toBeVisible();
    const card = page.locator('#perf');
    if (!d.records.length) await expect(card).toContainText('还没填投放数据');
    await shot(page, '08-detail-real.png');
    await card.getByRole('button', { name: /^填数据$|再填一条/ }).click();
    const form = page.getByRole('group', { name: '填一条投放数据' });
    // 开发库里的成片都是今天出的，投放日期只能是今天（不能早于生成那天，也不能晚于今天）
    const day = d.madeOn;
    await form.getByLabel('开始日期').fill(addDays(day, -1));
    await form.getByLabel('结束日期').fill(addDays(day, -1));
    await form.getByLabel('曝光', { exact: true }).fill('500');
    await form.getByLabel('点击', { exact: true }).fill('9');
    await form.getByRole('button', { name: '保存这一条' }).click();
    await expect(card.getByRole('alert')).toContainText('开始日期早于这条成片生成的日期');
    await form.getByLabel('开始日期').fill(day);
    await form.getByLabel('结束日期').fill(day);
    await form.getByLabel('点击', { exact: true }).fill('900');
    await form.getByLabel('备注').fill(MARK);
    await form.getByRole('button', { name: '保存这一条' }).click();
    await expect(card.getByRole('alert')).toContainText('点击比曝光还多');
    await form.getByLabel('曝光', { exact: true }).fill('12000');
    await form.getByLabel('点击', { exact: true }).fill('360');
    await form.getByLabel('成交单数').fill('9');
    await form.getByLabel('3 秒留存（%）').fill('41.5');
    await expect(form).toContainText('3.00%'); // 点击率自动算
    await expect(form).toContainText('2.50%'); // 转化率自动算
    await shot(page, '09-perf-form-real.png');
    await form.getByRole('button', { name: '保存这一条' }).click();
    await expect(card.locator('.gy-pftiles')).toContainText('12,000');
    await expect(card.locator('.gy-pftiles')).toContainText('3.00%');
    await expect(card).toContainText('至少要 3 条有曝光的记录');
    // 同一天再填一条：日期重叠，不收
    await card.getByRole('button', { name: '再填一条' }).click();
    const again = page.getByRole('group', { name: '填一条投放数据' });
    await again.getByLabel('开始日期').fill(day);
    await again.getByLabel('结束日期').fill(day);
    await again.getByLabel('曝光', { exact: true }).fill('10');
    await again.getByLabel('点击', { exact: true }).fill('1');
    await again.getByRole('button', { name: '保存这一条' }).click();
    await expect(card.getByRole('alert')).toContainText('日期不能重叠');
    await again.getByRole('button', { name: '取消' }).click();
    // 改
    await card.getByRole('button', { name: new RegExp(`改 ${day.slice(5)} 这一条`) }).click();
    const edit = page.getByRole('group', { name: '改这条投放数据' });
    await edit.getByLabel('点击', { exact: true }).fill('240');
    await edit.getByRole('button', { name: '保存这一条' }).click();
    await expect(card.locator('.gy-pftiles')).toContainText('2.00%');
    // 资产库列表里能看到这条的点击率
    await page.goto('/library');
    await expect(
      page.getByRole('link', { name: new RegExp(`第 ${v.no} 版`) }).first(),
    ).toContainText('2.0%');
    await shot(page, '08b-list-real-with-record.png');
    // 删
    await page.goto(`/library/${v.id}`);
    await card.getByRole('button', { name: new RegExp(`删 ${day.slice(5)} 这一条`) }).click();
    await card.getByRole('button', { name: '确定删' }).click();
    await expect(card.locator('.gy-pftiles')).toHaveCount(d.records.length ? 1 : 0);
  });

  test('CSV 导入：认列、对上成片、错误行说明、手动指认和跳过、确认导入', async ({ page }) => {
    const real = await realVideos(page);
    test.skip(!real, '本机开发库里没有出好的成片');
    const { client, videos } = real!;
    if (client.id !== (await page.evaluate(() => localStorage.getItem('shangzhen-client'))))
      await page.getByLabel('切换客户').selectOption(client.id);
    test.skip(videos.length < 2, '要两条成片才能测按编号对上');
    const [v, w] = videos;
    const d = await api(page, 'GET', `/clients/${client.id}/video-library/${v.id}`);
    // 开发库里的成片都是今天出的，日期只能是今天
    const today = d.madeOn as string;
    const csv = [
      '素材名称,视频编号,日期,展示数,点击数,3秒播放率,成交订单数,消耗回报率,负反馈率,点击率,备注',
      `${v.adName},,${today},"10,000",300,40%,5,2.1,0.4%,3%,${MARK}`,
      `随便起的名字,${w.code},${today.replace(/-/g, '/')},8000,200,39%,,,0.5%,,${MARK}`,
      `对不上的名字,,${today},9000,250,,,,,,${MARK}`,
      `${v.adName},,${today},abc,10,,,,,,${MARK}`,
      `${v.adName},,${today},100,10,,,,,,${MARK}`,
      `${v.adName},,11/15,100,10,,,,,,${MARK}`,
      `${v.adName},,${addDays(today, -1)},100,10,,,,,,${MARK}`,
    ].join('\n');
    await page.goto('/library');
    await page.getByRole('button', { name: '导入投放表格' }).click();
    await expect(page.getByRole('heading', { name: '导入投放表格' })).toBeVisible();
    await page.getByLabel('选择投放表格文件').setInputFiles({
      name: '千川素材报表.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('﻿' + csv, 'utf-8'),
    });
    const bar = page.getByRole('toolbar', { name: '这一步的操作' });
    await expect(bar).toContainText('千川素材报表.csv · 7 行 · 能导入 2 行');
    await expect(bar).toContainText('4 行有问题');
    await expect(bar).toContainText('1 行没对上');
    await expect(page.getByLabel('「曝光」用表格里的哪一列')).toHaveValue('3');
    await expect(page.getByLabel('「投产比」用表格里的哪一列')).toHaveValue('7');
    await expect(page.getByText(/没用上的列：点击率/)).toBeVisible();
    await expect(page.getByRole('row', { name: '第 2 行' })).toContainText('按投放用名对上');
    await expect(page.getByRole('row', { name: '第 3 行' })).toContainText('按视频编号对上');
    await expect(page.getByRole('row', { name: '第 5 行' })).toContainText('「曝光」不是数字');
    await expect(page.getByRole('row', { name: '第 6 行' })).toContainText(
      '和第 2 行是同一条成片，日期重叠',
    );
    await expect(page.getByRole('row', { name: '第 7 行' })).toContainText('日期看不懂');
    await expect(page.getByRole('row', { name: '第 8 行' })).toContainText(
      '早于这条成片生成的日期',
    );
    const confirm = bar.getByRole('button', { name: /导入能导入的/ });
    await expect(confirm).toBeDisabled();
    await shot(page, '10-import-preview-real.png');
    // 第 4 行先指认给第二条成片：和第 3 行同一条、同一天，重叠，写明原因；再改成跳过
    await page.getByLabel('第 4 行是哪条成片').selectOption(w.id);
    await expect(page.getByRole('row', { name: '第 4 行' })).toContainText('手动指认');
    await expect(page.getByRole('row', { name: '第 4 行' })).toContainText(
      '和第 3 行是同一条成片，日期重叠',
    );
    await expect(bar).toContainText('能导入 2 行');
    await page.getByLabel('第 4 行是哪条成片').selectOption('skip');
    await expect(bar).toContainText('跳过 1 行');
    await expect(confirm).toBeEnabled();
    await page
      .getByRole('group', { name: '显示哪些行' })
      .getByRole('button', { name: /有问题/ })
      .click();
    await expect(page.locator('.gy-imptbl tbody tr')).toHaveCount(5);
    await confirm.click();
    const done = page.locator('.gy-notice.success');
    await expect(done).toContainText('已导入 2 行');
    await expect(done).toContainText('跳过 1 行');
    await expect(done).toContainText('第 5 行');
    await expect(done).toContainText('第 7 行');
    await shot(page, '11-import-done-real.png');
    await expect(page.getByRole('cell', { name: '千川素材报表.csv' }).first()).toBeVisible();
    // 成片详情里能看到导入的两条
    await page.goto(`/library/${v.id}`);
    const card = page.locator('#perf');
    await expect(card.locator('tbody tr').filter({ hasText: '表格导入' })).toHaveCount(1);
    await expect(card.locator('.gy-pftiles')).toContainText('10,000');
    await expect(card.locator('.gy-pftiles')).toContainText('2.10');
    await shot(page, '12-detail-imported-real.png');
    // 哪种赢了：只有这一条有数据，比不出来，但会显示真实数字
    await page.goto('/library/win');
    await expect(page.getByRole('status').filter({ hasText: '只有「' })).toBeVisible();
    await shot(page, '13-win-real-one-video.png');
    await realVideos(page); // 清掉
  });

  test('接力：从资产库「换开头」跳回项目出片步，打开这一版的改法', async ({ page }) => {
    const real = await realVideos(page);
    test.skip(!real, '本机开发库里没有出好的成片');
    const { client, videos } = real!;
    const v = videos.find((x) => x.projectFlow);
    test.skip(!v, '没有新版详情里的成片');
    if (client.id !== (await page.evaluate(() => localStorage.getItem('shangzhen-client'))))
      await page.getByLabel('切换客户').selectOption(client.id);
    await page.goto(`/library/${v.id}`);
    await expect(page.getByRole('button', { name: /换价格说法/ })).toBeDisabled();
    await shot(page, '14-relay-card-real.png');
    await page.getByRole('button', { name: /^换开头/ }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${v.projectId}\\?step=4`));
    const ask = page.getByLabel('一句话说要怎么改');
    await expect(ask).toHaveValue(/开头从「.*」换成「.*」/);
    await expect(page.getByText(`接力 · 换开头 · 基于「第 ${v.no} 版」`)).toBeVisible();
    await expect(page).not.toHaveURL(/relay=/);
    await shot(page, '15-relay-landed-real.png', false);
    // 项目里每一版都能「在资产库打开」
    await page.getByRole('link', { name: '在资产库打开' }).first().click();
    await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  });

  test('390 宽：资产库列表和成片详情不横向溢出', async ({ page }) => {
    const real = await realVideos(page);
    test.skip(!real, '本机开发库里没有出好的成片');
    const { client, videos } = real!;
    if (client.id !== (await page.evaluate(() => localStorage.getItem('shangzhen-client'))))
      await page.getByLabel('切换客户').selectOption(client.id);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of ['/library', `/library/${videos[0].id}`, '/library/import']) {
      await page.goto(url);
      await page.waitForTimeout(400);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(over, url).toBeLessThanOrEqual(1);
    }
    await page.goto(`/library/${videos[0].id}`);
    await shot(page, '16-detail-390-real.png');
    await page.goto('/library');
    await expect(page.locator('.gy-vcard')).toHaveCount(videos.length);
    await shot(page, '17-list-390-real.png');
  });
});
