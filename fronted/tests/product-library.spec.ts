import { test, expect, type Page, type Route } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfWQAAAAASUVORK5CYII=',
  'base64',
);
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#ddd"/></svg>';

type Json = Record<string, unknown>;
const asset = (id: string, name: string, group: string, extra: Json = {}) => ({
  id,
  clientId: 'c',
  name: `${id}.png`,
  kind: 'PRODUCT',
  sku: '',
  tags: '',
  mime: 'image/png',
  sizeBytes: 3,
  metadata: { productName: name, productGroupId: group, ...extra },
  createdAt: `2026-11-20T10:00:0${id.slice(-1)}`,
});
const REPORT = {
  category: '低帮运动鞋',
  audience: '偏好复古运动风、寻找百搭鞋款的人',
  tone: '简约',
  summary: '灰白拼色低帮运动鞋',
  appearance: '低帮系带，鞋面多材质拼接',
  material: '可见绒面质感，成分待确认',
  usage: '适合日常出行、城市通勤',
  operation: '系带穿脱',
  styling: '可搭配牛仔裤',
  colors: ['浅灰', '白色'],
  pain_points: ['普通运动鞋单调'],
  pitch_lines: ['灰白拼接很耐看'],
  confirm: ['鞋面具体材质成分'],
  showcase_points: [{ part: '鞋舌', where: '上部', what: '印有 992 字样' }],
  provable_points: [
    { claim: '灰白多材质拼接外观', evidence: '图片1、图片2可见', how: '近景展示' },
    { claim: '上脚舒适', evidence: '待验证', how: '需要试穿' },
  ],
  image_views: [
    { image: '1', view: '侧面全貌' },
    { image: '2', view: '后跟特写' },
  ],
  fit_types: [{ type: '对比型广告', why: '细节多' }],
  exaggeration_risks: [{ point: '美国原产', why: '没有产地依据' }],
};

