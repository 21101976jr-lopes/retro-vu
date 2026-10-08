let registration;
let busy = false;
let applying = false;
let reloadPending=false;
const audioBusy=()=>busy || [...document.querySelectorAll('audio')].some(audio=>!audio.paused);
function tryUpdate(){if(!audioBusy())registration?.waiting?.postMessage({type:'TRY_ACTIVATE'});}
export function setPwaBusy(value) {
 busy=Boolean(value);
 if(!audioBusy()){
  if(reloadPending){window.location.reload();return;}
  tryUpdate();
 }
}
export function waitingUpdate() {return Boolean(registration?.waiting);}
export function applyUpdate() {
 if(busy || [...document.querySelectorAll('audio')].some(audio=>!audio.paused))return 'Desligue áudio, STREAM e REC antes de atualizar.';
 if(!registration?.waiting)return 'Nenhuma atualização pendente.';
 applying=true;registration.waiting.postMessage({type:'ACTIVATE_IDLE',busy:false});
 return 'Preparando atualização...';
}
export function registerPwa() {
 if(process.env.NODE_ENV!=='production'||!('serviceWorker' in navigator))return;
 const hadController=Boolean(navigator.serviceWorker.controller);
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(!hadController&&!applying)return;
  if(audioBusy())reloadPending=true;else window.location.reload();
 });
 navigator.serviceWorker.addEventListener('message',event=>{
  if(event.data?.type==='CHECK_IDLE'){event.ports?.[0]?.postMessage({idle:!audioBusy()});return;}
  if(event.data?.type==='UPDATE_BLOCKED'){applying=false;window.dispatchEvent(new CustomEvent('retro-update',{detail:event.data.message}));}
 });
 navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
  registration=reg;
  const announce=()=>{window.dispatchEvent(new CustomEvent('retro-update'));tryUpdate();};
  if(reg.waiting)announce();
  reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',()=>{if(reg.waiting)announce();}));
  const check=()=>{if(document.visibilityState==='visible'){reg.update().then(tryUpdate).catch(()=>{});}};
  document.addEventListener('visibilitychange',check);check();
 }).catch(()=>{ /* Online app remains usable if offline shell cannot be installed. */ });
}
