// Temporary mitigation for GHSA-86w9-cpqp-85rv / CVE-2026-85393.
// Same nested DigestAlgorithm length check proposed upstream:
// https://github.com/digitalbazaar/forge/pull/1152
// Remove after upgrading to an upstream release that includes this fix.
const fs = require('node:fs');
const file = require.resolve('node-forge/lib/rsa');
const version = require('node-forge/package.json').version;
if (version !== '1.4.0') throw new Error('Review the node-forge mitigation for version ' + version);
const original = 'obj.value.length !== 2) {';
const patched = "obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1)) {";
const source = fs.readFileSync(file, 'utf8');
if (source.includes(patched)) {
  console.log('node-forge nested DigestAlgorithm validation already applied.');
} else {
  if (source.split(original).length !== 2) throw new Error('Unexpected node-forge source; refusing to patch.');
  fs.writeFileSync(file, source.replace(original, patched));
  console.log('Applied node-forge nested DigestAlgorithm validation.');
}
