const {spawn}=require('node:child_process');
const path=require('node:path');
const readline=require('node:readline');
class NativeHost {
  constructor({spawnProcess=spawn}={}){this.child=null;this.pending=new Map();this.next=0;this.spawnProcess=spawnProcess;}
  start(){
    if(this.child)return;
    const script=path.join(__dirname.replace('app.asar','app.asar.unpacked'),'native-host.ps1');
    const child=this.spawnProcess('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child=child;
    readline.createInterface({input:child.stdout}).on('line',line=>{
      let message;try{message=JSON.parse(line)}catch{return}
      const request=this.pending.get(message.id);if(!request)return;
      this.pending.delete(message.id);clearTimeout(request.timer);
      message.error?request.reject(Error(message.error)):request.resolve(message.result);
    });
    child.stderr.on('data',()=>{});
    const fail=()=>{if(this.child!==child)return;this.child=null;for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(Error('Windows helper stopped. Try again.'))}this.pending.clear()};
    child.on('error',fail);child.on('exit',fail);
    child.stdin.on('error',()=>{});
  }
  call(method,args={}){
    this.start();const id=++this.next;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Windows helper timed out.'))},10000);
      this.pending.set(id,{resolve,reject,timer});
      try{this.child.stdin.write(JSON.stringify({...args,method,id})+'\n');}
      catch(e){clearTimeout(timer);this.pending.delete(id);reject(Error('Windows helper stopped. Try again.'));}
    });
  }
  close(){
    const child=this.child;this.child=null;
    for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(Error('Windows helper stopped.'));}
    this.pending.clear();child?.kill();
  }
}
module.exports={NativeHost};
