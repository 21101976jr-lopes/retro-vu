import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { readDiagnostic } from './stream/debug';

// TEMPORARY: extraction of transport diagnostics from the Android PWA.
export default function StreamDiagnostic({ color }) {
  const [report, setReport] = useState('');
  const [notice, setNotice] = useState('');
  const parsed = report ? JSON.parse(report) : {};
  const tx = parsed.snapshots?.send, rx = parsed.snapshots?.receive;
  const button = { color: 'inherit', background: 'transparent', border: '1px solid currentColor',
    padding: '10px', cursor: 'pointer', font: 'inherit' };
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(report); setNotice('Diagnóstico copiado.');
    } catch { setNotice('Selecione o texto abaixo → Selecionar tudo → Copiar.'); }
  }
  return <>
    <button type="button" aria-label="Abrir diagnóstico STREAM" onClick={() => { setReport(readDiagnostic()); setNotice(''); }}
      style={{ font: 'inherit', color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
      RETRO STREAM · DIAG
    </button>
    {report && createPortal(<div role="dialog" aria-modal="true" aria-label="Diagnóstico de transporte"
      onKeyDown={event => { if (event.key === 'Escape') setReport(''); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, overflow: 'auto', padding: 16,
        background: '#080b08', color, font: '14px monospace', boxSizing: 'border-box' }}>
      <h2>Diagnóstico STREAM</h2>
      {tx && <p>Produzido: {tx.pcmProducedBps} B/s PCM</p>}
      {tx?.peers?.map((peer, i) => <div key={peer.peer}>
        <p>Receptor {i + 1}: enviado {peer.pcmSentBps} B/s PCM</p>
        <p>Recebido remoto: {peer.remote?.pcmReceivedBps ?? '--'} B/s PCM</p>
        <p>Envio: {peer.queue?.bufferedAmount ?? '--'} B · máximo {peer.queue?.maxBufferedAmount ?? '--'} B</p>
        <p>Fila: {peer.queue?.queuedBytes ?? 0} B · espera {peer.queue?.blockedMs ?? 0} ms</p>
        <p>ICE {peer.iceConnectionState} · canal {peer.dataChannelState}</p>
      </div>)}
      {rx && <p>Recebido: {rx.pcmReceivedBps} B/s PCM · reprodução {(rx.bufferSeconds || 0).toFixed(1)} s</p>}
      <p>Último evento crítico: {parsed.lastFault?.reason || parsed.lastFault?.type || 'nenhum registrado'}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={button} onClick={copy}>COPIAR</button>
        <button style={button} onClick={() => setReport(readDiagnostic())}>ATUALIZAR</button>
        <button style={button} onClick={() => setReport('')}>FECHAR</button>
      </div>
      <p role="status">{notice}</p>
      <textarea aria-label="Relatório completo" readOnly autoFocus value={report}
        onFocus={event => event.target.select()}
        style={{ width: '100%', height: '35vh', boxSizing: 'border-box', background: '#111', color: 'inherit', font: '12px monospace' }} />
    </div>, document.body)}
  </>;
}
