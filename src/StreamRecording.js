import React, { useEffect, useState } from 'react';
export function recordingTime(seconds = 0) {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}
export default function StreamRecording({ recording, color, onClose, panelOnly = false }) {
  const [open,setOpen]=useState(panelOnly),[remove,setRemove]=useState(false),[details,setDetails]=useState(false);
  const file=recording.file;
  const busy=['starting','finalizing'].includes(recording.status);
  useEffect(()=>{if(file || busy){setOpen(true);setRemove(false);}},[file,busy]);
  return <div className="stream-recording">
    {!panelOnly && recording.status==='recording' && <span>REC {recordingTime(recording.seconds)}</span>}
    {!panelOnly && recording.status==='error' && <span role="status">{recording.message}</span>}
    {!panelOnly && file && <button type="button" onClick={()=>setOpen(true)}>ÚLTIMA GRAVAÇÃO</button>}
    {open && (file || busy) && <div className="stream-recording-backdrop" style={{color}}>
      <section role="dialog" aria-label="Gravação local USB" className="stream-recording-dialog">
        {busy ? <><h2>{recording.status==='starting'?'PREPARANDO GRAVAÇÃO':'FINALIZANDO GRAVAÇÃO'}</h2><p role="status">AGUARDE...</p></> : <>
          <h2>{remove ? 'DESCARTAR GRAVAÇÃO?' : details ? 'ARQUIVO WAV' : 'GRAVAÇÃO CONCLUÍDA'}</h2>
          <p className="recording-name">{file.name}</p>
          <p>{recordingTime(file.seconds)} · {(file.size/1048576).toFixed(2)} MiB · WAV PCM16</p>
          {remove ? <>
            <p>Excluir do acervo do aplicativo?</p>
            <button type="button" onClick={()=>{setRemove(false);recording.discard();}}>CONFIRMAR DESCARTE</button>
            <button type="button" onClick={()=>setRemove(false)}>CANCELAR</button>
          </> : details ? <>
            <p>WAV preservado neste aplicativo.</p>
            <p>Exportação: Downloads ou destino escolhido pelo Chrome.</p>
            {recording.message && <p role="status">{recording.message}</p>}
            {recording.files?.length>1 && <label>Gravações preservadas <select aria-label="Gravações preservadas" value={file.id} onChange={e=>recording.select(e.target.value)}>
              {recording.files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
            </select></label>}
            <button type="button" onClick={()=>setDetails(false)}>VOLTAR</button>
          </> : <>
            <p>Salva no acervo do aplicativo.</p>
            <audio controls src={file.url} aria-label="Ouvir gravação" />
            <div className="recording-actions">
              <button disabled={recording.exporting} type="button" onClick={()=>{recording.exportFile();setDetails(true);}}>SALVAR WAV</button>
              <button disabled={recording.exporting} type="button" onClick={()=>setRemove(true)}>DESCARTAR</button>
              <button type="button" onClick={()=>setDetails(true)}>DETALHES</button>
              <button type="button" onClick={()=>{setOpen(false);onClose?.();}}>CONTINUAR — WAV PRESERVADO</button>
            </div>
          </>}
        </>}
      </section>
    </div>}
  </div>;
}
