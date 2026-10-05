import React, { useEffect, useState } from 'react';
export function recordingTime(seconds = 0) {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}
export default function StreamRecording({ recording, color }) {
  const [open,setOpen]=useState(false),[remove,setRemove]=useState(false);
  const file=recording.file;
  const busy=['starting','finalizing'].includes(recording.status);
  useEffect(()=>{if(file || busy){setOpen(true);setRemove(false);}},[file,busy]);
  return <div className="stream-recording">
    {recording.status==='recording' && <span>REC {recordingTime(recording.seconds)}</span>}
    {recording.status==='error' && <span role="status">{recording.message}</span>}
    {file && <button type="button" onClick={()=>setOpen(true)}>ÚLTIMA GRAVAÇÃO</button>}
    {open && (file || busy) && <div className="stream-recording-backdrop" style={{color}}>
      <section role="dialog" aria-label="Gravação local USB" className="stream-recording-dialog">
        {busy ? <><h2>{recording.status==='starting'?'PREPARANDO GRAVAÇÃO':'FINALIZANDO GRAVAÇÃO'}</h2><p role="status">AGUARDE...</p></> : <>
          <h2>GRAVAÇÃO CONCLUÍDA</h2>
          <p className="recording-name">{file.name}</p>
          <p>{recordingTime(file.seconds)} · {(file.size/1048576).toFixed(2)} MiB · WAV PCM16</p>
          <button disabled={recording.exporting} type="button" onClick={recording.exportFile}>SALVAR WAV</button>
          {remove ? <><p>Excluir definitivamente esta gravação do aplicativo?</p>
            <button type="button" onClick={()=>{setRemove(false);recording.discard();}}>CONFIRMAR DESCARTE</button>
            <button type="button" onClick={()=>setRemove(false)}>CANCELAR</button></> : <button disabled={recording.exporting} type="button" onClick={()=>setRemove(true)}>DESCARTAR</button>}
          <p>Salva no acervo deste aplicativo. Exportação externa é separada.</p>
          {recording.message && <p role="status">{recording.message}</p>}
          <audio controls src={file.url} aria-label="Ouvir gravação" />
          <p>O Chrome escolhe Downloads ou solicita um destino. Não é possível impor Music/Retro VU.</p>
          {recording.files?.length>1 && <label>Gravações preservadas <select aria-label="Gravações preservadas" value={file.id} onChange={e=>recording.select(e.target.value)}>
            {recording.files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
          </select></label>}
          <button type="button" onClick={()=>setOpen(false)}>CONTINUAR — WAV PRESERVADO</button>
        </>}
      </section>
    </div>}
  </div>;
}
