'use strict';

// Explicit CLI for one private, temporary reference object. Never loaded by the web server.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function configuration() {
  const bucket = process.env.XINLIU_OSS_BUCKET || '';
  const endpoint = new URL(process.env.XINLIU_OSS_ENDPOINT || 'https://oss-cn-hangzhou.aliyuncs.com');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || endpoint.protocol !== 'https:' || !/^oss-[a-z0-9-]+\.aliyuncs\.com$/.test(endpoint.hostname) || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) throw new Error('OSS桶或endpoint配置无效');
  const keyId = process.env.XINLIU_OSS_ACCESS_KEY_ID, secret = process.env.XINLIU_OSS_ACCESS_KEY_SECRET;
  if (!keyId || !secret) throw new Error('缺少本地OSS凭据');
  return { bucket, origin: `https://${bucket}.${endpoint.hostname}`, keyId, secret };
}

function signature(config, method, key, date, headers = {}) {
  const oss = Object.keys(headers).filter(name => name.startsWith('x-oss-')).sort().map(name => `${name}:${headers[name]}\n`).join('');
  const canonical = `${method}\n${headers['content-md5'] || ''}\n${headers['content-type'] || ''}\n${date}\n${oss}/${config.bucket}/${key}`;
  return crypto.createHmac('sha1', config.secret).update(canonical).digest('base64');
}

function signedDownload(config, key, expires) {
  const query = new URLSearchParams({ OSSAccessKeyId: config.keyId, Expires: String(expires), Signature: signature(config, 'GET', key, String(expires)) });
  return `${config.origin}/${key}?${query}`;
}

async function stage(filename, metadataFile, config, transport = fetch) {
  const bytes = fs.readFileSync(filename);
  if (bytes.length > 16 * 1024 * 1024 || bytes.subarray(4, 8).toString('ascii') !== 'ftyp') throw new Error('参考视频必须为16MB以内的MP4');
  const key = `xinliu-reference-tests/${crypto.randomUUID()}/reference.mp4`;
  const date = new Date().toUTCString();
  const headers = { date, 'content-type': 'video/mp4', 'content-md5': crypto.createHash('md5').update(bytes).digest('base64'), 'x-oss-forbid-overwrite': 'true', 'x-oss-object-acl': 'private' };
  headers.authorization = `OSS ${config.keyId}:${signature(config, 'PUT', key, date, headers)}`;
  const response = await transport(`${config.origin}/${key}`, { method: 'PUT', headers, body: bytes, redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`私有参考片上传失败：HTTP ${response.status}`);
  const expires = Math.floor(Date.now() / 1000) + 1800;
  const metadata = { origin: config.origin, key, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), expires, signedUrl: signedDownload(config, key, expires) };
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  fs.chmodSync(metadataFile, 0o600);
  return { origin: metadata.origin, bytes: metadata.bytes, expires: new Date(expires * 1000).toISOString(), metadataFile };
}

async function remove(metadataFile, config, transport = fetch) {
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  if (metadata.origin !== config.origin || !/^xinliu-reference-tests\/[a-f0-9-]{36}\/reference\.mp4$/.test(metadata.key)) throw new Error('拒绝清理非本次暂存对象');
  const date = new Date().toUTCString();
  const response = await transport(`${config.origin}/${metadata.key}`, { method: 'DELETE', headers: { date, authorization: `OSS ${config.keyId}:${signature(config, 'DELETE', metadata.key, date)}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`暂存对象清理失败：HTTP ${response.status}`);
  delete metadata.signedUrl; metadata.deleted = true;
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  return { deleted: true, origin: metadata.origin };
}

if (require.main === module) {
  process.loadEnvFile(path.resolve(__dirname, '../backend/storage.env'));
  const [action, file, output] = process.argv.slice(2);
  const config = configuration();
  const job = action === 'upload' && file && output ? stage(path.resolve(file), path.resolve(output), config) : action === 'remove' && file ? remove(path.resolve(file), config) : Promise.reject(new Error('用法：stage-reference.cjs upload <mp4> <本地metadata.json> | remove <metadata.json>'));
  job.then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { configuration, signature, signedDownload, stage, remove };
