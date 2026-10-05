import React,{useState} from 'react';
export default function StreamSession({network}) {
 const [show,setShow]=useState(false),[message,setMessage]=useState('');
 async function copy(){
  try {await navigator.clipboard.writeText(network.share);setMessage('Convite copiado. Envie somente a quem pode ouvir.');}
  catch {setMessage('Selecione e copie o convite abaixo.');}
 }
 return <div className="stream-session">
  {network.share && <button type="button" onClick={()=>setShow(true)}>CONVITE PRIVADO</button>}
  {((show && network.share) || network.joinOpen) && <section role="dialog" aria-label="Sessão privada" className="stream-session-dialog">
   <h2>SESSÃO PRIVADA</h2>
   {network.joinOpen ? <>
    <p>Cole o convite enviado pelo transmissor. Até três receptores.</p>
    <label>Convite <textarea value={network.inviteText} onChange={e=>network.setInviteText(e.target.value)} autoCapitalize="none" spellCheck="false" /></label>
    {network.inviteError && <p role="alert">{network.inviteError}</p>}
    <button type="button" onClick={network.join}>ENTRAR NA SESSÃO</button>
    <button type="button" onClick={network.cancelJoin}>CANCELAR</button>
   </> : <>
    <p>Quem tiver este convite poderá ouvir. Compartilhe em particular. Um novo TRANSMITIR gera outro convite.</p>
    <textarea aria-label="Convite privado" readOnly value={network.share} onFocus={e=>e.target.select()} />
    <button type="button" onClick={copy}>COPIAR CONVITE</button>
    <p role="status">{message}</p>
    <button type="button" onClick={()=>setShow(false)}>FECHAR CONVITE</button>
   </>}
  </section>}
 </div>;
}