/** 用内存数据模拟商品库接口，记录写请求。 */
async function mockLibrary(page: Page) {
  const state = {
    assets: [
      asset('a1', '灰色运动鞋', 'g1'),
      asset('a2', '灰色运动鞋', 'g1'),
      asset('b1', '白T恤', 'g2'),
    ],
    folders: [] as Json[],
    placement: {} as Record<string, string | null>,
    analyses: {
      g1: {
        status: 'COMPLETED',
        brief: '',
        revision: 1,
        stale: false,
        model: 'test',
        analyzedAt: '2026-11-20T10:00:00Z',
        report: REPORT,
        sources: {
          assets: [
            { id: 'a1', mime: 'image/png' },
            { id: 'a2', mime: 'image/png' },
          ],
        },
      },
    } as Record<string, Json>,
    reviewed: {} as Record<string, boolean>,
    understanding: null as Json | null,
    understandingRevision: 0,
    personas: [] as Json[],
    personasSaved: false,
    writes: [] as { method: string; path: string; body: unknown }[],
    uploads: 0,
  };
  const derived = {
    core: ['灰白多材质拼接外观'],
    sub: ['鞋舌：印有 992 字样'],
    pain: ['普通运动鞋单调'],
    obj: ['鞋面具体材质成分', '上脚舒适（还没验证）'],
    scene: ['日常出行', '城市通勤'],
    when: [],
  };
  const suggestion = {
    id: null,
    name: '偏好复古运动风',
    pain: '普通运动鞋单调',
    want: '灰白多材质拼接外观',
    tone: '',
    scene: '日常出行',
    worry: '鞋面具体材质成分',
    hooks: ['对比型'],
    revision: 0,
  };
  const understandingBody = () => ({
    hasAnalysis: true,
    saved: !!state.understanding,
    understanding: state.understanding ?? derived,
    source: state.understanding ? 'EDITED' : 'DERIVED',
    editedCount: state.understanding ? 1 : 0,
    revision: state.understandingRevision,
    aiEnabled: false,
    personasSaved: state.personasSaved,
    personas: state.personasSaved ? state.personas : [suggestion],
  });
  const groupOf = (anchor: string) =>
    String(state.assets.find((a) => a.id === anchor)?.metadata.productGroupId);
  await page.route('**/api/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    const json = (v: unknown, status = 200) => route.fulfill({ status, json: v });
    let body: unknown = null;
    if (
      !['GET', 'HEAD'].includes(m) &&
      !(req.headers()['content-type'] ?? '').includes('multipart')
    ) {
      try {
        body = req.postDataJSON();
      } catch {
        body = null;
      }
    }
    if (m !== 'GET') state.writes.push({ method: m, path: p, body });
    if (p.endsWith('/auth/me')) return json({ username: 'admin' });
    if (p.endsWith('/auth/csrf')) return json({ token: 't', headerName: 'X-CSRF-TOKEN' });
    if (p === '/api/clients') return json([{ id: 'c', name: '测试客户', category: '服饰鞋包' }]);
    if (p.endsWith('/file')) return route.fulfill({ contentType: 'image/svg+xml', body: SVG });
    if (p === '/api/clients/c/assets' && m === 'GET') return json(state.assets);
    if (p === '/api/clients/c/assets' && m === 'POST') {
      state.uploads += 1;
      const text = req.postDataBuffer()!.toString();
      const group = /name="productGroupId"\r\n\r\n([^\r]+)/.exec(text)![1];
      const name = /name="productName"\r\n\r\n([^\r]+)/.exec(text)![1];
      const a = asset(`n${state.uploads}`, name, group);
      state.assets.push(a);
      return json(a);
    }
    if (p === '/api/clients/c/product-library') {
      const products: Record<string, unknown> = {};
      for (const g of new Set(state.assets.map((a) => String(a.metadata.productGroupId)))) {
        const an = state.analyses[g];
        const r = an?.report as typeof REPORT | undefined;
        products[`group:${g}`] = {
          groupId: g,
          anchorId: state.assets.find((a) => a.metadata.productGroupId === g)!.id,
          folderId: state.placement[g] ?? undefined,
          analysis: an
            ? {
                status: an.status,
                revision: an.revision,
                analyzedAt: an.analyzedAt,
                stale: false,
                hasReport: !!r,
                category: r?.category,
                confirmCount: r?.confirm.length,
                unverifiedCount: 1,
              }
            : undefined,
          reviewed: !!state.reviewed[g],
          confirmed: [],
          understandingSaved: false,
          personaCount: 0,
          projectCount: 0,
        };
      }
      return json({ folders: state.folders, products });
    }
    if (p === '/api/clients/c/product-folders' && m === 'POST') {
      const b = body as Json;
      if (b.parentId && state.folders.find((f) => f.id === b.parentId)?.parentId)
        return json({ message: '文件夹最多两层' }, 400);
      const f = {
        id: `f${state.folders.length + 1}`,
        name: b.name,
        parentId: b.parentId ?? undefined,
        sortOrder: state.folders.length,
        revision: 0,
      };
      state.folders.push(f);
      return json(f);
    }
    const folderMatch = /\/product-folders\/([^/]+)$/.exec(p);
    if (folderMatch && m === 'PUT') {
      const f = state.folders.find((x) => x.id === folderMatch[1])!;
      f.name = (body as Json).name;
      f.revision = Number(f.revision) + 1;
      return json(f);
    }
    const g = /\/product-groups\/([^/]+)/.exec(p);
    if (g) {
      const anchor = g[1];
      const group = groupOf(anchor);
      if (p.endsWith('/folder')) {
        state.placement[group] = ((body as Json).folderId as string) ?? null;
        return json({ groupId: group });
      }
      if (p.endsWith('/review')) {
        state.reviewed[group] = !!(body as Json).reviewed;
        return json(body);
      }
      if (p.endsWith('/cover')) {
        state.assets = state.assets.map((a) =>
          a.metadata.productGroupId === group
            ? { ...a, metadata: { ...a.metadata, coverAssetId: (body as Json).assetId } }
            : a,
        );
        return json(state.assets.filter((a) => a.metadata.productGroupId === group));
      }
      if (p.endsWith('/analysis')) {
        if (m === 'POST') {
          state.analyses[group] = { status: 'QUEUED', brief: '', revision: 1, stale: false };
          return json(state.analyses[group]);
        }
        if (m === 'PUT') {
          const b = body as Json;
          state.analyses[group] = {
            ...state.analyses[group],
            report: b.report,
            revision: Number(b.revision) + 1,
          };
          return json(state.analyses[group]);
        }
        const an = state.analyses[group];
        if (an?.status === 'QUEUED') {
          const ids = state.assets
            .filter((a) => a.metadata.productGroupId === group)
            .map((a) => ({ id: a.id, mime: 'image/png' }));
          state.analyses[group] = {
            ...an,
            status: 'COMPLETED',
            analyzedAt: '2026-11-21T10:00:00Z',
            report: REPORT,
            sources: { assets: ids },
          };
        }
        return json(
          state.analyses[group] ?? { status: 'EMPTY', brief: '', revision: 0, stale: false },
        );
      }
      if (p.endsWith('/understanding/extract')) {
        state.understanding = null;
        return json(understandingBody());
      }
      if (p.endsWith('/understanding')) {
        if (m === 'PUT') {
          state.understanding = (body as Json).understanding as Json;
          state.understandingRevision += 1;
        }
        return json(understandingBody());
      }
      if (p.endsWith('/personas/adopt')) {
        state.personasSaved = true;
        state.personas = [{ ...suggestion, id: 'p1' }];
        return json(understandingBody());
      }
      const personaMatch = /\/personas\/([^/]+)$/.exec(p);
      if (personaMatch && m === 'PUT') {
        const b = body as Json;
        state.personas = state.personas.map((x) =>
          x.id === personaMatch[1]
            ? { ...(b.persona as Json), id: x.id, revision: Number(x.revision) + 1 }
            : x,
        );
        return json(understandingBody());
      }
      if (personaMatch && m === 'DELETE') {
        state.personas = state.personas.filter((x) => x.id !== personaMatch[1]);
        return json(understandingBody());
      }
      if (p.endsWith('/personas') && m === 'POST') {
        if (!state.personasSaved) {
          state.personasSaved = true;
          state.personas = [{ ...suggestion, id: 'p1' }];
        }
        state.personas.push({
          ...(body as Json),
          id: `p${state.personas.length + 1}`,
          revision: 0,
        });
        return json(understandingBody());
      }
    }
    return json([]);
  });
  return state;
}

