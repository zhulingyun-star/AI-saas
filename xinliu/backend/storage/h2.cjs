'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

const VERSION = '2.3.232';
function h2Jar() {
  const candidates = process.env.XINLIU_H2_JAR ? [path.resolve(process.env.XINLIU_H2_JAR)] : [
    path.join(__dirname, '../.runtime', `h2-${VERSION}.jar`),
    path.join(os.homedir(), '.m2/repository/com/h2database/h2', VERSION, `h2-${VERSION}.jar`)
  ];
  const jar = candidates.find(filename => fs.existsSync(filename));
  if (!jar) throw new Error(`缺少H2 ${VERSION}驱动，请运行 node xinliu/work/install-h2.cjs 或设置XINLIU_H2_JAR`);
  return jar;
}

function createH2Store(dataDir) {
  const database = path.join(dataDir, 'xinliu');
  const pending = new Map();
  let child, sequence = 0, failure, ready, closing = false;
  let writes = Promise.resolve();
  function rejectAll(error) {
    failure = error;
    for (const item of pending.values()) item.reject(error);
    pending.clear();
  }
  function open() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      pending.set('0', { resolve, reject });
      try {
        child = spawn(process.env.XINLIU_JAVA || 'java', ['--class-path', h2Jar(), path.join(__dirname, 'H2Store.java'), database], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { PATH: process.env.PATH, ...(process.env.JAVA_HOME ? { JAVA_HOME: process.env.JAVA_HOME } : {}), XINLIU_H2_PASSWORD: process.env.XINLIU_H2_PASSWORD || '' }
        });
        // Do not print driver errors: database configuration must not leak into API/logs.
        child.stderr.resume();
        const startupTimeout = setTimeout(() => {
          rejectAll(new Error('H2启动超时，请检查Java和数据库文件占用'));
          child.kill();
        }, 20000);
        startupTimeout.unref();
        child.once('exit', () => clearTimeout(startupTimeout));
        child.on('error', () => rejectAll(new Error('无法启动H2，请检查Java 17及驱动配置')));
        child.on('exit', () => rejectAll(new Error('H2存储进程已退出，请检查驱动、数据库密码或文件占用后重启；不会回退到JSON写入')));
        child.stdin.on('error', () => rejectAll(new Error('H2存储连接已断开')));
        readline.createInterface({ input: child.stdout }).on('line', line => {
          const [id, status, payload] = line.split('\t');
          const item = pending.get(id);
          if (!item) return;
          pending.delete(id);
          if (id === '0') clearTimeout(startupTimeout);
          if (status === 'ERROR') item.reject(new Error('H2事务失败，当前修改未确认保存'));
          else item.resolve(payload ? Buffer.from(payload, 'base64').toString('utf8') : null);
        });
      } catch (error) { rejectAll(error); }
    });
    return ready;
  }
  async function request(operation, payload) {
    await open();
    if (failure) throw failure;
    return new Promise((resolve, reject) => {
      const id = String(++sequence);
      pending.set(id, { resolve, reject });
      child.stdin.write(id + '\t' + operation + (payload === undefined ? '' : '\t' + Buffer.from(payload).toString('base64')) + '\n');
    });
  }
  return {
    async load() { await writes; const json = await request('LOAD'); return json === null ? null : JSON.parse(json); },
    save(state) {
      if (closing) return Promise.reject(new Error('H2正在关闭，不能写入'));
      const json = JSON.stringify(state);
      writes = writes.then(() => request('SAVE', json));
      // Keep failures observable by every later save/load, without unhandled rejection noise.
      writes.catch(() => {});
      return writes;
    },
    async close() {
      closing = true;
      try {
        await writes;
        if (child && !failure) await request('CLOSE');
      } finally {
        if (child && child.exitCode === null && child.signalCode === null) {
          const exited = new Promise(resolve => child.once('exit', resolve));
          child.stdin.end();
          await exited;
        }
      }
    }
  };
}

module.exports = { createH2Store };
