import React,{useEffect,useState} from 'react';
export default function StreamSession({network}) {
 const [message,setMessage]=useState(''),[manualCopy,setManualCopy]=useState(false),[selected,setSelected]=useState('');
 const sessions=network.sessions || [];
 const choice=sessions.some(s=>s.invite===selected)?selected:sessions[0]?.invite;
 useEffect(()=>{setMessage('');setManualCopy(false);},[network.dialog]);
 async function copy(){
  try {await navigator.clipboard.writeText(network.share);setMessage('CONVITE COPIADO');}
  catch {setManualCopy(true);setMessage('Selecione e copie o convite.');}
 }
 async function share(){
  if(navigator.share){
   try {await navigator.share({title:'Retro VU',url:network.share});setMessage('CONVITE COMPARTILHADO');}
   catch(error){if(error.name!=='AbortError')await copy();}
  }else await copy();
 }
 return <div className="stream-session">
  {network.dialog && <section role="dialog" aria-modal="true" aria-label={network.dialog==='send'?'Transmitir áudio':network.dialog==='discover'?'Receber áudio':'Sessão privada'} className="stream-session-dialog">
   {network.dialog==='send' && <>
    <h2>TRANSMITIR ÁUDIO?</h2>
    <button className="session-primary" type="button" onClick={()=>network.confirmTransmit('open')}>TRANSMITIR</button>
    <button type="button" onClick={()=>network.confirmTransmit('private')}>MODO PRIVADO</button>
    <button type="button" onClick={network.closeDialog}>VOLTAR</button>
   </>}
   {network.dialog==='discover' && <>
    <h2>{sessions.length?'TRANSMISSÃO DISPONÍVEL':network.discovering?'PROCURANDO':'NENHUMA TRANSMISSÃO'}</h2>
    {sessions.length===1 && <p className="session-name">JUNIOR <small>● AO VIVO</small></p>}
    {sessions.length>1 && <label>Transmissor<select value={choice} onChange={e=>setSelected(e.target.value)}>{sessions.map((s,i)=><option key={s.invite} value={s.invite}>{s.name} · {i+1} · AO VIVO</option>)}</select></label>}
    {network.discoveryError && <p role="alert">{network.discoveryError}</p>}
    <button className="session-primary" type="button" disabled={!choice} onClick={()=>network.connect(choice)}>CONECTAR</button>
    <button type="button" onClick={network.privateJoin}>ENTRAR EM MODO PRIVADO</button>
    <button type="button" onClick={network.closeDialog}>VOLTAR</button>
   </>}
   {network.dialog==='private' && <>
    <h2>SESSÃO PRIVADA</h2>
    <label>Cole o convite recebido<textarea aria-label="Convite" value={network.inviteText} onChange={e=>network.setInviteText(e.target.value)} autoCapitalize="none" spellCheck="false" /></label>
    {network.inviteError && <p role="alert">{network.inviteError}</p>}
    <button className="session-primary" type="button" onClick={network.join}>CONECTAR</button>
    <button type="button" onClick={network.showDiscovery}>VOLTAR</button>
   </>}
   {network.dialog==='share' && <>
    <h2>SESSÃO PRIVADA</h2><p>Convite criado</p>
    <button className="session-primary" type="button" onClick={copy}>COPIAR CONVITE</button>
    <button type="button" onClick={share}>COMPARTILHAR</button>
    {manualCopy && <textarea aria-label="Convite privado" readOnly value={network.share} onFocus={e=>e.target.select()} />}
    {message && <p role="status">{message}</p>}
    <button type="button" onClick={network.closeDialog}>VOLTAR</button>
   </>}
  </section>}
 </div>;
}
