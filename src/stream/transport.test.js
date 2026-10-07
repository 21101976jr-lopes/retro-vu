import { StreamTransport } from './transport';
import { packPCM } from './pcm';
import { Signaling } from './signaling';
import { readDiagnostic } from './debug';
jest.mock('./signaling', () => ({ Signaling: jest.fn().mockImplementation(() => ({
  poll: jest.fn(), send: jest.fn(), close: jest.fn(),
})) }));
let pcs, nodes, contexts;
function makeContext() {
  const ctx = { sampleRate: 48000, state: 'running', destination: {}, resume: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(), audioWorklet: { addModule: jest.fn().mockResolvedValue() },
    createAnalyser: jest.fn(() => ({ disconnect: jest.fn() })) };
  contexts.push(ctx); return ctx;
}
function channel() {
  return { readyState: 'open', bufferedAmount: 0, send: jest.fn(), close: jest.fn(), ordered: true };
}
beforeEach(() => {
  pcs = []; nodes = []; contexts = [];
  Signaling.mockImplementation(() => ({ poll: jest.fn(), send: jest.fn(), close: jest.fn() }));
  window.RTCPeerConnection = jest.fn(() => {
    const pc = { createDataChannel: jest.fn(() => channel()), close: jest.fn(), connectionState: 'new',
      createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'sdp' }),
      createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'sdp' }),
      setLocalDescription: jest.fn(async value => { pc.localDescription = { ...value, toJSON: () => value }; }),
      setRemoteDescription: jest.fn(async value => { pc.remoteDescription = value; }),
      addIceCandidate: jest.fn().mockResolvedValue() };
    pcs.push(pc); return pc;
  });
  window.AudioContext = jest.fn(makeContext);
  window.AudioWorkletNode = jest.fn(() => {
    const node = { connect: jest.fn(), disconnect: jest.fn(), port: { postMessage: jest.fn(), close: jest.fn() } };
    nodes.push(node); return node;
  });
});
afterEach(() => { delete window.RTCPeerConnection; delete window.AudioWorkletNode; delete window.AudioContext; });
async function sender() {
  const source = { connect: jest.fn(), disconnect: jest.fn() };
  const session = { source, ctx: makeContext(), settings: { sampleRate: 44100, channelCount: 1 } };
  const update = jest.fn(), tx = new StreamTransport('send', session, update);
  await tx.start(); return { tx, session, update };
}
test('sender shares source, uses actual context rate and ordered reliable channel; close preserves local source', async () => {
  const { tx, session } = await sender();
  await tx.onSignal({ peers: [{ id: 'receiver' }], messages: [] });
  expect(pcs[0].createDataChannel).toHaveBeenCalledWith('retro-pcm-v1', { ordered: true });
  expect(session.source.connect).toHaveBeenCalledWith(nodes[0]);
  const peer = tx.peers.get('receiver'); peer.channel.onopen();
  expect(peer.queue).toBeUndefined();
  peer.channel.onmessage({ data: JSON.stringify({ type: 'ready' }) });
  expect(JSON.parse(peer.channel.send.mock.calls[0][0])).toMatchObject({ inputRate: 44100, sampleRate: 48000, channels: 1 });
  tx.onCapture({ type: 'pcm', samples: new Int16Array(960), frames: 960, position: 0 });
  expect(peer.channel.send.mock.calls[1][0]).toBeInstanceOf(ArrayBuffer);
  tx.close(); expect(session.source.disconnect).toHaveBeenCalledWith(nodes[0]);
  expect(session.ctx.close).not.toHaveBeenCalled();
});
test('one disconnected receiver does not destroy another receiver or USB source', async () => {
  const { tx, session } = await sender();
  await tx.onSignal({ peers: [{ id: 'a' }, { id: 'b' }], messages: [] });
  for (const peer of tx.peers.values()) { peer.channel.onopen(); peer.channel.onmessage({ data: JSON.stringify({ type: 'ready' }) }); }
  tx.drop('a', true);
  expect(tx.peers.has('b')).toBe(true); expect(pcs[1].close).not.toHaveBeenCalled();
  expect(session.source.disconnect).not.toHaveBeenCalled();
  expect(session.ctx.close).not.toHaveBeenCalled(); tx.close();
});
test('receiver uses worklet PCM playback and explicit cleanup; STOP remains bounded by worklet', async () => {
  const update = jest.fn(), rx = new StreamTransport('receive', null, update);
  await rx.start();
  const peer = rx.makePeer('tx'); const dc = channel(); rx.bindChannel(peer, dc);
  dc.onmessage({ data: JSON.stringify({ type: 'format', version: 1, channels: 1, sampleRate: 48000, sampleSize: 16 }) });
  await peer.chain;
  const node = peer.playback;
  expect(dc.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ready' }));
  expect(node.connect).toHaveBeenCalledWith(rx.ctx.destination);
  dc.onmessage({ data: packPCM(new Int16Array(960), { channels: 1, sampleRate: 48000, epoch: 1, sequence: 0, position: 0, frames: 960 }) });
  await peer.chain;
  expect(node.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'pcm' }), expect.any(Array));
  node.port.onmessage({ data: { type: 'status', state: 'RECOVERING', seconds: 0.2, underflows: 1 } });
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'RECOVERING', seconds: 0.2 }));
  await rx.togglePlay(); expect(node.port.postMessage).toHaveBeenLastCalledWith({ type: 'play', value: false });
  await rx.togglePlay(); expect(node.port.postMessage).toHaveBeenLastCalledWith({ type: 'play', value: true });
  rx.close(); expect(node.disconnect).toHaveBeenCalled(); expect(contexts[0].close).toHaveBeenCalled();
});
test('closing while worklet loads never attaches a late branch', async () => {
  let resolve;
  const ctx = makeContext(); ctx.audioWorklet.addModule.mockReturnValue(new Promise(done => { resolve = done; }));
  const source = { connect: jest.fn(), disconnect: jest.fn() };
  const tx = new StreamTransport('send', { ctx, source, settings: { channelCount: 1 } }, jest.fn());
  const pending = tx.start(); tx.close(); resolve(); await pending;
  expect(source.connect).not.toHaveBeenCalled();
});

