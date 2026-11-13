import { test, expect } from '@playwright/test';
import path from 'node:path';
import { mergeReadShots, splitReadShot, applyReadSuggestion, type StoryboardReport } from '../src/storyboard';

function report(): StoryboardReport {
  return { duration: 10, shots: [
    { id: 'a', start: 0, end: 4, action: '展示双瓶', camera: '固定', transition: '开头', effects: '无', text: '', review: '候选' },
    { id: 'b', start: 4, end: 10, action: '连续按压', camera: '固定', transition: '待确认', effects: '无', text: '商品花字', review: '候选' },
  ], dialogue: [{ id: 'l', start: 0, end: 4, text: '原字幕台词', source: 'subtitle' }], summary: '开场展示', music: '背景音乐', suggestions: [] };
}
test('merge/split retain independent dialogue and reject stale reread suggestions', () => {
  const initial = report(), merged = mergeReadShots(initial, 0);
  expect(merged.shots).toHaveLength(1); expect(merged.shots[0].end).toBe(10); expect(merged.shots[0].transition).toBe('开头'); expect(merged.dialogue).toEqual(initial.dialogue);
  const split = splitReadShot(merged, 0, 5); expect(split.shots.map(s => [s.start, s.end])).toEqual([[0, 5], [5, 10]]);
  expect(() => splitReadShot(initial, 0, 4)).toThrow();
  expect(() => applyReadSuggestion(merged, { ...initial.shots[0], shotId: 'a', contextStart: 0, contextEnd: 5, targetStart: 0, targetEnd: 4, slow: false })).toThrow('镜头区间已改变');
});

test('read → edit → merge → save → refresh → reread suggestion is explicit', async ({ page }, info) => {
  let state: any = { status: 'EMPTY', revision: 0, model: 'test-gemini', enabled: true, error: '', calls: [] };
  let removed = false, deletionBlocked = true;
  const image = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#ddd"/></svg>';
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), method = route.request().method(), pathname = url.pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
    if (pathname.endsWith('/auth/me')) return json({ username: 'admin' });
    if (pathname.endsWith('/auth/csrf')) return json({ token: 'test', headerName: 'X-CSRF-TOKEN' });
    if (pathname === '/api/clients') return json([{ id: 'c', name: '客户', category: '美妆' }]);
    if (pathname === '/api/system') return json({ aiMode: 'openai' });
    if (pathname.endsWith('/campaigns')) return json([{ id: 'p', name: '读片项目', brief: '', archived: false }]);
    if (pathname.endsWith('/campaigns/p/products')) return json({ revision: 0, products: [{ anchorId: 'prod', assets: [], analysis: {} }] });
    if (pathname.endsWith('/assets')) return json(removed ? [] : [{ id: 'ref', name: '参考片.mp4', kind: 'REFERENCE', mime: 'video/mp4', metadata: {} }]);
    if (pathname.endsWith('/assets/ref/reference') && method === 'DELETE') {
      if (deletionBlocked) return route.fulfill({ status: 409, json: { message: '参考视频正在分析，请等待结束后再删除' } });
      removed = true; return route.fulfill({ status: 204 });
    }
    if (pathname.endsWith('/storyboard/thumbnail')) return route.fulfill({ contentType: 'image/svg+xml', body: image });
    if (pathname.endsWith('/assets/ref/file')) return route.fulfill({ contentType: 'video/mp4', path: path.resolve('tests/fixtures/remake-test.mp4') });
    if (pathname.endsWith('/storyboard')) {
      if (method === 'PUT') { const input = route.request().postDataJSON(); expect(input.revision).toBe(state.revision); state = { ...state, revision: state.revision + 1, report: input.report }; }
      if (method === 'POST') {
        const input = route.request().postDataJSON(); expect(input.confirmed).toBe(true);
        if (input.shotId) { const shot = state.report.shots.find((s: any) => s.id === input.shotId); state.report.suggestions.push({ shotId: shot.id, targetStart: shot.start, targetEnd: shot.end, contextStart: 0, contextEnd: 10, action: '模型补读建议动作', camera: '固定', transition: '连续', effects: '无', text: '', review: '等待采用', slow: false }); }
        else state.report = report();
        state = { ...state, status: 'COMPLETED', revision: state.revision + 1, calls: [{ phase: '整片原速', seconds: 1, http: 200 }] };
      }
      return json(structuredClone(state));
    }
    return json([]);
  });
  await page.goto('/projects/p/remake?reference=ref');
  await page.getByRole('button', { name: 'AI 读取视频', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('最多5次调用');
  await expect(page.getByRole('dialog')).not.toContainText('test-gemini');
  await page.getByRole('button', { name: '确认并开始分析' }).click();
  await expect(page.getByLabel('构图、主体与动作')).toHaveValue('展示双瓶');
  await page.getByRole('button', { name: '与后一镜合并' }).click();
  await expect(page.getByRole('button', { name: /^选择镜头/ })).toHaveCount(1);
  await page.getByLabel('构图、主体与动作').fill('我确认是连续固定镜头');
  await expect(page.getByRole('button', { name: '补读此镜头', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '保存分镜', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('构图、主体与动作')).toHaveValue('我确认是连续固定镜头');
  await page.getByRole('button', { name: '补读此镜头', exact: true }).click();
  await page.getByRole('button', { name: '确认并开始分析' }).click();
  await expect(page.getByText('模型补读建议动作', { exact: true })).toBeVisible();
  await expect(page.getByLabel('构图、主体与动作')).toHaveValue('我确认是连续固定镜头');
  await page.getByRole('button', { name: '采用这份建议' }).click();
  await expect(page.getByLabel('构图、主体与动作')).toHaveValue('模型补读建议动作');
  await page.getByRole('button', { name: '台词与字幕', exact: true }).click();
  await expect(page.getByLabel('第1句台词')).toHaveValue('原字幕台词');
  await page.getByLabel('第1句台词').fill('我修改的台词');
  await page.getByRole('button', { name: '保存分镜', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '台词与字幕', exact: true }).click();
  await expect(page.getByLabel('第1句台词')).toHaveValue('我修改的台词');
  expect(state.report.dialogue[0].source).toBe('manual');
  await page.getByRole('button', { name: '画面与镜头', exact: true }).click();
  await page.screenshot({ path: info.outputPath('reference-storyboard.png'), fullPage: true });
  await page.getByRole('button', { name: '删除参考视频 参考片.mp4', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(removed).toBe(false);
  await page.getByRole('button', { name: '删除参考视频 参考片.mp4', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('参考视频正在分析');
  expect(removed).toBe(false);
  deletionBlocked = false;
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '参考片.mp4', exact: true })).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page).toHaveURL(/\/projects\/p\/remake$/);
  await page.reload();
  await expect(page.getByRole('button', { name: '上传参考视频', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '参考片.mp4', exact: true })).toHaveCount(0);
});
