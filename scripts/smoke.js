// Invoke explicitly with npm run smoke; ordinary node --test must not launch Electron.
if (require.main === module && !process.env.NODE_TEST_CONTEXT) {
  const {spawnSync} = require('node:child_process');
  const child = spawnSync(require('electron'),['.'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,DOODLE_SMOKE:'1'},stdio:'inherit'});
  if (child.error) { console.error(child.error.message); process.exitCode = 1; }
  else process.exitCode = child.status ?? 1;
}
