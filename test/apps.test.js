const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {discoverMacApps,windowsCatalog,publicCatalog}=require('../src/apps');
const {validate,interpret,commandFor,arrangeCommand}=require('../src/agent');
const plan=actions=>({title:'App test',explanation:'Selected icon',confidence:.9,actions});
test('discovers unfamiliar app bundles in nested application folders',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'doodle-apps-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'Tools','Pixel Brew.app'),{recursive:true});
  await fs.mkdir(path.join(root,'Messages.app'),{recursive:true});
  const catalog=await discoverMacApps([root],async location=>({CFBundleName:path.basename(location,'.app'),CFBundleIdentifier:location.includes('Messages')?'com.apple.MobileSMS':'studio.pixel.brew'}));
  assert.equal(Object.keys(catalog).length,2);assert.equal(catalog.messages.name,'Messages');
  const [id,entry]=Object.entries(catalog).find(([,app])=>app.name==='Pixel Brew');
  assert.ok(id.startsWith('app:'));
  assert.doesNotThrow(()=>validate(plan([{type:'open_app',value:id}]),'darwin',catalog));
  assert.deepEqual(commandFor({type:'open_app',value:id},{platform:'darwin',appCatalog:catalog}).args,['-a',entry.path]);
  const script=arrangeCommand({app:id},{x:0,y:30,width:800,height:600},'darwin',false,catalog).args[1];
  assert.match(script,/tell application id "studio.pixel.brew"/);assert.match(script,/bundle identifier is "studio.pixel.brew"/);
  assert.ok(!JSON.stringify(publicCatalog(catalog)).includes(root));
  assert.throws(()=>validate(plan([{type:'open_app',value:'/tmp/anything.app'}]),'darwin',catalog));
});
test('Windows discovery uses exact catalog AppIDs without accepting arbitrary paths',()=>{
  const catalog=windowsCatalog([{Name:"Unfamiliar App's Name",AppID:"Vendor.Product!App"}]);
  const id=Object.keys(catalog)[0];
  const cmd=commandFor({type:'open_app',value:id},{platform:'win32',appCatalog:catalog});
  const script=Buffer.from(cmd.args.at(-1),'base64').toString('utf16le');
  assert.match(script,/shell:AppsFolder\\Vendor.Product!App/);
  assert.throws(()=>commandFor({type:'open_app',value:'unknown'},{platform:'win32',appCatalog:catalog}));
});
test('vision receives installed app names and IDs, never local executable paths',async()=>{
  const catalog={'app:custom':{name:'My Custom App',path:'/private/apps/custom.app',bundleId:'custom.App',processName:'Custom'}};
  let body;
  const p=await interpret({provider:'gemini',platform:'darwin',image:'data:image/png;base64,AAAA',key:'test',appCatalog:catalog},async(_,opts)=>{
    body=JSON.parse(opts.body);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(plan([{type:'open_app',value:'app:custom'}]))}]}}]})};
  });
  assert.equal(p.actions[0].value,'app:custom');
  assert.match(body.systemInstruction.parts[0].text,/My Custom App/);
  assert.ok(!JSON.stringify(body).includes('/private/apps'));
});
