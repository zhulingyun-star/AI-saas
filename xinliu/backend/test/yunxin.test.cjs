'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { providersFromEnvironment } = require('../providers.cjs');
const yunxin = require('../yunxin.cjs');
const { createBackend } = require('../server.cjs');

test('provider selection is independent; keys, prefixes and models never fall back across providers', () => {
  const names = ['XINLIU_VIDEO_PROVIDER', 'XINLIU_TEXT_PROVIDER', 'XINLIU_VISION_PROVIDER'];
  const before = names.map(name => process.env[name]);
  try {
    process.env.XINLIU_VIDEO_PROVIDER = 'silvamux';
    process.env.XINLIU_TEXT_PROVIDER = 'yunxin';
    process.env.XINLIU_VISION_PROVIDER = 'yunxin';
    let providers = providersFromEnvironment();
    assert.equal(providers.video.id, 'silvamux'); assert.equal(providers.video.keyEnv, 'SILVAMUX_API_KEY');
    assert.equal(providers.text.id, 'yunxin'); assert.equal(providers.text.keyEnv, 'YUNXIN_TEXT_KEY');
    assert.equal(providers.text.protocol, 'gemini-content');
    assert.match(providers.text.createPath, /^\/hub\/v1beta\/models\/[^/]+:generateContent$/);
    process.env.XINLIU_VIDEO_PROVIDER = 'yunxin'; providers = providersFromEnvironment();
    assert.equal(providers.video.keyEnv, 'YUNXIN_VIDEO_KEY');
    assert.equal(providers.video.createPath, '/hub/volcengine/api/v3/contents/generations/tasks');
    process.env.XINLIU_VIDEO_PROVIDER = 'typo'; assert.throws(providersFromEnvironment, /未知/);
  } finally { names.forEach((name, i) => { if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i]; }); }
});

test('Yunxin response normalization preserves terminal states and refuses partial Gemini answers', () => {
  assert.equal(yunxin.geminiText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] }), null);
  assert.equal(yunxin.geminiText({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'private thought', thought: true }, { text: '{"ok":true}' }] } }] }), '{"ok":true}');
  assert.equal(yunxin.normalizeVideoResponse({ data: { task_id: 'abc', state: 'completed', metadata: { result_urls: ['https://example.com/result.mp4'] } } }).content.video_url, 'https://example.com/result.mp4');
  assert.equal(yunxin.normalizeVideoResponse({ status: 'expired' }).status, 'failed');
  assert.throws(() => yunxin.normalizeVideoResponse({ code: 500, success: false }), /业务错误/);
});

