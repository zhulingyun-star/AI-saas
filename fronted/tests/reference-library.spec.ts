import { test, expect, type Page, type Route } from '@playwright/test';
import path from 'node:path';

type Json = Record<string, unknown>;
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><rect width="90" height="120" fill="#ddd"/></svg>';

/** 拆解结果夹具：取自旧库里真实的防晒霜参考片（18.8 秒 6 镜）的结构，只用于测试。 */
const REPORT = {
  duration: 18.8,
  shots: [
    [0, 2.8, '双手并排握持两瓶防晒隔离霜，拇指同步按压泵头', '高角度俯拍特写', '开头', ''],
    [2.8, 5.1, '女性正面半身出镜，右手持开盖产品', '平视近景，固定机位', '硬切', ''],
    [5.1, 18.8, '左小臂伸出，挤出五个膏体点后抹开', '俯拍特写，固定机位', '硬切', '防晒 隔离 妆前'],
  ].map(([start, end, action, camera, transition, text], i) => ({
    id: `shot-${i + 1}`,
    start: Number(start),
    end: Number(end),
    action,
    camera,
    transition,
    effects: '',
    text,
    review: '',
  })),
  dialogue: [
    { id: 'l1', start: 0, end: 0.9, text: '出门不想化妆', source: 'subtitle' },
    { id: 'l2', start: 0.96, end: 1.7, text: '懒得化妆', source: 'subtitle' },
    { id: 'l3', start: 5.13, end: 6.9, text: '那你就去用这款', source: 'audio' },
  ],
  summary: '痛点开场 → 亮出产品 → 质感展示 → 上脸效果',
  music: '轻快背景音乐，男声画外音',
  suggestions: [],
};

