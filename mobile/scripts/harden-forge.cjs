// Upstream Forge now includes the fixes previously applied locally.
// Keep the install gate strict and exercise the cryptographic regressions;
// do not mutate installed package sources or waive new audit findings.
const { spawnSync } = require('node:child_process');
const version = require('node-forge/package.json').version;
if (version !== '1.4.3') throw new Error('Review the node-forge security gate for version ' + version);
const check = spawnSync(process.execPath, ['--test', 'tests/forge-security.test.cjs'], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status || 1);
console.log('Upstream node-forge 1.4.3 passed the mobile security regressions.');
