import React from 'react';
export function recordingTime(seconds = 0) {
  const total=Math.floor(seconds);
  return `${Math.floor(total/60).toString().padStart(2,'0')}:${(total%60).toString().padStart(2,'0')}`;
}
// Opened only by EXPORTAR WAV; completion never mounts this panel.
export default function StreamRecording({recording,color,onClose}) {
  return <div className="stream-recording-backdrop" style={{color}}>
    <section role="dialog" aria-label="Exportar gravações" className="stream-recording-dialog">
      <h2>ACERVO WAV</h2>
      <label>Gravações preservadas
        <select aria-label="Gravações preservadas" value={recording.file?.id||''} onChange={e=>recording.select(e.target.value)}>
          {(recording.files?.length?recording.files:[recording.file]).filter(Boolean).map(file=><option key={file.id} value={file.id}>{file.name}</option>)}
        </select>
      </label>
      <p>O original permanece no aplicativo.</p>
      <button type="button" disabled={recording.exporting} onClick={recording.exportFile}>EXPORTAR WAV</button>
      {recording.message && <p role="status">{recording.message}</p>}
      <button type="button" onClick={onClose}>VOLTAR</button>
    </section>
  </div>;
}
