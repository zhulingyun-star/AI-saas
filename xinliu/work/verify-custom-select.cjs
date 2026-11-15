'use strict';

const { chromium, executablePath, BASE_URL } = require('./browser-runtime.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const checks = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    const errors = [];
    const external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && !request.url().startsWith(BASE_URL + '/')) external.push(request.url());
    });
    const nav = async view => { await page.evaluate(view => navigate(view), view); await page.waitForFunction(view => viewState.view === view, view); };
    const trigger = id => page.locator(`#${id} + .custom-select .custom-select-trigger`);
    const menu = page.locator('.custom-select-list:not([hidden])');
    const allEnhanced = async () => {
      await page.waitForFunction(() => [...document.querySelectorAll('select')].filter(select => !select.multiple && select.size <= 1).every(select => select.customSelect?.root.isConnected));
    };
    await page.goto(BASE_URL + '/#projects');
    await allEnhanced();
    await trigger('collabProjectStatus').click();
    assert.equal(await menu.count(), 1);
    const selectedStyle = await menu.locator('[aria-selected="true"]').evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, radius: style.borderRadius };
    });
    assert.equal(selectedStyle.radius, '4px');
    assert.notEqual(selectedStyle.background, 'rgb(0, 120, 215)');
    await menu.getByRole('option', { name: '已归档', exact: true }).click();
    assert.equal(await page.evaluate(() => collabUi.projectStatus), '已归档');
    assert.equal(await trigger('collabProjectStatus').innerText(), '已归档');
    await trigger('collabProjectStatus').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => collabUi.projectStatus), '进行中');
    assert.equal(await trigger('collabProjectStatus').evaluate(element => element === document.activeElement), true);
    await trigger('collabProjectStatus').click();
    await page.keyboard.press('Escape');
    assert.equal(await menu.count(), 0);
    checks.push('项目筛选使用统一浅橙选中样式，鼠标与键盘更新真实筛选，刷新控件后焦点保留');

    await page.evaluate(() => {
      openModal('下拉表单回归', '<form id="selectTestForm"><label class="field"><span>处理方式</span><select id="selectTest" name="mode" class="input" required><option value="">请选择</option><option value="disabled" disabled>不可使用</option><option value="review">人工审核</option><option value="edit">继续编辑</option></select></label><input id="selectNext" class="input" name="note"><button type="submit">提交表单</button><button id="selectReset" type="button">重置</button></form>');
      document.getElementById('selectTestForm').onsubmit = event => { event.preventDefault(); window.selectTestSubmits = (window.selectTestSubmits || 0) + 1; };
      document.getElementById('selectReset').onclick = () => document.getElementById('selectTestForm').reset();
    });
    await allEnhanced();
    assert.equal(await trigger('selectTest').getAttribute('aria-label'), '处理方式');
    assert.equal(await trigger('selectTest').getAttribute('aria-required'), 'true');
    await page.locator('#selectTestForm label>span').click();
    assert.equal(await menu.count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.getElementById('selectTestForm').reportValidity()), false);
    assert.equal(await trigger('selectTest').getAttribute('aria-invalid'), 'true');
    await trigger('selectTest').focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => new FormData(document.getElementById('selectTestForm')).get('mode')), 'edit');
    assert.equal(await page.evaluate(() => window.selectTestSubmits || 0), 0);
    assert.equal(await trigger('selectTest').getAttribute('aria-invalid'), null);
    await trigger('selectTest').click();
    await page.keyboard.press('Escape');
    assert.ok(await page.getByRole('dialog', { name: '下拉表单回归' }).isVisible());
    await trigger('selectTest').click();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#selectNext').evaluate(element => element === document.activeElement), true);
    await trigger('selectTest').click();
    await page.getByRole('heading', { name: '下拉表单回归' }).click();
    assert.equal(await menu.count(), 0);
    await page.locator('#selectReset').click();
    await page.waitForFunction(() => document.getElementById('selectTest').customSelect.trigger.textContent === '请选择');
    await page.evaluate(() => { document.getElementById('selectTest').disabled = true; });
    await page.waitForFunction(() => document.getElementById('selectTest').customSelect.trigger.disabled);
    assert.ok(await trigger('selectTest').isDisabled());
    await page.evaluate(() => {
      const select = document.getElementById('selectTest');
      select.disabled = false;
      select.append(new Option('新选项', 'new'));
      select.querySelector('option[value="edit"]').textContent = '剪辑修改';
    });
    await trigger('selectTest').click();
    await menu.getByRole('option', { name: '新选项', exact: true }).click();
    assert.equal(await page.evaluate(() => new FormData(document.getElementById('selectTestForm')).get('mode')), 'new');
    await trigger('selectTest').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.getElementById('selectTest').value), 'review');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    checks.push('弹窗下拉保留字段名称、FormData、必填校验、禁用项与重置；选择不提交表单，Escape和Tab不误关闭弹窗');

    await page.evaluate(() => {
      const anchor = document.createElement('div');
      anchor.id = 'selectEdgeAnchor';
      Object.assign(anchor.style, { position: 'fixed', bottom: '8px', right: '8px', width: '200px', zIndex: '100' });
      anchor.innerHTML = '<select class="input" id="selectEdge" aria-label="边缘下拉"><option>第一项</option><option>第二项</option><option>第三项</option></select>';
      document.body.append(anchor);
    });
    await allEnhanced();
    await trigger('selectEdge').click();
    const bounds = await menu.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1500 && bounds.y + bounds.height <= 1000);
    assert.ok(bounds.y < (await trigger('selectEdge').boundingBox()).y);
    await page.evaluate(() => document.getElementById('selectEdgeAnchor').remove());
    await page.waitForFunction(() => !document.querySelector('.custom-select-list:not([hidden])'));
    checks.push('菜单不被表格或弹窗容器裁切，靠近屏幕底部向上打开，控件移除后无残留浮层');

    await nav('home');
    await page.getByRole('button', { name: '直接做视频', exact: true }).click();
    const routes = ['projects', 'tasks', 'runs', 'home', 'quick', 'studio', 'batch', 'resources', 'models', 'wardrobe', 'voices', 'reference', 'preferences', 'settings', 'labels', 'hotspots', 'drama'];
    for (const width of [1500, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of routes) {
        await nav(view);
        await allEnhanced();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${view} width ${width}`);
      }
    }
    await page.setViewportSize({ width: 1500, height: 1000 });
    await nav('projects');
    await trigger('collabProjectStatus').click();
    await page.screenshot({ path: path.join(__dirname, 'test-results', 'custom-select-projects.png') });
    await page.keyboard.press('Escape');
    const offline = await browser.newPage();
    await offline.goto('file:///' + path.resolve(__dirname, '../outputs/电商生产台.html').replace(/\\/g, '/') + '#projects');
    await offline.waitForFunction(() => document.getElementById('collabProjectStatus')?.customSelect?.root.isConnected);
    await offline.locator('#collabProjectStatus + .custom-select .custom-select-trigger').click();
    await offline.getByRole('option', { name: '已归档', exact: true }).click();
    assert.equal(await offline.evaluate(() => collabUi.projectStatus), '已归档');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    checks.push('17个入口四种宽度统一增强，无全页溢出或页面错误，离线版下拉筛选可操作，零模型调用');
    console.log(JSON.stringify({ status: 'passed', checks, pageErrors: errors, externalRequests: external }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