test('new frame keeps old routes and opens 项目 by default', async ({ page }) => {
  await mockLibrary(page);
  await page.goto('/');
  const top = page.getByRole('navigation', { name: '主栏目' });
  await expect(top.getByRole('link')).toHaveText([
    '项目',
    '商品库',
    '参考视频',
    '资产库',
    '团队管理',
  ]);
  await expect(top.getByRole('link', { name: '项目' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.gy-wordmark')).toHaveText('光影云');
  await expect(page.getByLabel('切换客户')).toHaveValue('c');
  for (const [section, path] of [
    ['参考视频', '/references'],
    ['资产库', '/library'],
    ['团队管理', '/team'],
    ['商品库', '/products'],
  ]) {
    await top.getByRole('link', { name: section }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(top.getByRole('link', { name: section })).toHaveAttribute('aria-current', 'page');
  }
  await page.goto('/models');
  await expect(top.getByRole('link', { name: '资产库' })).toHaveAttribute('aria-current', 'page');
  await expect(
    page
      .getByRole('navigation', { name: '资产库', exact: true })
      .getByRole('link', { name: '模特' }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: '收起左栏' }).click();
  await expect(page.locator('.gy-app')).toHaveClass(/gy-collapsed/);
  await page.getByRole('button', { name: '展开左栏' }).click();
  await expect(page.locator('.gy-app')).not.toHaveClass(/gy-collapsed/);
});

test('folders: create two levels, rename, move a product and filter the list', async ({ page }) => {
  const state = await mockLibrary(page);
  await page.goto('/products');
  await expect(page.getByRole('row', { name: '查看商品 灰色运动鞋' })).toBeVisible();
  await expect(page.getByRole('row', { name: '查看商品 白T恤' })).toBeVisible();
  const side = page.getByRole('navigation', { name: '商品文件夹' });
  await side.getByRole('button', { name: '+ 新建文件夹' }).click();
  await page.getByLabel('新文件夹名称').fill('鞋靴');
  await page.keyboard.press('Enter');
  await expect(side.getByTitle('鞋靴', { exact: true })).toBeVisible();
  await side.getByTitle('鞋靴', { exact: true }).hover();
  await side.getByRole('button', { name: '在 鞋靴 里新建子文件夹' }).click();
  await page.getByLabel('子文件夹名称').fill('运动休闲');
  await page.keyboard.press('Enter');
  await expect(side.getByTitle('运动休闲', { exact: true })).toBeVisible();
  // 子文件夹不能再建下一层
  await side.getByTitle('运动休闲', { exact: true }).hover();
  await expect(side.getByRole('button', { name: '在 运动休闲 里新建子文件夹' })).toHaveCount(0);
  // 全部商品 / 未分类 不能改名
  await expect(side.getByRole('button', { name: /重命名文件夹 (全部商品|未分类)/ })).toHaveCount(0);
  await side.getByTitle('鞋靴', { exact: true }).hover();
  await side.getByRole('button', { name: '重命名文件夹 鞋靴' }).click();
  await page.getByLabel('文件夹名称').fill('鞋子');
  await page.keyboard.press('Enter');
  await expect(side.getByTitle('鞋子', { exact: true })).toBeVisible();
  expect(
    state.writes.find((w) => w.method === 'PUT' && w.path.endsWith('/product-folders/f1'))?.body,
  ).toEqual({ name: '鞋子', revision: 0 });

  await side.getByTitle('全部商品', { exact: true }).click();
  await page.getByRole('row', { name: '查看商品 灰色运动鞋' }).click();
  await page.getByLabel('移动到文件夹').selectOption({ label: '鞋子 / 运动休闲' });
  await expect(
    page.getByRole('status').filter({ hasText: '已移到「鞋子 / 运动休闲」' }),
  ).toBeVisible();
  await page.goto('/products');
  await side.getByTitle('鞋子', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '鞋子', exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: '查看商品 灰色运动鞋' })).toBeVisible();
  await expect(page.getByRole('row', { name: '查看商品 白T恤' })).toHaveCount(0);
  await side.getByTitle('未分类', { exact: true }).click();
  await expect(page.getByRole('row', { name: '查看商品 白T恤' })).toBeVisible();
  await expect(page.getByRole('row', { name: '查看商品 灰色运动鞋' })).toHaveCount(0);
  await side.getByTitle('全部商品', { exact: true }).click();
  await page.getByLabel('搜索商品').fill('T恤');
  await expect(page.getByRole('row', { name: '查看商品 白T恤' })).toBeVisible();
  await expect(page.getByRole('row', { name: '查看商品 灰色运动鞋' })).toHaveCount(0);
});

test('new product: fill, upload and analyze, then review and save', async ({ page }) => {
  const state = await mockLibrary(page);
  await page.goto('/products/new');
  await expect(page.getByRole('button', { name: '分析商品信息' })).toBeDisabled();
  await page
    .getByLabel('选择商品图')
    .setInputFiles(
      ['one.png', 'two.png'].map((name) => ({ name, mimeType: 'image/png', buffer: PNG })),
    );
  await page.getByLabel('商品名称').fill('新鞋子');
  await page.getByLabel('SKU').fill('NEW-1');
  await page.getByRole('button', { name: '把图片2设为封面' }).click();
  await expect(page.getByText('授权')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/费用|价格|充值|预计/);
  await page.getByRole('button', { name: '分析商品信息' }).click();
  await expect(page).toHaveURL(/\/products\/n1\/review$/, { timeout: 15000 });
  expect(state.uploads).toBe(2);
  expect(
    state.writes.some(
      (w) => w.path.endsWith('/product-groups/n1/cover') && (w.body as Json).assetId === 'n2',
    ),
  ).toBeTruthy();
  expect(
    state.writes.some((w) => w.method === 'POST' && w.path.endsWith('/product-groups/n1/analysis')),
  ).toBeTruthy();
  await expect(page.locator('.gy-prog')).toContainText('0 / 4');
  await page.getByRole('button', { name: '本节全部确认' }).first().click();
  await expect(page.locator('.gy-prog')).toContainText('1 / 4');
  await page.getByRole('button', { name: '补充', exact: true }).click();
  await page.getByLabel('补充：鞋面具体材质成分').fill('翻毛皮和网布');
  await page.keyboard.press('Enter');
  await expect(page.getByText('已补充')).toBeVisible();
  await page.getByRole('button', { name: '确认并保存商品' }).click();
  await expect(page).toHaveURL(/\/products\/n1$/);
  const edit = state.writes.find(
    (w) => w.method === 'PUT' && w.path.endsWith('/product-groups/n1/analysis'),
  )!.body as Json;
  expect((edit.report as typeof REPORT).confirm).toEqual([
    '鞋面具体材质成分：翻毛皮和网布（已补充）',
  ]);
  expect(state.writes.find((w) => w.path.endsWith('/product-groups/n1/review'))!.body).toEqual({
    confirmed: ['provable|灰白多材质拼接外观'],
    reviewed: true,
  });
});

test('detail: analysis fields, rename, image viewer and cover', async ({ page }) => {
  const state = await mockLibrary(page);
  await page.goto('/products/a1');
  await expect(page.getByRole('heading', { name: /灰色运动鞋/ })).toBeVisible();
  await expect(page.getByText('低帮系带，鞋面多材质拼接')).toBeVisible();
  await expect(page.locator('.gy-item.need').filter({ hasText: '上脚舒适' })).toContainText(
    '待验证',
  );
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('textbox', { name: '外观', exact: true }).fill('人工核对后的外观');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('人工核对后的外观')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '商品分析已保存' })).toBeVisible();
  expect(
    (state.writes.find((w) => w.method === 'PUT' && w.path.endsWith('/analysis'))!.body as Json)
      .revision,
  ).toBe(1);

  await page.getByRole('button', { name: '重命名商品' }).click();
  await page.getByLabel('商品名称').fill('灰色复古鞋');
  await page.keyboard.press('Enter');
  expect(
    state.writes.find((w) => w.method === 'PUT' && w.path === '/api/clients/c/product-groups/a1')
      ?.body,
  ).toEqual({ productName: '灰色复古鞋', sku: '' });

  await page.getByRole('tab', { name: '图片说明' }).click();
  await page.getByRole('button', { name: '图片2', exact: true }).click();
  await expect(page.locator('.gy-vside')).toContainText('后跟特写');
  await page.getByRole('button', { name: '设为封面' }).click();
  await expect(page.locator('.gy-vside .gy-covertag')).toHaveText('封面');
  await page.getByRole('button', { name: '放大查看' }).click();
  const viewer = page.getByRole('dialog', { name: '图片2' });
  await expect(viewer.locator('img')).toHaveAttribute('src', '/api/clients/c/assets/a2/file');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('dialog', { name: '图片1' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('商品理解 tags and 目标人群 can be added, edited and removed', async ({ page }) => {
  const state = await mockLibrary(page);
  await page.goto('/products/a1');
  const uk = page.getByRole('region', { name: '商品理解' });
  await expect(uk).toContainText('灰白多材质拼接外观');
  await expect(uk).toContainText('还没保存');
  await uk.getByLabel('添加购买时机，回车确认').fill('换季添鞋');
  await page.keyboard.press('Enter');
  await expect(uk.locator('.gy-tag').filter({ hasText: '换季添鞋' })).toBeVisible();
  let put = state.writes
    .filter((w) => w.method === 'PUT' && w.path.endsWith('/understanding'))
    .pop()!.body as Json;
  expect(put.revision).toBe(0);
  expect((put.understanding as Json).when).toEqual(['换季添鞋']);
  await uk.getByRole('button', { name: '删除 普通运动鞋单调' }).click();
  await expect(uk.getByRole('button', { name: '删除 普通运动鞋单调' })).toHaveCount(0);
  await uk.getByRole('button', { name: '灰白多材质拼接外观', exact: true }).click();
  await uk.getByLabel('修改核心卖点').fill('灰白拼接外观');
  await page.keyboard.press('Enter');
  await expect(uk.locator('.gy-tag.core')).toHaveText(/灰白拼接外观/);
  put = state.writes.filter((w) => w.method === 'PUT' && w.path.endsWith('/understanding')).pop()!
    .body as Json;
  expect(put.revision).toBe(2);
  await uk.getByRole('button', { name: '按分析重新整理' }).click();
  await page
    .getByRole('dialog', { name: '重新提取商品理解' })
    .getByRole('button', { name: '重新提取' })
    .click();
  await expect(uk).toContainText('普通运动鞋单调');

  const ps = page.getByRole('region', { name: '目标人群' });
  await expect(ps).toContainText('偏好复古运动风');
  await ps.getByRole('button', { name: '采用这些人群' }).click();
  await expect(ps.getByRole('button', { name: '编辑' })).toHaveCount(1);
  await ps.getByRole('button', { name: '新增人群' }).click();
  await ps.getByLabel('人群名称').fill('通勤上班族');
  await ps.getByLabel('痛点').fill('早上赶时间');
  await ps.getByRole('button', { name: '痛点型' }).click();
  await ps.getByRole('button', { name: '人群锁定型' }).click();
  await expect(ps.getByRole('group', { name: '适合的开头' }).getByRole('button')).toHaveText([
    '痛点型',
    '反常识型',
    '对比型',
    '结果前置型',
    '价格型',
    '人群锁定型',
    '悬念型',
    '身份代入型',
  ]);
  await ps.getByRole('button', { name: '保存' }).click();
  await expect(ps.locator('.gy-pscard')).toHaveCount(2);
  const created = state.writes.find((w) => w.method === 'POST' && w.path.endsWith('/personas'))!
    .body as Json;
  expect(created).toMatchObject({
    name: '通勤上班族',
    pain: '早上赶时间',
    hooks: ['痛点型', '人群锁定型'],
  });
  await ps.getByRole('button', { name: '编辑' }).nth(1).click();
  await ps.getByLabel('说话风格').fill('直接、省事');
  await ps.getByRole('button', { name: '保存' }).click();
  await expect(ps).toContainText('直接、省事');
  await ps.getByRole('button', { name: '删除' }).first().click();
  await ps.getByRole('button', { name: '确认删除' }).click();
  await expect(ps.locator('.gy-pscard')).toHaveCount(1);
  await expect(ps).toContainText('通勤上班族');
});
