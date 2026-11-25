'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

// One administrator, no registration or browser-side password storage.
function createAuth({ password = process.env.XINLIU_ADMIN_PASSWORD, now = Date.now, secureCookies = false } = {}) {
  const salt = crypto.randomBytes(16);
  const digest = password ? crypto.scryptSync(password, salt, 32) : null;
  const sessions = new Map();
  const failures = new Map();
  const lifetime = 12 * 3600000;
  function fail(status, code, message) { throw Object.assign(new Error(message), { status, code }); }
  function token(request) {
    return String(request.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('xinliu_session='))?.slice(15);
  }
  function prune() {
    for (const [key, value] of sessions) if (value.expires <= now()) sessions.delete(key);
    for (const [key, value] of failures) if (value.until <= now()) failures.delete(key);
  }
  function cookie(value, maxAge) { return `xinliu_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`; }
  function session(request, mutating = false) {
    prune();
    const entry = sessions.get(token(request));
    if (!entry) fail(401, 'LOGIN_REQUIRED', '请登录管理员账号');
    if (mutating && request.headers['x-xinliu-csrf'] !== entry.csrf) fail(403, 'CSRF', '登录确认标识无效，请刷新后重试');
    return entry;
  }
  return {
    session,
    async login(request, body) {
      if (!digest) fail(503, 'ADMIN_NOT_CONFIGURED', '管理员密码未配置，请在后端 auth.env 设置 XINLIU_ADMIN_PASSWORD 后重启服务');
      prune();
      const address = request.socket.remoteAddress;
      const attempts = failures.get(address) || { count: 0, until: now() + 15 * 60000 };
      if (attempts.count >= 10) fail(429, 'LOGIN_RATE_LIMIT', '登录尝试过多，请稍后重试');
      attempts.count++;
      failures.set(address, attempts);
      const validShape = body && typeof body.username === 'string' && typeof body.password === 'string' && body.password.length <= 1024;
      const candidate = await scrypt(validShape ? body.password : '', salt, 32);
      if (!validShape || !crypto.timingSafeEqual(candidate, digest) || body.username !== 'admin') fail(401, 'INVALID_CREDENTIALS', '账号或密码错误');
      failures.delete(address);
      sessions.delete(token(request));
      if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
      const id = crypto.randomBytes(32).toString('hex');
      const entry = { username: 'admin', csrf: crypto.randomBytes(32).toString('hex'), expires: now() + lifetime };
      sessions.set(id, entry);
      return { entry, cookie: cookie(id, lifetime / 1000) };
    },
    logout(request) {
      session(request, true);
      sessions.delete(token(request));
      return cookie('', 0);
    }
  };
}

module.exports = { createAuth };
