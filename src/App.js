import useDigitalTheme from './useDigitalTheme';
import {setPwaBusy} from './pwa';
import { openAudioFile } from './recording/filePicker';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import StreamDisplay from './StreamDisplay';
import useStreamInput from './useStreamInput';
import useStreamNetwork from './useStreamNetwork';
import useStreamRecorder from './useStreamRecorder';
import useLiveProgress from './useLiveProgress';

// ═══════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO — ajuste aqui para afinar posições
// ═══════════════════════════════════════════════════════════════════

const VU = {
  ASPECT              : 3072 / 2048,
  PIVOT_X_PCT         : 25.96,   // Illustrator: 281.363/1083.733
  PIVOT_Y_PCT         : 65.80,   // Illustrator: 475.391/722.489
  NEEDLE_H_PCT        : 48,
  NEEDLE_ASPECT       : 272 / 924,
  NEEDLE_PIV_X_IN_IMG : 50.64,   // Illustrator: 48.592/95.956
  NEEDLE_PIV_Y_IN_IMG : 91.63,   // Illustrator: 298.665/325.968
  MIN_ANGLE           : -38.82,  // Illustrator: arco −20 dB
  MAX_ANGLE           : 39.21,   // Illustrator: arco +3 dB
  TUBE_X              : [56.46, 59.62, 62.78, 65.94, 69.11, 72.27, 75.43, 78.59, 81.76, 84.92, 88.08, 91.24],
  TUBE_L_CENTER       : 29.06,   // Illustrator: 209.964/722.489
  TUBE_R_CENTER       : 58.06,   // Illustrator: 419.452/722.489
  TUBE_SIZE_PCT       : 14.88,   // Illustrator: 161.219/1083.733
  NUM_TUBES           : 12,
  VOLTAR_TOP          : 84.12,   // Illustrator: (633.589 - 51.659/2)/722.489
  VOLTAR_H            : 7.15,    // Illustrator: 51.659/722.489
  VOLTAR_LEFT         : 41.60,   // Illustrator: (541.69 - 181.665/2)/1083.733
  VOLTAR_W            : 16.76,   // Illustrator: 181.665/1083.733
};

const RADIO = {
  ASPECT        : 3070 / 2048,
  // FM needle — Illustrator: centros 304.593/759.193 × 210.333mm
  FM_LEFT_X     : 28.14,
  FM_RIGHT_X    : 70.13,
  FM_NEEDLE_Y   : 24.30,   // topo = centro(29.11%) - altura(9.62%)/2
  FM_NEEDLE_H   : 9.62,    // 69.502mm / 722.489mm
  // LEDs — todos calibrados no Illustrator
  LED_POWER_X   : 13.17,  LED_POWER_Y   : 14.02,
  LED_MIC_X     : 92.62,  LED_MIC_Y     : 19.03,
  LED_PLAYER_X  : 92.62,  LED_PLAYER_Y  : 29.18,
  LED_STATUS_X  : 13.82,  LED_STATUS_Y  : 87.47,
  LED_SMALL_W   : 2.18,
  LED_LARGE_W   : 4.10,
  // NOW PLAYING: 373.822×57.978mm, centro 542.511×392.013mm
  NP_LEFT       : 32.85,  NP_RIGHT      : 32.62,
  NP_TOP        : 50.25,  NP_BOT        : 41.73,
  // SENS display: 177.8×47.487mm, centro 915.504×408.854mm
  SD_LEFT       : 76.35,  SD_RIGHT      : 7.22,
  SD_TOP        : 53.30,  SD_BOT        : 40.12,
  // Botões +/− — círculos 60mm, centros 862.496/963.543 × 490.072mm
  BTN_PLUS_X    : 75.51,  BTN_PLUS_T    : 61.60,  BTN_PLUS_W  : 8.31,  BTN_PLUS_H  : 12.46,
  BTN_MINUS_X   : 84.85,  BTN_MINUS_T   : 61.60,  BTN_MINUS_W : 8.31,  BTN_MINUS_H : 12.46,
};

// STREAM: geometria DEFINITIVA, aprovada no Motorola. Não recalibrar.
const STREAM = {
  WIDTH: 3070, HEIGHT: 2048,
  DISPLAY: { x: 234, y: 280, width: 1812, height: 1440 }, // Centro (1140, 1000); sem overlay.
  BUTTON_X: 2600, BUTTON_W: 755, BUTTON_H: 240,
  BUTTONS: [
    ['TRANSMITIR', 300], ['RECEBER', 580], ['PLAY / STOP', 860],
    ['MONITOR', 1140], ['REC', 1420], ['VOLTAR', 1700],
  ],
};

