const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {NativeHost}=require('../src/native-host');
function child(){
  const process=new EventEmitter();
  process.stdin=new PassThrough();process.stdout=new PassThrough();process.stderr=new PassThrough();
  process.kill=()=>{process.emit('exit',0);};return process;
}
test('closing the native helper rejects pending work immediately',async()=>{
  const process=child(),host=new NativeHost({spawnProcess:()=>process});
  const result=assert.rejects(host.call('foreground'),/Windows helper stopped/);
  host.close();await result;assert.equal(host.pending.size,0);
});
test('an old helper exiting cannot invalidate a restarted helper',async()=>{
  const old=child(),current=child();let calls=0;
  const host=new NativeHost({spawnProcess:()=>++calls===1?old:current});
  host.start();host.close();
  const result=host.call('foreground');old.emit('exit',0);
  current.stdout.write(JSON.stringify({id:host.next,result:123})+'\n');
  assert.equal(await result,123);host.close();
});
