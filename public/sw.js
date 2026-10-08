/* global globalThis */
const VERSION = '__BUILD_VERSION__';
const ASSETS = /*__PRECACHE__*/ [];
const PREFIX = 'retro-vu-shell-';
const CACHE = PREFIX + VERSION;
let activationCheck;
function activateWhenIdle() {
  if(activationCheck)return activationCheck;
  activationCheck=(async()=>{
    const windows=await globalThis.clients.matchAll({type:'window',includeUncontrolled:true});
    if(!windows.length)return;
    const answers=await Promise.all(windows.map(client=>new Promise(resolve=>{
      const channel=new MessageChannel();
      const finish=value=>{clearTimeout(timer);channel.port1.close();resolve(value);};
      const timer=setTimeout(()=>finish(false),3000);
      channel.port1.onmessage=event=>finish(event.data?.idle===true);
      client.postMessage({type:'CHECK_IDLE'},[channel.port2]);
    })));
    if(answers.every(Boolean))await globalThis.skipWaiting();
  })().finally(()=>{activationCheck=null;});
  return activationCheck;
}
globalThis.addEventListener('install', event => {
  // Never replace a worker beneath ongoing audio. New version waits for all windows to close,
  // or for the single idle client to explicitly request activation.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url,{cache:'reload'})))));
});
globalThis.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
    await globalThis.clients.claim();
  })());
});
globalThis.addEventListener('message',event=>{
  if(event.data?.type==='TRY_ACTIVATE'){event.waitUntil(activateWhenIdle());return;}
  if(event.data?.type!=='ACTIVATE_IDLE' || event.data.busy!==false)return;
  event.waitUntil((async()=>{
    const clients=await globalThis.clients.matchAll({type:'window',includeUncontrolled:true});
    if(clients.length!==1 || clients[0].id!==event.source?.id){
      event.source?.postMessage({type:'UPDATE_BLOCKED',message:'Feche outras abas do Retro VU antes de atualizar.'});return;
    }
    await globalThis.skipWaiting();
  })());
});
globalThis.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==globalThis.location.origin||url.pathname.startsWith('/api/'))return;
  const asset=request.mode==='navigate'&&url.pathname==='/'?'/index.html':url.pathname;
  if(!ASSETS.includes(asset))return;
  // Cache per release keeps app/worklets matched. API, PCM, user WAVs and external URLs are never cached.
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(asset)) || fetch(request)));
});
