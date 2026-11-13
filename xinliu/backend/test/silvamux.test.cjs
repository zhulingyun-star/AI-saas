'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBackend } = require('../server.cjs');
const { providersFromEnvironment, videoPayload, videoSpec } = require('../silvamux.cjs');

test('SilvaMux profile and multimodal Ark payload preserve roles and use explicit silent defaults', () => {
  assert.deepEqual(videoSpec({}), { duration: 4, resolution: '480p', ratio: '9:16', generate_audio: false });
  assert.equal(providersFromEnvironment().video.protocol, 'ark-video');
  const payload = videoPayload({ input: { config: { duration: 4 } }, prompt: '测试', strategy: { negativePrompt: '变形' } }, { model: 'seedance-test' }, [
    { role: 'product_image', url: 'https://assets.example/product.jpg' },
    { role: 'character_image', url: 'https://assets.example/person.jpg' },
    { role: 'reference_video', url: 'https://assets.example/video.mp4' },
    { role: 'voice_audio', url: 'https://assets.example/audio.mp3' }
  ]);
  assert.deepEqual(payload.content.slice(1).map(item => [item.type, item.role]), [
    ['image_url', 'reference_image'], ['image_url', 'reference_image'], ['video_url', 'reference_video'], ['audio_url', 'reference_audio']
  ]);
  assert.match(payload.content[0].text, /无声/);
  assert.equal(payload.duration, 4);
  assert.equal(payload.generate_audio, false);
  assert.equal(payload.client_task_id, undefined);
});

