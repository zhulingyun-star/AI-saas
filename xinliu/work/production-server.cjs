const { createBackend, loadLocalEnvironment } = require('../backend/server.cjs');
loadLocalEnvironment();
const backend = createBackend();
backend.server.on('error', error => { console.error('心流本地服务：' + error.code); process.exitCode = 1; });
backend.start().then(url => console.log('心流本地联调：' + url + '/#projects；H2；API ' + url + '/api/health')).catch(error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => backend.close().then(() => process.exit(0), () => process.exit(1)));
