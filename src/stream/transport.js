import { HEADER, packPCM, unpackPCM, Sequence } from './pcm';
import { SenderQueue } from './flow';
import { Signaling } from './signaling';
import { debug } from './debug';

const WORKLET = '/stream/pcm-worklet.js?v=2';
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
// Optional TURN infrastructure config; never place long-lived production credentials in the bundle.
function iceServers() {
  return process.env.REACT_APP_STREAM_ICE_SERVERS ? JSON.parse(process.env.REACT_APP_STREAM_ICE_SERVERS) : ICE;
}
export class StreamTransport {
  constructor(role, session, update, credentials) {
    this.credentials = credentials;
    this.role = role; this.session = session; this.update = update; this.peers = new Map();
    this.metricAt = Date.now(); this.previousProduced = 0; this.previousReceived = 0; this.producedFrames = 0;
    this.closed = false; this.epoch = 1; this.sequence = 0; this.playWanted = true; this.bytes = 0; this.blocks = 0;
    this.publish({ role, status: role === 'send' ? 'WAITING' : 'SEARCHING', seconds: 0, playing: true });
    if (role === 'receive') {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      // Called synchronously from RECEBER's user gesture.
      this.resume = this.ctx.resume();
      // A suspended resume promise must not block presence/SDP indefinitely.
      this.resume.then(() => {
        if (this.closed) return;
        for (const peer of this.peers.values()) if (this.ctx.state === 'running') this.readyReceiver(peer);
      }).catch(error => { if (!this.closed) this.publish({status: 'NEEDS_PLAY', error: error.message}); });
    }
  }
  publish(values) { if (!this.closed) this.update(values); }
  async start() {
    try {
      if (this.closed) return;
      if (!window.RTCPeerConnection || !window.AudioWorkletNode) throw new Error('WebRTC / AudioWorklet indisponível');
      if (this.role === 'send' && this.session.kind === 'voice') {
        this.voiceStateChanged=muted=>{for(const peer of this.peers.values())this.sendControl(peer,{type:'voice-state',muted});};
        this.session.onVoiceState?.add(this.voiceStateChanged);
        this.format={mode:'voice',version:1,sampleRate:this.session.ctx.sampleRate,channels:this.session.settings.channelCount};
      } else if (this.role === 'send') {
        const { ctx, source, settings } = this.session;
        if (![1, 2].includes(settings.channelCount)) throw new Error('Quantidade de canais USB não informada');
        await ctx.audioWorklet.addModule(WORKLET);
        if (this.closed) return;
        this.format = { sampleRate: ctx.sampleRate, channels: settings.channelCount, sampleSize: 16,
          inputRate: settings.sampleRate, version: 1, sourceKind: this.session.kind || 'usb' };
        this.capture = new AudioWorkletNode(ctx, 'retro-capture', {
          channelCount: settings.channelCount, channelCountMode: 'explicit',
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          processorOptions: { channels: settings.channelCount },
        });
        // Worklet output is always zero. This keeps processing scheduled without monitoring USB.
        source.connect(this.capture); this.capture.connect(ctx.destination);
        this.capture.port.onmessage = ({ data }) => this.onCapture(data);
        this.capture.onprocessorerror = () => this.fail(new Error('Capture worklet failed'));
        debug('format', this.format);
      } else {
        if (this.closed) return;
        if (this.ctx.state !== 'running') this.publish({ status: 'NEEDS_PLAY' });
      }
      if (this.closed) return;
      this.signal = new Signaling(this.role, result => this.onSignal(result), error => {
        this.publish({ error: error.message, signalingError: true });
      }, this.credentials);
      this.signal.poll();
      this.metricTimer = setInterval(() => this.reportMetrics(), 2000);
    } catch (error) { this.fail(error); }
  }
  fail(error) {
    debug('error', { message: error.message });
    this.publish({ status: 'ERROR', error: error.message, analyser: null });
    this.close('transport-fatal'); // Closes only the network branch; USB/SIGNAL/MONITOR have their own owner.
  }
  onCapture(data) {
    if (this.closed) return;
    if (data.type === 'overrun' || data.type === 'error') {
      debug('capture-discontinuity', data);
      for (const id of [...this.peers.keys()]) this.drop(id, true, data.reason || 'capture-overrun', { worklet: data });
      this.activeCapture = false;
      this.publish({ status: 'CAPTURE_DELAY', error: data.message || 'Fila local do worklet excedida' });
      return;
    }
    if (data.type !== 'pcm') return;
    this.producedFrames = data.generatedFrames ?? this.producedFrames + data.frames;
    this.workletStats = { queuedFrames: data.queuedFrames, maxQueuedFrames: data.maxQueuedFrames, creditStalls: data.creditStalls, framesPerBlock: data.frames };
    try {
      const packet = packPCM(data.samples, { ...this.format, epoch: this.epoch, sequence: this.sequence++ >>> 0,
        frames: data.frames, position: data.position });
      for (const peer of this.peers.values()) if (peer.queue) peer.queue.push(packet);
    } finally { this.capture?.port.postMessage({ type: 'credit', run: data.run }); }
  }
  errorInfo(error) {
    return { name: error?.name, message: error?.message, errorDetail: error?.errorDetail, sctpCauseCode: error?.sctpCauseCode };
  }
  peerSnapshot(peer) {
    return { peer: peer.id, connectionState: peer.pc.connectionState, iceConnectionState: peer.pc.iceConnectionState,
      dataChannelState: peer.channel?.readyState, pendingPCM: peer.pendingPCM,
      bufferedAmount: peer.channel?.bufferedAmount, queue: peer.queue?.snapshot(), remote: peer.remoteTelemetry,
      rtc: peer.rtcStats };
  }
  sendControl(peer, value, retry = true) {
    if (this.closed || peer.dead || peer.channel?.readyState !== 'open') return false;
    try { peer.channel.send(JSON.stringify(value)); return true; }
    catch (error) {
      debug('send-exception', { ...this.peerSnapshot(peer), control: value.type, error: this.errorInfo(error) });
      if (error.name === 'OperationError') {
        if (retry && !peer.controlTimer) peer.controlTimer = setTimeout(() => {
          peer.controlTimer = null; this.sendControl(peer, value);
        }, 250);
      } else this.drop(peer.id, true, 'control-send-fatal', { error: this.errorInfo(error) });
      return false;
    }
  }
  reportMetrics() {
    if (this.closed) return;
    const now = Date.now(), seconds = (now - this.metricAt) / 1000;
    if (seconds <= 0) return;
    const produced = this.producedFrames * (this.format?.channels || 0) * 2;
    const received = this.role === 'receive' ? this.bytes - this.blocks * HEADER : 0;
    const peers = [...this.peers.values()].map(peer => {
      const sent = peer.sentPCMBytes || 0;
      const pcmSentBps = Math.round((sent - (peer.previousSent || 0)) / seconds);
      const packetBytes = peer.queue?.sentBytes || 0;
      const packetSentBps = Math.round((packetBytes - (peer.previousPacketSent || 0)) / seconds);
      peer.previousPacketSent = packetBytes;
      peer.previousSent = sent;
      // RTC stats are evidence separate from successful send() calls and remote delivery.
      if (peer.pc.getStats && !peer.statsPending) {
        peer.statsPending = true;
        peer.pc.getStats().then(stats => {
          if (peer.dead) return;
          const found = [];
          stats.forEach(stat => {
            if (stat.type === 'data-channel' && stat.label === 'retro-pcm-v1') found.push({ type: stat.type,
              bytesSent: stat.bytesSent, bytesReceived: stat.bytesReceived, messagesSent: stat.messagesSent });
            if (stat.type === 'candidate-pair' && stat.nominated && stat.state === 'succeeded') found.push({ type: stat.type,
              currentRoundTripTime: stat.currentRoundTripTime, availableOutgoingBitrate: stat.availableOutgoingBitrate });
          });
          peer.rtcStats = { observedAt: Date.now(), values: found };
        }).catch(error => debug('stats-error', { message: error.message })).finally(() => { peer.statsPending = false; });
      }
      return { ...this.peerSnapshot(peer), pcmSentBps, packetSentBps, pcmSentBytes: sent };
    });
    const metrics = { role: this.role, intervalMs: now - this.metricAt,
      pcmProducedBps: Math.round((produced - this.previousProduced) / seconds), pcmProducedBytes: produced,
      pcmReceivedBps: Math.round((received - this.previousReceived) / seconds), pcmReceivedBytes: received,
      bytes: this.bytes, blocks: this.blocks, sequence: this.sequence, epoch: this.epoch,
      format: this.format, worklet: this.workletStats, bufferSeconds: this.bufferSeconds, peers };
    this.metricAt = now; this.previousProduced = produced; this.previousReceived = received;
    debug('metrics', metrics);
    this.publish({ diagnostic: metrics });
    if (this.role === 'receive') for (const peer of this.peers.values()) this.sendControl(peer, {
      type: 'telemetry', pcmReceivedBps: metrics.pcmReceivedBps, pcmReceivedBytes: received, bufferSeconds: this.bufferSeconds,
    }, false);
  }
  syncCapture() {
    if (!this.capture) return;
    const active = [...this.peers.values()].some(p => p.queue && p.channel?.readyState === 'open');
    if (active !== this.activeCapture) {
      this.activeCapture = active;
      if (active) { this.epoch = (this.epoch + 1) >>> 0; this.sequence = 0; }
      this.capture.port.postMessage({ type: 'enable', enabled: active });
    }
  }
  async onSignal({ peers, messages }) {
    if (this.closed) return;
    this.publish({ signalingError: false });
    for (const [id] of this.peers) if (!peers.some(p => p.id === id)) this.drop(id, false, 'presence-left');
    for (const remote of peers) {
      if (this.role === 'send' && !this.peers.has(remote.id)) {
        const peer = this.makePeer(remote.id);
        this.bindChannel(peer, peer.pc.createDataChannel('retro-pcm-v1', { ordered: true }));
        const offer = await peer.pc.createOffer();
        if (this.closed || peer.dead) return;
        await peer.pc.setLocalDescription(offer);
        if (!peer.dead) this.sendDescription(peer);
      }
    }
    for (const message of messages) {
      if (this.closed) return;
      if (!peers.some(p => p.id === message.from)) continue;
      if (message.type === 'reset') { this.drop(message.from, false, 'remote-reset', { remoteReason: message.value?.reason }); continue; }
      let peer = this.peers.get(message.from);
      if (!peer && this.role === 'receive' && message.type === 'description') {
        // One transmitter per private session; each sender may have up to three receivers.
        peer = this.makePeer(message.from);
      }
      if (!peer) continue;
      try {
        if (message.type === 'description') {
          if(this.role==='receive') {
            const voice=message.value.sourceKind==='voice' || /^m=audio [1-9]/m.test(message.value.sdp||'');
            peer.voice=voice;
            if(voice)this.publish({sourceKind:'voice',seconds:0});
          }
          await peer.pc.setRemoteDescription({type:message.value.type,sdp:message.value.sdp});
          for (const candidate of peer.candidates) await peer.pc.addIceCandidate(candidate);
          peer.candidates = [];
          if (message.value.type === 'offer') {
            await peer.pc.setLocalDescription(await peer.pc.createAnswer());
            if (!peer.dead) this.sendDescription(peer);
          }
        } else if (message.type === 'candidate') {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(message.value);
          else peer.candidates.push(message.value);
        }
      } catch (error) { debug('negotiation-error', { message: error.message }); this.drop(peer.id, true, 'negotiation-error', { error: this.errorInfo(error) }); }
    }
  }
  sendDescription(peer) {
    this.signal.send(peer.id, 'description', {...peer.pc.localDescription.toJSON(),
      ...(this.role==='send'&&this.session.kind==='voice'?{sourceKind:'voice'}:{})});
    peer.descriptionSent = true;
    for (const candidate of peer.localCandidates) this.signal.send(peer.id, 'candidate', candidate);
    peer.localCandidates = [];
  }
  makePeer(id) {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const peer = { id, pc, candidates: [], localCandidates: [], chain: Promise.resolve(), pendingPCM: 0, sequence: new Sequence() };
    this.peers.set(id, peer);
    if(this.role==='send' && this.session.kind==='voice')this.session.stream.getAudioTracks().forEach(track=>pc.addTrack(track,this.session.stream));
    pc.ontrack=event=>{
      if(this.role!=='receive'||event.track.kind!=='audio'||peer.dead)return;
      try{this.prepareVoice(event,peer);}catch(error){debug('voice-playback-error',{message:error.message});this.publish({sourceKind:'voice',status:'ERROR',error:error.message});}
    };
    this.publish({ status: 'CONNECTING' });
    peer.timeout = setTimeout(() => { if (pc.connectionState !== 'connected') this.drop(id, true, 'connect-timeout-25s'); }, 25000);
    pc.onicecandidate = event => {
      if (event.candidate && !peer.dead) {
        if (peer.descriptionSent) this.signal.send(id, 'candidate', event.candidate.toJSON());
        else peer.localCandidates.push(event.candidate.toJSON());
      }
    };
    pc.oniceconnectionstatechange = () => debug('ice', { peer: id, state: pc.iceConnectionState });
    pc.onconnectionstatechange = () => {
      debug('peer', { peer: id, state: pc.connectionState });
      if (pc.connectionState === 'connected') {
        clearTimeout(peer.timeout);
        peer.updateVoice?.();
        if (this.role === 'send' && (peer.queue || this.session.kind==='voice') && peer.channel?.readyState === 'open') this.publish({ status: 'CONNECTED' });
      }
      if (['failed', 'closed'].includes(pc.connectionState)) this.drop(id, true, 'pc-' + pc.connectionState);
      if (pc.connectionState === 'disconnected') {
        this.publish({ status: 'DISCONNECTED' });
        clearTimeout(peer.timeout); peer.timeout = setTimeout(() => this.drop(id, true, 'disconnected-timeout-10s'), 10000);
      }
    };
    pc.ondatachannel = event => this.bindChannel(peer, event.channel);
    return peer;
  }
  bindChannel(peer, channel) {
    peer.channel = channel; channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      debug('datachannel', { peer: peer.id, state: 'open', ordered: channel.ordered });
      if (this.role === 'send') {
        this.sendControl(peer, { type: 'format', ...this.format });
        if(this.session.kind==='voice')this.sendControl(peer,{type:'voice-state',muted:!this.session.stream.getAudioTracks()[0].enabled});
      }
    };
    channel.onclose = () => this.drop(peer.id, true, 'dc-close');
    channel.onerror = event => this.drop(peer.id, true, 'dc-error', { error: this.errorInfo(event?.error) });
    channel.onmessage = ({ data }) => {
      if (peer.dead || this.closed) return;
      if (this.role === 'send') {
        try {
          const control = typeof data === 'string' ? JSON.parse(data) : {};
          if (control.type === 'ready') {if(this.session.kind==='voice'){if(peer.pc.connectionState==='connected')this.publish({status:'CONNECTED',format:this.format});}else this.activateSender(peer);}
          if (control.type === 'telemetry') peer.remoteTelemetry = { ...control, observedAt: Date.now() };
        } catch (error) { this.drop(peer.id, true, 'invalid-control', { error: this.errorInfo(error) }); }
        return;
      }
      // Bound async format setup and MessagePort backlog; never queue unbounded PCM.
      if (++peer.pendingPCM > 64) { this.drop(peer.id, true, 'receiver-port-cap-64'); return; }
      peer.chain = peer.chain.then(async () => {
        if (this.closed || peer.dead) return;
        if (typeof data === 'string') {
          const format = JSON.parse(data);
          if(format.type==='voice-state'){this.voiceMuted=Boolean(format.muted);if(this.voiceGate)this.voiceGate.gain.setValueAtTime(this.playWanted&&!this.voiceMuted?1:0,this.ctx.currentTime);this.publish({voiceMuted:this.voiceMuted});peer.pendingPCM--;return;}
          if(format.type==='format' && format.mode==='voice' && format.version===1){
            this.format=format;this.publish({format,sourceKind:'voice'});this.sendControl(peer,{type:'ready'});peer.pendingPCM--;return;
          }
          if (format.type === 'resync' && peer.playback) {
            peer.sequence = new Sequence(); peer.playback.port.postMessage({ type: 'reset' });
            debug('receiver-resync', { reason: format.reason, droppedBytes: format.droppedBytes });
            peer.pendingPCM--; return;
          }
          if (format.type !== 'format' || format.version !== 1 || ![1, 2].includes(format.channels) ||
              format.sampleSize !== 16 || format.sampleRate < 8000 || format.sampleRate > 192000)
            throw new Error('Unsupported PCM format');
          await this.preparePlayback(format, peer);
          peer.pendingPCM--;
        } else {
          if (!peer.playback) throw new Error('PCM before format');
          const packet = unpackPCM(data);
          if (packet.sampleRate !== this.format.sampleRate || packet.channels !== this.format.channels)
            throw new Error('PCM format changed');
          if (peer.sequence.epoch !== undefined && peer.sequence.epoch !== packet.epoch)
            peer.playback.port.postMessage({ type: 'reset' });
          peer.sequence.accept(packet);
          peer.playback.port.postMessage({ type: 'pcm', samples: packet.samples }, [packet.samples.buffer]);
          this.bytes += data.byteLength; this.blocks++;
        }
      }).catch(error => { debug('receive-error', { message: error.message }); this.drop(peer.id, true, 'receive-pcm-error', { error: this.errorInfo(error) }); });
    };
  }
  activateSender(peer) {
    if (peer.queue || peer.dead) return;
    const channel = peer.channel;
    peer.sentPCMBytes = 0; peer.previousSent = 0;
    peer.queue = new SenderQueue(channel, failure => {
      this.drop(peer.id, true, failure.reason, { failure });
    }, bytes => { this.bytes += bytes; this.blocks++; peer.sentPCMBytes += bytes - HEADER; }, event => {
      debug(['send-exception', 'sender-queue-cap'].includes(event.reason) ? event.reason : 'flow', { peer: peer.id, ...this.peerSnapshot(peer), ...event });
      if (['dc-high-water', 'send-operation-error', 'sender-queue-cap'].includes(event.reason))
        this.publish({ status: 'BACKPRESSURE' });
      if (event.reason === 'send-resumed') this.publish({ status: 'CONNECTED' });
    });
    this.syncCapture(); this.publish({ status: 'CONNECTED', format: this.format });
  }
  async preparePlayback(format, peer) {
    if (this.ctx.sampleRate !== format.sampleRate) {
      await this.ctx.close();
      if (this.closed || peer.dead) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: format.sampleRate });
      this.ctx.resume().then(() => {
        if (!this.closed && !peer.dead && peer.playback) this.readyReceiver(peer);
      }).catch(error => { if (!this.closed) this.fail(error); });
    }
    if (this.ctx.sampleRate !== format.sampleRate) throw new Error('Playback sample rate mismatch');
    await this.ctx.audioWorklet.addModule(WORKLET);
    if (this.closed || peer.dead) return;
    this.clearPlayback();
    this.format = format;
    const node = new AudioWorkletNode(this.ctx, 'retro-playback', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [format.channels],
      processorOptions: { channels: format.channels },
    });
    this.playback = peer.playback = node;
    this.recordingSession={ready:true,ctx:this.ctx,source:node,settings:{sampleRate:format.sampleRate,channelCount:format.channels,sampleSize:16},onEnd:new Set()};
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.3;
    node.connect(this.analyser); node.connect(this.ctx.destination);
    node.port.postMessage({ type: 'play', value: this.playWanted });
    node.port.onmessage = ({ data }) => {
      if (this.closed || peer.dead) return;
      if (data.type === 'credit') { peer.pendingPCM--; return; }
      if (data.type === 'overflow') { this.drop(peer.id, true, 'receiver-playout-cap-15s'); return; }
      if (data.type === 'status') {
        this.bufferSeconds = data.seconds;
        if (data.state !== this.lastPlaybackState) {
          debug('playout', { state: data.state, seconds: data.seconds }); this.lastPlaybackState = data.state;
        }
        this.publish({ status: this.ctx.state === 'running' ? data.state : 'NEEDS_PLAY',
          seconds: data.seconds, playing: this.playWanted, analyser: this.analyser, format });
        if (data.underflows !== this.underflows) {
          this.underflows = data.underflows; debug('underflows', { count: data.underflows });
        }

      }
    };
    node.onprocessorerror = () => { this.drop(peer.id, true, 'playback-processor-error'); this.fail(new Error('Playback worklet failed')); };
    peer.awaitingReady = true;
    if (this.ctx.state === 'running') this.readyReceiver(peer);
    this.publish({ status: this.ctx.state === 'running' ? 'BUFFERING' : 'NEEDS_PLAY', format, analyser: this.analyser, recordingSession:this.recordingSession,sourceKind:format.sourceKind || 'usb' });
    debug('received-format', format);
  }
  prepareVoice(event,peer) {
    this.clearPlayback();
    const stream=event.streams?.[0] || new MediaStream([event.track]);
    const source=this.ctx.createMediaStreamSource(stream),gate=this.ctx.createGain();
    this.voiceSource=source;this.voiceGate=gate;
    this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=2048;this.analyser.smoothingTimeConstant=0.3;
    source.connect(gate);gate.connect(this.analyser);gate.connect(this.ctx.destination);gate.gain.value=this.playWanted&&!this.voiceMuted?1:0;
    this.recordingSession={ready:true,ctx:this.ctx,source,stream,settings:{sampleRate:this.ctx.sampleRate,channelCount:event.track.getSettings?.().channelCount||1,sampleSize:16},onEnd:new Set()};
    const update=()=>{
      if(this.closed||peer.dead)return;
      const connected=peer.pc.connectionState==='connected';
      this.publish({sourceKind:'voice',analyser:this.analyser,recordingSession:this.recordingSession,seconds:0,
        playing:connected&&this.playWanted&&this.ctx.state==='running'&&!event.track.muted,
        status:!connected?'CONNECTING':this.ctx.state!=='running'?'NEEDS_PLAY':!this.playWanted?'STOPPED':event.track.muted?'CONNECTING':'PLAYING'});
    };
    peer.updateVoice=update;
    event.track.onunmute=update;event.track.onmute=update;event.track.onended=()=>this.drop(peer.id,true,'voice-track-ended');
    this.ctx.resume().then(update).catch(error=>this.publish({status:'NEEDS_PLAY',error:error.message}));update();
  }
  readyReceiver(peer) {
    if (!peer.awaitingReady || peer.dead) return;
    if (this.sendControl(peer, { type: 'ready' })) peer.awaitingReady = false;
  }
  async togglePlay() {
    if (this.role !== 'receive' || this.closed) return;
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); if (this.closed) return; this.playWanted = true; }
      catch (error) { this.fail(error); return; }
    } else this.playWanted = !this.playWanted;
    if (this.ctx.state !== 'running') { this.publish({ status: 'NEEDS_PLAY' }); return; }
    for (const peer of this.peers.values()) this.readyReceiver(peer);
    if(this.voiceGate)this.voiceGate.gain.setValueAtTime(this.playWanted&&!this.voiceMuted?1:0,this.ctx.currentTime);
    if(this.voiceGate){for(const peer of this.peers.values())peer.updateVoice?.();return;}
    this.playback?.port.postMessage({ type: 'play', value: this.playWanted });
    this.publish({ status: this.playWanted ? this.voiceGate?'PLAYING':'BUFFERING' : 'STOPPED', playing: this.playWanted });
  }
  clearPlayback() {
    const finishing=[];
    if(this.recordingSession){this.recordingSession.ready=false;for(const end of this.recordingSession.onEnd)finishing.push(end());this.recordingSession=null;}
    if(finishing.length)this.recordingFinished=Promise.allSettled(finishing);
    this.voiceSource?.disconnect();this.voiceGate?.disconnect();this.voiceSource=null;this.voiceGate=null;
    this.publish({recordingSession:null});
    if (this.playback) { this.playback.port.onmessage = null; this.playback.port.close(); this.playback.disconnect(); }
    this.analyser?.disconnect(); this.playback = null; this.analyser = null;
  }
  drop(id, notify = false, reason = 'explicit-peer-stop', details = {}) {
    const peer = this.peers.get(id); if (!peer) return;
    debug('peer-closing', { role: this.role, reason, ...this.peerSnapshot(peer), ...details });
    this.publish({ lastReconnect: reason });
    peer.dead = true; this.peers.delete(id); clearTimeout(peer.timeout); clearTimeout(peer.controlTimer);
    peer.queue?.close(); peer.pc.onconnectionstatechange = null; peer.pc.onicecandidate = null; peer.pc.ondatachannel = null;
    if (peer.channel) { peer.channel.onclose = null; peer.channel.onerror = null; peer.channel.onmessage = null; peer.channel.close(); }
    peer.pc.close();
    if (notify && !this.closed) this.signal?.send(id, 'reset', { reason });
    if (this.role === 'receive') { this.clearPlayback(); this.publish({ status: 'DISCONNECTED', seconds: 0, analyser: null }); }
    else {
      this.syncCapture();
      this.publish({ status: [...this.peers.values()].some(p => p.channel?.readyState === 'open') ? 'CONNECTED' : 'WAITING' });
    }
    debug('peer-removed', { peer: id, reason });
  }
  close(reason = 'session-stop') {
    clearInterval(this.metricTimer);
    this.session?.onVoiceState?.delete(this.voiceStateChanged);
    this.closed = true; this.signal?.close();
    for (const id of [...this.peers.keys()]) this.drop(id, false, reason);
    if (this.capture) {
      this.capture.port.onmessage = null; this.capture.port.close();
      try { this.session.source.disconnect(this.capture); } catch { /* Capture may already be stopped. */ }
      this.capture.disconnect(); this.capture = null;
    }
    this.clearPlayback();
    if (this.role === 'receive' && this.ctx?.state !== 'closed') {
      const ctx=this.ctx;if(this.recordingFinished)Promise.resolve(this.recordingFinished).finally(()=>ctx.close().catch(()=>{}));else ctx.close().catch(()=>{});
    }
  }
}
