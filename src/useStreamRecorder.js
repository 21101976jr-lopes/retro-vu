import { useCallback, useEffect, useRef, useState } from 'react';
import { WavRecorder } from './recording/WavRecorder';
import { loadRecordings, deleteRecording, exportRecording } from './recording/archive';
const IDLE = {status:'idle',seconds:0,file:null,message:''};
export default function useStreamRecorder(session) {
  const [state,setState] = useState(IDLE);
  const [files,setFiles] = useState([]);
  const owner = useRef({current:null,file:null,files:[],mounted:true,revision:0});
  const stop = useCallback(() => owner.current.current?.stop().catch(()=>{}) || null, []);
  const discard = useCallback(async () => {
    const o = owner.current;
    if (o.current || !o.file) return;
    try {
      await deleteRecording(o.file.id);
      URL.revokeObjectURL(o.file.url);
      o.files=o.files.filter(f=>f.id!==o.file.id);o.file=o.files[0]||null;
      setFiles([...o.files]);setState({...IDLE,file:o.file,status:o.file?'available':'idle'});
    } catch(error) {setState(s=>({...s,message:`Não foi possível descartar: ${error.message}`}));}
  }, []);
  function select(id) {
    const o=owner.current;if(o.current)return;
    o.file=o.files.find(f=>f.id===id)||null;setState({...IDLE,status:'available',file:o.file});
  }
  async function exportFile() {
    const file=owner.current.file;if(!file)return;
    setState(s=>({...s,exporting:true,message:'ABRINDO EXPORTAÇÃO...'}));
    try { const message=await exportRecording(file);setState(s=>({...s,message,exporting:false})); }
    catch(error){setState(s=>({...s,exporting:false,message:error.name==='AbortError'?'Exportação cancelada. WAV preservado no aplicativo.':`Exportação não concluída: ${error.message}. WAV preservado.`}));}
  }
  function toggle() {
    const o = owner.current;
    if (o.current) { stop(); return; }
    if (!session?.ready || (session.stream && session.stream.getAudioTracks()[0]?.readyState !== 'live')) {
      setState(s=>({...s,status:'error',message:'REC: ative uma fonte ou conecte RECEBER.'})); return;
    }
    o.revision++;
    navigator.storage?.persist?.().catch(()=>{});
    setState({...IDLE,status:'starting',message:'PREPARANDO WAV'});
    const recorder = new WavRecorder(session, values => {
      if (!o.mounted || o.current !== recorder) return;
      if (values.status === 'available') {
        o.file=values.file;o.files=[values.file,...o.files];o.current=null;setFiles([...o.files]);
        // WavRecorder committed the file to OPFS. Keep playback and navigation untouched.
      }
      if (values.status === 'error') o.current = null;
      setState(s=>({...s,...values,...(values.status==='error'?{file:o.file}:{})}));
      // Archive is committed by WavRecorder; export is always an explicit later action.
    });
    o.current = recorder;recorder.start().catch(error=>recorder.fail(error));
  }
  useEffect(()=>{ if (owner.current.current && owner.current.current.session !== session) stop(); },[session,stop]);
  useEffect(()=>{
    const o=owner.current;o.mounted=true;let cancelled=false;
    loadRecordings().then(restored=>{
      if(cancelled){restored.forEach(f=>URL.revokeObjectURL(f.url));return;}
      if(!restored.length)return;
      o.files=[...o.files,...restored.filter(f=>!o.files.some(existing=>existing.id===f.id))];setFiles([...o.files]);
      if(!o.revision && !o.current){o.file=o.files[0]||null;setState({...IDLE,file:o.file,status:o.file?'available':'idle'});}
    }).catch(error=>{if(!cancelled)setState(s=>({...s,message:`Acervo indisponível: ${error.message}`}));});
    const leaving=event=>{if(o.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',leaving);
    return ()=>{
      cancelled=true;o.mounted=false;o.current?.dispose();o.current=null;
      o.files.forEach(f=>URL.revokeObjectURL(f.url));o.files=[];o.file=null;
      window.removeEventListener('beforeunload',leaving);
    };
  },[]);
  return {...state,files,stop,toggle,discard,select,exportFile};
}
