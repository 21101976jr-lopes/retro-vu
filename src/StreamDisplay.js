import PlaylistPanel from './PlaylistPanel';
import StreamSession from './StreamSession';
import React, { useEffect, useState } from 'react';
import useDigitalTheme from './useDigitalTheme';
import './StreamDisplay.css';
import StreamDiagnostic from './StreamDiagnostic';
import StreamNightMode from './StreamNightMode';
import StreamIndicators from './StreamIndicators';
import StreamRecording from './StreamRecording';

const ISSUES = {
  'USB AUDIO NOT READY': ['ATIVE A ENTRADA', 'Toque em TRANSMITIR para iniciar a captura USB.'],
  'USB AUDIO NOT FOUND': ['USB NÃO ENCONTRADO', 'Conecte o USB e tente TRANSMITIR.'],
  'USB AUDIO DISCONNECTED': ['USB DESCONECTADO', 'Reconecte o toca-discos e toque em TRANSMITIR.'],
  'AUDIO PERMISSION REQUIRED': ['PERMITA O ÁUDIO', 'Autorize o acesso ao áudio no navegador e tente novamente.'],
  'MONITOR AUDIO ERROR': ['MONITOR INDISPONÍVEL', 'Toque em MONITOR para tentar novamente.'],
  'SECURE CONTEXT REQUIRED': ['ACESSO SEGURO', 'Abra o Retro VU por um endereço HTTPS.'],
  'WEB AUDIO UNAVAILABLE': ['ÁUDIO INDISPONÍVEL', 'Este navegador não oferece o recurso de áudio necessário.'],
  'USB AUDIO UNAVAILABLE': ['USB INDISPONÍVEL', 'Confira a conexão e tente novamente.'],
  'USB INPUT MISMATCH': ['ENTRADA INCORRETA', 'Confira o USB e toque em TRANSMITIR.'],
  'VOICE PROCESSING ACTIVE': ['CAPTURA INCOMPATÍVEL', 'O navegador ativou processamento de voz. Tente novamente.'],
  'AUDIO CONTEXT SUSPENDED': ['ÁUDIO PAUSADO', 'Toque em TRANSMITIR para tentar novamente.'],
};

