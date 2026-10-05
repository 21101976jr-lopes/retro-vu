import React from 'react';
export function indicatorStates(capture, network, recording) {
  const sending = network.role === 'send';
  const receiving = network.role === 'receive';
  const connectedRx = ['BUFFERING', 'PLAYING', 'RECOVERING', 'STOPPED', 'NEEDS_PLAY'].includes(network.status);
  return [
    capture.status === 'OPENING' ? 'pending' : sending && capture.status === 'READY'
      ? network.status === 'CONNECTED' ? 'on' : network.status === 'ERROR' ? 'off' : 'pending' : 'off',
    receiving ? connectedRx ? 'on' : network.status === 'ERROR' ? 'off' : 'pending' : 'off',
    receiving && network.status === 'PLAYING' ? 'on'
      : receiving && network.playing && ['BUFFERING', 'RECOVERING', 'CONNECTING', 'NEEDS_PLAY'].includes(network.status) ? 'pending' : 'off',
    capture.monitor ? 'on' : 'off',
    recording.status === 'recording' ? 'on' : ['starting', 'finalizing'].includes(recording.status) ? 'pending' : 'off',
  ];
}
const NAMES = ['TRANSMITIR', 'RECEBER', 'PLAY', 'MONITOR', 'REC'];
function Symbol({ index }) {
  if (index === 0) return <><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M7 7a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16" /></>;
  if (index === 1) return <><path d="M9 3h6v8h4l-7 7-7-7h4z" fill="currentColor" /><path d="M3 17v4h18v-4" /></>;
  if (index === 2) return <path d="M6 3l15 9-15 9z" fill="currentColor" />;
  if (index === 3) return <><path d="M3 9h4l6-5v16l-6-5H3z" fill="currentColor" /><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>;
  return <circle cx="12" cy="12" r="8" fill="currentColor" />;
}
export default function StreamIndicators({ capture, network, recording }) {
  const states = indicatorStates(capture, network, recording);
  return <div className="stream-indicators" aria-label="Estados das funções STREAM">
    {NAMES.map((name, i) => <svg key={name} className="stream-indicator" data-state={states[i]}
      data-function={name} role="img" aria-label={`${name}: ${{ off: 'desligado', pending: 'preparando', on: 'ativo' }[states[i]]}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <Symbol index={i} />
    </svg>)}
  </div>;
}
