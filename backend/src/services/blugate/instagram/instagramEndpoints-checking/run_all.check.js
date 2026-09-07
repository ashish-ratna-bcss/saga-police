// Run all Instagram endpoint checks sequentially.
// Run: node run_all.check.js
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const checks = fs.readdirSync(__dirname)
  .filter((f) => f.endsWith('.check.js') && f !== 'run_all.check.js')
  .sort();

let failed = 0;
for (const file of checks) {
  console.log('\n===', file, '===');
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) failed += 1;
}

console.log('\nDone.', checks.length - failed, 'passed,', failed, 'failed');
process.exitCode = failed ? 1 : 0;
