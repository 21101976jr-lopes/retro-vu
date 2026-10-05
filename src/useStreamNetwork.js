import {newInvitation,parseInvitation,pendingInvitation,invitationURL} from './stream/invitation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StreamTransport } from './stream/transport';
const IDLE = { role: null, status: 'IDLE', seconds: 0, analyser: null, playing: false };
export default function useStreamNetwork(session) {
  const [state, setState] = useState(IDLE);
  const ref = useRef(null);
  const [joinOpen,setJoinOpen]=useState(false);
  const [inviteText,setInviteText]=useState(pendingInvitation);
  const [inviteError,setInviteError]=useState('');
  const [share,setShare]=useState('');
  const stop = useCallback(() => { ref.current?.close(); ref.current = null; setState(IDLE);setShare('');setJoinOpen(false); }, []);
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
        setShare(invitationURL(credentials.invite));start('send',session,credentials);
      }).catch(error=>{if(!cancelled)setState({...IDLE,status:'ERROR',role:'send',error:error.message});});
    } else if (ref.current?.role === 'send') stop();
    return ()=>{cancelled=true;};
  }, [session, start, stop]);
  useEffect(() => () => ref.current?.close(), []);
  return { ...state, share,joinOpen,inviteText,inviteError,setInviteText,
    cancelJoin:()=>setJoinOpen(false),
    join:()=>{
      const invite=parseInvitation(inviteText);
      if(!invite){setInviteError('Cole o convite privado recebido do transmissor.');return;}
      setInviteError('');setJoinOpen(false);
      if(window.location.hash.startsWith('#stream='))window.history.replaceState(null,'',window.location.pathname+window.location.search);
      start('receive',null,{invite});
    }, stop, toggleReceive: () => {
    if (ref.current?.role === 'receive') stop(); else {setJoinOpen(true);setInviteError('');}
  }, togglePlay: () => ref.current?.togglePlay() };
}