const DAMPING = 0.12;

const STROBE_COLORS = [
  '#ffffff', '#ff2200', '#ff8800', '#ffff00',
  '#00ff44', '#00aaff', '#cc00ff', '#ff00bb',
];

// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const { theme: digitalTheme } = useDigitalTheme();

  const [screen,      setScreen]      = useState(() =>
    // TEMPORÁRIO PARA CALIBRAÇÃO: acesso direto só em desenvolvimento.
    process.env.NODE_ENV === 'development' &&
    new URLSearchParams(window.location.search).get('stream-calibration') === '1'
      ? 'stream' : 'radio');
  const [audioMode,   setAudioMode]   = useState('mic');
  const [isPowered,   setIsPowered]   = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [trackName,   setTrackName]   = useState('');
  const [progress,    setProgress]    = useState(0);
  const [sensitivity, setSensitivity] = useState(5);
  const [streamReady, setStreamReady] = useState(false);
  const streamInput = useStreamInput(true);
  const streamNetwork = useStreamNetwork(streamInput.session);
  const recording = useStreamRecorder(streamInput.session);
  const liveActive = ['OPENING', 'READY'].includes(streamInput.status);
  useEffect(()=>{setPwaBusy(liveActive || Boolean(streamNetwork.role) || isPlaying || isListening || ['starting','recording','finalizing'].includes(recording.status));},[liveActive,streamNetwork.role,isPlaying,isListening,recording.status]);
  const livePosition = useLiveProgress(liveActive);
  const streamAnalyser = streamInput.session?.analyser || streamNetwork.analyser;
  const streamAnalyserRef = useRef(null);
  streamAnalyserRef.current = streamAnalyser;
  const [vuReady,     setVuReady]     = useState(false);

  const [needleAngle, setNeedleAngle] = useState(VU.MIN_ANGLE);
  const [litTubesL,   setLitTubesL]   = useState(0);
  const [litTubesR,   setLitTubesR]   = useState(0);
  const [strobeColorIdx, setStrobeColorIdx] = useState(0);
  const [strobeLevel,    setStrobeLevel]    = useState(0);
  const [panelDims,   setPanelDims]   = useState({ w: 0, h: 0 });

  const audioCtxRef     = useRef(null);
  const analyserRef     = useRef(null);
  const micStreamRef    = useRef(null);
  const audioElRef      = useRef(null);
  const audioElSrcRef   = useRef(null);
  const animRef         = useRef(null);
  const currentAngleRef = useRef(VU.MIN_ANGLE);
  const sensitivityRef  = useRef(sensitivity);
  const fileInputRef    = useRef(null);
  const vuPanelRef      = useRef(null);
  const prevPeakRef     = useRef(0);
  const strobeLevelRef  = useRef(0);

  const streamImageRef = useRef(null);
  const streamLoadRef = useRef(null);
  const streamMountedRef = useRef(false);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  // Carrega e decodifica antes de permitir qualquer conteúdo STREAM na tela.
  const prepareStream = useCallback(() => {
    if (!streamLoadRef.current) {
      const image = new Image();
      streamImageRef.current = image; // Mantém a imagem decodificada referenciada.
      streamLoadRef.current = new Promise((resolve, reject) => {
        image.onload = async () => {
          try {
            if (typeof image.decode === 'function') await image.decode();
            resolve();
          } catch (error) { reject(error); }
        };
        image.onerror = () => reject(new Error('Não foi possível carregar stream.png.'));
        image.src = '/images/stream.png';
      }).catch(error => {
        streamLoadRef.current = null; // Permite nova tentativa no próximo clique.
        throw error;
      });
    }
    return streamLoadRef.current;
  }, []);

  useEffect(() => {
    streamMountedRef.current = true;
    let cancelled = false;
    prepareStream().then(() => {
      if (!cancelled) setStreamReady(true);
    }).catch(() => {}); // Em caso de erro, o rádio permanece visível.
    return () => { cancelled = true; streamMountedRef.current = false; };
  }, [prepareStream]);

  const openStream = () => {
    prepareStream().then(() => {
      if (!streamMountedRef.current || screenRef.current !== 'radio') return;
      setStreamReady(true);
      setScreen('stream');
    }).catch(() => {
      if (streamMountedRef.current && screenRef.current === 'radio')
        alert('Não foi possível abrir STREAM. Tente novamente.');
    });
  };

  useEffect(() => {
    const l = document.createElement('link');
    l.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap';
    l.rel = 'stylesheet';
    document.head.appendChild(l);
    // Pré-carrega imagens do VU para evitar flash
    ['panel-off.png','needle.png','tube-lit.png'].forEach(n => {
      const i = new Image(); i.src = `/images/${n}`;
    });
  }, []);

  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);

  useEffect(() => {
    const el = vuPanelRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      if (r.width > 0) setPanelDims({ w: r.width, h: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [screen]);

  useEffect(() => { if (screen !== 'vu') setVuReady(false); }, [screen]);

  // ─── Áudio ───────────────────────────────────────────────────────

  const ensureCtx = useCallback(() => {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    if (!analyserRef.current) {
      const an = audioCtxRef.current.createAnalyser();
      an.fftSize = 2048;              // mais amostras = RMS mais preciso
      an.smoothingTimeConstant = 0.3; // resposta rápida (Winamp-like)
      analyserRef.current = an;
    }
  }, []);

  const startAnim = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const tick = () => {
      const activeAnalyser = streamAnalyserRef.current || analyserRef.current;
      if (!activeAnalyser) { animRef.current = null; return; }
      // ── Domínio de tempo: pico + RMS (como Winamp) ──
      const timeBuf = new Uint8Array(activeAnalyser.fftSize);
      activeAnalyser.getByteTimeDomainData(timeBuf);

      let peak = 0, sumSq = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i] - 128) / 128; // -1 a +1
        const abs = Math.abs(v);
        if (abs > peak) peak = abs;          // pico: captura batidas e ataques
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / timeBuf.length);

      // 60% pico + 40% RMS → dinâmica estilo Winamp
      const combined = peak * 0.6 + rms * 0.4;

      // Sensibilidade logarítmica: sens=1 → 0.25x, sens=5 → 1x, sens=10 → 4x
      const gain = Math.pow(10, (sensitivityRef.current - 5) * 0.2);

      // Soft-clip suave: tanh garante que nunca "trava" no máximo
      const rawLevel = Math.tanh(combined * gain * 4);

      // VU needle com inércia
      const target = VU.MIN_ANGLE + rawLevel * (VU.MAX_ANGLE - VU.MIN_ANGLE);
      currentAngleRef.current += (target - currentAngleRef.current) * DAMPING;
      setNeedleAngle(currentAngleRef.current);

      // Válvulas L e R com leve variação independente
      setLitTubesL(Math.round(rawLevel * VU.NUM_TUBES));
      setLitTubesR(Math.round(Math.min(1, rawLevel * (0.8 + Math.random() * 0.4)) * VU.NUM_TUBES));

      // ── Strobe: onset detection + decay ultra-rápido ──
      // Detecta SUBIDA do pico (ataque de batida, guitarra, voz)
      const onset = Math.max(0, peak - prevPeakRef.current * 0.85);
      prevPeakRef.current = peak;
      // Ganho do strobe = 2.5x mais sensível que o VU
      const strobeGain = Math.pow(10, (sensitivityRef.current - 5) * 0.2) * 2.5;
      const strobeFlash = Math.tanh(onset * strobeGain * 10);
      // Decay muito rápido: cai 45% por frame → apaga entre as batidas
      strobeLevelRef.current = Math.max(strobeFlash, strobeLevelRef.current * 0.55);
      setStrobeLevel(strobeLevelRef.current);

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, []);

  const pauseAnim = useCallback(() => {
    // Para a animação sem animar o retorno do ponteiro (para troca de tela)
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    setLitTubesL(0); setLitTubesR(0);
  }, []);

  const stopAnim = useCallback(() => {
    // Para a animação E anima ponteiro voltando ao repouso (para stop/pause de áudio)
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    const ret = () => {
      currentAngleRef.current += (VU.MIN_ANGLE - currentAngleRef.current) * 0.1;
      const d = Math.abs(currentAngleRef.current - VU.MIN_ANGLE);
      setNeedleAngle(d > 0.3 ? currentAngleRef.current : VU.MIN_ANGLE);
      setLitTubesL(0); setLitTubesR(0);
      if (d > 0.3) requestAnimationFrame(ret);
      else currentAngleRef.current = VU.MIN_ANGLE;
    };
    requestAnimationFrame(ret);
  }, []);

  const startMic = useCallback(async () => {
    if (streamAnalyserRef.current) { startAnim(); return; }
    try {
      ensureCtx();
      // Desconecta analyser da saída para evitar eco do microfone
      try { analyserRef.current?.disconnect(audioCtxRef.current.destination); } catch {}
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      audioCtxRef.current.createMediaStreamSource(stream).connect(analyserRef.current);
      setIsListening(true); startAnim();
    } catch { alert('Microfone não acessível. Verifique permissões (requer HTTPS).'); }
  }, [ensureCtx, startAnim]);

  const stopMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    setIsListening(false); stopAnim();
  }, [stopAnim]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTrackName(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').trim());
    if (audioElRef.current) {
      audioElRef.current.pause();
      try { URL.revokeObjectURL(audioElRef.current.src); } catch {}
    }
    const audio = new Audio(URL.createObjectURL(file));
    audio.addEventListener('timeupdate', () => {
      if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
    });
    audio.addEventListener('ended', () => {
      setIsPlaying(false); setProgress(0); stopAnim(); setIsListening(false);
    });
    audioElRef.current = audio;
    audioElSrcRef.current = null;
    setIsPlaying(false); setProgress(0);
    setAudioMode('player');
    e.target.value = '';
  }, [stopAnim]);

  const handlePlay = useCallback(() => {
    if (!audioElRef.current) { alert('Carregue uma música primeiro (LOAD / ABRIR).'); return; }
    ensureCtx();
    if (!audioElSrcRef.current) {
      const src = audioCtxRef.current.createMediaElementSource(audioElRef.current);
      src.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
      audioElSrcRef.current = src;
    }
    audioElRef.current.play().catch(err => alert('Erro: ' + err.message));
    setIsPlaying(true); setIsListening(true);
    setAudioMode('player'); // ← garante modo PLAYER ao dar play
    startAnim();
  }, [ensureCtx, startAnim]);

  const handlePause = useCallback(() => {
    audioElRef.current?.pause();
    setIsPlaying(false); stopAnim(); setIsListening(false);
  }, [stopAnim]);

  const handleStop = useCallback(() => {
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.currentTime = 0; }
    setIsPlaying(false); setProgress(0); stopAnim(); setIsListening(false);
  }, [stopAnim]);

  // POWER – música NÃO para ao trocar de tela
  const handlePower = useCallback(() => {
    if (streamAnalyserRef.current) {
      if (isPowered) pauseAnim(); else startAnim();
      setIsPowered(!isPowered); setScreen(isPowered ? 'radio' : 'vu');
      return;
    }
    if (isPowered) {
      // Voltando para o rádio
      if (audioMode === 'mic') {
        stopMic();
      } else {
        pauseAnim(); // só pausa animação, música continua tocando
      }
      setIsPowered(false); setScreen('radio');
    } else {
      // Indo para o VU
      setIsPowered(true); setScreen('vu');
      if (audioMode === 'mic') {
        startMic();
      } else if (audioElRef.current) {
        if (isPlaying) {
          startAnim(); // música já tocando, só reinicia animação
        } else {
          handlePlay();
        }
      }
    }
  }, [isPowered, audioMode, isPlaying, startMic, stopMic, startAnim, pauseAnim, handlePlay]);

  useEffect(() => () => { stopMic(); stopAnim(); }, [stopMic, stopAnim]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (streamAnalyser && (screen === 'vu' || screen === 'strobe')) startAnim();
    return () => { if (streamAnalyser) pauseAnim(); };
  }, [streamAnalyser, screen, startAnim, pauseAnim]);

  // ─── Layout VU ───────────────────────────────────────────────────
  const { w: PW, h: PH } = panelDims;
  const needleH  = PH * VU.NEEDLE_H_PCT / 100;
  const needleW  = needleH * VU.NEEDLE_ASPECT;
  const pivotX   = PW * VU.PIVOT_X_PCT / 100;
  const pivotY   = PH * VU.PIVOT_Y_PCT / 100;
  // Posição top/left para alinhar o pivô interno da espada ao pivô do painel
  const needleLeft = pivotX - needleW * VU.NEEDLE_PIV_X_IN_IMG / 100;
  const needleTop  = pivotY - needleH * VU.NEEDLE_PIV_Y_IN_IMG / 100;
  const tubeSize = PW * VU.TUBE_SIZE_PCT / 100;
  const tubeLTop = PH * VU.TUBE_L_CENTER / 100 - tubeSize / 2;
  const tubeRTop = PH * VU.TUBE_R_CENTER / 100 - tubeSize / 2;

  // ─── LED ─────────────────────────────────────────────────────────
  const Led = ({ xPct, yPct, wPct, on }) => (
    <img src="/images/led-on.png" alt="" draggable={false} style={{
      position: 'absolute',
      left: `${xPct}%`, top: `${yPct}%`,
      width: `${wPct}%`, height: 'auto',
      transform: 'translate(-50%,-50%)',
      opacity: on ? 1 : 0,
      transition: 'opacity 0.15s',
      pointerEvents: 'none',
    }} />
  );

  const panelStyle = (asp) => ({
    position: 'relative',
    width: `min(100vw, calc(100vh * ${asp}))`,
    maxWidth: 1400,
    aspectRatio: `${asp}`,
    overflow: 'hidden',
  });

  // ═══════════════════════════════════════════════════════════════════
  // TELA 1 – RADIO
  // ═══════════════════════════════════════════════════════════════════
  if (screen === 'stream' && streamReady) {
    return (
      <div style={S.root}>
        <div style={panelStyle(STREAM.WIDTH / STREAM.HEIGHT)}>
          <img src="/images/stream.png" alt="STREAM" style={S.bg} draggable={false} />
          <StreamDisplay recording={recording} network={streamNetwork} capture={streamInput} geometry={STREAM.DISPLAY} baseWidth={STREAM.WIDTH} baseHeight={STREAM.HEIGHT} />
          {/* Hotspots definitivos. VOLTAR apenas navega; as sessões de áudio são globais. */}
          {STREAM.BUTTONS.map(([label, centerY]) => (
            <button key={label} type="button" aria-label={label}
              aria-pressed={label === 'TRANSMITIR' ? ['OPENING', 'READY'].includes(streamInput.status)
                : label === 'REC' ? recording.status === 'recording'
                : label === 'MONITOR' ? streamInput.monitor
                : label === 'RECEBER' ? streamNetwork.role === 'receive'
                : label === 'PLAY / STOP' && streamNetwork.role === 'receive' ? streamNetwork.playing : undefined}
              onClick={label === 'VOLTAR' ? () => { if ((!recording.file && recording.status !== 'finalizing') || window.confirm('A gravação permanece no aplicativo. A exportação pode estar pendente; volte ao STREAM para ouvir ou salvar WAV. Sair do display?')) setScreen('radio'); }
                : label === 'TRANSMITIR' ? () => { const toggle = async () => { const pending = recording.stop(); if (pending) await pending; streamNetwork.stop(); streamInput.toggleCapture(); }; if (liveActive) toggle(); else streamNetwork.requestTransmit(toggle); }
                : label === 'RECEBER' ? async () => { const pending = recording.stop(); if (pending) await pending; streamInput.stop(); if (streamNetwork.role === 'send') streamNetwork.stop(); streamNetwork.toggleReceive(); }
                : label === 'PLAY / STOP' ? streamNetwork.togglePlay
                : label === 'MONITOR' ? streamInput.toggleMonitor
                : label === 'REC' ? recording.toggle : undefined}
              style={{ ...S.hs, background: 'transparent', border: 0, padding: 0,
                left: `${(STREAM.BUTTON_X - STREAM.BUTTON_W / 2) / STREAM.WIDTH * 100}%`,
                top: `${(centerY - STREAM.BUTTON_H / 2) / STREAM.HEIGHT * 100}%`,
                width: `${STREAM.BUTTON_W / STREAM.WIDTH * 100}%`,
                height: `${STREAM.BUTTON_H / STREAM.HEIGHT * 100}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (screen === 'radio' || (screen === 'stream' && !streamReady)) {
    const fmX = RADIO.FM_LEFT_X + (liveActive ? livePosition : progress) * (RADIO.FM_RIGHT_X - RADIO.FM_LEFT_X);

    return (
      <div style={S.root} className="screen-fade">
        <div style={panelStyle(RADIO.ASPECT)}>

          <img src="/images/radio-panel.png" alt="Radio" style={S.bg} draggable={false} />

          {/* Agulha FM */}
          <img src="/images/fm-needle.png" alt="" draggable={false} style={{
            position: 'absolute',
            left: `${fmX}%`, top: `${RADIO.FM_NEEDLE_Y}%`,
            height: `${RADIO.FM_NEEDLE_H}%`, width: 'auto',
            transform: 'translateX(-50%)',
            transition: liveActive ? 'none' : 'left 0.4s linear',
            pointerEvents: 'none',
          }} />

          {/* LEDs — POWER sempre aceso */}
          <Led xPct={RADIO.LED_POWER_X}  yPct={RADIO.LED_POWER_Y}  wPct={RADIO.LED_SMALL_W} on={true} />
          <Led xPct={RADIO.LED_MIC_X}    yPct={RADIO.LED_MIC_Y}    wPct={RADIO.LED_SMALL_W} on={audioMode === 'mic'} />
          <Led xPct={RADIO.LED_PLAYER_X} yPct={RADIO.LED_PLAYER_Y} wPct={RADIO.LED_SMALL_W} on={audioMode === 'player'} />
          <Led xPct={RADIO.LED_STATUS_X} yPct={RADIO.LED_STATUS_Y} wPct={RADIO.LED_LARGE_W} on={isListening} />

          {/* Display NOW PLAYING */}
          <div style={{
            position: 'absolute',
            left: `${RADIO.NP_LEFT}%`,   top: `${RADIO.NP_TOP}%`,
            right: `${RADIO.NP_RIGHT}%`, bottom: `${RADIO.NP_BOT}%`,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', pointerEvents: 'none',
            padding: '0 2%', gap: '1px',
          }}>
            {trackName ? (
              <>
                <span style={{
                  color: digitalTheme.color, fontFamily: "'Oswald',sans-serif",
                  fontWeight: 400, fontSize: 'clamp(6px,.8vw,10px)',
                  opacity: 0.55, letterSpacing: 3, lineHeight: 1,
                }}>NOW PLAYING</span>
                <span style={{
                  color: digitalTheme.color, fontFamily: "'Oswald',sans-serif",
                  fontWeight: 700, fontSize: 'clamp(10px,1.4vw,18px)',
                  textShadow: `0 0 14px ${digitalTheme.color}`,
                  whiteSpace: 'normal', wordBreak: 'break-word',
                  textAlign: 'center', lineHeight: 1.2,
                  maxWidth: '100%', overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>{trackName}</span>
              </>
            ) : (
              <span style={{
                color: digitalTheme.color, fontFamily: "'Oswald',sans-serif",
                fontWeight: 400, fontSize: 'clamp(10px,1.4vw,18px)',
                opacity: 0.25, letterSpacing: 3,
              }}>LOAD / ABRIR</span>
            )}
          </div>

          {/* Display digital de sensibilidade — Illustrator */}
          <div style={{
            position: 'absolute',
            left: `${RADIO.SD_LEFT}%`,   top: `${RADIO.SD_TOP}%`,
            right: `${RADIO.SD_RIGHT}%`, bottom: `${RADIO.SD_BOT}%`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <span style={{
              color: digitalTheme.color,
              fontFamily: "'Oswald',monospace",
              fontWeight: 700,
              fontSize: 'clamp(16px,2.5vw,34px)',
              textShadow: `0 0 12px ${digitalTheme.color}, 0 0 24px ${digitalTheme.color}`,
              letterSpacing: 2,
            }}>{sensitivity}</span>
          </div>

          {/* ── HOTSPOTS ──────────────────────────────────────────── */}

          {/* STREAM — arte-base 3070 × 2048; centro (2330, 1795), tamanho 780 × 225. */}
          <button type="button" aria-label="STREAM" onClick={openStream}
            style={{ ...S.hs, background: 'transparent', border: 0, padding: 0,
              left: `${(2330 - 780 / 2) / 3070 * 100}%`,
              top: `${(1795 - 225 / 2) / 2048 * 100}%`,
              width: `${780 / 3070 * 100}%`, height: `${225 / 2048 * 100}%` }} />

          {/* POWER */}
          <div onClick={handlePower}
               style={{ ...S.hs, left: '3%', top: '7%', width: '17%', height: '28%' }} />

          {/* MIC */}
          <div onClick={() => { setAudioMode('mic'); if (isPlaying) handlePause(); }}
               style={{ ...S.hs, right: '14%', top: '5%', width: '14%', height: '19%' }} />

          {/* PLAYER */}
          <div onClick={() => setAudioMode('player')}
               style={{ ...S.hs, right: '14%', top: '24%', width: '14%', height: '18%' }} />

          {/* LOAD */}
          <div onClick={() => openAudioFile(fileInputRef.current, handleFileChange)}
               style={{ ...S.hs, left: '3%', top: '43%', width: '20%', height: '26%' }} />

          {/* STOP */}
          <div onClick={handleStop}
               style={{ ...S.hs, left: '31%', top: '61%', width: '11%', height: '19%' }} />

          {/* PLAY */}
          <div onClick={handlePlay}
               style={{ ...S.hs, left: '42%', top: '61%', width: '16%', height: '19%' }} />

          {/* PAUSE */}
          <div onClick={handlePause}
               style={{ ...S.hs, left: '57%', top: '61%', width: '11%', height: '19%' }} />

          {/* SENSIBILIDADE + — Illustrator: centro 862.496×490.072mm */}
          <div onClick={() => setSensitivity(s => Math.min(10, s + 1))}
               style={{ ...S.hs, left: `${RADIO.BTN_PLUS_X}%`, top: `${RADIO.BTN_PLUS_T}%`, width: `${RADIO.BTN_PLUS_W}%`, height: `${RADIO.BTN_PLUS_H}%` }} />

          {/* SENSIBILIDADE − — Illustrator: centro 963.543×490.072mm */}
          <div onClick={() => setSensitivity(s => Math.max(1, s - 1))}
               style={{ ...S.hs, left: `${RADIO.BTN_MINUS_X}%`, top: `${RADIO.BTN_MINUS_T}%`, width: `${RADIO.BTN_MINUS_W}%`, height: `${RADIO.BTN_MINUS_H}%` }} />

          {/* Scroll no knob (só cobre o knob, não os botões abaixo) */}
          <div onWheel={(e) => {
                 e.preventDefault();
                 setSensitivity(s => Math.max(1, Math.min(10, s + (e.deltaY < 0 ? 1 : -1))));
               }}
               style={{ ...S.hs, right: '2%', top: '43%', width: '16%', height: '15%', cursor: 'ns-resize' }}
          />

          <input ref={fileInputRef} type="file" accept="audio/*"
                 style={{ display: 'none' }} onChange={handleFileChange} />
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TELA 3 – STROBE
  // ═══════════════════════════════════════════════════════════════════
  if (screen === 'strobe') {
    const col = STROBE_COLORS[strobeColorIdx];
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }} className="screen-fade">

        {/* Flash colorido — opacidade = nível de áudio */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundColor: col,
          opacity: strobeLevel,
          // Sem transition = resposta instantânea (efeito strobe real)
        }} />

        {/* Botão mudar cor — canto inferior direito */}
        <div
          onClick={() => setStrobeColorIdx(i => (i + 1) % STROBE_COLORS.length)}
          style={{
            position: 'absolute', bottom: '6%', right: '5%',
            width: 'clamp(44px,7vw,70px)', aspectRatio: '1',
            borderRadius: '50%',
            backgroundColor: col,
            border: '3px solid rgba(255,255,255,0.5)',
            cursor: 'pointer',
            boxShadow: `0 0 20px ${col}, 0 0 40px ${col}66`,
            zIndex: 10,
          }}
        />

        {/* Label da cor atual */}
        <div style={{
          position: 'absolute', bottom: '6%', right: 'calc(5% + clamp(50px,8vw,80px))',
          color: col, fontFamily: "'Oswald',sans-serif",
          fontWeight: 600, fontSize: 'clamp(10px,1.4vw,18px)',
          textShadow: `0 0 10px ${col}`,
          display: 'flex', alignItems: 'center',
          opacity: 0.85, letterSpacing: 2,
          zIndex: 10,
        }}>COR</div>

        {/* Botão voltar ao VU — canto inferior esquerdo */}
        <div
          onClick={() => setScreen('vu')}
          style={{
            position: 'absolute', bottom: '6%', left: '5%',
            color: 'rgba(255,255,255,0.7)', fontFamily: "'Oswald',sans-serif",
            fontWeight: 700, fontSize: 'clamp(12px,1.6vw,20px)',
            cursor: 'pointer', letterSpacing: 3,
            textShadow: '0 0 10px rgba(255,255,255,0.5)',
            zIndex: 10,
          }}
        >◀ VU</div>

      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TELA 2 – VU METER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div style={S.root}>
      <div ref={vuPanelRef} style={panelStyle(VU.ASPECT)}>

        <img src="/images/panel-off.png" alt="VU" style={S.bg} draggable={false}
             onLoad={() => setVuReady(true)} />

        <div style={{ opacity: vuReady ? 1 : 0, transition: 'opacity 0.25s' }}>

          {/* Ponteiro */}
          {PW > 0 && (
            <img src="/images/needle.png" alt="" draggable={false} style={{
              position: 'absolute',
              left: needleLeft,
              top: needleTop,
              width: needleW, height: needleH,
              transformOrigin: `${VU.NEEDLE_PIV_X_IN_IMG}% ${VU.NEEDLE_PIV_Y_IN_IMG}%`,
              transform: `rotate(${needleAngle}deg)`,
              filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.85))',
              pointerEvents: 'none', willChange: 'transform',
            }} />
          )}

          {/* Válvulas */}
          {PW > 0 && VU.TUBE_X.map((xPct, i) => {
            const left = PW * xPct / 100 - tubeSize / 2;
            return (
              <React.Fragment key={i}>
                <img src="/images/tube-lit.png" alt="" draggable={false} style={{
                  position: 'absolute', left, top: tubeLTop,
                  width: tubeSize, height: tubeSize,
                  opacity: i < litTubesL ? 1 : 0,
                  transition: 'opacity 0.04s', pointerEvents: 'none',
                }} />
                <img src="/images/tube-lit.png" alt="" draggable={false} style={{
                  position: 'absolute', left, top: tubeRTop,
                  width: tubeSize, height: tubeSize,
                  opacity: i < litTubesR ? 1 : 0,
                  transition: 'opacity 0.04s', pointerEvents: 'none',
                }} />
              </React.Fragment>
            );
          })}



          {/* Visor central — modo e sensibilidade (onde era VOLTAR) */}
          <div style={{
            position: 'absolute',
            top: `${VU.VOLTAR_TOP}%`,
            left: `${VU.VOLTAR_LEFT}%`,
            width: `${VU.VOLTAR_W}%`,
            height: `${VU.VOLTAR_H}%`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', pointerEvents: 'none',
          }}>
            <span style={{
              color: digitalTheme.color, fontFamily: "'Oswald',sans-serif",
              fontWeight: 600, fontSize: 'clamp(9px,1.2vw,16px)',
              letterSpacing: 2, textShadow: `0 0 8px ${digitalTheme.color}`,
            }}>
              {audioMode === 'mic' ? '🎙 MIC' : '♪ PLAYER'}
            </span>
            <span style={{
              color: digitalTheme.color, fontFamily: "'Oswald',sans-serif",
              fontWeight: 400, fontSize: 'clamp(8px,1vw,13px)',
              opacity: 0.7, letterSpacing: 1,
            }}>
              SENS {sensitivity}
            </span>
          </div>

          {/* Hotspot VOLTAR — canto inferior esquerdo (usuário adiciona imagem do botão) */}
          <div
            onClick={() => { setIsPowered(false); setScreen('radio'); if(audioMode==='mic') stopMic(); else pauseAnim(); }}
            style={{
              position: 'absolute',
              left: '1%',
              top: `${VU.VOLTAR_TOP}%`,
              width: '20%',
              height: `${VU.VOLTAR_H}%`,
              cursor: 'pointer',
            }}
          />

          {/* Botão STROBE — posição calibrada no Illustrator (imagem física no painel) */}
          <div
            onClick={() => setScreen('strobe')}
            style={{
              position: 'absolute',
              left: '73.75%', top: '85.38%',
              width: '13.30%', height: '4.83%',
              cursor: 'pointer',
            }}
          />

        </div>
      </div>
    </div>
  );
}

const S = {
  root: {
    width: '100vw', height: '100vh', background: '#080808',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  bg: {
    width: '100%', height: '100%', display: 'block',
    userSelect: 'none', pointerEvents: 'none', objectFit: 'fill',
  },
  hs: {
    position: 'absolute', cursor: 'pointer',
    // background: 'rgba(255,80,0,0.2)', // ← debug
    // border: '1px solid #ff5000',
  },
};
