let registration;
let busy = false;
let applying = false;
export function setPwaBusy(value) {busy=Boolean(value);}
export function waitingUpdate() {return Boolean(registration?.waiting);}
export function applyUpdate() {
 if(busy || [...document.querySelectorAll('audio')].some(audio=>!audio.paused))return 'Desligue áudio, STREAM e REC antes de atualizar.';
 if(!registration?.waiting)return 'Nenhuma atualização pendente.';
 applying=true;registration.waiting.postMessage({type:'ACTIVATE_IDLE',busy:false});
 return 'Preparando atualização...';
}
export function registerPwa() {
 if(process.env.NODE_ENV!=='production'||!('serviceWorker' in navigator))return;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applying&&!busy)window.location.reload();});
 navigator.serviceWorker.addEventListener('message',event=>{
  if(event.data?.type==='UPDATE_BLOCKED'){applying=false;window.dispatchEvent(new CustomEvent('retro-update',{detail:event.data.message}));}
 });
 navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
  registration=reg;
  const announce=()=>window.dispatchEvent(new CustomEvent('retro-update'));
  if(reg.waiting)announce();
  reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',()=>{if(reg.waiting)announce();}));
  const check=()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{});};
  document.addEventListener('visibilitychange',check);check();
 }).catch(()=>{ /* Online app remains usable if offline shell cannot be installed. */ });
}
