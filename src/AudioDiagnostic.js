import React, { useCallback, useEffect, useRef, useState } from 'react';

const FIELDS = ['deviceId', 'channelCount', 'sampleRate', 'sampleSize',
  'echoCancellation', 'noiseSuppression', 'autoGainControl'];
const EMPTY_LEVELS = [{ rms: 0, peak: 0 }, { rms: 0, peak: 0 }];
const show = value => value === undefined ? 'Não informado pelo navegador' : JSON.stringify(value);
const db = value => value > 0 ? `${(20 * Math.log10(value)).toFixed(1)} dBFS` : '−∞ dBFS';
const jsonStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13 };
const controlStyle = { padding: 12, fontSize: 16, margin: '6px 6px 6px 0' };

function closeResources(resources) {
  if (!resources) return;
  clearTimeout(resources.finishTimer);
  cancelAnimationFrame(resources.frame);
  resources.stream?.getTracks().forEach(track => track.stop());
  resources.nodes?.forEach(node => { try { node.disconnect(); } catch {} });
  if (resources.ctx && resources.ctx.state !== 'closed') resources.ctx.close().catch(() => {});
}


// MediaRecorder recebe o stream original: sem Web Audio ou conversão de canais.
function MonoContentTest({ media, available, selected, disabled, onBusyChange }) {
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('Grave 30 a 60 segundos e pressione PARAR.');
  const [clip, setClip] = useState(null);
  const sessionRef = useRef(null);
  const urlRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session?.recorder?.state === 'recording') session.recorder.stop();
    session?.stream?.getTracks().forEach(track => track.stop());
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  function stopRecording() {
    const session = sessionRef.current;
    if (!session) return;
    if (!session.recorder) {
      sessionRef.current = null;
      setPhase('idle');
      onBusyChange(false);
      setMessage('Solicitação cancelada.');
      return;
    }
    if (session.recorder.state !== 'inactive') {
      session.endedAt = performance.now();
      setPhase('stopping');
      session.recorder.stop();
      session.stream.getTracks().forEach(track => track.stop());
    }
  }

  async function record() {
    if (sessionRef.current) return;
    const session = { stream: null, recorder: null, chunks: [] };
    sessionRef.current = session;
    const current = () => sessionRef.current === session;
    setPhase('pending');
    onBusyChange(true);
    setMessage('Aguardando captura da entrada selecionada…');
    playerRef.current?.pause();
    try {
      if (!window.MediaRecorder) throw new Error('MediaRecorder não disponível neste navegador.');
      // Não pedir channelCount: forçar mono poderia provocar downmix no navegador.
      const requested = { video: false, audio: { deviceId: { exact: selected },
        echoCancellation: { exact: false }, noiseSuppression: { exact: false },
        autoGainControl: { exact: false } } };
      const stream = await media.getUserMedia(requested);
      session.stream = stream;
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return; }
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('Nenhuma trilha de áudio recebida.');
      const settings = track.getSettings?.() || {};
      if (['echoCancellation', 'noiseSuppression', 'autoGainControl'].some(key => settings[key] === true)) {
        throw new Error('O navegador manteve processamento de voz ativo; gravação cancelada.');
      }
      const recorder = new window.MediaRecorder(stream);
      session.recorder = recorder;
      recorder.ondataavailable = event => {
        if (current() && event.data.size > 0) session.chunks.push(event.data);
      };
      recorder.onerror = event => {
        if (!current()) return;
        session.error = `${event.error?.name || 'Erro'}: ${event.error?.message || 'Falha no MediaRecorder'}`;
        setMessage(session.error);
        stopRecording();
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(item => item.stop());
        if (!current()) return;
        sessionRef.current = null;
        setPhase('idle');
        onBusyChange(false);
        if (session.error || !session.chunks.length) {
          setMessage(session.error || 'Nenhum áudio foi recebido para criar a gravação.');
          return;
        }
        const blob = new Blob(session.chunks, { type: recorder.mimeType || session.chunks[0].type });
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        setClip({ url: urlRef.current, label: track.label, settings, requested,
          mimeType: blob.type, duration: ((session.endedAt ?? performance.now()) - session.startedAt) / 1000 });
        setMessage('Gravação concluída. Use o player abaixo para ouvir.');
      };
      track.addEventListener('ended', () => { if (current()) stopRecording(); });
      session.startedAt = performance.now();
      recorder.start(); // Sem limite de tempo; PARAR encerra a gravação.
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
      setClip(null);
      setPhase('recording');
      setMessage('Gravando a entrada selecionada. Pressione PARAR quando terminar.');
    } catch (err) {
      session.stream?.getTracks().forEach(track => track.stop());
      if (!current()) return;
      sessionRef.current = null;
      setPhase('idle');
      onBusyChange(false);
      setMessage(`${err.name || 'Erro'}: ${err.message}${err.constraint ? ` — constraint: ${err.constraint}` : ''}`);
    }
  }

  return <section aria-label="TESTE DE CONTEÚDO MONO" style={{ marginTop: 24, borderTop: '1px solid #777', paddingTop: 16 }}>
    <h2 style={{ fontSize: 20 }}>TESTE DE CONTEÚDO MONO</h2>
    <p>Gravação temporária direta da entrada selecionada, sem somar, duplicar ou converter canais no código.
      O formato e a codificação são escolhidos pelo MediaRecorder do navegador.</p>
    <button style={controlStyle} disabled={!available || !selected || disabled || phase !== 'idle'} onClick={record}>GRAVAR TESTE</button>
    <button style={controlStyle} disabled={phase !== 'pending' && phase !== 'recording'} onClick={stopRecording}>PARAR</button>
    <p aria-live="polite">{message}</p>
    {clip && <>
      <audio ref={playerRef} aria-label="Gravação do teste mono" controls src={clip.url} style={{ width: '100%' }} />
      <p>Entrada gravada: {clip.label || '(label não informado)'}</p>
      {['channelCount', 'sampleRate', 'sampleSize', 'echoCancellation', 'noiseSuppression', 'autoGainControl'].map(key =>
        <div key={key}><strong>{key}:</strong> {show(clip.settings[key])}</div>)}
      <p>Duração da gravação (aproximada): {clip.duration.toFixed(1)} s • Formato: {clip.mimeType}</p>
      {clip.settings.channelCount !== 1 && <p>Mono não confirmado: veja o channelCount recebido. Nenhuma conversão para mono foi feita.</p>}
      <p>Valores acima descrevem a captura. Campo não informado não confirma que o navegador desativou o processamento.
        O áudio fica apenas na memória desta página e é descartado ao sair ou gravar novamente.</p>
    </>}
  </section>;
}

