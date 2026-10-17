const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pointFrom,screenPoint,trashNames,desktopInventory,trashDesktopItems,clickCommand,layoutFrom,layoutRect} = require('../src/desktop');
const {validate,interpret,arrangeCommand,commandFor} = require('../src/agent');
const plan = actions => ({title:'Desktop plan',explanation:'Marks on the desktop',confidence:.95,actions});
const response = p => async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(p)}]}]})});
test('normalized screen coordinates respect negative display origins and display edges',()=>{
  const bounds={x:-1920,y:-200,width:1920,height:1080};
  assert.deepEqual(screenPoint('500,500',bounds),{x:-960,y:340});
  assert.deepEqual(screenPoint('1000,1000',bounds),{x:-1,y:879});
  for (const value of ['-1,0','1001,10','1,2; rm','NaN,0','1,2,3']) assert.throws(()=>pointFrom(value));
  const cmd=clickCommand('500,500',bounds,'darwin'); assert.match(cmd.args[1],/\{-960, 340\}/);
  const win=clickCommand('500,500',bounds,'win32',p=>({x:p.x*2,y:p.y*2}));
  assert.match(Buffer.from(win.args.at(-1),'base64').toString('utf16le'),/SetCursorPos\(-1920,680\)/);
});
test('trash accepts bounded exact names, never paths or duplicate targets',()=>{
  assert.deepEqual(trashNames('["report.pdf","drafts"]'),['report.pdf','drafts']);
  for (const names of ['[]','["../other"]','[".."]','["C:\\\\secret"]','["a","a"]','["a\\u0000b"]',JSON.stringify(Array.from({length:13},(_,i)=>String(i)))]) assert.throws(()=>trashNames(names));
  assert.throws(()=>validate(plan([{type:'trash_files',value:'["a"]'},{type:'trash_files',value:'["a"]'}])));
});
test('trash preflights the complete selection and refuses replaced files',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'doodle-trash-test-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  await fs.writeFile(path.join(directory,'keep.txt'),'original');
  await fs.writeFile(path.join(directory,'other.txt'),'other');
  const frame={directory,inventory:await desktopInventory(directory)}, moved=[];
  await assert.rejects(()=>trashDesktopItems(['keep.txt','missing.txt'],frame,async p=>moved.push(p)),/not on your desktop/);
  assert.equal(moved.length,0);
  await fs.writeFile(path.join(directory,'other.txt'),'changed contents');
  await assert.rejects(()=>trashDesktopItems(['keep.txt','other.txt'],frame,async p=>moved.push(p)),/changed/);
  assert.equal(moved.length,0);
  await trashDesktopItems(['keep.txt'],frame,async p=>moved.push(p));
  assert.deepEqual(moved,[path.join(directory,'keep.txt')]);
  assert.equal(await fs.readFile(path.join(directory,'keep.txt'),'utf8'),'original'); // Mocked trash API: no real deletion.
  await assert.rejects(()=>trashDesktopItems(['keep.txt'],frame,async()=>{},()=>true),/Stopped/);
});
test('desktop requests include separate scene and drawing, and reject invented files',async()=>{
  let body;
  const args={image:'data:image/png;base64,AAAA',key:'test',platform:'darwin',desktop:{image:'data:image/jpeg;base64,BBBB',names:['report.pdf']}};
  await interpret(args,async(url,opts)=>{body=JSON.parse(opts.body);return response(plan([{type:'trash_files',value:'["report.pdf"]'}]))();});
  assert.equal(body.input[0].content.length,3);
  assert.equal(body.input[0].content[1].image_url,args.desktop.image);
  assert.match(body.instructions,/Image 2/);
  await assert.rejects(()=>interpret(args,response(plan([{type:'trash_files',value:'["unknown.pdf"]'}]))),/outside this desktop/);
  await assert.rejects(()=>interpret({...args,desktop:undefined},response(plan([{type:'click',value:'500,500'}]))),/overlay capture/);
});
test('split-screen layouts validate apps, dimensions and containment',()=>{
  const layout=layoutFrom('{"app":"chrome","x":0,"y":0,"width":500,"height":1000}',['chrome']);
  assert.deepEqual(layoutRect(layout,{x:100,y:0,width:2000,height:1000}),{x:100,y:0,width:1000,height:1000});
  for (const patch of [{app:'unknown'},{x:-1},{width:0},{width:1001},{x:750},{height:NaN}]) assert.throws(()=>layoutFrom(JSON.stringify({...layout,...patch}),['chrome']));
  assert.throws(()=>validate(plan([{type:'arrange_app',value:JSON.stringify({...layout,app:'safari'})}]),'win32'));
  const mac=arrangeCommand(layout,{x:0,y:25,width:720,height:875},'darwin');
  assert.match(mac.args[1],/Google Chrome/); assert.match(mac.args[1],/set size of window 1 to \{720, 875\}/);
  const windows=arrangeCommand(layout,{x:0,y:0,width:960,height:1080},'win32');
  assert.match(Buffer.from(windows.args.at(-1),'base64').toString('utf16le'),/SetWindowPos/);
});
