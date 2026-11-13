'use strict';

let playwright;
try { playwright = require('./ui-runtime/node_modules/playwright-core'); }
catch { playwright = require('../../fronted/node_modules/playwright-core'); }

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium');
const BASE_URL = (process.env.XINLIU_TEST_BASE_URL || 'http://127.0.0.1:8767').replace(/\/$/, '');

module.exports = { chromium: playwright.chromium, executablePath, BASE_URL };
