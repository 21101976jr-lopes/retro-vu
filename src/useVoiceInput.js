import {useCallback,useEffect,useRef,useState} from 'react';
const IDLE={status:'STANDBY',settings:{},signal:0,monitor:false,muted:false,session:null};
// Voice owns one capture. WebRTC, analyser, MONITOR and REC share this source.
export default function useVoiceInput(){
 const [state,setState]=useState(IDLE),owner=useRef(null);
 const stop=useCallback(()=>{const s=owner.current;owner.current=null;if(s){s.ready=false;s.stream?.getTracks().forEach(t=>t.stop());s.source?.disconnect();s.analyser?.disconnect();s.ctx.close().catch(()=>{});}setState(IDLE);},[]);
 useEffect(()=>()=>{const s=owner.current;owner.current=null;if(s){s.stream?.getTracks().forEach(t=>t.stop());s.source?.disconnect();s.ctx.close().catch(()=>{});}},[]);
 async function start(){
  if(owner.current)return;
  const s={ctx:new (window.AudioContext||window.webkitAudioContext)(),kind:'voice',ready:false,onVoiceState:new Set()};owner.current=s;
  setState({...IDLE,status:'OPENING'});
  try{
   await s.ctx.resume();if(owner.current!==s)return;
   const constraints={channelCount:{ideal:1},echoCancellation:true,noiseSuppression:true,autoGainControl:true};
   const devices=await navigator.mediaDevices.enumerateDevices?.() || [];
   const microphones=devices.filter(d=>d.kind==='audioinput'&&d.label&&!/usb|numark|ttusb/i.test(d.label)&&!['default','communications'].includes(d.deviceId));
   const selected=microphones.find(d=>/mic|built.in|intern/i.test(d.label)) || microphones[0];
   if(selected)constraints.deviceId={exact:selected.deviceId};
   s.stream=await navigator.mediaDevices.getUserMedia({audio:constraints});
   if(owner.current!==s){s.stream.getTracks().forEach(t=>t.stop());return;}
   if(owner.current!==s)return;
   let track=s.stream.getAudioTracks()[0];
   const after=await navigator.mediaDevices.enumerateDevices?.() || [];
   if(owner.current!==s){s.stream.getTracks().forEach(t=>t.stop());return;}
   const actual=after.find(d=>d.deviceId===track.getSettings().deviceId);
   if(/usb|numark|ttusb/i.test(actual?.label||track.label||'')){
    const mic=after.find(d=>d.kind==='audioinput'&&d.label&&!/usb|numark|ttusb/i.test(d.label)&&!['default','communications'].includes(d.deviceId));
    s.stream.getTracks().forEach(t=>t.stop());
    if(!mic)throw new Error('Nenhum microfone disponível além da entrada USB.');
    s.stream=await navigator.mediaDevices.getUserMedia({audio:{...constraints,deviceId:{exact:mic.deviceId}}});
    if(owner.current!==s){s.stream.getTracks().forEach(t=>t.stop());return;}track=s.stream.getAudioTracks()[0];
   }
   s.settings=track.getSettings();
   s.settings={...s.settings,channelCount:s.settings.channelCount||1};
   s.source=s.ctx.createMediaStreamSource(s.stream);s.analyser=s.ctx.createAnalyser();s.analyser.fftSize=2048;s.source.connect(s.analyser);s.ready=true;
   track.addEventListener('ended',()=>{if(owner.current===s){stop();setState({...IDLE,status:'ERROR',message:'MICROPHONE ENDED'});}});
   setState({...IDLE,status:'READY',settings:s.settings,session:s});
  }catch(error){if(owner.current===s){stop();setState({...IDLE,status:'ERROR',message:error.name==='NotAllowedError'?'AUDIO PERMISSION REQUIRED':error.message});}}
 }
 function toggleMute(){const s=owner.current;if(!s?.ready)return;const track=s.stream.getAudioTracks()[0];track.enabled=!track.enabled;for(const notify of s.onVoiceState)notify(!track.enabled);setState(v=>({...v,muted:!track.enabled}));}
 async function toggleMonitor(){const s=owner.current;if(!s?.ready)return;try{await s.ctx.resume();if(owner.current!==s||s.ctx.state!=='running')return;if(s.monitor)s.source.disconnect(s.ctx.destination);else s.source.connect(s.ctx.destination);s.monitor=!s.monitor;setState(v=>({...v,monitor:s.monitor}));}catch(error){setState(v=>({...v,message:error.message}));}}
 return {...state,start,stop,toggleMute,toggleMonitor};
}
