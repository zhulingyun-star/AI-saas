import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { adCheck, applyFix, fixValue, ignoreKey, productRules } from '../src/adcheck';

/**
 * 新版项目：列表 / 文件夹、新建三种方式（含商品和参考视频选择弹窗）、视频二创四步、
 * 分镜编辑保存、广告用语检查、多版本出片 / 审片 / 对比 / 接力。接口用 page.route 拦截的桩，不调用任何模型或视频接口。
 */

const RISKS = [
  {
    point: '直接宣称“全猪皮/真皮材质”或具体中底专利科技功能（如绝对缓震、久走不累）',
    why: '仅凭图片无法鉴定皮革真伪，稳妥说法应聚焦“细腻绒面质感”',
  },
  { point: '直接作为核心卖点宣称“美国原产进口”', why: '缺乏产地佐证' },
];

test.describe('广告用语检查（纯函数）', () => {
  test('极限词、治病、承诺、价格和商品分析里的说法都能查出来', () => {
    const ctx = { hasPrice: false, risks: RISKS };
    const words = (t: string) => adCheck(t, ctx).map((h) => [h.word, h.cat]);
    expect(words('这是全网最低的顶级好鞋')).toEqual([
      ['全网最低', 'ext'],
      ['顶级', 'ext'],
    ]);
    expect(words('穿上能治疗脚痛，100%有效')).toEqual([
      ['治疗', 'med'],
      ['100%有效', 'fake'],
    ]);
    expect(words('今天只要399元')).toEqual([['399元', 'price']]);
    expect(words('真皮材质，绝对缓震，美国原产进口')).toEqual([
      ['真皮材质', 'prod'],
      ['绝对缓震', 'prod'],
      ['美国原产进口', 'prod'],
    ]);
    // 「真皮材质」去掉尾巴的「真皮」也查
    expect(words('鞋面是真皮的')).toEqual([['真皮', 'prod']]);
    expect(productRules(RISKS)[0].fix).toEqual(['细腻绒面质感']);
  });
  test('不误伤：最近、最后、第一次、第一镜；有价格时不查价格', () => {
    const ctx = { hasPrice: false, risks: [] };
    for (const t of [
      '最近很多人在穿',
      '最后看一眼上脚',
      '第一次穿就很舒服',
      '第一镜先拍鞋面',
      '最终效果',
      '第一眼就喜欢',
    ])
      expect(adCheck(t, ctx), t).toEqual([]);
    expect(adCheck('这是最好看的一双', ctx).map((h) => h.word)).toEqual(['最']);
    expect(adCheck('今天只要399元', { hasPrice: true })).toEqual([]);
  });
  test('替换、删掉、只给建议，以及忽略记录跟着句子走', () => {
    const t = '这是最好看的一双';
    const [hit] = adCheck(t, { hasPrice: true });
    expect(fixValue(hit.fix[0])).toBe('很');
    expect(applyFix(t, hit, '很')).toBe('这是很好看的一双');
    expect(fixValue('（删掉，商品不能说治病）')).toBe('');
    expect(fixValue('先去商品库补上真实价格和活动')).toBeNull();
    expect(ignoreKey('s1:0', t, hit)).not.toBe(ignoreKey('s1:0', t + '！', hit));
  });
});

// ---------------------------------------------------------------------------
const C = 'c';
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#bbb"/></svg>';
const shoe = (id: string, created: string) => ({
  id,
  clientId: C,
  name: `${id}.png`,
  kind: 'PRODUCT',
  sku: 'NB-992',
  tags: '',
  mime: 'image/png',
  sizeBytes: 4,
  metadata: { productName: '新百伦 992 灰白复古鞋', productGroupId: 'g-shoe' },
  createdAt: created,
});
const REPORT = {
  duration: 10.4,
  shots: [
    {
      id: 's1',
      start: 0,
      end: 4,
      action: '双手按压泵头',
      camera: '俯拍特写',
      transition: '开头',
      effects: '',
      text: '',
      review: '',
    },
    {
      id: 's2',
      start: 4,
      end: 10.4,
      action: '正面出镜涂抹',
      camera: '平视近景',
      transition: '硬切',
      effects: '',
      text: '',
      review: '',
    },
  ],
  dialogue: [
    { id: 'l1', start: 0, end: 2, text: '出门不想化妆', source: 'subtitle' },
    { id: 'l2', start: 5, end: 8, text: '这款最好用', source: 'subtitle' },
  ],
  summary: '痛点开场，再亮出产品',
  music: '轻快吉他',
  suggestions: [],
};
const REF = {
  assetId: 'ref',
  name: '防晒隔离霜带货',
  fileName: 'ref.mp4',
  mime: 'video/mp4',
  sizeBytes: 100,
  createdAt: '2026-11-20T00:00:00',
  folderId: null,
  hook: '痛点型',
  storyboard: {
    status: 'COMPLETED',
    revision: 2,
    hasReport: true,
    error: '',
    duration: 10.4,
    shotCount: 2,
    lineCount: 2,
  },
  usedBy: [],
};

