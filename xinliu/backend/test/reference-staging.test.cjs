'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { signature, signedDownload, stage, remove } = require('../../work/stage-reference.cjs');

test('reference staging uses a private unique object, expiring signed URL, and cleanup limited to its own object', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-reference-stage-'));
  const file = path.join(root, 'reference.mp4'), metadataFile = path.join(root, 'metadata.json');
  const bytes = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex'); fs.writeFileSync(file, bytes);
  const config = { bucket: 'fixture-bucket', origin: 'https://fixture-bucket.oss-cn-hangzhou.aliyuncs.com', keyId: 'fixture-only-id', secret: 'fixture-only-secret' };
  const calls = [];
  const transport = async (url, options) => { calls.push({ url, options }); return { ok: true }; };
  try {
    await stage(file, metadataFile, config, transport);
    const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    assert.match(metadata.key, /^xinliu-reference-tests\/[a-f0-9-]+\/reference\.mp4$/);
    assert.equal(calls[0].options.method, 'PUT'); assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.headers['x-oss-object-acl'], 'private'); assert.equal(calls[0].options.headers['x-oss-forbid-overwrite'], 'true');
    assert.equal(metadata.expires - Math.floor(Date.now() / 1000) <= 1800, true);
    assert.equal(fs.statSync(metadataFile).mode & 0o777, 0o600);
    assert.equal(JSON.stringify(metadata).includes(config.secret), false);
    assert.equal(metadata.signedUrl, signedDownload(config, metadata.key, metadata.expires));
    const get = new URL(metadata.signedUrl);
    assert.equal(get.searchParams.get('Signature'), signature(config, 'GET', metadata.key, String(metadata.expires)));
    const invalid = { ...metadata, key: 'existing-customer-data/video.mp4' }; fs.writeFileSync(metadataFile, JSON.stringify(invalid));
    await assert.rejects(remove(metadataFile, config, transport), /拒绝/); assert.equal(calls.length, 1);
    fs.writeFileSync(metadataFile, JSON.stringify(metadata)); await remove(metadataFile, config, transport);
    assert.equal(calls[1].options.method, 'DELETE');
    assert.equal(JSON.parse(fs.readFileSync(metadataFile, 'utf8')).signedUrl, undefined);
    assert.equal(JSON.parse(fs.readFileSync(metadataFile, 'utf8')).deleted, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
