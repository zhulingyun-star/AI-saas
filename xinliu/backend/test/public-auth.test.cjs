'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createBackend } = require('../server.cjs');

test('public access keeps real administrator auth, csrf, migration and private supplier configuration protected', async () => {
  assert.throws(() => createBackend({ host: '0.0.0.0' }), { code: 'PUBLIC_ORIGIN_REQUIRED' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silvamux-public-'));
  const password = crypto.randomBytes(24).toString('hex');
  const backend = createBackend({ host: '0.0.0.0', publicOrigin: 'http://fixture.example:58271', port: 0, dataDir: dir, adminPassword: password, providers: {} });
  await backend.start();
  const base = `http://127.0.0.1:${backend.server.address().port}`;
  try {
    assert.equal((await fetch(base + '/api/config')).status, 401);
    assert.equal((await fetch(base + '/api/workspace-import')).status, 401);
    assert.equal((await fetch(base + '/api/session', { method: 'POST', headers: { 'X-Xinliu-Local': '1' } })).status, 415);
    const session = await (await fetch(base + '/api/session')).json(); assert.equal(session.required, true); assert.equal(session.authenticated, false);
    const login = await fetch(base + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }) });
    assert.equal(login.status, 200);
    const body = await login.json(), headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
    assert.equal((await fetch(base + '/api/config', { headers })).status, 200);
    assert.deepEqual(await (await fetch(base + '/api/workspace-import', { headers })).json(), { import: null });
    assert.equal((await fetch(base + '/api/assets', { method: 'POST', headers, body: '{}' })).status, 403);
    assert.equal((await fetch(base + '/api/session', { method: 'DELETE', headers: { ...headers, 'X-Xinliu-CSRF': body.csrf } })).status, 200);
    assert.equal((await fetch(base + '/api/config', { headers })).status, 401);
    assert.equal((await fetch(base + '/silvamux.private.cjs')).status, 404);
    assert.equal((await fetch(base + '/api/health', { headers: { Origin: 'http://untrusted.example' } })).status, 403);
  } finally { await backend.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
