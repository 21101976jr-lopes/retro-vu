import React,{useState,useEffect} from 'react';
import {waitingUpdate,applyUpdate} from './pwa';
export default function PwaUpdate(){
 const [waiting,setWaiting]=useState(waitingUpdate),[message,setMessage]=useState('');
 useEffect(()=>{const update=event=>{setWaiting(waitingUpdate());setMessage(event.detail||'');};window.addEventListener('retro-update',update);return()=>window.removeEventListener('retro-update',update);},[]);
 return waiting?<div className="stream-session"><button type="button" onClick={()=>setMessage(applyUpdate())}>ATUALIZAÇÃO DISPONÍVEL</button>{message&&<p role="status">{message}</p>}</div>:null;
}
