'use strict';
const { chromium, executablePath, BASE_URL } = require('./browser-runtime.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(15000);
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(BASE_URL + '/')) external.push(request.url()); });
    await page.goto(BASE_URL + '/#home');
    await page.getByRole('button', { name: '直接做视频', exact: true }).click();
    await page.locator('#draftMedia').setInputFiles(path.resolve(__dirname, '../outputs/production-workbench/media/shirt.jpg'));
    await page.waitForFunction(() => product().name === 'shirt.jpg');
    await page.locator('#flowClaims').fill('本地粗剪测试，只展示商品外观');
    await page.getByRole('button', { name: '看本条方案', exact: true }).click();
    await page.locator('#flowApprove').check();
    await page.getByRole('button', { name: '确认并创建 1 条产单', exact: true }).click();
    await page.goto(BASE_URL + '/#voices');
    await page.getByRole('button', { name: '上传真人口播', exact: true }).click();
    // A locally synthesized one-second tone is a deterministic audio fixture, not a model voice.
    const wav = Buffer.alloc(44 + 16000);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(16000, 40);
    for (let n = 0; n < 8000; n++) wav.writeInt16LE(Math.round(Math.sin(n * 2 * Math.PI * 440 / 8000) * 5000), 44 + n * 2);
    await page.locator('#voiceAudio').setInputFiles({ name: 'local-tone.wav', mimeType: 'audio/wav', buffer: wav });
    await page.waitForFunction(() => client().voices.some(v => v.name === 'local-tone.wav'));
    await page.evaluate(() => {
      state.config.voiceId = client().voices.find(v => v.name === 'local-tone.wav').id;
      state.config.modelId = 'none'; saveDraft(); viewState.stage = 4; navigate('studio');
    });
    const before = await page.evaluate(() => client().jobs.length);
    const event = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: '导出预览视频', exact: true }).click();
    const download = await event;
    const file = await download.path();
    const bytes = fs.readFileSync(file);
    assert.ok(bytes.length > 5000); assert.equal(bytes.subarray(0, 4).toString('hex'), '1a45dfa3');
    const stored = await page.evaluate(() => ({ job: client().jobs[0], count: client().jobs.length, balance: client().ledger.length, busy: viewState.renderBusy }));
    assert.equal(stored.count, before + 1); assert.equal(stored.job.cost, 0); assert.ok(stored.job.fileId); assert.equal(stored.balance, 0); assert.equal(stored.busy, false);
    await page.evaluate(async fileId => {
      const video = document.createElement('video'); video.id = 'exportPlaybackTest'; video.muted = true;
      video.src = await fileUrl(fileId); document.body.appendChild(video);
    }, stored.job.fileId);
    await page.waitForFunction(() => document.getElementById('exportPlaybackTest').readyState >= 2);
    await page.locator('#exportPlaybackTest').evaluate(v => v.play());
    await page.waitForFunction(() => document.getElementById('exportPlaybackTest').currentTime > 0.3);
    const playback = await page.locator('#exportPlaybackTest').evaluate(v => {
      const stream = v.captureStream();
      const result = { width: v.videoWidth, height: v.videoHeight, audioTracks: stream.getAudioTracks().length, decodedAudioBytes: v.webkitAudioDecodedByteCount, time: v.currentTime };
      stream.getTracks().forEach(t => t.stop()); v.pause(); return result;
    });
    assert.equal(playback.width, 540); assert.equal(playback.height, 960); assert.equal(playback.audioTracks, 1); assert.ok(playback.decodedAudioBytes > 0);
    await page.reload(); assert.equal(await page.evaluate(() => client().jobs[0].fileId), stored.job.fileId);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ status: 'passed', checks: ['真实商品图片与WAV上传', '浏览器实际渲染4秒WebM且可下载', '导出含540×960视频及可解码音轨', '文件/产单落盘、刷新恢复、零模型积分', '无脚本异常及外部调用'], bytes: bytes.length, playback, pageErrors: errors, externalRequests: external, scope: '本地浏览器粗剪，非AI画面生成或声音克隆' }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