/** 用内存数据模拟参考视频库接口，记录写请求。 */
async function mockRefs(page: Page, opts: { enabled?: boolean } = {}) {
  const state = {
    enabled: opts.enabled ?? true,
    folders: [] as Json[],
    refs: [
      { id: 'r1', name: '1cff1056.mp4', createdAt: '2026-11-13T10:00:00' },
      { id: 'r2', name: 'outfit.mp4', createdAt: '2026-11-12T10:00:00' },
    ] as { id: string; name: string; createdAt: string }[],
    profile: {} as Record<
      string,
      {
        folderId: string | null;
        name?: string;
        hook?: string | null;
        tasks: Record<string, string>;
        revision: number;
      }
    >,
    boards: {
      r1: { status: 'COMPLETED', revision: 3, report: structuredClone(REPORT) },
    } as Record<
      string,
      { status: string; revision: number; report?: typeof REPORT; error?: string }
    >,
    usedBy: { r1: [{ id: 'p1', name: '新百伦鞋子 · 视频二创', kind: 'campaign' }] } as Record<
      string,
      Json[]
    >,
    deleteBlocked: true,
    writes: [] as { method: string; path: string; body: unknown }[],
  };
  const prof = (id: string) =>
    (state.profile[id] ??= { folderId: null, tasks: {}, revision: 0, hook: null });
  const board = (id: string) => {
    const b = state.boards[id];
    return {
      status: b?.status ?? 'EMPTY',
      revision: b?.revision ?? 0,
      hasReport: !!b?.report,
      error: b?.error ?? '',
      ...(b?.report
        ? {
            duration: b.report.duration,
            shotCount: b.report.shots.length,
            lineCount: b.report.dialogue.length,
          }
        : {}),
    };
  };
  const item = (id: string) => {
    const r = state.refs.find((x) => x.id === id)!;
    const p = prof(id);
    return {
      assetId: id,
      name: p.name ?? r.name,
      fileName: r.name,
      mime: 'video/mp4',
      sizeBytes: 2_400_000,
      createdAt: r.createdAt,
      folderId: p.folderId,
      ...(p.hook ? { hook: p.hook } : {}),
      storyboard: board(id),
      usedBy: state.usedBy[id] ?? [],
    };
  };
  const detail = (id: string) => ({
    ...item(id),
    shotTasks: prof(id).tasks,
    labelRevision: prof(id).revision,
    analysisEnabled: state.enabled,
  });
  await page.route('**/api/**', async (route: Route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const m = req.method();
    const json = (v: unknown, status = 200) => route.fulfill({ status, json: v });
    const body = () => {
      try {
        return req.postDataJSON();
      } catch {
        return null;
      }
    };
    if (m !== 'GET')
      state.writes.push({
        method: m,
        path: p,
        body: m === 'POST' && p.endsWith('/assets') ? null : body(),
      });
    if (p.endsWith('/auth/me')) return json({ username: 'admin' });
    if (p.endsWith('/auth/csrf')) return json({ token: 't', headerName: 'X-CSRF-TOKEN' });
    if (p === '/api/clients') return json([{ id: 'c', name: '测试客户', category: '美妆个护' }]);
    if (p.endsWith('/storyboard/thumbnail'))
      return route.fulfill({ contentType: 'image/svg+xml', body: SVG });
    if (p.endsWith('/file'))
      return route.fulfill({
        contentType: 'video/mp4',
        path: path.resolve('tests/fixtures/remake-test.mp4'),
      });
    if (p === '/api/clients/c/reference-library')
      return json({
        folders: state.folders,
        references: state.refs.map((r) => item(r.id)),
        analysisEnabled: state.enabled,
      });
    if (p === '/api/clients/c/reference-folders' && m === 'POST') {
      const b = body();
      if (state.folders.some((f) => f.name === b.name))
        return json({ message: `已经有叫「${b.name}」的文件夹` }, 400);
      const parent = state.folders.find((f) => f.id === b.parentId);
      if (parent?.parentId) return json({ message: '文件夹最多两层' }, 400);
      const f = {
        id: `f${state.folders.length + 1}`,
        parentId: b.parentId ?? null,
        name: b.name,
        sortOrder: state.folders.length,
        revision: 0,
      };
      state.folders.push(f);
      return json(f);
    }
    let mm = p.match(/\/reference-folders\/([^/]+)$/);
    if (mm && m === 'PUT') {
      const f = state.folders.find((x) => x.id === mm![1])!;
      Object.assign(f, { name: body().name, revision: Number(f.revision) + 1 });
      return json(f);
    }
    if (mm && m === 'DELETE') {
      state.folders = state.folders.filter((x) => x.id !== mm![1]);
      return route.fulfill({ status: 204 });
    }
    mm = p.match(/\/references\/([^/]+)(\/[a-z]+)?$/);
    if (mm) {
      const [, id, action] = mm;
      if (!state.refs.some((r) => r.id === id)) return json({ message: '参考视频不存在' }, 404);
      const pr = prof(id);
      if (action === '/folder') pr.folderId = body().folderId ?? null;
      if (action === '/name' || action === '/labels') {
        const b = body();
        if (b.revision !== pr.revision)
          return json({ message: '这条参考视频刚被别人改过，请刷新后再改' }, 409);
        if (action === '/name') pr.name = b.name;
        else {
          pr.hook = b.hook ?? null;
          pr.tasks = Object.fromEntries(
            Object.entries(b.shotTasks as Record<string, string>).filter(([, v]) => v),
          );
        }
        pr.revision += 1;
      }
      return json(detail(id));
    }
    if (p === '/api/clients/c/assets' && m === 'POST') {
      const id = `r${state.refs.length + 1}`;
      state.refs.unshift({ id, name: 'new-ref.mp4', createdAt: '2026-11-22T10:00:00' });
      return json({ id, name: 'new-ref.mp4', kind: 'REFERENCE', mime: 'video/mp4', metadata: {} });
    }
    if (p === '/api/clients/c/assets') return json([]);
    mm = p.match(/\/assets\/([^/]+)\/storyboard$/);
    if (mm) {
      const id = mm[1];
      if (m === 'POST') {
        if (!state.enabled) return json({ message: '尚未配置读片模型' }, 400);
        const b = state.boards[id];
        state.boards[id] = { ...b, status: 'QUEUED', revision: (b?.revision ?? 0) + 1 };
      }
      const b = state.boards[id];
      return json({
        status: b?.status ?? 'EMPTY',
        revision: b?.revision ?? 0,
        model: 'hidden',
        enabled: state.enabled,
        error: b?.error ?? '',
        calls: [],
        ...(b?.report ? { report: b.report } : {}),
        ...(['QUEUED', 'RUNNING'].includes(b?.status ?? '')
          ? { progress: { phase: '读取整片画面与字幕', elapsedSeconds: 12, stageSeconds: 3 } }
          : {}),
      });
    }
    mm = p.match(/\/assets\/([^/]+)\/reference$/);
    if (mm && m === 'DELETE') {
      if (state.deleteBlocked)
        return json({ message: '参考视频已有商品改编稿，不能删除；可以上传新的参考视频' }, 409);
      state.refs = state.refs.filter((r) => r.id !== mm![1]);
      return route.fulfill({ status: 204 });
    }
    return json([]);
  });
  return state;
}

