const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const ALIASES = {safari:'safari','google chrome':'chrome',firefox:'firefox',spotify:'spotify',discord:'discord',code:'vscode','visual studio code':'vscode',vlc:'vlc',textedit:'notepad',notepad:'notepad',calculator:'calculator',paint:'paint',finder:'explorer','file explorer':'explorer',messages:'messages',mail:'mail',notes:'notes',calendar:'calendar',reminders:'reminders',facetime:'facetime'};
function catalogId(name, identity) {
  return ALIASES[name.toLowerCase()] || `app:${createHash('sha256').update(identity).digest('hex').slice(0,20)}`;
}
async function readMacApp(bundlePath, readPlist) {
  if (!bundlePath.toLowerCase().endsWith('.app')) throw Error('Choose a macOS .app bundle.');
  const data = readPlist ? await readPlist(bundlePath) : JSON.parse((await exec('/usr/bin/plutil',['-convert','json','-o','-',path.join(bundlePath,'Contents','Info.plist')],{timeout:5000,maxBuffer:1024*1024})).stdout);
  if (typeof data.CFBundleIdentifier !== 'string' || !data.CFBundleIdentifier) throw Error('This app has no bundle identifier.');
  const name = String(data.CFBundleDisplayName || data.CFBundleName || path.basename(bundlePath,'.app')).slice(0,150);
  const entry = {name,path:bundlePath,bundleId:data.CFBundleIdentifier,processName:String(data.CFBundleName || name),kind:'mac'};
  return {id:catalogId(name,data.CFBundleIdentifier),entry};
}
async function discoverMacApps(directories = ['/Applications',path.join(os.homedir(),'Applications'),'/System/Applications','/System/Library/CoreServices'], readPlist) {
  const found = [], visited = new Set();
  async function walk(directory,depth=0) {
    if (depth > 3) return;
    let entries,real;
    try { real=await fs.realpath(directory); if(visited.has(real))return;visited.add(real);entries=await fs.readdir(directory,{withFileTypes:true}); } catch { return; }
    for (const item of entries) {
      const location=path.join(directory,item.name);
      if (item.name.toLowerCase().endsWith('.app')) found.push(location);
      else if (item.isDirectory() && !item.name.startsWith('.')) await walk(location,depth+1);
    }
  }
  for (const directory of directories) await walk(directory);
  const catalog=Object.create(null), identities=new Set();
  // Bound plist subprocesses while scanning large application folders.
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<found.length) {
      const location=found[next++];
      try {
        const {id,entry}=await readMacApp(location,readPlist);
        if (!identities.has(entry.bundleId)) {identities.add(entry.bundleId);catalog[id]=entry;}
      } catch { /* A partial install or helper without a plist is not launchable. */ }
    }
  }));
  return catalog;
}
function windowsCatalog(items) {
  const catalog=Object.create(null);
  for (const item of items) {
    if (typeof item.Name !== 'string' || typeof item.AppID !== 'string' || !item.Name || !item.AppID) continue;
    const id=catalogId(item.Name,item.AppID);
    catalog[id]={name:item.Name,appId:item.AppID,kind:'windows-start'};
  }
  return catalog;
}
async function discoverInstalledApps(platform = process.platform) {
  if (platform === 'darwin') return discoverMacApps();
  if (platform === 'win32') {
    const script="[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); @(Get-StartApps | Select-Object Name,AppID) | ConvertTo-Json -Compress";
    const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:4*1024*1024});
    const data=JSON.parse(stdout);return windowsCatalog(Array.isArray(data)?data:[data]);
  }
  return undefined;
}
function publicCatalog(catalog) {
  return Object.fromEntries(Object.entries(catalog || {}).map(([id,entry])=>[id,{name:entry.name}]));
}
module.exports={catalogId,readMacApp,discoverMacApps,windowsCatalog,discoverInstalledApps,publicCatalog};
