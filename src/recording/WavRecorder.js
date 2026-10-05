import { commitRecording } from './archive';
import { validateWav, wavName } from './wav';
export const MAX_WAV_BYTES = 2 * 1024 * 1024 * 1024 - 44;
export class WavRecorder {
  constructor(session, update) {
    this.session = session; this.update = update; this.name = wavName(); this.tempName = `rec-${crypto.randomUUID()}.wav`;
    this.result = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.result.catch(() => {}); // start can fail before the caller asks to stop.
  }
  start() { this.starting = this.begin(); return this.starting; }
  async begin() {
    const {ctx, settings, source, stream} = this.session;
    this.rate = ctx.sampleRate; this.channels = settings.channelCount;
    if (!navigator.storage?.getDirectory || !window.Worker || !window.AudioWorkletNode || !window.OfflineAudioContext)
      throw new Error('REC WAV requer armazenamento local OPFS e AudioWorklet neste navegador.');
    if (![1,2].includes(this.channels) || ctx.state !== 'running') throw new Error('Fonte USB PCM não está pronta.');
    const estimate = await navigator.storage.estimate?.();
    const available = estimate?.quota ? estimate.quota - (estimate.usage || 0) - 16 * 1024 * 1024 : MAX_WAV_BYTES;
    this.limit = Math.floor(Math.min(MAX_WAV_BYTES, available) / (this.channels * 2)) * this.channels * 2;
    if (this.limit < this.rate * this.channels * 2 * 10) throw new Error('Espaço local insuficiente para REC WAV.');
    if (this.disposed) throw new Error('REC cancelado');
    this.worker = new Worker('/recording/wav-writer.js?v=1');
    const ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; });
    this.worker.onmessage = ({data}) => {
      if (this.disposed) return;
      if (data.type === 'ready') this.readyResolve();
      if (data.type === 'error') this.fail(new Error(data.message));
      if (data.type === 'ack') {
        this.node?.port.postMessage({type:'credit'});
        if (!this.stopping) this.update({seconds:data.frames / this.rate});
        if (data.warning) this.stop(data.warning).catch(() => {});
      }
      if (data.type === 'file') this.complete(data).catch(error => this.fail(error));
    };
    this.worker.onerror = () => this.fail(new Error('Worker de gravação falhou.'));
    this.startTimer = setTimeout(() => this.fail(new Error('Armazenamento local não respondeu.')), 15000);
    this.worker.postMessage({type:'init',name:this.tempName,rate:this.rate,channels:this.channels,limit:this.limit});
    await ready; clearTimeout(this.startTimer);
    await ctx.audioWorklet.addModule('/recording/pcm-recorder.js?v=1');
    if (this.disposed) throw new Error('REC cancelado');
    this.node = new AudioWorkletNode(ctx,'retro-wav-recorder', { numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],
      channelCount:this.channels,channelCountMode:'explicit',channelInterpretation:'discrete',processorOptions:{channels:this.channels} });
    this.node.port.onmessage = ({data}) => {
      if (this.disposed || this.finishing) return;
      if (data.type === 'pcm') this.worker.postMessage(data,[data.buffer]);
      if (data.type === 'stopped') {
        this.warning = this.warning || data.warning;
        this.finish();
      }
    };
    this.node.onprocessorerror = () => this.fail(new Error('Processador PCM do REC falhou.'));
    this.ended = () => this.stop('Entrada USB encerrada; confira o final do arquivo.').catch(() => {});
    this.contextChanged = () => { if (ctx.state !== 'running') this.stop('Contexto de áudio interrompido; arquivo parcial.').catch(() => {}); };
    stream.getAudioTracks()[0].addEventListener('ended',this.ended);
    ctx.addEventListener('statechange',this.contextChanged);
    source.connect(this.node); this.node.connect(ctx.destination);
    this.update({status:'recording',seconds:0,message:''});
  }
  stop(warning = '') {
    this.warning = this.warning || warning;
    if (!this.stopping) {
      this.stopping = true; this.update({status:'finalizing',message:'FINALIZANDO WAV'});
      Promise.resolve(this.starting).then(() => {
        if (this.disposed || this.finishing) return;
        if (this.session.ctx.state !== 'running') { this.finish(); return; }
        this.node.port.postMessage({type:'stop'});
        this.stopTimer = setTimeout(() => this.fail(new Error('REC não confirmou todos os blocos; arquivo não anunciado como concluído.')), 10000);
      }).catch(error => this.fail(error));
    }
    return this.result;
  }
  finish() {
    if (this.finishing || this.disposed) return;
    this.finishing = true; this.stopping = true;
    this.update({status:'finalizing',message:'VALIDANDO WAV'});
    clearTimeout(this.stopTimer); this.disconnect();
    this.worker.postMessage({type:'finish'});
    this.finishTimer = setTimeout(() => this.fail(new Error('Finalização WAV não confirmada.')), 30000);
  }
  async complete(data) {
    const file = new File([data.file],this.name,{type:'audio/wav'});
    let decoder;
    const format = await validateWav(file, (buffer, info) => {
      decoder ||= new OfflineAudioContext(info.channels,1,info.rate);
      return decoder.decodeAudioData(buffer);
    });
    if (this.disposed) return;
    clearTimeout(this.finishTimer);
    await commitRecording(this.tempName,{name:this.name,created:Date.now(),seconds:format.seconds,rate:format.rate,channels:format.channels});
    this.committed = true;
    this.worker.terminate(); this.worker = null;
    const result = {id:this.tempName,created:Date.now(),blob:file,url:URL.createObjectURL(file),name:this.name,type:'audio/wav',size:file.size,
      seconds:format.seconds,rate:format.rate,channels:format.channels,dispose:()=>this.dispose()};
    this.resolve(result);
    this.update({status:'available',file:result,seconds:format.seconds,message:this.warning || data.warning || ''});
  }
  disconnect() {
    this.session.stream.getAudioTracks()[0]?.removeEventListener('ended',this.ended);
    this.session.ctx.removeEventListener('statechange',this.contextChanged);
    if (this.node) {
      try { this.session.source.disconnect(this.node); } catch { /* USB may already have ended. */ }
      this.node.port.onmessage = null; this.node.port.close(); this.node.disconnect(); this.node = null;
    }
  }
  fail(error) {
    if (this.disposed) return;
    this.readyReject?.(error); this.reject(error);
    this.update({status:'error',file:null,message:`REC WAV: ${error.message}`}); this.dispose();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; clearTimeout(this.startTimer); clearTimeout(this.stopTimer); clearTimeout(this.finishTimer);
    this.disconnect(); this.worker?.terminate(); this.worker = null;
    const error = new Error('REC encerrado'); this.readyReject?.(error); this.reject(error);
    if (!this.committed) navigator.storage?.getDirectory?.().then(root=>root.getDirectoryHandle('retro-vu-recordings'))
      .then(dir=>dir.removeEntry(this.tempName)).catch(()=>{});
  }
}
