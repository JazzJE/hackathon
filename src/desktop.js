const fs = require('node:fs/promises');
const path = require('node:path');
function pointFrom(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?,\d+(?:\.\d+)?$/.test(value)) throw Error('Invalid screen target.');
  const [x,y] = value.split(',').map(Number);
  if (![x,y].every(n => Number.isFinite(n) && n >= 0 && n <= 1000)) throw Error('Screen target is outside the captured display.');
  return {x,y};
}
function screenPoint(value, bounds) {
  const p = pointFrom(value);
  return {x:bounds.x+Math.min(bounds.width-1,Math.round(p.x*bounds.width/1000)),y:bounds.y+Math.min(bounds.height-1,Math.round(p.y*bounds.height/1000))};
}
function trashNames(value) {
  let names;
  try { names = JSON.parse(value); } catch { throw Error('Invalid desktop file list.'); }
  if (!Array.isArray(names) || !names.length || names.length > 12 || new Set(names).size !== names.length || names.some(n => typeof n !== 'string' || !n || n === '.' || n === '..' || /[\\/\x00-\x1f]/.test(n))) throw Error('Choose up to 12 distinct desktop items by their exact names.');
  return names;
}
async function desktopInventory(directory) {
  const names = (await fs.readdir(directory)).filter(n => !n.startsWith('.')).sort().slice(0,300);
  const records = new Map();
  for (const name of names) {
    try {
      const stat = await fs.lstat(path.join(directory,name));
      records.set(name,{ino:stat.ino,dev:stat.dev,mtimeMs:stat.mtimeMs,birthtimeMs:stat.birthtimeMs});
    } catch { /* Items can disappear while the overlay is opening. */ }
  }
  return records;
}
async function trashDesktopItems(names, frame, trashItem, shouldStop = () => false) {
  if (!frame?.inventory) throw Error('Draw over your desktop to select files first.');
  // Check every item before moving any of them; never accept model-generated paths.
  for (const name of names) {
    if (!frame.inventory.has(name)) throw Error(`“${name}” was not on your desktop when you drew. Capture again.`);
    const before = frame.inventory.get(name), now = await fs.lstat(path.join(frame.directory,name));
    if (['ino','dev','mtimeMs','birthtimeMs'].some(key => now[key] !== before[key])) throw Error(`“${name}” changed since the capture. Draw over the desktop again.`);
  }
  const moved = [];
  for (const name of names) {
    if (shouldStop()) throw Error('Stopped. Items already moved remain in Trash.');
    await trashItem(path.join(frame.directory,name)); moved.push(name);
  }
  return `Moved to Trash / Recycle Bin: ${moved.join(', ')}.`;
}
function clickCommand(value, bounds, platform, convertPoint = point => point) {
  const {x,y} = convertPoint(screenPoint(value,bounds));
  if (platform === 'darwin') return {file:'/usr/bin/osascript',args:['-e',`tell application "System Events" to click at {${x}, ${y}}`]};
  if (platform !== 'win32') throw Error('Screen targeting supports Windows and macOS.');
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DoodlePointer { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra); }'; [DoodlePointer]::SetCursorPos(${x},${y}) | Out-Null; [DoodlePointer]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [DoodlePointer]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`;
  return {file:'powershell.exe',args:['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')]};
}
function layoutFrom(value, apps) {
  let layout;
  try { layout = JSON.parse(value); } catch { throw Error('Invalid window layout.'); }
  if (!layout || !apps.includes(layout.app) || !['x','y','width','height'].every(k => Number.isFinite(layout[k])) || layout.x < 0 || layout.y < 0 || layout.width < 50 || layout.height < 50 || layout.x + layout.width > 1000 || layout.y + layout.height > 1000) throw Error('Window layout must fit inside the captured display and use a supported app.');
  return layout;
}
function layoutRect(layout, bounds) {
  return {x:bounds.x+Math.round(layout.x*bounds.width/1000),y:bounds.y+Math.round(layout.y*bounds.height/1000),width:Math.round(layout.width*bounds.width/1000),height:Math.round(layout.height*bounds.height/1000)};
}
module.exports = {pointFrom, screenPoint, trashNames, desktopInventory, trashDesktopItems, clickCommand, layoutFrom, layoutRect};