type Any = Record<string, any>;
function seg(shots: Any[], ratio: string) {
  return [
    {
      key: 'style',
      title: '画面和商品图',
      text: `制作${ratio === '16:9' ? '横屏 16:9' : '竖屏 9:16'}商品短视频，时长 11 秒。`,
    },
    ...shots.map((s, i) => ({
      key: `shot-${i + 1}`,
      title: `镜头 ${i + 1}`,
      text: `第 ${i + 1} 镜：${s.visual}${s.lines.map((l: string) => `「${l}」`).join('')}`,
    })),
    { key: 'sound', title: '声音', text: '画外音只作为声音。' },
  ];
}

async function mockProjects(page: Page, opts: { versions?: Any[]; confirmed?: boolean } = {}) {
  const state: Any = {
    folders: [{ id: 'f1', parentId: null, name: '11 月上新', sortOrder: 0, revision: 0 }],
    projects: [] as Any[],
    created: [] as Any[],
    storyboardPuts: [] as Any[],
    versionPosts: [] as Any[],
    verdicts: [] as Any[],
    ignores: [] as string[],
    settings: {
      ratio: '9:16',
      resolution: '720p',
      personaId: '',
      personaName: '',
      approach: '',
      facts: '外观：灰白拼色',
    },
    revision: 3,
    board: {
      saved: !!opts.confirmed,
      confirmed: !!opts.confirmed,
      revision: opts.confirmed ? 2 : 0,
      stale: false,
      shots: REPORT.shots.map((s, i) => ({
        id: s.id,
        start: s.start,
        end: s.end,
        origCamera: s.camera,
        origVisual: s.action,
        origLines: [REPORT.dialogue[i].text],
        camera: s.camera,
        visual: opts.confirmed ? ['双手托鞋', '上脚走两步'][i] : '',
        lines: opts.confirmed ? [['出门不想穿搭'], ['最好看的一双']][i] : [],
        task: i === 0 ? '抓住注意力' : '',
      })),
    },
    versions: opts.versions ?? [],
  };
  const item = (p: Any) => ({
    revision: 1,
    flow: p.mode === 'REMAKE',
    legacyPath: p.mode === 'FRAMEWORK' ? `/studio/${p.id}?framework=1` : `/studio/${p.id}`,
    folderId: null,
    product: {
      anchorId: 'a',
      groupId: 'g-shoe',
      name: '新百伦 992 灰白复古鞋',
      sku: 'NB-992',
      coverId: 'a',
      imageIds: ['a', 'b'],
    },
    reference: p.mode === 'REMAKE' ? { assetId: 'ref', name: REF.name } : null,
    ratio: '9:16',
    resolution: '720p',
    duration: 11,
    status: 'DRAFT',
    storyboardConfirmed: false,
    storyboardSaved: false,
    versions: { count: 0, running: 0, unreviewed: 0, usable: 0, latestStatus: null },
    updatedAt: '2026-11-22T08:00:00',
    createdAt: '2026-11-22T08:00:00',
    ...p,
  });
  state.projects = [
    item({
      id: 'p1',
      name: '新百伦 · 视频二创',
      mode: 'REMAKE',
      folderId: 'f1',
      versions: { count: 2, running: 0, unreviewed: 1, usable: 0, latestStatus: 'REVIEW' },
    }),
    item({ id: 'p2', name: '新百伦 · 框架模式', mode: 'FRAMEWORK' }),
  ];
  const flow = () => ({
    project: state.projects[0],
    revision: state.revision,
    settings: state.settings,
    product: {
      ...state.projects[0].product,
      analysis: {
        status: 'COMPLETED',
        revision: 5,
        stale: false,
        hasReport: true,
        category: '运动鞋',
        risks: RISKS,
        hasPrice: false,
      },
      personas: [
        {
          id: 'ps1',
          name: '通勤上班族',
          pain: '早上没时间搭配',
          want: '百搭',
          tone: '',
          scene: '',
          worry: '怕不耐脏',
          hooks: ['痛点型'],
          revision: 0,
        },
        {
          id: 'ps2',
          name: '复古爱好者',
          pain: '',
          want: '',
          tone: '',
          scene: '',
          worry: '怕撞款',
          hooks: ['对比型'],
          revision: 0,
        },
      ],
    },
    reference: {
      ...REF,
      shotTasks: { s1: '抓住注意力' },
      labelRevision: 1,
      analysisEnabled: false,
      report: REPORT,
      boardRevision: 2,
    },
    legacyApproach: null,
    storyboard: state.board,
    ignores: state.ignores,
    targetDuration: 11,
    draftSegments: state.board.confirmed ? seg(state.board.shots, state.settings.ratio) : [],
    versions: state.versions,
    videoEnabled: true,
    aiEnabled: false,
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    const json = (v: unknown, status = 200) => route.fulfill({ status, json: v });
    const body = () => req.postDataJSON();
    if (p === '/api/auth/me') return json({ username: 'admin' });
    if (p === '/api/auth/csrf') return json({ token: 't', headerName: 'X-CSRF-TOKEN' });
    if (p === '/api/clients')
      return json([{ id: C, name: '轻羽 · 服饰内容组', category: '服饰鞋包' }]);
    if (/\/(assets\/[^/]+\/file|storyboard\/thumbnail)$/.test(p))
      return route.fulfill({ contentType: 'image/svg+xml', body: svg });
    if (/\/jobs\/[^/]+\/file$/.test(p))
      return route.fulfill({
        contentType: 'video/mp4',
        path: path.resolve('tests/fixtures/remake-test.mp4'),
      });
    if (p.endsWith('/assets') && m === 'GET')
      return json([shoe('a', '2026-11-20T00:00:00'), shoe('b', '2026-11-20T00:00:01')]);
    if (p.endsWith('/assets') && m === 'POST')
      return json({
        ...shoe('new1', '2026-11-22T00:00:00'),
        metadata: { productName: '弹窗里新建的鞋', productGroupId: 'g-new' },
      });
    if (p.endsWith('/product-library'))
      return json({
        folders: [{ id: 'pf', parentId: null, name: '鞋靴', sortOrder: 0, revision: 0 }],
        products: {
          'group:g-shoe': {
            groupId: 'g-shoe',
            anchorId: 'a',
            folderId: 'pf',
            analysis: { status: 'COMPLETED', revision: 5, hasReport: true },
            reviewed: true,
            confirmed: [],
            understandingSaved: false,
            personaCount: 2,
            projectCount: 1,
          },
        },
      });
    if (p.endsWith('/analysis') && m === 'GET')
      return json({
        status: 'COMPLETED',
        brief: '',
        revision: 5,
        stale: false,
        report: { appearance: '灰白拼色低帮系带', material: '绒面质感' },
      });
    if (p.endsWith('/analysis') && m === 'POST')
      return json({ status: 'QUEUED', revision: 1 }, 200);
    if (p.endsWith('/reference-library'))
      return json({
        folders: [],
        references: [
          REF,
          {
            ...REF,
            assetId: 'raw',
            name: '还没拆的',
            storyboard: { status: 'EMPTY', revision: 0, hasReport: false, error: '' },
          },
        ],
        analysisEnabled: false,
      });
    if (p.endsWith('/references/ref'))
      return json({ ...REF, shotTasks: {}, labelRevision: 1, analysisEnabled: false });
    if (p.endsWith('/assets/ref/storyboard'))
      return json({
        status: 'COMPLETED',
        revision: 2,
        model: '',
        enabled: false,
        error: '',
        calls: [],
        report: REPORT,
      });
    if (p.endsWith('/project-library'))
      return json({
        folders: state.folders,
        projects: state.projects,
        videoEnabled: true,
        aiEnabled: false,
      });
    if (p.endsWith('/project-library/projects')) {
      const b = body();
      state.created.push(b);
      const it = item({
        id: `new${state.created.length}`,
        name: b.name,
        mode: b.mode,
        folderId: b.folderId,
        // 新版建的三种项目都进四步详情
        flow: true,
      });
      state.projects.unshift(it);
      return json(it);
    }
    if (p.endsWith('/project-folders') && m === 'POST') {
      const f = {
        id: 'f2',
        parentId: body().parentId ?? null,
        name: body().name,
        sortOrder: 1,
        revision: 0,
      };
      state.folders.push(f);
      return json(f);
    }
    if (/\/projects\/[^/]+\/folder$/.test(p)) {
      const id = p.split('/').at(-2);
      state.projects = state.projects.map((x: Any) =>
        x.id === id ? { ...x, folderId: body().folderId } : x,
      );
      return json({ id, folderId: body().folderId ?? '' });
    }
    if (/\/projects\/[^/]+\/name$/.test(p)) {
      const id = p.split('/').at(-2);
      state.projects = state.projects.map((x: Any) =>
        x.id === id ? { ...x, name: body().name } : x,
      );
      return json(state.projects.find((x: Any) => x.id === id));
    }
    if (p.endsWith('/projects/p1/flow')) return json(flow());
    if (p.endsWith('/projects/p1/settings')) {
      const b = body();
      for (const k of ['ratio', 'resolution', 'personaId', 'personaName', 'approach'])
        if (b[k] !== undefined) state.settings[k] = b[k];
      state.revision++;
      return json(flow());
    }
    if (p.endsWith('/projects/p1/storyboard')) {
      const b = body();
      state.storyboardPuts.push(b);
      state.board = {
        ...state.board,
        saved: true,
        confirmed: b.confirmed,
        revision: state.board.revision + 1,
        shots: state.board.shots.map((s: Any, i: number) => ({ ...s, ...b.shots[i] })),
      };
      return json(flow());
    }
    if (p.endsWith('/projects/p1/ad-ignores')) {
      state.ignores = [...state.ignores, body().key];
      return json(state.ignores);
    }
    if (p.endsWith('/projects/p1/versions/rewrite'))
      return json(
        { message: '文字模型没配置，AI 改不了；出片词没有动，可以展开下面的段落直接改' },
        503,
      );
    if (p.endsWith('/projects/p1/versions')) {
      const b = body();
      state.versionPosts.push(b);
      const v = {
        id: `job${state.versions.length + 1}`,
        no: state.versions.length + 1,
        status: 'QUEUED',
        message: '已排队',
        progress: 0,
        submitted: false,
        hasOutput: false,
        createdAt: new Date(Date.now() - 65000).toISOString().replace('Z', ''),
        updatedAt: new Date().toISOString().replace('Z', ''),
        ratio: state.settings.ratio,
        resolution: state.settings.resolution,
        duration: 11,
        note: b.note || '首版：按已确认的分镜出片',
        basedOn: b.basedOn,
        carriedReasons: [],
        segments: b.segments,
        verdict: null,
      };
      state.versions = [v, ...state.versions];
      return json(v);
    }
    if (/\/jobs\/[^/]+\/verdict$/.test(p)) {
      const id = p.split('/').at(-2);
      const b = body();
      state.verdicts.push({ id, ...b });
      state.versions = state.versions.map((v: Any) =>
        v.id === id
          ? {
              ...v,
              verdict: {
                rating: b.rating,
                reason: b.reason,
                use: b.use,
                revision: b.revision + 1,
                by: 'admin',
                at: '',
              },
            }
          : v,
      );
      return json({});
    }
    if (/\/jobs\/[^/]+\/cancel$/.test(p)) {
      const id = p.split('/').at(-2);
      state.versions = state.versions.map((v: Any) =>
        v.id === id ? { ...v, status: 'CANCELLED', message: '已取消，没有发出视频请求' } : v,
      );
      return json({ id, status: 'CANCELLED' });
    }
    return json([]);
  });
  return state;
}