test('SilvaMux integration: quote/auth, id-only create, poll/retain, denied access, unknown no resend', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-silvamux-'));
  let mode = 'ok', calls = 0, fixtureOrigin;
  const fixture = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    assert.equal(req.headers.authorization, req.url === '/result.webm' ? undefined : 'Bearer mock-secret');
    if (req.method === 'POST') {
      calls++;
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      assert.equal(req.url, '/api/v3/contents/generations/tasks');
      assert.equal(body.duration, 4); assert.equal(body.resolution, '480p'); assert.equal(body.generate_audio, false);
      assert.equal(body.content[1].role, 'reference_image');
      if (mode === 'denied') { res.statusCode = 403; res.end(JSON.stringify({ error: { code: 'MODEL_ACCESS_DENIED', message: 'mock-secret should not be exposed' } })); return; }
      if (mode === 'uncertain') { req.socket.destroy(); return; }
      res.end(JSON.stringify({ id: 'ark-task-1' })); return;
    }
    if (req.url === '/api/v3/contents/generations/tasks/ark-task-1') {
      res.end(JSON.stringify({ id: 'ark-task-1', status: 'succeeded', content: { video_url: fixtureOrigin + '/result.webm' }, usage: { completion_tokens: 100 } })); return;
    }
    if (req.url === '/result.webm') {
      res.setHeader('Content-Type', 'video/webm');
      res.end(fs.readFileSync(path.resolve(__dirname, '../../outputs/production-workbench/服饰细节_本地粗剪_非AI生成.webm'))); return;
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
  process.env.XINLIU_ARK_TEST_KEY = 'mock-secret';
  const provider = { ...providersFromEnvironment().video, baseUrl: fixtureOrigin, keyEnv: 'XINLIU_ARK_TEST_KEY', price: { creditsPerSecond: 1 }, allowedResultOrigins: [fixtureOrigin] };
  const backend = createBackend({ dataDir, port: 0, allowFixture: true, providers: { video: provider }, timeoutMs: 500 });
  const origin = await backend.start();
  try {
    const session = await fetch(origin + '/api/session', { method: 'POST', headers: { 'X-Xinliu-Local': '1' } });
    const cookie = session.headers.get('set-cookie').split(';')[0], csrf = (await session.json()).csrf;
    async function api(url, body) {
      const r = await fetch(origin + url, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Xinliu-CSRF': csrf }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, ...await r.json() };
    }
    const asset = await api('/api/assets', { clientId: 'a', name: '真实商品图', type: 'image/png', base64: Buffer.from([137,80,78,71,13,10,26,10]).toString('base64') });
    const input = { config: { category: '食品饮料', format: '细节演示', factsConfirmed: true, generationCapability: 'commerce', duration: 4, generateAudio: false, outputSpec: { aspect: '9:16', resolution: '480p' } }, product: { name: '果茶' }, shots: [{ start: 0, end: 4, visual: '杯壁水珠', speech: '' }] };
    let n = 0;
    const draft = async plan => (await api('/api/tasks', { clientId: 'a', workId: 'w', campaignId: 'c', kind: 'video', input: plan || input, assets: [{ assetId: asset.asset.id, role: 'product_image' }], idempotencyKey: 'ark-' + ++n })).task;
    const quote = async id => api(`/api/tasks/${id}/quote`, { clientId: 'a' });
    const submit = async (id, q, authorized = true) => api(`/api/tasks/${id}/submit`, { clientId: 'a', quoteId: q.id, acceptedCredits: q.credits, budgetLimit: q.credits, authorized });
    const task = await draft();
    backend.setProviders({ video: { ...provider, price: { creditsPerSecond: null } } });
    assert.equal((await quote(task.id)).error.code, 'PRICE_UNKNOWN'); assert.equal(calls, 0);
    backend.setProviders({ video: provider });
    const q = (await quote(task.id)).quote;
    assert.equal(q.credits, 4); assert.equal(q.spec.resolution, '480p'); assert.equal(calls, 0);
    assert.equal((await submit(task.id, q, false)).status, 409); assert.equal(calls, 0);
    const created = await submit(task.id, q);
    assert.equal(created.task.status, 'queued'); assert.equal(created.task.upstreamId, 'ark-task-1');
    await submit(task.id, q); assert.equal(calls, 1);
    // Result retrieval remains pinned to the configuration used when submitting.
    backend.setProviders({});
    const done = await api(`/api/tasks/${task.id}/refresh`, { clientId: 'a' });
    assert.equal(done.task.status, 'succeeded'); assert.ok(done.task.resultUrl);
    const result = await fetch(origin + done.task.resultUrl + '?clientId=a', { headers: { Cookie: cookie, Range: 'bytes=0-15' } });
    assert.equal(result.status, 206); assert.equal((await result.arrayBuffer()).byteLength, 16);
    backend.setProviders({ video: provider });
    const audio = structuredClone(input); audio.config.generateAudio = true;
    assert.equal((await quote((await draft(audio)).id)).error.code, 'PRICE_UNKNOWN');
    // An unapproved result origin can be added later, without another paid create.
    const stored = backend.state.tasks.find(item => item.id === task.id);
    stored.status = 'result_unavailable'; stored.lastRefresh = 0;
    stored.providerSnapshot.allowedResultOrigins = [];
    backend.setProviders({ video: { ...provider, allowedResultOrigins: [] } });
    const blocked = await api(`/api/tasks/${task.id}/refresh`, { clientId: 'a' });
    assert.equal(blocked.task.status, 'result_unavailable'); assert.match(blocked.task.error, /RESULT_ORIGIN|未获允许/);
    backend.setProviders({ video: provider }); stored.lastRefresh = 0;
    assert.equal((await api(`/api/tasks/${task.id}/refresh`, { clientId: 'a' })).task.status, 'succeeded');
    assert.equal(calls, 1);
    for (const duration of [3, 4.5, 16]) {
      const bad = structuredClone(input); bad.config.duration = duration; bad.shots[0].end = duration;
      assert.equal((await quote((await draft(bad)).id)).error.code, 'SPEC_NOT_SUPPORTED');
    }
    const hd = structuredClone(input); hd.config.outputSpec.resolution = '1080p';
    assert.equal((await quote((await draft(hd)).id)).error.code, 'SPEC_NOT_SUPPORTED'); assert.equal(calls, 1);
    mode = 'denied';
    const denied = await draft(), dq = (await quote(denied.id)).quote;
    const rejected = (await submit(denied.id, dq)).task;
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.errorCode, 'MODEL_ACCESS_DENIED'); assert.match(rejected.error, /开通/);
    assert.equal(JSON.stringify(rejected).includes('mock-secret'), false);
    assert.equal(backend.state.reservations.find(r => r.taskId === denied.id).status, 'released');
    await submit(denied.id, dq); await api(`/api/tasks/${denied.id}/refresh`, { clientId: 'a' }); assert.equal(calls, 2);
    mode = 'uncertain';
    const uncertain = await draft(), uq = (await quote(uncertain.id)).quote;
    assert.equal((await submit(uncertain.id, uq)).task.status, 'unknown');
    await submit(uncertain.id, uq); assert.equal(calls, 3);
    assert.equal(JSON.stringify(await backend.readPersistedState()).includes('mock-secret'), false);
  } finally {
    await backend.close(); await new Promise(resolve => fixture.close(resolve)); delete process.env.XINLIU_ARK_TEST_KEY;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