test('old /reference opens the new library; list shows cards with real counts only', async ({
  page,
}) => {
  await mockRefs(page);
  await page.goto('/reference');
  await expect(page).toHaveURL(/\/references$/);
  await expect(
    page.getByRole('navigation', { name: '主栏目' }).getByRole('link', { name: '参考视频' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: '全部参考视频' })).toBeVisible();
  const done = page.getByRole('listitem').filter({ hasText: '1cff1056.mp4' });
  await expect(done).toContainText('3 个镜头 · 3 句台词');
  await expect(done).toContainText('用在 1 个项目');
  await expect(done).toContainText('0:19');
  const fresh = page.getByRole('listitem').filter({ hasText: 'outfit.mp4' });
  await expect(fresh).toContainText('还没拆解');
  await expect(fresh).toContainText('还没用过');
  await page.getByLabel('搜索参考视频').fill('outfit');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('搜索参考视频').fill('不存在');
  await expect(page.getByText('没有找到“不存在”')).toBeVisible();
  await expect(page.getByText(/费用|价格|定价/)).toHaveCount(0);
});

test('folders: two levels, rename, move a video, fixed items cannot be renamed', async ({
  page,
}) => {
  const state = await mockRefs(page);
  await page.goto('/references');
  const side = page.getByRole('navigation', { name: '参考视频文件夹' });
  await side.getByRole('button', { name: '+ 新建文件夹' }).click();
  await page.getByLabel('新文件夹名称').fill('美妆护肤');
  await page.getByLabel('新文件夹名称').press('Enter');
  await expect(page).toHaveURL(/folder=f1/);
  await side.getByTitle('美妆护肤', { exact: true }).hover();
  await side.getByRole('button', { name: '在 美妆护肤 里新建子文件夹' }).click();
  await page.getByLabel('子文件夹名称').fill('防晒');
  await page.getByLabel('子文件夹名称').press('Enter');
  await expect(side.getByRole('button', { name: '在 防晒 里新建子文件夹' })).toHaveCount(0);
  await side.getByTitle('美妆护肤', { exact: true }).hover();
  await side.getByRole('button', { name: '重命名文件夹 美妆护肤' }).click();
  await page.getByLabel('文件夹名称').fill('美妆');
  await page.getByLabel('文件夹名称').press('Enter');
  await expect(side.getByTitle('美妆', { exact: true })).toBeVisible();
  // 「全部参考视频」「未分类」没有改名按钮
  await expect(
    side.getByRole('button', { name: /重命名文件夹 (全部参考视频|未分类)/ }),
  ).toHaveCount(0);

  await page.goto('/references/r1');
  await page.getByRole('button', { name: '移动到文件夹' }).click();
  await page.getByLabel('放进文件夹').selectOption({ label: '美妆 / 防晒' });
  await page.getByRole('button', { name: '移动', exact: true }).click();
  await expect(page.getByText('美妆 / 防晒 · 18.8 秒')).toBeVisible();
  expect(state.profile.r1.folderId).toBe('f2');
  await page.goto('/references?folder=f1');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(side.getByTitle('美妆', { exact: true })).toContainText('1');
  await side.getByTitle('未分类', { exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('listitem')).toContainText('outfit.mp4');
});

test('upload shows 拆解中, then the finished storyboard opens in detail', async ({ page }) => {
  const state = await mockRefs(page);
  await page.goto('/references');
  await page.getByRole('button', { name: '上传参考视频' }).first().click();
  const dialog = page.getByRole('dialog', { name: '上传参考视频' });
  await expect(dialog).toContainText('只学结构和节奏，不放进成片');
  await expect(dialog).not.toContainText(/费用|价格/);
  await dialog
    .getByLabel('选择参考视频文件')
    .setInputFiles(path.resolve('tests/fixtures/remake-test.mp4'));
  await dialog.getByLabel('名称').fill('新的参考片');
  await dialog.getByRole('button', { name: '上传并拆解' }).click();
  await expect(page).toHaveURL(/\/references\/r3$/);
  await expect(page.getByRole('heading', { name: '新的参考片' })).toBeVisible();
  await expect(page.getByText('正在拆解镜头和台词')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '读取整片画面与字幕' })).toBeVisible();
  const start = state.writes.find((w) => w.path.endsWith('/r3/storyboard'));
  expect(start?.body).toMatchObject({ revision: 0, confirmed: true });
  expect(state.writes.find((w) => w.path.endsWith('/r3/name'))?.body).toMatchObject({
    name: '新的参考片',
    revision: 0,
  });
  await page.getByRole('button', { name: '返回参考视频库' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: '新的参考片' })).toContainText(
    '拆解中',
  );
  // 后台拆完
  state.boards.r3 = { status: 'COMPLETED', revision: 2, report: structuredClone(REPORT) };
  await page.getByRole('button', { name: '查看参考视频 新的参考片' }).click();
  await expect(page.getByText('镜头 3', { exact: true })).toBeVisible();
  await expect(page.getByText('还没标').first()).toBeVisible();
});

