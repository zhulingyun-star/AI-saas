const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createBackend } = require('../server.cjs');
const strategies = require('../../outputs/production-workbench/prompt-strategies.js');

function input(category = '服饰鞋包', capability = 'commerce') {
  return { config: { category, format: '细节演示', platform: '抖音', duration: 10, claims: '客户确认的颜色和外观', price: '', factsConfirmed: true, scene: '桌面操作', camera: '手机实拍感', style: '日常聊天', subtitle: '白字黑描边', flower: '无花字', cta: '查看商品详情', generationCapability: capability, outputSpec: { aspect: '9:16', resolution: '720p' } }, product: { name: '测试商品', sku: 'SKU-01' }, shots: [{ start: 0, end: 5, role: '商品全貌', visual: '商品正面', speech: '看外观' }, { start: 5, end: 10, role: '细节', visual: '商品近景', speech: '看细节' }] };
}
test('品类、拍法、平台与动作迁移使用不同策略，文本输出不会执行资料指令', () => {
  const compiled = Object.keys(strategies.categories).map(category => strategies.compile(input(category)));
  assert.equal(new Set(compiled.map(result => result.videoPrompt)).size, 7);
  assert.equal(new Set(compiled.map(result => result.visionPrompt)).size, 7);
  assert.equal(new Set(compiled.map(result => result.directorPrompt)).size, 7);
  const motion = strategies.compile(input('服饰鞋包', 'motion'));
  assert.match(motion.videoPrompt, /手部接触/);
  assert.ok(motion.requires.includes('motion_video'));
  const fashion = input();
  const talking = input(); talking.config.format = '真人口播';
  assert.notEqual(strategies.compile(fashion).videoPrompt, strategies.compile(talking).videoPrompt);
  talking.config.platform = '小红书';
  assert.match(strategies.compile(talking).videoPrompt, /少促销播报/);
  assert.notEqual(motion.videoPrompt, strategies.compile(input()).videoPrompt);
  const source = fs.readFileSync(path.resolve(__dirname, '../../outputs/production-workbench/app.js'), 'utf8');
  const names = [...source.matchAll(/formats: \[([^\]]+)\]/g)].slice(0, 7).flatMap(match => [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]));
  assert.deepEqual([...new Set(names)].filter(name => !strategies.formats[name]), []);
  assert.equal(new Set(names).size, 43);
  assert.equal(new Set(Object.values(strategies.formats).map(format => format.method)).size, 43);
});

