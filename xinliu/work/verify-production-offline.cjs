const { chromium, executablePath, BASE_URL } = require('./browser-runtime.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '../outputs');
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1060 }, reducedMotion: 'reduce' });
  await page.goto('file:///' + path.join(root, '电商生产台.html').replace(/\\/g, '/') + '#home');
  await page.getByRole('button', { name: '载入示例客户' }).click();
  await page.locator('[data-action=nav][data-view=studio]').first().click();
  await page.locator('[data-action=studio-stage][data-stage="1"]').click();
  await page.getByRole('heading', { name: '选择拍法与开场' }).waitFor();
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: path.join(root, 'production-workbench/新版-离线制作.png') });
  await page.goto(BASE_URL + '/#home');
  await page.evaluate(() => {
    document.body.innerHTML = '<main style="display:grid;place-items:center;background:#e9eaec;min-height:100vh;padding:20px"><video id="checkVideo" src="/服饰细节_本地粗剪_非AI生成.webm" controls style="width:310px;max-height:850px;background:#222"></video></main>';
  });
  await page.waitForFunction(() => document.getElementById('checkVideo').readyState >= 2);
  const metadata = await page.evaluate(() => {
    const video = document.getElementById('checkVideo');
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, readyState: video.readyState };
  });
  assert.equal(metadata.width, 540);
  assert.equal(metadata.height, 960);
  await page.evaluate(() => document.getElementById('checkVideo').currentTime = 1);
  await page.screenshot({ path: path.join(root, 'production-workbench/新版-导出播放.png') });
  console.log(JSON.stringify({ offline: 'passed', exportedVideo: metadata }));
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