test('without a 读片模型 the video is still saved and the page says why it cannot be split', async ({
  page,
}) => {
  const state = await mockRefs(page, { enabled: false });
  await page.goto('/references?upload=1');
  const dialog = page.getByRole('dialog', { name: '上传参考视频' });
  await expect(dialog).toContainText('读片模型还没配置');
  await dialog
    .getByLabel('选择参考视频文件')
    .setInputFiles(path.resolve('tests/fixtures/remake-test.mp4'));
  await dialog.getByRole('button', { name: '上传', exact: true }).click();
  await expect(page.getByText('读片模型还没配置，暂时拆不了').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '开始拆解' })).toBeDisabled();
  expect(state.writes.some((w) => w.path.endsWith('/storyboard'))).toBe(false);
});

test('detail: tabs, hook type and per-shot tasks, rename, delete and new project', async ({
  page,
}) => {
  const state = await mockRefs(page);
  await page.goto('/references/r1');
  await expect(page.locator('video[aria-label="参考视频原片"]')).toBeVisible();
  await expect(page.getByText('镜头 1', { exact: true })).toBeVisible();
  await expect(page.getByText('高角度俯拍特写')).toBeVisible();
  await expect(page.getByRole('img', { name: '镜头 2 缩略图' })).toBeVisible();
  await expect(page.getByText('画面字幕：防晒 隔离 妆前')).toBeVisible();
  // 没有人工标过：开头和每镜任务都显示还没标，不编
  await expect(page.locator('.gy-hookv')).toContainText('还没标');
  await expect(page.getByText('每镜任务：已标 0 / 3 个镜头')).toBeVisible();
  await page.getByRole('tab', { name: '台词' }).click();
  await expect(page.getByText('3 句 · 字幕 2 句 · 语音 1 句')).toBeVisible();
  await expect(page.getByText('出门不想化妆')).toBeVisible();
  await page.getByRole('tab', { name: '结构总结' }).click();
  await expect(page.getByText('痛点开场 → 亮出产品 → 质感展示 → 上脸效果')).toBeVisible();
  await expect(page.getByText('每镜任务还没标。', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '标开头和每镜任务' }).click();
  await expect(page.getByRole('tab', { name: '镜头拆解' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page
    .getByRole('group', { name: '开头类型' })
    .getByRole('button', { name: '痛点型' })
    .click();
  await expect(page.getByText('痛点型：开口就说他正烦的事')).toBeVisible();
  await page.getByLabel('镜头 1 的任务').selectOption('抓住注意力');
  await page.getByLabel('镜头 2 的任务').selectOption('建立需求');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.gy-hookv')).toContainText('痛点型');
  await expect(page.getByText('每镜任务：已标 2 / 3 个镜头')).toBeVisible();
  expect(state.profile.r1).toMatchObject({
    hook: '痛点型',
    tasks: { 'shot-1': '抓住注意力', 'shot-2': '建立需求' },
  });
  await page.getByRole('tab', { name: '结构总结' }).click();
  await expect(page.locator('.gy-tflow')).toContainText('镜头 1 · 抓住注意力');
  await page.reload();
  await expect(page.locator('.gy-hookv')).toContainText('痛点型');

  await page.getByRole('button', { name: '重命名参考视频' }).click();
  await page.getByLabel('参考视频名称').fill('防晒隔离霜 · 美妆带货');
  await page.getByLabel('参考视频名称').press('Enter');
  await expect(page.getByRole('heading', { name: '防晒隔离霜 · 美妆带货' })).toBeVisible();
  // 同一个 revision 管名称和标注：改名后 revision 往前走
  expect(state.profile.r1.revision).toBe(2);

  await expect(page.getByRole('link', { name: /新百伦鞋子 · 视频二创/ })).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('dialog')).toContainText('参考视频已有商品改编稿，不能删除');
  state.deleteBlocked = false;
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page).toHaveURL(/\/references$/);
  await expect(page.getByRole('listitem')).toHaveCount(1);

  await page.getByRole('button', { name: '查看参考视频 outfit.mp4' }).click();
  await page.getByRole('button', { name: '用它新建项目' }).click();
  await expect(page).toHaveURL(/\/p\/new\?mode=remake&reference=r2$/);
});

test('rename from a card hover pencil (Esc cancels, Enter saves)', async ({ page }) => {
  const state = await mockRefs(page);
  await page.goto('/references');
  const card = page.getByRole('listitem').filter({ hasText: 'outfit.mp4' });
  await card.hover();
  await card.getByRole('button', { name: '重命名 outfit.mp4' }).click();
  await page.getByLabel('参考视频名称').fill('不要保存');
  await page.getByLabel('参考视频名称').press('Escape');
  await expect(card).toContainText('outfit.mp4');
  await card.hover();
  await card.getByRole('button', { name: '重命名 outfit.mp4' }).click();
  await page.getByLabel('参考视频名称').fill('穿搭 · 通勤');
  await page.getByLabel('参考视频名称').press('Enter');
  await expect(page.getByRole('listitem').filter({ hasText: '穿搭 · 通勤' })).toBeVisible();
  expect(state.profile.r2.name).toBe('穿搭 · 通勤');
});

test('picker dialog: folders, search, pick, and upload inside the dialog', async ({ page }) => {
  const state = await mockRefs(page);
  state.folders.push({ id: 'f1', parentId: null, name: '美妆护肤', sortOrder: 0, revision: 0 });
  state.profile.r1 = { folderId: 'f1', tasks: {}, revision: 0 };
  // 走真实的新建项目页（视频二创）里的「选一条参考视频」
  await page.goto('/p/new?mode=remake');
  await page.getByRole('button', { name: /选一条参考视频/ }).click();
  const dialog = page.getByRole('dialog', { name: '选择参考视频' });
  await expect(dialog.getByRole('radio')).toHaveCount(2);
  await dialog.getByRole('button', { name: '美妆护肤' }).click();
  await expect(dialog.getByRole('radio')).toHaveCount(1);
  await dialog.getByRole('button', { name: '全部参考视频' }).click();
  await dialog.getByLabel('在弹窗里搜索参考视频').fill('outfit');
  await expect(dialog.getByRole('radio')).toHaveCount(1);
  await dialog.getByRole('radio', { name: 'outfit.mp4' }).click();
  await expect(dialog).toContainText('已选：outfit.mp4');
  await dialog.getByRole('button', { name: '用这条' }).click();
  await expect(page.locator('.gy-refv')).toContainText('outfit.mp4');

  await page.getByRole('button', { name: '换一条' }).click();
  await expect(dialog.getByRole('radio', { name: 'outfit.mp4' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await dialog.getByRole('button', { name: /上传参考视频/ }).click();
  await expect(dialog).toContainText('会同步到参考视频库');
  await dialog
    .getByLabel('选择参考视频文件')
    .setInputFiles(path.resolve('tests/fixtures/remake-test.mp4'));
  await dialog.getByLabel('名称').fill('弹窗里上传的');
  await dialog.getByRole('button', { name: '上传并选用' }).click();
  await expect(page.locator('.gy-refv')).toContainText('弹窗里上传的');
  expect(state.refs.map((r) => r.id)).toContain('r3');
  await page.goto('/references');
  await expect(page.getByRole('listitem').filter({ hasText: '弹窗里上传的' })).toContainText(
    '拆解中',
  );
});