test('production and per-peer accepted rates are 96000 PCM / 97600 packet bytes per second, not duplicated', async () => {
  let now = 1000;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  const { tx } = await sender();
  await tx.onSignal({ peers: [{ id: 'receiver' }], messages: [] });
  const peer = tx.peers.get('receiver'); peer.channel.onopen();
  peer.channel.onmessage({ data: JSON.stringify({ type: 'ready' }) });
  for (let i = 0; i < 100; i++) tx.onCapture({ type: 'pcm', samples: new Int16Array(960), frames: 960,
    generatedFrames: (i + 1) * 960, position: i * 960 });
  now = 3000; tx.reportMetrics();
  const metric = JSON.parse(readDiagnostic()).snapshots.send;
  expect(metric.pcmProducedBps).toBe(96000);
  expect(metric.peers[0].pcmSentBps).toBe(96000);
  expect(metric.peers[0].packetSentBps).toBe(97600);
  expect(metric.peers[0].queue.maxMessageBytes).toBe(1952);
  tx.close(); clock.mockRestore();
});
test('exact closing reason records pre-close ICE, peer state and queue', async () => {
  const { tx } = await sender();
  const peer = tx.makePeer('receiver'), dc = channel(); tx.bindChannel(peer, dc);
  peer.pc.connectionState = 'connected'; peer.pc.iceConnectionState = 'completed';
  peer.pc.close.mockImplementation(() => { peer.pc.connectionState = 'closed'; });
  tx.drop(peer.id, true, 'test-explicit-reason');
  expect(JSON.parse(readDiagnostic()).lastFault).toMatchObject({ type: 'peer-closing', reason: 'test-explicit-reason',
    connectionState: 'connected', iceConnectionState: 'completed', dataChannelState: 'open', bufferedAmount: 0 });
  tx.close();
});
test('ordered resync recovers a skipped interval without closing receiver', async () => {
  const rx = new StreamTransport('receive', null, jest.fn()); await rx.start();
  const peer = rx.makePeer('tx'), dc = channel(); rx.bindChannel(peer, dc);
  dc.onmessage({ data: JSON.stringify({ type: 'format', version: 1, channels: 1, sampleRate: 48000, sampleSize: 16 }) });
  await peer.chain;
  const packet = sequence => packPCM(new Int16Array(960), { channels: 1, sampleRate: 48000, epoch: 2, sequence, position: sequence * 960, frames: 960 });
  dc.onmessage({ data: packet(0) }); await peer.chain;
  dc.onmessage({ data: JSON.stringify({ type: 'resync', reason: 'sender-queue-cap' }) }); await peer.chain;
  dc.onmessage({ data: packet(500) }); await peer.chain;
  expect(peer.playback.port.postMessage).toHaveBeenCalledWith({ type: 'reset' });
  expect(peer.pc.close).not.toHaveBeenCalled(); expect(peer.sequence.next).toBe(501); rx.close();
});

