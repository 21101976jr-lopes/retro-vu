const fs=require('fs'),path=require('path'),vm=require('vm'),os=require('os');
const {buildPwa}=require('../scripts/build-pwa.cjs');
function worker(){
 const handlers={},cache={addAll:jest.fn().mockResolvedValue(),match:jest.fn().mockResolvedValue('cached')};
 const context={URL,setTimeout,clearTimeout,MessageChannel:class{constructor(){this.port1={close:jest.fn()};this.port2={reply:data=>this.port1.onmessage({data})};}},Request:class{constructor(url,options){this.url=url;this.options=options;}},
  caches:{open:jest.fn().mockResolvedValue(cache),keys:async()=>['retro-vu-shell-old','other-cache'],delete:jest.fn().mockResolvedValue(true)},
  clients:{claim:jest.fn(),matchAll:jest.fn().mockResolvedValue([{id:'one'}])},location:{origin:'https://retro.test'},
  fetch:jest.fn(),skipWaiting:jest.fn(),addEventListener:(type,handler)=>{handlers[type]=handler;}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../public/sw.js'),'utf8').replace("'__BUILD_VERSION__'","'new'").replace('/*__PRECACHE__*/ []',JSON.stringify(['/index.html','/stream/pcm-worklet.js','/recording/wav-writer.js'])),context);
 return {handlers,context,cache};
}
test('PWA build is deterministic, includes actual app/worklets and changes version with content',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retro-pwa-'));
 try{
  fs.mkdirSync(path.join(dir,'stream'));fs.writeFileSync(path.join(dir,'index.html'),'app');fs.writeFileSync(path.join(dir,'stream/pcm-worklet.js'),'worklet');
  const a=buildPwa(dir),b=buildPwa(dir);expect(a.version).toBe(b.version);expect(a.assets).toContain('/stream/pcm-worklet.js');
  fs.writeFileSync(path.join(dir,'index.html'),'changed');expect(buildPwa(dir).version).not.toBe(a.version);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('service worker precaches release, never forces activation or touches OPFS',async()=>{
 const {handlers,context,cache}=worker();let job;
 handlers.install({waitUntil:p=>{job=p;}});await job;expect(cache.addAll).toHaveBeenCalled();expect(context.skipWaiting).not.toHaveBeenCalled();
 handlers.activate({waitUntil:p=>{job=p;}});await job;
 expect(context.caches.delete).toHaveBeenCalledWith('retro-vu-shell-old');expect(context.caches.delete).not.toHaveBeenCalledWith('other-cache');
});
test('API, POST, user recordings and foreign URLs bypass cache; shell/worklets work offline',async()=>{
 const {handlers}=worker();
 for(const [url,method]of [['https://retro.test/api/stream-signal','POST'],['https://retro.test/api/stream-signal','GET'],['blob:recording','GET'],['https://elsewhere.test/','GET']]){
  const respondWith=jest.fn();handlers.fetch({request:{url,method},respondWith});expect(respondWith).not.toHaveBeenCalled();
 }
 let response;handlers.fetch({request:{url:'https://retro.test/stream/pcm-worklet.js?v=2',method:'GET'},respondWith:p=>{response=p;}});
 expect(await response).toBe('cached');
});
test('waiting update activates only on explicit idle request from the sole client',async()=>{
 const {handlers,context}=worker();let job;const source={id:'one',postMessage:jest.fn()};
 handlers.message({data:{type:'ACTIVATE_IDLE',busy:true},source,waitUntil:p=>{job=p;}});expect(context.skipWaiting).not.toHaveBeenCalled();
 context.clients.matchAll.mockResolvedValue([{id:'one'},{id:'two'}]);
 handlers.message({data:{type:'ACTIVATE_IDLE',busy:false},source,waitUntil:p=>{job=p;}});await job;expect(context.skipWaiting).not.toHaveBeenCalled();expect(source.postMessage).toHaveBeenCalled();
 context.clients.matchAll.mockResolvedValue([{id:'one'}]);handlers.message({data:{type:'ACTIVATE_IDLE',busy:false},source,waitUntil:p=>{job=p;}});await job;expect(context.skipWaiting).toHaveBeenCalledTimes(1);
});

test('automatic update requires every open client to report idle',async()=>{
 const {handlers,context}=worker();let job;
 const client=idle=>({postMessage:(message,ports)=>ports[0].reply({idle})});
 context.clients.matchAll.mockResolvedValue([client(true),client(false)]);
 handlers.message({data:{type:'TRY_ACTIVATE'},waitUntil:p=>{job=p;}});await job;expect(context.skipWaiting).not.toHaveBeenCalled();
 context.clients.matchAll.mockResolvedValue([client(true),client(true)]);
 handlers.message({data:{type:'TRY_ACTIVATE'},waitUntil:p=>{job=p;}});await job;expect(context.skipWaiting).toHaveBeenCalledTimes(1);
 expect(context.caches.delete).not.toHaveBeenCalled();
});
