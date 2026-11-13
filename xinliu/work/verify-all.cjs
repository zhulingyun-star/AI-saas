'use strict';

const { createBackend } = require('../backend/server.cjs');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const suites = ['preview-server', 'ui-layout', 'production-flow', 'production-guardrails', 'reference-variants', 'workspace', 'collaboration', 'production-offline', 'generation-ui', 'analytics', 'media-export'];

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-regression-'));
  // Never load the user's env files: no real keys or model providers in this server.
  const backend = createBackend({ port: 0, dataDir, providers: {} });
  const base = await backend.start();
  const reportDir = path.resolve(__dirname, 'test-results');
  fs.mkdirSync(reportDir, { recursive: true });
  const results = [];
  const selected = process.argv.slice(2);
  try {
    for (const suite of selected.length ? selected : suites) {
      if (!suites.includes(suite)) throw new Error('Unknown verification suite');
      const started = Date.now();
      const child = spawn(process.execPath, [path.join(__dirname, `verify-${suite}.cjs`)], {
        env: { ...process.env, XINLIU_TEST_BASE_URL: base }, stdio: ['ignore', 'pipe', 'pipe']
      });
      let output = '';
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk.toString(); });
      const timer = setTimeout(() => child.kill('SIGTERM'), 180000);
      const exitCode = await new Promise(resolve => child.once('exit', (code, signal) => resolve(signal || code)));
      clearTimeout(timer);
      let detail;
      try { detail = JSON.parse(output); } catch { detail = output; }
      const result = { suite, status: exitCode === 0 ? 'passed' : 'failed', seconds: Math.round((Date.now() - started) / 100) / 10, detail };
      results.push(result);
      console.log(JSON.stringify(result));
      fs.writeFileSync(path.join(reportDir, suite + '.json'), JSON.stringify(result, null, 2));
    }
    fs.writeFileSync(path.join(reportDir, 'summary.json'), JSON.stringify({ at: new Date().toISOString(), isolatedH2: true, paidModelsConfigured: false, results }, null, 2));
    if (results.some(result => result.status !== 'passed')) process.exitCode = 1;
  } finally { await backend.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
