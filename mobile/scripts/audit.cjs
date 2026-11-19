// ICA Unified mobile dependency security gate.
//
// Published-package audits cannot distinguish Metro build tooling from code that
// ships in the mobile runtime. We keep high/critical findings blocking by
// default and allow only narrowly verified exceptions:
//   braces GHSA-vfj7-8cjw-p6xm only while npm has no patched release AND the
//      lockfile proves braces is reachable exclusively through Metro file-map
//      build tooling. Any new runtime path or dependency shape fails closed.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BRACES_ADVISORY = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const PICOMATCH_ADVISORY = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';

function verifyBracesIsMetroToolingOnly() {
  const lockPath = path.join(process.cwd(), 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const packages = lock.packages || {};
  const braces = packages['node_modules/braces'];

  if (!braces || braces.version !== '3.0.3') {
    throw new Error(
      'braces advisory exception refused: expected audited braces@3.0.3 lockfile entry.',
    );
  }

  const directBracesParents = [];
  const micromatchParents = [];

  for (const [packagePath, meta] of Object.entries(packages)) {
    const deps = meta && meta.dependencies ? meta.dependencies : {};
    if (Object.prototype.hasOwnProperty.call(deps, 'braces')) {
      directBracesParents.push(packagePath);
    }
    if (Object.prototype.hasOwnProperty.call(deps, 'micromatch')) {
      micromatchParents.push(packagePath);
    }
  }

  const expectedBracesParents = new Set(['node_modules/micromatch']);
  const expectedMicromatchParents = new Set([
    'node_modules/@expo/metro-file-map',
    'node_modules/metro-file-map',
  ]);

  const unexpectedBracesParents = directBracesParents.filter(
    (packagePath) => !expectedBracesParents.has(packagePath),
  );
  const unexpectedMicromatchParents = micromatchParents.filter(
    (packagePath) => !expectedMicromatchParents.has(packagePath),
  );

  if (
    directBracesParents.length !== expectedBracesParents.size ||
    micromatchParents.length !== expectedMicromatchParents.size ||
    unexpectedBracesParents.length ||
    unexpectedMicromatchParents.length
  ) {
    throw new Error(
      'braces advisory exception refused: braces/micromatch is reachable outside the verified Metro build-tool path.',
    );
  }

  return {
    bracesVersion: braces.version,
    directBracesParents,
    micromatchParents,
  };
}

// As of November 18, 2026 picomatch has an unpatched ReDoS advisory.
// Its current locked consumers here are Metro/Expo/React Native codegen and
// Jest build tools. This exception fails closed if any package, version or
// consumer path changes. It does NOT declare the advisory fixed.
function verifyPicomatchIsBuildToolingOnly() {
  const lock = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf8'));
  const packages = lock.packages || {};
  const expectedVersions = {
    'node_modules/picomatch': '2.3.2',
    'node_modules/expo/node_modules/picomatch': '4.0.7',
    'node_modules/tinyglobby/node_modules/picomatch': '4.0.7',
  };
  const installed = Object.entries(packages)
    .filter(([packagePath]) => packagePath.endsWith('/picomatch'))
    .map(([packagePath, entry]) => [packagePath, entry.version])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const expectedInstalled = Object.entries(expectedVersions).sort((a, b) => a[0].localeCompare(b[0]));
  if (JSON.stringify(installed) !== JSON.stringify(expectedInstalled)) {
    throw new Error('picomatch exception refused: installed package versions or paths changed.');
  }
  const directConsumers = Object.entries(packages)
    .filter(([, entry]) => Object.prototype.hasOwnProperty.call(entry?.dependencies || {}, 'picomatch'))
    .map(([name]) => name).sort();
  const expectedDirectConsumers = [
    'node_modules/expo/node_modules/@expo/cli',
    'node_modules/expo/node_modules/@expo/metro-config',
    'node_modules/jest-util',
    'node_modules/micromatch',
    'node_modules/tinyglobby',
  ].sort();
  if (JSON.stringify(directConsumers) !== JSON.stringify(expectedDirectConsumers)) {
    throw new Error('picomatch exception refused: unexpected direct consumer, possibly a runtime path.');
  }
  const upstream = {
    micromatch: ['node_modules/metro-file-map'],
    'jest-util': ['node_modules/jest-worker'],
    tinyglobby: [
      'node_modules/@react-native/babel-plugin-codegen/node_modules/@react-native/codegen',
      'node_modules/@react-native/codegen',
      'node_modules/react-native',
    ],
    '@expo/cli': ['node_modules/expo'],
    '@expo/metro-config': ['node_modules/expo', 'node_modules/expo/node_modules/@expo/cli'],
  };
  for (const [dependency, allowed] of Object.entries(upstream)) {
    const actual = Object.entries(packages)
      .filter(([, entry]) => Object.prototype.hasOwnProperty.call(entry?.dependencies || {}, dependency))
      .map(([name]) => name).sort();
    if (JSON.stringify(actual) !== JSON.stringify(allowed.sort())) {
      throw new Error('picomatch exception refused: upstream dependency path changed for ' + dependency);
    }
  }
  return { installed: expectedInstalled, consumers: directConsumers };
}

const check = spawnSync(process.execPath, ['--test', 'tests/forge-security.test.cjs'], {
  stdio: 'inherit',
});
if (check.status !== 0) process.exit(1);

const audit = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8' });
let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  throw new Error('Could not read npm audit results');
}
if (report.error || !report.metadata || ![0, 1].includes(audit.status)) {
  throw new Error('npm audit failed');
}

const findings = new Map();
for (const item of Object.values(report.vulnerabilities || {})) {
  for (const via of item.via) {
    if (typeof via === 'object') findings.set(via.url, via);
  }
}

let failed = false;
for (const [url, advisory] of findings) {
  if (url === PICOMATCH_ADVISORY) {
    try {
      const proof = verifyPicomatchIsBuildToolingOnly();
      console.warn('UNPATCHED build-tool advisory, narrowly scoped with a fail-closed lockfile guard: ' +
        url + ' (' + proof.installed.map(([name, version]) => name + '@' + version).join(', ') + ')');
    } catch (error) {
      console.error(String(error && error.message ? error.message : error));
      failed = true;
    }
    continue;
  }

  if (url === BRACES_ADVISORY) {
    try {
      const proof = verifyBracesIsMetroToolingOnly();
      console.log(
        'BUILD-TOOL ONLY with fail-closed dependency-path guard: ' +
          url +
          ' (' +
          proof.micromatchParents.join(', ') +
          ' -> micromatch -> braces@' +
          proof.bracesVersion +
          ')',
      );
    } catch (error) {
      console.error(String(error && error.message ? error.message : error));
      failed = true;
    }
    continue;
  }

  console.error(advisory.severity + ': ' + advisory.title + ' ' + url);
  if (['high', 'critical'].includes(advisory.severity)) failed = true;
}

if (failed) process.exit(1);
console.log('Mobile audit: no unmitigated high/critical runtime findings.');