const doneVersion = (no: number, extra: Any = {}) => ({
  id: `old${no}`,
  no,
  status: 'REVIEW',
  message: '已生成',
  progress: 100,
  submitted: true,
  hasOutput: true,
  createdAt: `2026-11-22T0${no}:00:00`,
  updatedAt: `2026-11-22T0${no}:10:00`,
  ratio: '9:16',
  resolution: '720p',
  duration: 11,
  note: no === 1 ? '首版：按已确认的分镜出片' : '直接改了 镜头 2',
  basedOn: no === 1 ? null : 'old1',
  carriedReasons: [],
  segments: [
    { key: 'style', title: '画面和商品图', text: '制作竖屏 9:16 商品短视频，时长 11 秒。' },
    { key: 'shot-1', title: '镜头 1', text: '第 1 镜：双手托鞋「出门不想穿搭」' },
    {
      key: 'shot-2',
      title: '镜头 2',
      text:
        no === 1
          ? '第 2 镜：上脚走两步「最好看的一双」'
          : '第 2 镜：上脚原地转一圈「很好看的一双」',
    },
  ],
  verdict: null,
  ...extra,
});

test('项目列表：文件夹、搜索、改名、移动，旧流程的框架模式作品进旧制作页', async ({ page }) => {
  const state = await mockProjects(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '全部项目' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(3);
  await expect(page.getByRole('row', { name: '打开项目 新百伦 · 视频二创' })).toContainText(
    '2 个版本 · 1 版待审片',
  );
  const side = page.getByRole('navigation', { name: '项目文件夹' });
  await side.getByRole('button', { name: /^11 月上新\s*\d*$/ }).click();
  await expect(page).toHaveURL(/\?folder=f1$/);
  await expect(page.getByRole('row')).toHaveCount(2);
  await side.getByRole('button', { name: /^全部项目\s*\d*$/ }).click();
  await page.getByLabel('搜索项目').fill('框架');
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByLabel('搜索项目').fill('');
  const row = page.getByRole('row', { name: '打开项目 新百伦 · 框架模式' });
  await row.hover();
  await row.getByRole('button', { name: '重命名项目 新百伦 · 框架模式' }).click();
  await page.getByLabel('项目名称').fill('鞋 · 框架测试');
  await page.getByLabel('项目名称').press('Enter');
  await expect(page.getByRole('row', { name: '打开项目 鞋 · 框架测试' })).toBeVisible();
  await page.getByRole('row', { name: '打开项目 鞋 · 框架测试' }).hover();
  await page.getByRole('button', { name: '移动项目 鞋 · 框架测试' }).click();
  await page.getByRole('dialog', { name: '移动到文件夹' }).getByLabel(/放进/).selectOption('f1');
  await page.getByRole('dialog').getByRole('button', { name: '移动' }).click();
  await expect.poll(() => state.projects.find((x: Any) => x.id === 'p2').folderId).toBe('f1');
  await side.getByRole('button', { name: '+ 新建文件夹' }).click();
  await page.getByLabel('新文件夹名称').fill('日常测试');
  await page.getByLabel('新文件夹名称').press('Enter');
  await expect(side.getByRole('button', { name: /^日常测试\s*\d*$/ })).toBeVisible();
  await expect(page).toHaveURL(/\?folder=f2$/);
  await side.getByRole('button', { name: /^全部项目\s*\d*$/ }).click();
  await page.getByRole('row', { name: '打开项目 鞋 · 框架测试' }).click();
  await expect(page).toHaveURL(/\/studio\/p2\?framework=1$/);
});

test('新建项目：复刻默认选中；商品已核对时事实只显示一行（商品弹窗、参考视频弹窗、画幅分辨率、文件夹）', async ({
  page,
}) => {
  const state = await mockProjects(page);
  await page.goto('/p/new');
  const sum = page.getByRole('complementary', { name: '项目摘要' });
  await expect(page.getByRole('radio', { name: /复刻/ })).toHaveAttribute('aria-checked', 'true');
  // 只有一个商品时直接选上；还是可以打开弹窗换
  await expect(sum.getByRole('button', { name: '创建项目' })).toBeDisabled();
  await page.getByRole('button', { name: /商品：新百伦 992 灰白复古鞋/ }).click();
  const pd = page.getByRole('dialog', { name: '选择商品' });
  await pd.getByLabel('在弹窗里搜索商品').fill('不存在');
  await expect(pd).toContainText('没有找到“不存在”');
  await pd.getByLabel('在弹窗里搜索商品').fill('992');
  await pd.getByRole('radio', { name: '新百伦 992 灰白复古鞋' }).click();
  await pd.getByRole('button', { name: '选这个商品' }).click();
  await expect(sum).toContainText('选一条参考视频');
  await page.getByRole('button', { name: /选一条参考视频/ }).click();
  const rd = page.getByRole('dialog', { name: '选择参考视频' });
  await rd.getByRole('radio', { name: '防晒隔离霜带货' }).click();
  await rd.getByRole('button', { name: '用这条' }).click();
  await expect(page.locator('.gy-pjshots .sh')).toHaveCount(2);
  // 商品已核对：不出文本框和勾选，事实自动带上
  await expect(page.getByText('已就绪（修订 5）')).toBeVisible();
  await expect(page.getByLabel('商品事实', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('已核对商品事实')).toHaveCount(0);
  await expect(sum).toContainText('已就绪');
  await expect(sum).not.toContainText('点击后');
  await page
    .getByRole('group', { name: '画幅' })
    .getByRole('button', { name: '横屏 16:9' })
    .click();
  await page.getByRole('group', { name: '分辨率' }).getByRole('button', { name: '1080p' }).click();
  await page.getByLabel('放进文件夹').selectOption('f1');
  await expect(sum).toContainText('横屏 16:9 · 1080p');
  await sum.getByRole('button', { name: '创建项目' }).click();
  await expect(page).toHaveURL(/\/p\/new1$/);
  expect(state.created[0]).toMatchObject({
    mode: 'REMAKE',
    productAnchorId: 'a',
    referenceAssetId: 'ref',
    ratio: '16:9',
    resolution: '1080p',
    folderId: 'f1',
    factsConfirmed: true,
    name: '新百伦 992 灰白复古鞋 · 复刻',
  });
  expect(state.created[0].facts).toContain('灰白拼色低帮系带');
});

test('新建项目：四种方式（专业、故事灰显，没有框架模式）；简易进新版详情；未核对的商品要填事实并勾选', async ({
  page,
}) => {
  const state = await mockProjects(page);
  await page.goto('/p/new');
  const modes = page.getByRole('radiogroup', { name: '创作方式' }).getByRole('radio');
  await expect(modes).toHaveCount(4);
  await expect(modes.nth(0)).toContainText('复刻');
  await expect(modes.nth(1)).toContainText('简易');
  await expect(page.getByRole('radio', { name: /专业/ })).toBeDisabled();
  await expect(page.getByRole('radio', { name: /故事/ })).toBeDisabled();
  await expect(page.getByRole('radio', { name: /框架模式/ })).toHaveCount(0);
  await page.getByRole('radio', { name: /简易/ }).click();
  await expect(page.getByRole('button', { name: /选一条参考视频/ })).toHaveCount(0);
  await page.getByRole('button', { name: /商品：新百伦 992 灰白复古鞋/ }).click();
  const pd = page.getByRole('dialog', { name: '选择商品' });
  await pd.getByRole('button', { name: /新建商品/ }).click();
  await pd.getByLabel('商品名称').fill('弹窗里新建的鞋');
  await pd.getByLabel('选择商品图').setInputFiles({
    name: 'x.png',
    mimeType: 'image/png',
    buffer: Buffer.from('89504e47', 'hex'),
  });
  await pd.getByRole('button', { name: '保存并选用' }).click();
  await expect(page.getByRole('button', { name: /商品：弹窗里新建的鞋/ })).toBeVisible();
  // 新建的商品还没核对：显示事实文本框，勾选后才能建
  const sum = page.getByRole('complementary', { name: '项目摘要' });
  await expect(page.getByLabel('商品事实', { exact: true })).toBeVisible();
  await expect(page.getByLabel('已核对商品事实')).not.toBeChecked();
  await expect(sum).toContainText('待核对');
  // 换回已核对的商品：事实只显示一行
  await page.getByRole('button', { name: /商品：弹窗里新建的鞋/ }).click();
  await pd.getByRole('radio', { name: '新百伦 992 灰白复古鞋' }).click();
  await pd.getByRole('button', { name: '选这个商品' }).click();
  await expect(page.getByText('已就绪（修订 5）')).toBeVisible();
  await sum.getByRole('button', { name: '创建项目' }).click();
  await expect(page).toHaveURL(/\/p\/new1$/);
  await page.goto('/p/new?mode=oneclick');
  await expect(page.getByRole('radio', { name: /简易/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('已就绪（修订 5）')).toBeVisible();
  await page.getByRole('button', { name: '创建项目' }).click();
  await expect(page).toHaveURL(/\/p\/new2$/);
  expect(state.created.map((x: Any) => x.mode)).toEqual(['ONE_CLICK', 'ONE_CLICK']);
});

test('视频二创四步：方向选人群、分镜编辑保存、广告用语检查和忽略、确认后出第一版', async ({
  page,
}) => {
  const state = await mockProjects(page);
  await page.goto('/p/p1');
  await expect(
    page.getByRole('navigation', { name: '制作步骤' }).getByRole('button', { name: /^第 2 步/ }),
  ).toHaveAttribute('aria-current', 'step');
  await expect(page.getByText('痛点型')).toBeVisible();
  await page
    .getByRole('group', { name: '给谁看' })
    .getByRole('button', { name: '通勤上班族' })
    .click();
  await expect.poll(() => state.settings.personaName).toBe('通勤上班族');
  await page
    .getByRole('navigation', { name: '制作步骤' })
    .getByRole('button', { name: /^第 1 步/ })
    .click();
  await expect(page.getByRole('button', { name: /商品：新百伦/ })).toBeVisible();
  await page
    .getByRole('navigation', { name: '制作步骤' })
    .getByRole('button', { name: /^第 4 步/ })
    .click();
  await expect(page.getByRole('toolbar', { name: '这一步的操作' })).toContainText('分镜待确认');
  await page
    .getByRole('navigation', { name: '制作步骤' })
    .getByRole('button', { name: /^第 3 步/ })
    .click();
  const bar = page.getByRole('toolbar', { name: '这一步的操作' });
  // 分镜之前不出现成片画面
  await expect(page.locator('video')).toHaveCount(0);
  await expect(bar.getByRole('button', { name: '确认分镜，去出片' })).toBeDisabled();
  await expect(bar).toContainText('还有 2 镜没写改成什么画面');
  await bar.getByRole('button', { name: '编辑分镜' }).click();
  await page.getByLabel('镜头 1 改成的画面').fill('双手托鞋，拇指抚过鞋头翻毛');
  await page.locator('#shot-1').getByRole('button', { name: '加一句台词' }).click();
  await page.getByLabel('镜头 1 第 1 句台词', { exact: true }).fill('全网最低价，只要399元');
  await expect(page.locator('#shot-1 .gy-adlive')).toContainText('2 处可能违规');
  await page.locator('#shot-1').getByRole('button', { name: '加一句台词' }).click();
  await page.getByLabel('镜头 1 第 2 句台词', { exact: true }).fill('删掉的句子');
  await page.getByRole('button', { name: '删掉镜头 1 第 2 句台词' }).click();
  await page.getByLabel('镜头 2 改成的画面').fill('上脚走两步');
  await page.locator('#shot-2').getByRole('button', { name: '加一句台词' }).click();
  await page
    .getByLabel('镜头 2 第 1 句台词', { exact: true })
    .fill('最近很多人穿，这是最好看的一双');
  await page.getByLabel('镜头 2 的任务').selectOption('推动下单');
  await bar.getByRole('button', { name: '保存' }).click();
  await expect(bar.getByRole('button', { name: '确认分镜，去出片' })).toBeEnabled();
  expect(state.storyboardPuts[0]).toMatchObject({ revision: 0, confirmed: false });
  expect(state.storyboardPuts[0].shots[0].lines).toEqual(['全网最低价，只要399元']);
  expect(state.storyboardPuts[0].shots[1].task).toBe('推动下单');
  // 汇总只提醒：3 处（全网最低、只要399、最），「最近」不算
  const sum = page.locator('#adsum');
  await expect(sum).toContainText('台词里有 3 处可能违规的说法');
  await expect(page.locator('.gy-cvmiss')).toContainText('还没有「建立需求」的镜头');
  await sum.getByRole('button', { name: '逐条看' }).click();
  await expect(sum.locator('.gy-adrow')).toHaveCount(3);
  await sum
    .locator('.gy-adrow')
    .filter({ hasText: '全网最低' })
    .getByRole('button', { name: '换成「活动价以页面为准」' })
    .click();
  await expect
    .poll(() => state.storyboardPuts.at(-1)?.shots[0].lines[0])
    .toBe('活动价以页面为准价，只要399元');
  await sum
    .locator('.gy-adrow')
    .filter({ hasText: '镜头 2' })
    .getByRole('button', { name: '没问题，忽略' })
    .click();
  await expect(sum).toContainText('台词里有 1 处可能违规的说法');
  expect(state.ignores[0]).toMatch(/^s2:0\|最\|/);
  // 查看态点开命中看原因
  await page
    .locator('#shot-1')
    .getByRole('button', { name: /可能违规的说法「399元」/ })
    .click();
  await expect(page.getByRole('dialog', { name: '「399元」为什么可能违规' })).toContainText(
    '商品资料里还没有价格',
  );
  await bar.getByRole('button', { name: '确认分镜，去出片' }).click();
  await expect(page).toHaveURL(/step=4/);
  await expect(page.locator('.gy-pseg')).toHaveCount(4);
  await bar.getByRole('button', { name: '出第一版' }).click();
  await expect(bar).toContainText('确认：按已确认的分镜出第 1 版（竖屏 9:16 · 720p · 11 秒）');
  await bar.getByRole('button', { name: '确认出片' }).click();
  await expect(bar).toContainText('第 1 版正在出片 · 排队中 · 已等待');
  expect(state.versionPosts[0]).toMatchObject({ confirmed: true, basedOn: null });
  await expect(page.locator('.gy-vgen .ph4 .n')).toHaveText('排队中');
  await bar.getByRole('button', { name: '取消这一版' }).click();
  await expect(page.getByRole('region').or(page.locator('.gy-ocver')).first()).toContainText(
    '已取消',
  );
});

test('多版本：单独审片（差必填原因）、改这一版再出、AI 未配置提示、对比、接力', async ({
  page,
}) => {
  const state = await mockProjects(page, {
    confirmed: true,
    versions: [doneVersion(2), doneVersion(1)],
  });
  await page.goto('/p/p1?step=4');
  const cards = page.locator('.gy-ocver');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('第 2 版');
  await expect(cards.first()).toContainText('比第 1 版：直接改了 镜头 2');
  const v1 = page.locator('.gy-ocver', { hasText: '首版' });
  await v1
    .getByRole('group', { name: '第 1 版的评价' })
    .getByRole('button', { name: '差' })
    .click();
  await expect(v1.getByRole('button', { name: '保存原因' })).toBeDisabled();
  await v1.getByLabel('第 1 版差在哪').fill('鞋面颜色偏黄');
  await v1.getByRole('button', { name: '保存原因' }).click();
  await expect
    .poll(() => state.verdicts.at(-1))
    .toMatchObject({ id: 'old1', rating: 'BAD', reason: '鞋面颜色偏黄' });
  await cards.first().getByRole('button', { name: '标记可投放' }).click();
  await expect.poll(() => state.verdicts.at(-1)).toMatchObject({ id: 'old2', use: 'USABLE' });
  // 出片词按段，和上一版不同的段标出来；出片词里的违规说法只标出、计数
  await v1.locator('summary', { hasText: '这一版的出片词' }).click();
  await expect(v1).toContainText('1 处可能违规的说法');
  await cards.first().locator('summary', { hasText: '这一版的出片词' }).click();
  await expect(cards.first().locator('.gy-pseg.chg')).toHaveCount(1);
  // 对比
  await page.getByRole('button', { name: '对比最新两版' }).click();
  const cmp = page.locator('.gy-vcmp');
  await expect(cmp).toContainText('对比 第 1 版 和 第 2 版');
  await expect(cmp).toContainText('出片词 3 段里有 1 段不同');
  await expect(cmp.locator('video')).toHaveCount(2);
  await cmp.getByRole('button', { name: '左右互换' }).click();
  await expect(cmp).toContainText('对比 第 2 版 和 第 1 版');
  await cmp.getByRole('button', { name: '两版一起播放' }).click();
  await cmp.getByRole('button', { name: '关闭对比' }).click();
  await expect(cmp).toHaveCount(0);
  // 接力：换价格说法没价格时不可用
  await expect(cards.first().getByRole('button', { name: '换价格说法' })).toBeDisabled();
  await cards.first().getByRole('button', { name: '换开头' }).click();
  await expect(cards.first().getByLabel('一句话说要怎么改')).toHaveValue(
    /开头从「痛点型」换成「对比型」/,
  );
  await expect(cards.first()).toContainText('接力 · 换开头 · 基于「第 2 版」');
  await expect(cards.first().getByRole('button', { name: '按这句改' })).toBeDisabled();
  // 按段改，再出
  await cards.first().locator('summary', { hasText: '镜头 1' }).click();
  await cards
    .first()
    .getByLabel('第 2 版出片词 · 镜头 1')
    .fill('第 1 镜：双手托鞋，拇指抚过鞋头「出门不想穿搭」');
  await cards.first().getByRole('button', { name: '照改好的词出片' }).click();
  const bar = page.getByRole('toolbar', { name: '这一步的操作' });
  await expect(bar).toContainText('照改好的出片词（改了 镜头 1）出第 3 版（竖屏 9:16 · 720p）');
  await bar.getByRole('button', { name: '确认出片' }).click();
  await expect
    .poll(() => state.versionPosts[0])
    .toMatchObject({ basedOn: 'old2', note: '直接改了 镜头 1', confirmed: true });
  await expect(cards.first()).toContainText('第 3 版');
});

test('参考视频详情「用它新建项目」带着这条参考视频进新建项目', async ({ page }) => {
  await mockProjects(page);
  await page.goto('/references/ref');
  await page.getByRole('button', { name: '用它新建项目' }).click();
  await expect(page).toHaveURL(/\/p\/new\?mode=remake&reference=ref$/);
  await expect(page.locator('.gy-refv')).toContainText('防晒隔离霜带货');
  await expect(page.getByRole('radio', { name: /复刻/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('390 宽：新建项目和分镜不横向溢出', async ({ page }) => {
  await mockProjects(page, { confirmed: true, versions: [doneVersion(1)] });
  await page.setViewportSize({ width: 390, height: 900 });
  for (const url of ['/', '/p/new', '/p/p1?step=3', '/p/p1?step=4']) {
    await page.goto(url);
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      url,
    ).toBeTruthy();
  }
});
