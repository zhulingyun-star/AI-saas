'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { providersFromEnvironment } = require('../providers.cjs');
const { createBackend } = require('../server.cjs');
const protocols = require('../model-protocols.cjs');

test('all purposes use SilvaMux code profiles; environment selectors/key do not change them; no key in profiles', () => {
  const before = process.env.XINLIU_VIDEO_PROVIDER;
  process.env.XINLIU_VIDEO_PROVIDER = 'removed-channel';
  try {
    const profiles = providersFromEnvironment();
    for (const p of Object.values(profiles)) { assert.equal(p.id, 'silvamux'); assert.equal(p.baseUrl, 'https://www.silvamux.com'); assert.equal(p.keyEnv, undefined); assert.equal(p.apiKey, undefined); }
    assert.equal(profiles.vision.supportsVideoDataUri, true);
    assert.equal(profiles.text.createPath, '/api/v1/chat/completions');
    assert.equal(protocols.geminiText({ candidates: [{ finishReason: 'MAX_TOKENS' }] }), null);
    assert.equal(protocols.normalizeVideoResponse({ data: { task_id: 'x', state: 'completed', video_url: 'https://fixture.example/result.mp4' } }).status, 'succeeded');
  } finally { if (before === undefined) delete process.env.XINLIU_VIDEO_PROVIDER; else process.env.XINLIU_VIDEO_PROVIDER = before; }
});

test('SilvaMux chat accepts real video data, preserves quote/auth/idempotency, rejects incomplete answers, retains no key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silvamux-understanding-'));
  let calls = 0, truncated = false;
  const fixture = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer fixture-understanding-key');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw), content = payload.messages[1].content;
    assert.equal(payload.stream, false); assert.equal(payload.max_tokens, 4096);
    assert.ok(content[0].text);
    if (calls === 0) assert.match(content.find(p => p.type === 'video_url').video_url.url, /^data:video\/mp4;base64,/);
    calls++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ finish_reason: truncated ? 'length' : 'stop', message: { content: '{"summary":"苹果镜头推进","rules":[]}' } }] }));
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  process.env.SILVAMUX_UNDERSTANDING_FIXTURE = 'fixture-understanding-key';
  const profile = { ...providersFromEnvironment().vision, credentialSource: undefined, keyEnv: 'SILVAMUX_UNDERSTANDING_FIXTURE', baseUrl: `http://127.0.0.1:${fixture.address().port}`, price: { fixedCredits: 2 } };
  const backend = createBackend({ dataDir: dir, port: 0, allowFixture: true, providers: { vision: profile, text: profile } });
  const base = await backend.start();
  try {
    const login = await fetch(base + '/api/session', { method: 'POST', headers: { 'X-Xinliu-Local': '1' } });
    const cookie = login.headers.get('set-cookie').split(';')[0], csrf = (await login.json()).csrf;
    const api = async (route, body) => { const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Xinliu-CSRF': csrf }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, ...await r.json() }; };
    const asset = (await api('/api/assets', { clientId: 'a', name: 'clip.mp4', type: 'video/mp4', base64: Buffer.from('000000186674797069736f6d', 'hex').toString('base64') })).asset;
    const input = { config: { category: '食品饮料', format: '细节演示', duration: 4, videoAnalysis: true, teamId: 'default' }, shots: [{ start: 0, end: 4, visual: '视频观察', speech: '' }] };
    const task = (await api('/api/tasks', { clientId: 'a', workId: 'w', campaignId: 'c', kind: 'vision', input, assets: [{ assetId: asset.id, role: 'reference_video' }], idempotencyKey: 'understanding' })).task;
    const quote = (await api(`/api/tasks/${task.id}/quote`, { clientId: 'a' })).quote;
    assert.equal(calls, 0); assert.equal(quote.credits, 2);
    const auth = { clientId: 'a', quoteId: quote.id, acceptedCredits: 2, budgetLimit: 2, authorized: true };
    assert.equal((await api(`/api/tasks/${task.id}/submit`, { ...auth, authorized: false })).status, 409); assert.equal(calls, 0);
    const result = (await api(`/api/tasks/${task.id}/submit`, auth)).task;
    assert.equal(result.status, 'succeeded'); assert.equal(result.provider, 'silvamux'); assert.equal(result.output.manualConfirmationRequired, true);
    await api(`/api/tasks/${task.id}/submit`, auth); assert.equal(calls, 1);
    truncated = true;
    const second = (await api('/api/tasks', { clientId: 'a', workId: 'w', campaignId: 'c', kind: 'text', input: { ...input, config: { ...input.config, videoAnalysis: false } }, assets: [], idempotencyKey: 'text' })).task;
    const q2 = (await api(`/api/tasks/${second.id}/quote`, { clientId: 'a' })).quote;
    const partial = (await api(`/api/tasks/${second.id}/submit`, { ...auth, quoteId: q2.id })).task;
    assert.equal(partial.status, 'unknown'); assert.equal(partial.output, null); assert.equal(calls, 2);
    const saved = JSON.stringify(await backend.readPersistedState());
    assert.equal(saved.includes('fixture-understanding-key'), false);
    assert.equal(JSON.stringify(await api('/api/config')).includes('fixture-understanding-key'), false);
  } finally {
    await backend.close(); await new Promise(resolve => fixture.close(resolve)); delete process.env.SILVAMUX_UNDERSTANDING_FIXTURE;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
