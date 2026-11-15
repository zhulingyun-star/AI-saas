'use strict';

const path = require('node:path');
const { createBackend } = require('../backend/server.cjs');

const backend = createBackend({
  port: Number(process.env.XINLIU_REVIEW_PORT || 8768),
  dataDir: path.resolve(__dirname, 'review-data'),
  providers: {}
});
backend.start().then(url => console.log('Review only, no paid providers: ' + url)).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await backend.close();
  process.exit(0);
});