export default function StreamDisplay({ geometry, baseWidth, baseHeight, capture, network = {}, recording = {}, playlist = null, openPlayer }) {
  const { theme, cycleTheme } = useDigitalTheme();
  const [recordingOpen,setRecordingOpen] = useState(false);
  const [recordingNotice,setRecordingNotice] = useState(false);
  useEffect(()=>{
    if(['starting','recording'].includes(recording.status))setRecordingOpen(false);
    if(recording.status!=='available')return;
    setRecordingNotice(true);
    const timer=setTimeout(()=>setRecordingNotice(false),5000);
    return ()=>clearTimeout(timer);
  },[recording.file,recording.status]);
  const showRecording = !playlist && !network.dialog && recordingOpen && Boolean(recording.file);
  const showMain = !playlist && !network.dialog && !showRecording;
  const ready = capture.status === 'READY';
  const issue = network.role === 'receive' ? null : ISSUES[capture.message] || (capture.status === 'ERROR'
    ? ['FALHA NO ÁUDIO', 'Confira a entrada USB e tente novamente.'] : null);
  const mode = issue ? 'error' : capture.status === 'OPENING' ? 'opening'
    : capture.monitor ? 'monitor' : ready ? 'capture' : 'idle';
  let title = issue ? issue[0] : {
    idle: 'PRONTO', opening: capture.kind==='voice'?'ABRINDO MIC':'ABRINDO USB', capture: capture.kind==='voice'&&!network.role?'MIC ATIVO':'TRANSMITIR ATIVO', monitor: 'MONITOR ATIVO',
  }[mode];
  let detail = issue ? issue[1] : {
    idle: 'Toque em TRANSMITIR para escolher a fonte.',
    opening: 'Aguardando a entrada e a permissão de áudio.',
    capture: capture.kind==='voice'?'MICROFONE':capture.kind==='player'?'PLAYER LOCAL':'USB CONECTADO',
    monitor: 'Sem áudio? Selecione a saída de mídia no Android.',
  }[mode];
  const receiving = network.role === 'receive';
  if (network.role && !issue && !capture.monitor) {
    const contexts = {
      WAITING: ['TRANSMITINDO', 'AGUARDANDO RECEPTOR'],
      SEARCHING: ['PROCURANDO', 'Aguardando um transmissor.'],
      CONNECTING: ['CONECTANDO', 'Preparando o caminho de áudio.'],
      CONNECTED: ['TRANSMITINDO', 'RECEPTOR CONECTADO'],
      BUFFERING: ['BUFFERIZANDO', 'Preparando reprodução estável.'],
      PLAYING: ['RECEBENDO', network.sourceKind==='voice'?(network.voiceMuted?'MICROFONE SILENCIADO':'Voz · baixa latência'):'Áudio PCM sem compressão.'],
      RECOVERING: ['RECUPERANDO', 'Aguardando margem no buffer.'],
      STOPPED: ['PAUSADO', 'Toque em PLAY / STOP para ouvir.'],
      DISCONNECTED: ['CONEXÃO PERDIDA', 'Procurando novamente.'],
      BACKPRESSURE: ['AGUARDANDO ENVIO', 'Conexão mantida; aguardando espaço.'],
      CAPTURE_DELAY: ['ATRASO LOCAL', 'Restabelecendo o fluxo PCM.'],
      NEEDS_PLAY: ['ATIVE O ÁUDIO', 'Toque em PLAY / STOP.'],
      ERROR: ['STREAM INDISPONÍVEL', network.error || 'Confira a conexão.'],
    };
    const context = contexts[network.status];
    if (context) [title, detail] = context;
    if (network.signalingError && !['PLAYING', 'CONNECTED'].includes(network.status)) {
      title = 'SEM SINALIZAÇÃO'; detail = network.error || 'Confira a rede ou o servidor.';
    }
  }
  const settings = receiving && network.format ? {
    sampleRate: network.format.sampleRate, sampleSize: network.format.sampleSize, channelCount: network.format.channels,
  } : capture.settings;
  const channel = settings.channelCount === 1 ? 'MONO' : settings.channelCount ? `${settings.channelCount} CH` : '--';
  const format = `${settings.sampleRate ? `${settings.sampleRate / 1000} kHz` : '-- kHz'} / ${settings.sampleSize || '--'} BIT`;
  return <section aria-label="Display STREAM" data-theme={theme.id} data-state={network.role ? 'network' : mode} className="stream-terminal"
    style={{ left: `${geometry.x / baseWidth * 100}%`, top: `${geometry.y / baseHeight * 100}%`,
      width: `${geometry.width / baseWidth * 100}%`, height: `${geometry.height / baseHeight * 100}%`,
      '--stream-phosphor': theme.color }}>
    {showMain && <StreamIndicators capture={capture} network={network} recording={recording} />}
    {showMain && <div className="stream-terminal-content">
      <header className="stream-terminal-header">
        <h1>{process.env.NODE_ENV === 'development' && network.role ? <StreamDiagnostic color={theme.color} /> : 'RETRO STREAM'}</h1>
        <button type="button" className="stream-terminal-theme" onClick={cycleTheme}
          aria-label={`Alterar cor do display: ${theme.name}`} title={`Cor: ${theme.name}`}>
          COLOR</button>
      </header>
      <div className="stream-terminal-rule" />
      <div className="stream-terminal-context" aria-live="polite" aria-atomic="true">
        <h2>{title}</h2>
        <p className="stream-terminal-detail">{detail}</p>
        {(mode === 'capture' || (receiving && network.format)) && <p className="stream-terminal-technical">
          <span>{channel}</span><span aria-hidden="true"> · </span><span>{capture.kind==='voice'||network.sourceKind==='voice'?'VOZ WEBRTC':format}</span>
        </p>}
      </div>
      {!issue && <footer className="stream-terminal-footer">
        {openPlayer && <button type="button" onClick={openPlayer}>PLAYER LOCAL</button>}
        {ready && network.role === 'send' && <StreamNightMode />}
        {receiving && network.format && network.sourceKind!=='voice' ? <p className="stream-terminal-detail">BUFFER {Number(network.seconds || 0).toFixed(1)} s</p> : null}
        {ready && capture.kind==='voice' && <button className="stream-voice-toggle" aria-pressed={!capture.muted} onClick={capture.toggleMute}>{capture.muted?'ATIVAR MICROFONE':'SILENCIAR MICROFONE'}</button>}
        {ready && capture.kind!=='player' && capture.kind!=='voice' ? <div className="stream-terminal-bar-row">
          <span>SIGNAL</span><span className="stream-terminal-segments" role="meter" aria-label="SIGNAL"
            aria-valuemin={0} aria-valuemax={12} aria-valuenow={capture.signal}>
            {Array.from({ length: 12 }, (_, i) => <i key={i} data-lit={i < capture.signal} />)}
          </span>
        </div> : <p className="stream-terminal-idle-note">
          <span className="stream-terminal-cursor" aria-hidden="true" /> {receiving ? 'PCM · REDE' : 'CAPTURA LOCAL'}
        </p>}
      {network.share && <div className="stream-session"><button type="button" onClick={network.showShare}>SESSÃO PRIVADA</button></div>}

      {recording.status==='recording' && <span className="stream-rec-status">REC ATIVO</span>}
      {recording.status==='finalizing' && <span role="status">FINALIZANDO WAV</span>}
      {recording.status==='error' && <span role="status">{recording.message}</span>}
      {recordingNotice && recording.status==='available' && <span role="status">WAV PRESERVADO</span>}
      {recording.file && <button type="button" onClick={()=>setRecordingOpen(true)}>EXPORTAR WAV</button>}
      </footer>}
    </div>}
    {playlist && <PlaylistPanel playlist={playlist} />}
    {!playlist && network.dialog && <StreamSession network={network} />}
    {showRecording && <StreamRecording recording={recording} color={theme.color} onClose={()=>setRecordingOpen(false)} panelOnly />}
  </section>;
}
