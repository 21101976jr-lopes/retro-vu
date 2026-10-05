import { useCallback, useEffect, useRef, useState } from 'react';

const IDLE = { status: 'STANDBY', message: 'AWAITING COMMAND', settings: {}, input: '--', signal: 0, monitor: false };
const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());
function dispose(session) {
  if (!session || session.disposed) return;
  session.disposed = true;
  cancelAnimationFrame(session.frame);
  session.removeEnded?.();
  stopTracks(session.probe);
  stopTracks(session.stream);
  session.source?.disconnect();
  session.monitorConnected = false;
  session.analyser?.disconnect();
  if (session.ctx && session.ctx.state !== 'closed') session.ctx.close().catch(() => {});
}

// Estratégia validada no AudioDiagnostic: deviceId exato, tratamentos de voz
// desligados, getSettings e AnalyserNode. Não solicita estéreo.
export default function useStreamInput(enabled) {
  const [state, setState] = useState(IDLE);
  const sessionRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const release = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    dispose(session);
  }, []);
  const stop = useCallback(() => { release(); setState(IDLE); }, [release]);
  useEffect(() => {
    if (!enabled) stop();
    return release;
  }, [enabled, release, stop]);

  async function toggleMonitor() {
    const session = sessionRef.current;
    if (!enabledRef.current || !session?.ready) {
      setState(previous => ({ ...previous, message: 'USB AUDIO NOT READY' }));
      return;
    }
    // Um único source: análise permanente e saída independente, sem ganho extra.
    session.monitorWanted = !session.monitorWanted;
    const wanted = session.monitorWanted;
    const revision = session.monitorRevision = (session.monitorRevision || 0) + 1;
    const current = () => enabledRef.current && sessionRef.current === session &&
      session.monitorRevision === revision;
    try {
      if (wanted) {
        // Invocado no handler do clique, antes de qualquer await, inclusive se running.
        await session.ctx.resume();
      }
      if (!current()) return;
      if (wanted) {
        if (session.ctx.state !== 'running') throw new Error('AUDIO CONTEXT SUSPENDED');
        if (!session.monitorConnected) session.source.connect(session.ctx.destination);
      } else if (session.monitorConnected) {
        session.source.disconnect(session.ctx.destination);
      }
      session.monitorConnected = wanted;
      setState(previous => ({ ...previous, monitor: wanted, message: wanted ? 'MONITOR ON' : 'MONITOR OFF' }));
    } catch {
      if (!current()) return;
      session.monitorWanted = !!session.monitorConnected;
      setState(previous => ({ ...previous, monitor: !!session.monitorConnected, message: 'MONITOR AUDIO ERROR' }));
    }
  }

  function toggleCapture() {
    if (sessionRef.current) stop();
    else start();
  }

  async function start() {
    if (!enabledRef.current || sessionRef.current) return;
    const session = { frame: 0 };
    sessionRef.current = session;
    const current = () => enabledRef.current && sessionRef.current === session;
    setState({ ...IDLE, status: 'OPENING', message: 'OPENING USB AUDIO' });
    try {
      const media = navigator.mediaDevices;
      if (!window.isSecureContext || !media?.getUserMedia || !media?.enumerateDevices)
        throw new Error('SECURE CONTEXT REQUIRED');
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('WEB AUDIO UNAVAILABLE');
      session.ctx = new Context();
      await session.ctx.resume();
      if (!current()) return;
      let devices = await media.enumerateDevices();
      if (!current()) return;
      const voice = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      if (!devices.some(device => device.kind === 'audioinput' && device.label)) {
        const probe = await media.getUserMedia({ video: false, audio: voice });
        if (!current()) { stopTracks(probe); return; }
        session.probe = probe;
        try { devices = await media.enumerateDevices(); }
        finally { stopTracks(probe); session.probe = null; }
        if (!current()) return;
      }
      const inputs = devices.filter(device => device.kind === 'audioinput' && device.deviceId);
      const usb = inputs.find(device => /^usb audio$/i.test(device.label.trim())) ||
        inputs.find(device => /usb[ _-]*audio|numark|ttusb/i.test(device.label));
      if (!usb) throw new Error('USB AUDIO NOT FOUND');
      // Não pedir channelCount: preserva a captura entregue, sem forçar downmix.
      const stream = await media.getUserMedia({ video: false, audio: {
        deviceId: { exact: usb.deviceId }, sampleRate: { ideal: 48000 }, ...voice,
      } });
      if (!current()) { stopTracks(stream); return; }
      session.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState === 'ended') throw new Error('USB AUDIO DISCONNECTED');
      const settings = track.getSettings?.() || {};
      if (settings.deviceId && settings.deviceId !== usb.deviceId) throw new Error('USB INPUT MISMATCH');
      if (['echoCancellation', 'noiseSuppression', 'autoGainControl'].some(key => settings[key] === true))
        throw new Error('VOICE PROCESSING ACTIVE');
      if (session.ctx.state !== 'running') throw new Error('AUDIO CONTEXT SUSPENDED');
      // Fonte central única. SIGNAL e MONITOR são ramificações independentes.
      // REC/rede poderão conectar seus próprios consumidores a esta sessão,
      // sem reabrir getUserMedia. A sessão possui e libera todos os recursos.
      session.source = session.ctx.createMediaStreamSource(stream);
      session.analyser = session.ctx.createAnalyser();
      session.analyser.fftSize = 2048;
      session.analyser.smoothingTimeConstant = 0;
      session.source.connect(session.analyser); // SIGNAL independe da rota MONITOR.
      const ended = () => {
        if (!current()) return;
        release();
        setState({ ...IDLE, status: 'ERROR', message: 'USB AUDIO DISCONNECTED' });
      };
      track.addEventListener('ended', ended);
      session.removeEnded = () => track.removeEventListener('ended', ended);
      const data = new Float32Array(session.analyser.fftSize);
      let smoothed = 0, lastUpdate = -Infinity;
      const tick = time => {
        if (!current()) return;
        if (time - lastUpdate >= 50) {
          lastUpdate = time;
          let peak = 0, sum = 0;
          session.analyser.getFloatTimeDomainData(data);
          for (const value of data) { peak = Math.max(peak, Math.abs(value)); sum += value * value; }
          const combined = 0.6 * peak + 0.4 * Math.sqrt(sum / data.length);
          const level = track.muted || session.ctx.state !== 'running' ? 0 :
            Math.max(0, Math.min(1, (20 * Math.log10(Math.max(combined, 0.00001)) + 55) / 55));
          smoothed += (level - smoothed) * (level > smoothed ? 0.55 : 0.25);
          setState(previous => ({ ...previous, signal: Math.round(smoothed * 12) }));
        }
        session.frame = requestAnimationFrame(tick);
      };
      session.settings = settings;
      session.ready = true;
      setState({ monitor: false, status: 'READY', message: 'USB AUDIO READY', settings, input: 'USB AUDIO', signal: 0 });
      session.frame = requestAnimationFrame(tick);
    } catch (error) {
      if (current()) {
        release();
        const message = ['NotAllowedError', 'SecurityError'].includes(error.name) ? 'AUDIO PERMISSION REQUIRED'
          : error.name === 'NotFoundError' ? 'USB AUDIO NOT FOUND'
          : error.name === 'OverconstrainedError' ? 'USB AUDIO UNAVAILABLE'
          : error.message || 'USB AUDIO ERROR';
        setState({ ...IDLE, status: 'ERROR', message });
      }
    } finally {
      if (!current()) dispose(session);
    }
  }
  return { ...state, session: sessionRef.current?.ready ? sessionRef.current : null, toggleCapture, stop, toggleMonitor };
}