test('本地API：独立素材、显式报价授权、幂等提交、查单、结果转存、未知不重发、重启落盘', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-api-test-'));
  let creates = 0; let chatCreates = 0; let uncertainCreates = 0;
  const calls = [];
  let fixtureOrigin;
  const fixture = http.createServer(async (request, response) => {
    if (request.url === '/result.webm') {
      response.writeHead(200, { 'Content-Type': 'video/webm' });
      response.end(fs.readFileSync(path.resolve(__dirname, '../../outputs/production-workbench/服饰细节_本地粗剪_非AI生成.webm')));
      return;
    }
    if (request.url === '/tasks' && request.method === 'POST') {
      let text = '';
      for await (const chunk of request) text += chunk;
      calls.push(JSON.parse(text));
      assert.equal(request.headers.authorization, 'Bearer fixture-only');
      creates++;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ id: `fixture-${creates}`, status: 'queued' }));
      return;
    }
    if (request.url.startsWith('/tasks/') && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ id: request.url.split('/').at(-1), status: 'succeeded', output: { video_url: fixtureOrigin + '/result.webm' } }));
      return;
    }
    if (request.url === '/chat' && request.method === 'POST') {
      let text = ''; for await (const chunk of request) text += chunk;
      assert.ok(JSON.parse(text).messages[1].content[0].text.includes('返回JSON'));
      chatCreates++;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: '{"visibleFacts":[],"missingFacts":["材质"]}' } }] }));
      return;
    }
    if (request.url === '/uncertain' && request.method === 'POST') {
      uncertainCreates++; request.socket.destroy(); return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
  process.env.XINLIU_FIXTURE_KEY = 'fixture-only';
  const provider = { protocol: 'xinliu-bridge', baseUrl: fixtureOrigin, keyEnv: 'XINLIU_FIXTURE_KEY', model: 'fixture-video', createPath: '/tasks', statusPath: '/tasks/{id}', idempotencyHeader: 'Idempotency-Key', supportsImageDataUri: true, supportedAspects: ['9:16'], supportedResolutions: ['720p'], maxDuration: 30, capabilities: ['commerce'], allowedResultOrigins: [fixtureOrigin], price: { creditsPerSecond: 2 }, response: { idPath: 'id', statusPath: 'status', resultPath: 'output.video_url', success: ['succeeded'], failed: ['failed'], running: ['queued', 'running'] } };
  let backend = createBackend({ port: 0, dataDir: temporary, providers: {}, allowFixture: true, maxParallel: 20, timeoutMs: 1000 });
  let origin = await backend.start();
  let cookie; let csrf;
  async function bootstrap() {
    const response = await fetch(origin + '/api/session', { method: 'POST', headers: { 'X-Xinliu-Local': '1' } });
    cookie = response.headers.get('set-cookie').split(';')[0];
    csrf = (await response.json()).csrf;
  }
  async function request(route, body = null) {
    const response = await fetch(origin + route, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json', 'X-Xinliu-CSRF': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  }
  try {
    assert.equal((await fetch(origin + '/api/config')).status, 401);
    assert.equal((await fetch(origin + '/api/session', { method: 'POST', headers: { 'X-Xinliu-Local': '1', Origin: 'https://attacker.example' } })).status, 403);
    await bootstrap();
    assert.equal((await fetch(origin + '/api/tasks', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    const health = await request('/api/health'); assert.equal(health.body.name, '心流');
    assert.equal((await request('/api/openapi')).body.openapi, '3.1.0');
    assert.equal((await request('/api/assets', { clientId: 'a', name: '内网链接', type: 'video/mp4', url: 'http://192.168.1.2/video.mp4' })).body.error.code, 'UNSAFE_URL');
    const compiled = await request('/api/prompts/compile', input()); assert.equal(compiled.status, 200);
    const upload = await request('/api/assets', { clientId: 'a', name: '真实图片', type: 'image/png', base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') });
    assert.equal(upload.status, 201);
    const assetId = upload.body.asset.id;
    const body = { clientId: 'a', workId: 'work-a', campaignId: 'project-a', kind: 'video', input: input(), assets: [{ assetId, role: 'product_image' }], idempotencyKey: 'video-a' };
    const draft = await request('/api/tasks', body); assert.equal(draft.status, 201);
    const taskId = draft.body.task.id;
    assert.equal((await request('/api/tasks', body)).body.task.id, taskId);
    const conflict = copy(body); conflict.input.config.claims = '不同输入';
    assert.equal((await request('/api/tasks', conflict)).status, 409);
    assert.equal((await request(`/api/tasks/${taskId}?clientId=b`)).status, 404);
    assert.equal((await request('/api/tasks', { ...body, clientId: 'b', idempotencyKey: 'cross-client' })).status, 422);
    assert.equal((await request(`/api/tasks/${taskId}/quote`, { clientId: 'a' })).body.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(creates, 0);
    backend.setProviders({ video: provider });
    const quote = (await request(`/api/tasks/${taskId}/quote`, { clientId: 'a' })).body.quote;
    assert.equal(quote.credits, 20); assert.equal(creates, 0);
    assert.equal((await request(`/api/tasks/${taskId}/submit`, { clientId: 'a', quoteId: quote.id, acceptedCredits: 20, authorized: false, budgetLimit: 20 })).status, 409);
    const submitBody = { clientId: 'a', quoteId: quote.id, acceptedCredits: 20, authorized: true, budgetLimit: 20 };
    const [first, second] = await Promise.all([request(`/api/tasks/${taskId}/submit`, submitBody), request(`/api/tasks/${taskId}/submit`, submitBody)]);
    assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(creates, 1);
    assert.equal(calls[0].assets[0].role, 'product_image'); assert.ok(calls[0].assets[0].url.startsWith('data:image/png'));
    const finished = await request(`/api/tasks/${taskId}/refresh`, { clientId: 'a' });
    assert.equal(finished.body.task.status, 'succeeded');
    const output = await fetch(origin + finished.body.task.resultUrl + '?clientId=a', { headers: { Cookie: cookie, Range: 'bytes=0-127' } });
    assert.equal(output.status, 206); assert.equal((await output.arrayBuffer()).byteLength, 128);
    assert.equal((await fetch(origin + finished.body.task.resultUrl + '?clientId=b', { headers: { Cookie: cookie } })).status, 404);
    assert.equal(JSON.stringify(await backend.readPersistedState()).includes('fixture-only'), false);
    const textProvider = { protocol: 'openai-chat', baseUrl: fixtureOrigin, createPath: '/chat', keyEnv: 'XINLIU_FIXTURE_KEY', model: 'fixture-vl', supportsImageDataUri: true, price: { fixedCredits: 1 } };
    backend.setProviders({ video: provider, vision: textProvider, text: textProvider });
    const vision = await request('/api/tasks', { ...body, kind: 'vision', idempotencyKey: 'vision-a' });
    const visionId = vision.body.task.id;
    const visionQuote = (await request(`/api/tasks/${visionId}/quote`, { clientId: 'a' })).body.quote;
    const visionResult = await request(`/api/tasks/${visionId}/submit`, { clientId: 'a', quoteId: visionQuote.id, acceptedCredits: 1, authorized: true, budgetLimit: 1 });
    assert.equal(visionResult.body.task.output.manualConfirmationRequired, true);
    assert.equal(chatCreates, 1);
    const motionInput = input('服饰鞋包', 'motion');
    const videoAsset = await request('/api/assets', { clientId: 'a', name: '动作参考', type: 'video/webm', url: fixtureOrigin + '/result.webm' });
    const motion = await request('/api/tasks', { ...body, input: motionInput, idempotencyKey: 'motion-a', assets: [{ assetId, role: 'product_image' }, { assetId, role: 'character_image' }, { assetId: videoAsset.body.asset.id, role: 'motion_video' }] });
    assert.equal((await request(`/api/tasks/${motion.body.task.id}/quote`, { clientId: 'a' })).body.error.code, 'CAPABILITY_NOT_SUPPORTED');
    const supportedMotionProvider = { ...provider, capabilities: ['commerce', 'motion'] };
    backend.setProviders({ video: supportedMotionProvider });
    assert.equal((await request(`/api/tasks/${motion.body.task.id}/quote`, { clientId: 'a' })).body.error.code, 'INVALID_MOTION_RANGE');
    motionInput.config.motion = { start: 0, end: 10, scope: '身体与表情', description: '缓慢转身，手接触商品' };
    const validMotion = await request('/api/tasks', { ...body, input: motionInput, idempotencyKey: 'motion-valid', assets: [{ assetId, role: 'product_image' }, { assetId, role: 'character_image' }, { assetId: videoAsset.body.asset.id, role: 'motion_video' }] });
    const motionId = validMotion.body.task.id;
    const motionQuote = (await request(`/api/tasks/${motionId}/quote`, { clientId: 'a' })).body.quote;
    assert.equal(creates, 1);
    await request(`/api/tasks/${motionId}/submit`, { clientId: 'a', quoteId: motionQuote.id, acceptedCredits: 20, authorized: true, budgetLimit: 20 });
    assert.equal(creates, 2);
    assert.equal(calls.at(-1).capability, 'motion');
    assert.equal(calls.at(-1).motion.description, '缓慢转身，手接触商品');
    assert.ok(calls.at(-1).assets.some(asset => asset.role === 'motion_video'));
    const unknownProvider = { ...provider, createPath: '/uncertain' };
    backend.setProviders({ video: unknownProvider });
    const uncertain = await request('/api/tasks', { ...body, idempotencyKey: 'uncertain-a' });
    const uncertainId = uncertain.body.task.id;
    const uncertainQuote = (await request(`/api/tasks/${uncertainId}/quote`, { clientId: 'a' })).body.quote;
    const uncertainBody = { clientId: 'a', quoteId: uncertainQuote.id, acceptedCredits: 20, authorized: true, budgetLimit: 20 };
    assert.equal((await request(`/api/tasks/${uncertainId}/submit`, uncertainBody)).body.task.status, 'unknown');
    await request(`/api/tasks/${uncertainId}/submit`, uncertainBody);
    assert.equal(uncertainCreates, 1);
    assert.equal((await request(`/api/tasks/${uncertainId}/refresh`, { clientId: 'a' })).body.error.code, 'NO_UPSTREAM_ID');
    await backend.close();
    backend = createBackend({ port: 0, dataDir: temporary, providers: {}, allowFixture: true });
    origin = await backend.start(); await bootstrap();
    assert.equal((await request(`/api/tasks/${taskId}?clientId=a`)).body.task.status, 'succeeded');
    assert.equal((await request(`/api/tasks/${uncertainId}?clientId=a`)).body.task.status, 'unknown');
    assert.ok(backend.state.reservations.every(reservation => reservation.status === 'held'));
  } finally {
    await backend.close();
    await new Promise(resolve => fixture.close(resolve));
    delete process.env.XINLIU_FIXTURE_KEY;
  }
});
function copy(value) { return JSON.parse(JSON.stringify(value)); }
