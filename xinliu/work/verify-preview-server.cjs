const { chromium } = require('./ui-runtime/node_modules/playwright-core');
const assert = require('node:assert/strict');

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const errors = [];
    const failedResponses = [];
    const health = await fetch('http://127.0.0.1:8767/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).name, '心流');
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });
    for (const [route, heading] of [
      ['projects', '项目总览'],
      ['home', '今日制作'],
      ['runs', '生成任务']
    ]) {
      const response = await page.goto(`http://127.0.0.1:8767/#${route}`);
      if (response) assert.equal(response.status(), 200);
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResponses, []);
    console.log(JSON.stringify({ status: 'passed', routes: ['projects', 'home', 'runs'], pageErrors: errors, failedResponses }));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
