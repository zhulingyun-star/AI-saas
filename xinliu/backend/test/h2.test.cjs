'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createBackend } = require('../server.cjs');

test('H2 imports legacy JSON once, preserves the original, and restores the committed database after restart', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-h2-migration-'));
  const original = JSON.stringify({ assets: [{ id: 'old-asset', clientId: 'a', name: '旧素材' }], tasks: [{ id: 'unfinished', status: 'submitting', refreshing: true }], quotes: [], reservations: [], events: [] });
  fs.writeFileSync(path.join(dataDir, 'state.json'), original);
  let backend = createBackend({ dataDir, port: 0, providers: {} });
  try {
    const origin = await backend.start();
    assert.equal((await (await fetch(origin + '/api/health')).json()).database, 'H2');
    assert.ok(fs.statSync(path.join(dataDir, 'xinliu.mv.db')).size > 0);
    assert.equal(backend.state.assets[0].name, '旧素材');
    assert.equal(backend.state.tasks[0].status, 'unknown');
    assert.equal(backend.state.tasks[0].refreshing, false);
    assert.equal(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'), original);
    const committed = await backend.readPersistedState();
    assert.equal(committed.tasks[0].status, 'unknown');
    await backend.close();
    // Once H2 exists, even an invalid old backup must not be read or resurrect old state.
    fs.writeFileSync(path.join(dataDir, 'state.json'), 'legacy-backup-is-not-the-current-database');
    backend = createBackend({ dataDir, port: 0, providers: {} });
    await backend.start();
    assert.deepEqual(await backend.readPersistedState(), committed);
    assert.equal(backend.state.assets[0].id, 'old-asset');
  } finally { await backend.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('H2 fails closed on invalid first migration and blocks a second process instead of falling back to JSON', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-h2-invalid-'));
  fs.writeFileSync(path.join(dataDir, 'state.json'), '{broken');
  const broken = createBackend({ dataDir, port: 0, providers: {} });
  let first, second;
  try {
    await assert.rejects(broken.start());
    assert.equal(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'), '{broken');
    fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({ assets: [], tasks: [], quotes: [], reservations: [], events: [] }));
    first = createBackend({ dataDir, port: 0, providers: {} }); await first.start();
    second = createBackend({ dataDir, port: 0, providers: {} });
    await assert.rejects(second.start(), /H2/);
    assert.equal(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'), JSON.stringify({ assets: [], tasks: [], quotes: [], reservations: [], events: [] }));
  } finally {
    await broken.close(); if (second) await second.close(); if (first) await first.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
