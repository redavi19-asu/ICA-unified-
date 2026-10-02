// npm audits published versions, so node-forge 1.4.0 is still flagged after our
// local source mitigation. Allow only this advisory, and only after the actual
// installed implementation passes the malformed-signature regression tests.
const { spawnSync } = require('node:child_process');
const check = spawnSync(process.execPath, ['--test', 'tests/forge-security.test.cjs'], { stdio: 'inherit' });
if (check.status !== 0) process.exit(1);
const audit = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8' });
let report;
try { report = JSON.parse(audit.stdout); } catch { throw new Error('Could not read npm audit results'); }
if (report.error || !report.metadata || ![0, 1].includes(audit.status)) throw new Error('npm audit failed');
const findings = new Map();
for (const item of Object.values(report.vulnerabilities || {})) {
  for (const via of item.via) if (typeof via === 'object') findings.set(via.url, via);
}
let failed = false;
for (const [url, advisory] of findings) {
  if (url === 'https://github.com/advisories/GHSA-86w9-cpqp-85rv') {
    console.log('MITIGATED locally, awaiting upstream release: ' + url);
  } else {
    console.error(advisory.severity + ': ' + advisory.title + ' ' + url);
    if (['high', 'critical'].includes(advisory.severity)) failed = true;
  }
}
if (failed) process.exit(1);
console.log('Mobile audit: no unmitigated high/critical findings.');