test('pending resume does not prevent signaling, offer/answer, ICE or DataChannel setup', async () => {
 let resumeAudio;
 window.AudioContext.mockImplementation(()=>{const ctx=makeContext();ctx.state='suspended';ctx.resume.mockReturnValue(new Promise(resolve=>{resumeAudio=()=>{ctx.state='running';resolve();};}));return ctx;});
 const rx=new StreamTransport('receive',null,jest.fn(),{invite:'a'.repeat(64)});
 await rx.start();
 expect(rx.signal.poll).toHaveBeenCalledTimes(1);
 await rx.onSignal({peers:[{id:'sender'}],messages:[{from:'sender',type:'description',value:{type:'offer',sdp:'offer'}},{from:'sender',type:'candidate',value:{candidate:'ice'}}]});
 const peer=rx.peers.get('sender');
 expect(peer.pc.createAnswer).toHaveBeenCalled();
 expect(peer.pc.addIceCandidate).toHaveBeenCalledWith({candidate:'ice'});
 const dc=channel();rx.bindChannel(peer,dc);
 dc.onmessage({data:JSON.stringify({type:'format',version:1,channels:1,sampleRate:48000,sampleSize:16})});await peer.chain;
 expect(peer.awaitingReady).toBe(true);
 expect(dc.send).not.toHaveBeenCalled();
 resumeAudio();await Promise.resolve();await Promise.resolve();
 expect(dc.send).toHaveBeenCalledWith(JSON.stringify({type:'ready'}));
 rx.close();
});

test('voice sends an existing media track without a PCM capture or 5 second buffer',async()=>{
 const track={enabled:true},stream={getAudioTracks:()=>[track]},ctx=makeContext();
 const create=window.RTCPeerConnection.getMockImplementation();window.RTCPeerConnection.mockImplementation(()=>{const pc=create();pc.addTrack=jest.fn();return pc;});
 const tx=new StreamTransport('send',{kind:'voice',stream,ctx,settings:{channelCount:1}},jest.fn());await tx.start();await tx.onSignal({peers:[{id:'rx'}],messages:[]});
 const peer=tx.peers.get('rx');expect(peer.pc.addTrack).toHaveBeenCalledWith(track,stream);expect(ctx.audioWorklet.addModule).not.toHaveBeenCalled();expect(nodes).toHaveLength(0);peer.channel.onopen();peer.channel.onmessage({data:JSON.stringify({type:'ready'})});expect(peer.queue).toBeUndefined();expect(tx.capture).toBeUndefined();tx.close();expect(ctx.close).not.toHaveBeenCalled();
});
test('voice receiver uses media source, immediate output gate and a digital REC branch',async()=>{
 const update=jest.fn(),rx=new StreamTransport('receive',null,update);await rx.start();
 const source={connect:jest.fn(),disconnect:jest.fn()},gain={connect:jest.fn(),disconnect:jest.fn(),gain:{value:1,setValueAtTime:jest.fn()}};
 rx.ctx.createMediaStreamSource=jest.fn(()=>source);rx.ctx.createGain=()=>gain;
 const peer=rx.makePeer('tx'),track={kind:'audio',muted:false,getSettings:()=>({channelCount:1})},stream={getAudioTracks:()=>[track]};
 peer.pc.ontrack({track,streams:[stream]});await Promise.resolve();
 expect(rx.recordingSession.source).toBe(source);expect(gain.connect).toHaveBeenCalledWith(rx.ctx.destination);expect(nodes).toHaveLength(0);
 expect(update).toHaveBeenCalledWith(expect.objectContaining({status:'PLAYING',sourceKind:'voice',seconds:0}));
 await rx.togglePlay();expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0,undefined);expect(rx.ctx.close).not.toHaveBeenCalled();rx.close();expect(source.disconnect).toHaveBeenCalled();
});
test('receiver teardown waits for WAV finalization before closing context',async()=>{
 const rx=new StreamTransport('receive',null,jest.fn());await rx.start();const peer=rx.makePeer('tx');await rx.preparePlayback({channels:1,sampleRate:48000,sampleSize:16},peer);
 let done;rx.recordingSession.onEnd.add(()=>new Promise(resolve=>done=resolve));rx.close();expect(rx.ctx.close).not.toHaveBeenCalled();done();await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(rx.ctx.close).toHaveBeenCalled();
});