// Temporário: independente do App e sem conexão com AudioContext.destination.
export default function AudioDiagnostic() {
  const media = navigator.mediaDevices;
  const available = window.isSecureContext && !!media?.getUserMedia && !!media?.enumerateDevices;
  const [supported] = useState(() => media?.getSupportedConstraints?.() || null);
  const [attempt, setAttempt] = useState(null);
  const [history, setHistory] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState('');
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('Conecte o Numark antes de conceder a permissão.');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [levels, setLevels] = useState(EMPTY_LEVELS);
  const resourcesRef = useRef(null);
  const sequenceRef = useRef(0);
  const mountedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!media?.enumerateDevices) return;
    const all = await media.enumerateDevices();
    const inputs = all.filter(device => device.kind === 'audioinput');
    if (!mountedRef.current) return;
    setDevices(inputs);
    setSelected(previous => inputs.some(device => device.deviceId === previous)
      ? previous : (inputs.find(device => device.deviceId)?.deviceId || ''));
  }, [media]);

  const release = useCallback(() => {
    sequenceRef.current += 1;
    closeResources(resourcesRef.current);
    resourcesRef.current = null;
  }, []);

  const stop = useCallback(() => {
    release();
    setBusy(false);
    setActive(false);
    setLevels(EMPTY_LEVELS);
    setStatus('Captura encerrada. Os últimos dados obtidos permanecem abaixo.');
  }, [release]);

  useEffect(() => {
    mountedRef.current = true;
    const update = () => refresh().catch(err => {
      if (mountedRef.current) setError(`${err.name}: ${err.message}`);
    });
    update();
    media?.addEventListener?.('devicechange', update);
    return () => {
      mountedRef.current = false;
      media?.removeEventListener?.('devicechange', update);
      release();
    };
  }, [media, refresh, release]);

  async function capture(mode) {
    const permissionOnly = mode === 'permission';
    const audio = permissionOnly ? true : {
      deviceId: { exact: selected },
      channelCount: mode === 'exact' ? { exact: 2 } : { ideal: 2 },
      sampleRate: { ideal: 48000 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    const test = {
      mode: permissionOnly ? 'PERMISSÃO' : mode === 'exact' ? 'EXACT 2' : 'IDEAL 2',
      startedAt: new Date().toISOString(),
      selectedDevice: devices.filter(device => device.deviceId === selected)
        .map(({ deviceId, groupId, label }) => ({ deviceId, groupId, label }))[0] || { deviceId: selected },
      supported, requested: { audio, video: false }, settings: null,
      capabilities: null, capabilitiesStatus: 'Sem trilha obtida nesta tentativa.', error: null,
    };
    setAttempt(test);
    release();
    const sequence = sequenceRef.current;
    const current = () => mountedRef.current && sequence === sequenceRef.current;
    const resources = { nodes: [], frame: 0 };
    resourcesRef.current = resources;
    setBusy(true);
    setActive(false);
    setError('');
    setLevels(EMPTY_LEVELS);
    setResult(null);
    setStatus('Aguardando permissão/captura…');
    try {
      if (!available) throw new Error('Captura exige contexto seguro e APIs de mídia disponíveis.');
      if (!permissionOnly && !selected) throw new Error('Selecione uma entrada identificada primeiro.');
      // Criado dentro do clique: mantém a ativação do usuário exigida no celular.
      if (!permissionOnly) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) throw new Error('Web Audio não disponível neste navegador.');
        resources.ctx = new Context();
        await resources.ctx.resume();
        if (!current()) return;
      }
      const stream = await media.getUserMedia({ audio, video: false });
      resources.stream = stream;
      if (!current()) { closeResources(resources); return; }
      // Ler os labels enquanto a permissão e a trilha estão ativas.
      await refresh();
      if (!current()) { closeResources(resources); return; }
      if (permissionOnly) {
        closeResources(resources);
        resourcesRef.current = null;
        setStatus('Permissão concedida; captura de permissão encerrada. Selecione uma entrada e inicie o teste.');
        return;
      }
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('A captura não forneceu trilha de áudio.');
      const settings = track.getSettings?.() || {};
      test.settings = settings;
      if (typeof track.getCapabilities !== 'function') {
        test.capabilitiesStatus = 'getCapabilities() não disponível neste navegador.';
      } else {
        try {
          test.capabilities = track.getCapabilities();
          test.capabilitiesStatus = 'Capacidades informadas pela trilha selecionada.';
        } catch (err) {
          test.capabilitiesStatus = `getCapabilities() falhou: ${err.name}: ${err.message}`;
        }
      }
      setAttempt({ ...test });
      const ctx = resources.ctx;
      const source = ctx.createMediaStreamSource(stream);
      const splitter = ctx.createChannelSplitter(2);
      const analysers = [ctx.createAnalyser(), ctx.createAnalyser()];
      resources.nodes = [source, splitter, ...analysers];
      source.connect(splitter);
      analysers.forEach((analyser, index) => {
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
        splitter.connect(analyser, index, 0);
      });
      // Não ligar à saída: diagnóstico silencioso, sem MONITOR.
      setResult({ ...test, label: track.label, settings, requested: audio, supported,
        contextSampleRate: ctx.sampleRate, contextState: ctx.state,
        trackState: track.readyState, muted: track.muted });
      track.addEventListener('ended', () => {
        if (current()) { stop(); setStatus('A entrada encerrou a captura (desconexão ou permissão).'); }
      });
      const buffers = analysers.map(analyser => new Float32Array(analyser.fftSize));
      let lastUpdate = -Infinity;
      const tick = timestamp => {
        if (!current()) return;
        if (timestamp - lastUpdate >= 100) {
          lastUpdate = timestamp;
          setLevels(analysers.map((analyser, index) => {
            analyser.getFloatTimeDomainData(buffers[index]);
            let sum = 0, peak = 0;
            for (const value of buffers[index]) {
              sum += value * value;
              peak = Math.max(peak, Math.abs(value));
            }
            return { rms: Math.sqrt(sum / buffers[index].length), peak };
          }));
          setResult(previous => ({ ...previous, settings: track.getSettings?.() || {},
            contextState: ctx.state, trackState: track.readyState, muted: track.muted }));
        }
        resources.frame = requestAnimationFrame(tick);
      };
      resources.frame = requestAnimationFrame(tick);
      setHistory(previous => [...previous, { ...test, label: track.label }]);
      setActive(true);
      setStatus('Captura ativa, sem reprodução local. Coletando níveis por 1 segundo; encerramento automático.');
      resources.finishTimer = setTimeout(() => {
        if (!current()) return;
        release();
        setActive(false);
        setBusy(false);
        setStatus(`${test.mode} concluído. Captura liberada; escolha manualmente o próximo teste. Níveis exibidos são a última amostra.`);
      }, 1000);
    } catch (err) {
      closeResources(resources);
      if (current()) {
        resourcesRef.current = null;
        const failure = { ...test, error: { name: err.name || 'Erro', message: err.message || String(err),
          constraint: err.constraint ?? null, code: err.code ?? null, stack: err.stack ?? null } };
        setAttempt(failure);
        setHistory(previous => [...previous, failure]);
        setError(`${err.name || 'Erro'}: ${err.message}${err.constraint ? ` — restrição: ${err.constraint}` : ''}`);
        setStatus('Não foi possível iniciar. Nenhuma troca automática para outra entrada foi feita.');
      }
    } finally {
      if (current()) setBusy(false);
    }
  }

  const channels = result?.settings.channelCount;
  const channelDescription = !result ? 'Aguardando captura.'
    : channels === 1 ? 'MONO informado pelo navegador. RIGHT não está disponível.'
    : channels === 2 ? 'ESTÉREO: 2 canais informados pelo navegador.'
    : channels > 2 ? `${channels} canais informados; exibindo somente os dois primeiros.`
    : 'Quantidade de canais não informada: mono/estéreo não confirmado.';
  const usb = devices.filter(device => /numark|usb|ttusb/i.test(device.label));
  const report = JSON.stringify({ capturedAt: new Date().toISOString(),
    userAgent: navigator.userAgent, secureContext: window.isSecureContext,
    origin: window.location.origin, status, error, selectedDeviceId: selected,
    devices: devices.map(({ deviceId, groupId, label }) => ({ deviceId, groupId, label })),
    supported, attempt, history, result, channelDescription }, null, 2);

  return (
    <main style={{ height: '100dvh', overflowY: 'auto', background: '#111', color: '#fff',
      fontFamily: 'system-ui, sans-serif', fontSize: 16, lineHeight: 1.5, padding: 16 }}>
      <div style={{ maxWidth: 760, margin: '0 auto', overflowWrap: 'anywhere' }}>
        <h1 style={{ fontSize: 25 }}>Retro VU — diagnóstico de áudio USB</h1>
        <p>Temporário • somente desenvolvimento • gravação de teste local • sem transmissão ou monitor.</p>
        <p>Contexto seguro: <strong>{window.isSecureContext ? 'SIM' : 'NÃO'}</strong><br />
          Origem: {window.location.origin}</p>
        {!available && <p role="alert" style={{ color: '#ffb9a8' }}>
          Captura indisponível. HTTP pelo IP do computador normalmente não é contexto seguro.
          Use HTTPS confiável ou uma exceção temporária e específica de desenvolvimento no Chrome.
        </p>}
        <button style={controlStyle} disabled={!available || busy || active || recordingBusy} onClick={() => capture('permission')}>
          1. Permitir microfone e listar entradas
        </button>
        <button style={controlStyle} disabled={!available || busy || recordingBusy} onClick={() => refresh().catch(err => setError(`${err.name}: ${err.message}`))}>
          Atualizar lista
        </button>
        <h2 style={{ fontSize: 20, marginTop: 16 }}>Suporte do navegador — getSupportedConstraints()</h2>
        <p>Suporte a uma propriedade não garante que a entrada USB ofereça todos os valores.</p>
        {supported ? <>
          {FIELDS.slice(1).map(field => <div key={field}><strong>{field}:</strong> {supported[field] === true ? 'Suportada' : 'Não anunciada como suportada'}</div>)}
          <pre style={jsonStyle}>{JSON.stringify(supported, null, 2)}</pre>
        </> : <p>getSupportedConstraints() não disponível neste contexto.</p>}
        <h2 style={{ fontSize: 20, marginTop: 16 }}>Entradas encontradas ({devices.length})</h2>
        {devices.length === 0 && <p>Nenhuma entrada enumerada. Conceda permissão e atualize a lista.</p>}
        {devices.map((device, index) => <div key={`${device.deviceId}-${index}`} style={{ margin: '12px 0' }}>
          <strong>{index + 1}. {device.label || '(nome oculto/não informado)'}</strong>
          <div style={jsonStyle}>deviceId: {device.deviceId || '(oculto)'}</div>
          <div style={jsonStyle}>groupId: {device.groupId || '(oculto)'}</div>
        </div>)}
        <p>{usb.length ? 'Há label com Numark/TTUSB/USB. Isso é um indício; confirme tocando o disco e observando os níveis.'
          : 'Nenhum label contém Numark/TTUSB/USB. Uma entrada USB ainda pode aparecer com nome genérico ou como padrão.'}</p>
        <label htmlFor="diagnostic-input">2. Entrada a testar</label>
        <select id="diagnostic-input" value={selected} disabled={busy || recordingBusy}
          onChange={event => { stop(); setSelected(event.target.value); setResult(null); setAttempt(null); setError(''); }}
          style={{ ...controlStyle, display: 'block', width: '100%', marginRight: 0 }}>
          <option value="">Selecione uma entrada</option>
          {devices.map((device, index) => <option key={`${device.deviceId}-${index}`}
            value={device.deviceId} disabled={!device.deviceId}>
            {index + 1}. {device.label || 'Sem nome'}
          </option>)}
        </select>
        <p>IDEAL 2 consulta as capacidades da entrada e prefere estéreo. EXACT 2 exige dois canais, sem fallback para mono.
          Ambos usam a entrada selecionada, preferem 48000 Hz e solicitam os três tratamentos de voz como false.</p>
        <button style={controlStyle} disabled={!available || !selected || busy || active || recordingBusy} onClick={() => capture('ideal')}>
          TESTAR IDEAL 2 / CONSULTAR CAPACIDADES
        </button>
        <button style={controlStyle} disabled={!available || !selected || busy || active || recordingBusy} onClick={() => capture('exact')}>
          FORÇAR ESTÉREO 2CH
        </button>
        <p>Cada botão faz uma nova captura independente e a encerra automaticamente após 1 segundo de medição.
          Escolha qualquer ordem: EXACT 2 não executa IDEAL 2 antes nem tenta mono em caso de erro.</p>
        <button style={controlStyle} disabled={!busy && !active} onClick={stop}>Parar captura</button>
        <p role="status">{status}</p>
        {error && <p role="alert" style={{ color: '#ffb9a8' }}>{error}</p>}
        {attempt && <>
          <h2 style={{ fontSize: 20, marginTop: 16 }}>ÚLTIMO TESTE: {attempt.mode}</h2>
          <h3>Capacidades da entrada — getCapabilities()</h3>
          <p>{attempt.capabilitiesStatus}</p>
          {attempt.capabilities && <>
            {FIELDS.slice(1).map(field => <div key={field}><strong>{field}:</strong> {show(attempt.capabilities[field])}</div>)}
            <pre style={jsonStyle}>{JSON.stringify(attempt.capabilities, null, 2)}</pre>
          </>}
          {attempt.mode === 'EXACT 2' && result && result.settings.channelCount !== 2 &&
            <p role="alert">EXACT 2 não confirmado: a captura abriu, mas getSettings() não informou 2 canais. Não considere este resultado estéreo confirmado.</p>}
        </>}
        <h2 style={{ fontSize: 20, marginTop: 16 }}>Canais e níveis reais</h2>
        <p>{channelDescription}</p>
        <p>Dois canais declarados não provam conteúdo estéreo: podem conter sinais iguais.
          RIGHT silencioso também não prova mono. Não há variação aleatória nem cópia de LEFT para RIGHT.</p>
        {['LEFT', 'RIGHT'].map((name, index) => <div key={name} style={{ margin: '12px 0' }}>
          <strong>{name}</strong>{index === 1 && channels === 1 ? <p>Não disponível em mono.</p> : <>
            <meter aria-label={`${name} RMS`} min="0" max="1" value={Math.max(0, Math.min(1, (20 * Math.log10(Math.max(levels[index].rms, 0.001)) + 60) / 60))}
              style={{ display: 'block', width: '100%', height: 28 }} />
            <div>RMS: {db(levels[index].rms)} • Pico: {db(levels[index].peak)}</div>
          </>}</div>)}
        {result && <>
          <h2 style={{ fontSize: 20, marginTop: 16 }}>Valores obtidos — getSettings()</h2>
          <p>Entrada testada: <strong>{result.label || '(label não informado)'}</strong></p>
          {FIELDS.map(field => <div key={field} style={{ padding: '5px 0', borderBottom: '1px solid #444' }}>
            <strong>{field}:</strong> {show(result.settings[field])}
          </div>)}
          <p>Dados coletados durante o teste. A captura é liberada ao concluir.</p>
          <p>Web Audio: {result.contextSampleRate} Hz; estado: {result.contextState}. Essa taxa pode diferir da captura por reamostragem.</p>
          <p>Trilha: {result.trackState}; muted: {String(result.muted)}.</p>
          {active && result.contextState !== 'running' && <p role="alert">Web Audio suspenso: níveis não são confiáveis enquanto estiver suspenso. Pare e inicie novamente.</p>}
          <details><summary>Preferências solicitadas e suporte anunciado</summary>
            <pre style={jsonStyle}>{JSON.stringify({ requested: result.requested, supported: result.supported }, null, 2)}</pre>
          </details>
        </>}
        <MonoContentTest media={media} available={available} selected={selected}
          disabled={busy || active} onBusyChange={setRecordingBusy} />
        <h2 style={{ fontSize: 20, marginTop: 16 }}>Relatório para copiar após o teste</h2>
        <p>Os dados ficam nesta página. Selecione e copie o texto; o relatório não contém o áudio do teste.</p>
        <textarea aria-label="Relatório do diagnóstico" readOnly value={report}
          style={{ width: '100%', height: 220, fontSize: 13, padding: 8 }} />
        <p><a href={window.location.pathname} onClick={stop} style={{ color: '#9bd7ff' }}>Sair do diagnóstico e abrir Retro VU</a></p>
      </div>
    </main>
  );
}
