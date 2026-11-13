'use strict';
const { chromium, executablePath, BASE_URL } = require('./browser-runtime.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const checks = [], errors = [], external = [];
  try {
    const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1500, height: 1000 } });
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(BASE_URL + '/')) external.push(request.url()); });
    await page.goto(BASE_URL + '/#data');
    await page.getByRole('heading', { name: '没有报表，就不展示增长数字' }).waitFor();
    const templateEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载CSV模板', exact: true }).click();
    const template = await templateEvent;
    assert.match(fs.readFileSync(await template.path(), 'utf8'), /素材名,SKU,消耗,曝光,点击,订单,成交金额/);
    checks.push('空报表不伪造指标、CSV模板可下载');
    async function upload(name, text) {
      await page.getByRole('button', { name: '导入素材报表', exact: true }).click();
      await page.evaluate(() => document.querySelector('.toast')?.classList.remove('visible'));
      await page.locator('#dataCsv').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
      await page.waitForFunction(() => document.querySelector('.toast.visible'));
      return page.locator('.toast').innerText();
    }
    const header = '素材名,SKU,消耗,曝光,点击,订单,成交金额\r\n';
    const valid = '\uFEFF' + header + '"镜头A,主图",SKU-A,100,1000,100,10,500\r\n"镜头B""角度",SKU-B,￥900,9000,90,30,1500\r\n';
    await upload('weighted.csv', valid);
    assert.deepEqual(await page.locator('.stats .stat strong').allTextContents(), ['¥1,000', '1.90%', '¥25.00', '2.00']);
    assert.equal(await page.locator('main tbody tr').count(), 2);
    assert.deepEqual(await page.evaluate(() => client().metrics.map(row => row.name)), ['镜头A,主图', '镜头B"角度']);
    checks.push('BOM/CRLF/引号逗号/转义引号与货币符号、按汇总量计算CTR/CPA/ROAS');
    const failures = [];
    for (const [name, csv] of [
      ['missing-columns', '素材名,消耗\n缺列,10'],
      ['negative-number', header + '负数,A,-1,100,10,1,20'],
      ['non-number', header + '非数字,A,abc,100,10,1,20'],
      ['blank-number', header + '空消耗,A,,100,10,1,20'],
      ['fractional-count', header + '小数曝光,A,10,100.5,10,1,20'],
      ['unclosed-quote', header + '"缺少闭合引号,A,10,100,10,1,20'],
      ['duplicate-column', header.replace('成交金额', '成交金额,消耗') + '重复列,A,10,100,10,1,20,10'],
      ['mismatched-column-count', header + '缺少数据列,A,10,100,10,1'],
      ['misplaced-quote', header + '错误"引号,A,10,100,10,1,20'],
      ['characters-after-quote', header + '"名称"多余,A,10,100,10,1,20'],
      ['unsafe-integer', header + '超大计数,A,10,9007199254740992,10,1,20'],
      ['whitespace-name', header + '   ,A,10,100,10,1,20']
    ]) {
      await upload('weighted.csv', valid);
      const before = await page.evaluate(() => JSON.stringify(client().metrics));
      const message = await upload(name + '.csv', csv);
      const after = await page.evaluate(() => JSON.stringify(client().metrics));
      if (before !== after || /导入\s*\d+\s*条/.test(message)) failures.push(name);
      if (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    }
    assert.deepEqual(failures, [], 'Invalid CSV must not silently replace the current report');
    checks.push('12类无效CSV全部拒绝且保留旧报表，包括缺列、非法数值、引号错误、重复列和不安全整数');
    await upload('weighted.csv', valid);
    await page.goto(BASE_URL + '/#home');
    await page.getByRole('button', { name: '直接做视频', exact: true }).click();
    await page.locator('#flowClaims').fill('测试商品已确认的外观');
    await page.getByRole('button', { name: '看本条方案', exact: true }).click();
    await page.locator('#flowApprove').check();
    await page.getByRole('button', { name: '确认并创建 1 条产单', exact: true }).click();
    const jobId = await page.evaluate(() => client().jobs[0].id);
    await page.goto(BASE_URL + '/#data');
    await page.locator('[data-metric-job="0"]').selectOption(jobId);
    await page.reload();
    assert.equal(await page.locator('[data-metric-job="0"]').inputValue(), jobId);
    assert.deepEqual(await page.locator('.stats .stat strong').allTextContents(), ['¥1,000', '1.90%', '¥25.00', '2.00']);
    const exportEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出素材报表', exact: true }).click();
    const exported = JSON.parse(fs.readFileSync(await (await exportEvent).path(), 'utf8'));
    assert.equal(exported.length, 2); assert.equal(exported[0].jobId, jobId);
    await page.locator('#activeClient').selectOption('lumi');
    await page.getByRole('heading', { name: '没有报表，就不展示增长数字' }).waitFor();
    await page.locator('#activeClient').selectOption('qingyu');
    assert.equal(await page.locator('[data-metric-job="0"]').inputValue(), jobId);
    checks.push('报表关联真实产单、刷新保留、JSON导出与客户分区隔离');
    await upload('zero.csv', header + '零投放,A,0,0,0,0,0');
    const zero = await page.locator('.stats .stat strong').allTextContents();
    assert.ok(!zero.join('').includes('NaN') && !zero.join('').includes('Infinity'));
    assert.deepEqual(zero, ['¥0', '—%', '—', '—']);
    checks.push('零分母显示缺省值，不产生NaN/Infinity或虚构表现');
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ status: 'passed', checks, pageErrors: errors, externalRequests: external, scope: '本地CSV复盘，未连接千川或实时投放平台' }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