test('Yunxin text/vision/video use channel keys; video polling stays pinned after switching provider', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-yunxin-'));
  let origin, videoCreates = 0, textCalls = 0;
  const fixture = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/hub/v1beta/')) {
      assert.equal(req.headers.authorization, 'Bearer mock-yunxin-text');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw); assert.ok(body.contents[0].parts[0].text);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      if (textCalls === 1) assert.equal(body.contents[0].parts[1].inline_data.mime_type, 'image/png');
      textCalls++;
      res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"visibleFacts":[],"missingFacts":[]}' }] } }] })); return;
    }
    if (req.url === '/hub/volcengine/api/v3/contents/generations/tasks' && req.method === 'POST') {
      assert.equal(req.headers.authorization, 'Bearer mock-yunxin-video');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw); assert.equal(body.duration, 4); assert.equal(body.model, 'doubao-seedance-2-0');
      videoCreates++; res.end(JSON.stringify({ task_id: 'yunxin-task' })); return;
    }
    if (req.url === '/hub/volcengine/api/v3/contents/generations/tasks/yunxin-task') {
      assert.equal(req.headers.authorization, 'Bearer mock-yunxin-video');
      res.end(JSON.stringify({ code: 0, data: { task_id: 'yunxin-task', state: 'completed', video_url: origin + '/result.webm' } })); return;
    }
    if (req.url === '/result.webm') {
      assert.equal(req.headers.authorization, undefined); res.setHeader('Content-Type', 'video/webm');
      res.end(fs.readFileSync(path.resolve(__dirname, '../../outputs/production-workbench/服饰细节_本地粗剪_非AI生成.webm'))); return;
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${fixture.address().port}`;
  process.env.YUNXIN_MOCK_TEXT = 'mock-yunxin-text'; process.env.YUNXIN_MOCK_VIDEO = 'mock-yunxin-video';
  const providers = yunxin.providersFromEnvironment();
  for (const [kind, provider] of Object.entries(providers)) {
    provider.baseUrl = origin; provider.keyEnv = kind === 'video' ? 'YUNXIN_MOCK_VIDEO' : 'YUNXIN_MOCK_TEXT';
    provider.allowedResultOrigins = [origin]; provider.price = kind === 'video' ? { creditsPerSecond: 3 } : { fixedCredits: 6 };
  }
  const backend = createBackend({ dataDir, port: 0, allowFixture: true, providers }); const base = await backend.start();
  try {
    const session = await fetch(base + '/api/session', { method: 'POST', headers: { 'X-Xinliu-Local': '1' } });
    const cookie = session.headers.get('set-cookie').split(';')[0], csrf = (await session.json()).csrf;
    const api = async (route, body) => { const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Xinliu-CSRF': csrf }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, ...await r.json() }; };
    const asset = (await api('/api/assets', { clientId: 'a', name: '商品', type: 'image/png', base64: Buffer.from([137,80,78,71,13,10,26,10]).toString('base64') })).asset;
    const input = { config: { category: '食品饮料', format: '细节演示', duration: 4, factsConfirmed: true, generationCapability: 'commerce', outputSpec: { aspect: '9:16', resolution: '480p' } }, shots: [{ start: 0, end: 4, visual: '商品', speech: '' }] };
    let videoId;
    for (const kind of ['text', 'vision', 'video']) {
      const task = (await api('/api/tasks', { clientId: 'a', workId: 'w', campaignId: 'c', kind, input, assets: [{ assetId: asset.id, role: 'product_image' }], idempotencyKey: kind })).task;
      const quote = (await api(`/api/tasks/${task.id}/quote`, { clientId: 'a' })).quote;
      assert.equal(quote.credits, kind === 'video' ? 12 : 6);
      const body = { clientId: 'a', quoteId: quote.id, acceptedCredits: quote.credits, budgetLimit: quote.credits, authorized: true };
      const submitted = (await api(`/api/tasks/${task.id}/submit`, body)).task;
      assert.equal(submitted.provider, 'yunxin');
      assert.equal(submitted.status, kind === 'video' ? 'queued' : 'succeeded');
      if (kind !== 'video') assert.equal(submitted.output.manualConfirmationRequired, true);
      else videoId = task.id;
      await api(`/api/tasks/${task.id}/submit`, body);
    }
    assert.equal(textCalls, 2); assert.equal(videoCreates, 1);
    backend.setProviders({ video: { ...providers.video, id: 'silvamux', keyEnv: 'DO_NOT_USE_THIS_OTHER_KEY' } });
    const result = (await api(`/api/tasks/${videoId}/refresh`, { clientId: 'a' })).task;
    assert.equal(result.status, 'succeeded'); assert.ok(result.resultUrl); assert.equal(result.provider, 'yunxin');
    const config = JSON.stringify(await api('/api/config'));
    const state = JSON.stringify(await backend.readPersistedState());
    for (const secret of ['mock-yunxin-text', 'mock-yunxin-video']) { assert.equal(config.includes(secret), false); assert.equal(state.includes(secret), false); }
  } finally {
    await backend.close(); await new Promise(resolve => fixture.close(resolve)); fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.YUNXIN_MOCK_TEXT; delete process.env.YUNXIN_MOCK_VIDEO;
  }
});
