import {newInvitation,parseInvitation,pendingInvitation,invitationURL} from './stream/invitation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StreamTransport } from './stream/transport';
const IDLE = { role: null, status: 'IDLE', seconds: 0, analyser: null, playing: false };
export default function useStreamNetwork(session) {
  const [state, setState] = useState(IDLE);
  const ref = useRef(null);
  const [dialog,setDialog]=useState(null);
  const sourceRef=useRef('usb');
  const [sessions,setSessions]=useState([]);
  const [discovering,setDiscovering]=useState(false);
  const [discoveryError,setDiscoveryError]=useState('');
  const modeRef=useRef('open'), transmitAction=useRef(null);
  const [inviteText,setInviteText]=useState(pendingInvitation);
  const [inviteError,setInviteError]=useState('');
  const [share,setShare]=useState('');
  const stop = useCallback(() => { ref.current?.close(); ref.current = null; setState(IDLE);setShare('');setDialog(null); }, []);
  const start = useCallback((role, source, credentials) => {
    ref.current?.close();
    let controller;
    const pending = [];
    const update = values => {
      if (!controller) pending.push(values);
      else if (ref.current === controller) setState(previous => ({ ...previous, ...values }));
    };
    try {
      controller = new StreamTransport(role, source, update, credentials);
      ref.current = controller;
      setState({ ...IDLE, ...Object.assign({}, ...pending) });
      controller.start();
    } catch (error) { setState({ ...IDLE, role, status: 'ERROR', error: error.message }); }
  }, []);
  useEffect(() => {
    let cancelled=false;
    if (session) {
      newInvitation().then(credentials=>{
        if(cancelled)return;
        const visibility=modeRef.current;
        setShare(visibility==='private'?invitationURL(credentials.invite):'');
        if(visibility==='private')setDialog('share');
        start('send',session,{...credentials,visibility});
      }).catch(error=>{if(!cancelled)setState({...IDLE,status:'ERROR',role:'send',error:error.message});});
    } else if (ref.current?.role === 'send') stop();
    return ()=>{cancelled=true;};
  }, [session, start, stop]);
  useEffect(() => () => ref.current?.close(), []);
  useEffect(() => {
    if(dialog !== 'discover')return;
    let cancelled=false, timer, abort;
    async function refresh(){
      abort=new AbortController();
      const timeout=setTimeout(()=>abort.abort(),8000);
      setDiscovering(true);
      try {
        const response=await fetch('/api/stream-signal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'discover'}),signal:abort.signal});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error || 'Descoberta indisponível');
        if(!cancelled){setSessions(result.sessions);setDiscoveryError('');}
      } catch(error){if(!cancelled){setSessions([]);setDiscoveryError('Não foi possível consultar. Tentando novamente.');}}
      finally{clearTimeout(timeout);if(!cancelled){setDiscovering(false);timer=setTimeout(refresh,3000);}}
    }
    refresh();return()=>{cancelled=true;clearTimeout(timer);abort?.abort();};
  },[dialog]);
  function connect(invite){
    setInviteError('');setDialog(null);
    if(window.location.hash.startsWith('#stream='))window.history.replaceState(null,'',window.location.pathname+window.location.search);
    // Keep AudioContext creation/resume in this direct CONNECT user gesture.
    start('receive',null,{invite});
  }
  return { ...state, share,dialog,sessions,discovering,discoveryError,inviteText,inviteError,setInviteText,
    closeDialog:()=>setDialog(null),showShare:()=>setDialog('share'),
    privateJoin:()=>{setInviteError('');setDialog('private');},
    showDiscovery:()=>setDialog('discover'),
    requestTransmit:action=>{transmitAction.current=action;setDialog('source');},
    chooseSource:kind=>{sourceRef.current=kind;setDialog('send');},
    confirmTransmit:mode=>{modeRef.current=mode;setDialog(null);transmitAction.current?.(sourceRef.current);},
    connect,
    join:()=>{
      const invite=parseInvitation(inviteText);
      if(!invite){setInviteError('Cole um convite válido deste Retro VU.');return;}
      connect(invite);
    }, stop, toggleReceive: () => {
      if (ref.current?.role === 'receive') stop();
      else {setDialog('discover');setInviteError('');}
    }, togglePlay: () => ref.current?.togglePlay() };
}
