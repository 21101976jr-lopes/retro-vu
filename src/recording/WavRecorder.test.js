import {WavRecorder} from './WavRecorder';
import {validateWav} from './wav';
jest.mock('./archive',()=>({commitRecording:jest.fn().mockResolvedValue()}));
jest.mock('./wav',()=>({validateWav:jest.fn(),wavName:()=> 'Retro-VU-test.wav'}));
let worker,node,session,remove;
beforeEach(()=>{
 remove=jest.fn().mockResolvedValue();
 Object.defineProperty(navigator,'storage',{configurable:true,value:{estimate:async()=>({quota:1e9,usage:0}),getDirectory:async()=>({getDirectoryHandle:async()=>({removeEntry:remove})})}});
 Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=> 'test'}});
 window.Worker=class{constructor(){worker=this;}terminate=jest.fn();postMessage=jest.fn(data=>{if(data.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));});};
 window.AudioWorkletNode=class{constructor(){node=this;this.port={postMessage:jest.fn(),close:jest.fn()};}connect=jest.fn();disconnect=jest.fn();};
 window.OfflineAudioContext=class{};
 URL.createObjectURL=jest.fn(()=> 'blob:wav');
 session={ctx:{state:'running',sampleRate:44100,audioWorklet:{addModule:jest.fn().mockResolvedValue()},destination:{},addEventListener:jest.fn(),removeEventListener:jest.fn()},
 settings:{channelCount:1,sampleRate:48000},source:{connect:jest.fn(),disconnect:jest.fn()},stream:{getAudioTracks:()=>[{addEventListener:jest.fn(),removeEventListener:jest.fn()}]}};
 validateWav.mockResolvedValue({seconds:1,rate:44100,channels:1});
});
afterEach(()=>jest.clearAllMocks());
test('same source/context, actual PCM rate, ordered finalization and validation before available',async()=>{
 const update=jest.fn(),r=new WavRecorder(session,update);await r.start();
 expect(session.source.connect).toHaveBeenCalledWith(node);
 expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'init',rate:44100,channels:1}));
 expect(update).toHaveBeenCalledWith(expect.objectContaining({status:'recording'}));
 const buffer=new ArrayBuffer(8);node.port.onmessage({data:{type:'pcm',buffer,frames:4,sequence:0}});
 expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:'pcm'}),[buffer]);
 const done=r.stop();await Promise.resolve();expect(node.port.postMessage).toHaveBeenCalledWith({type:'stop'});
 expect(worker.postMessage.mock.calls.some(([x])=>x.type==='finish')).toBe(false);
 node.port.onmessage({data:{type:'stopped'}});
 expect(worker.postMessage).toHaveBeenLastCalledWith({type:'finish'});
 expect(session.source.disconnect).toHaveBeenCalledWith(node);
 worker.onmessage({data:{type:'file',file:new Blob(['wav'])}});
 const file=await done;expect(validateWav).toHaveBeenCalled();expect(file.type).toBe('audio/wav');expect(file.name).toMatch(/\.wav$/);
 expect(update).toHaveBeenLastCalledWith(expect.objectContaining({status:'available'}));file.dispose();
});
test('decoder rejection never announces success and releases worker',async()=>{
 validateWav.mockRejectedValue(new Error('Invalid PCM'));
 const update=jest.fn(),r=new WavRecorder(session,update);await r.start();
 const done=r.stop();await Promise.resolve();node.port.onmessage({data:{type:'stopped'}});
 worker.onmessage({data:{type:'file',file:new Blob(['bad'])}});
 await expect(done).rejects.toThrow('Invalid PCM');expect(worker.terminate).toHaveBeenCalled();
 expect(update.mock.calls.some(([x])=>x.status==='available')).toBe(false);
});
test('storage unsupported or insufficient space cannot silently fall back to unbounded RAM',async()=>{
 const update=jest.fn();Object.defineProperty(navigator,'storage',{configurable:true,value:{}});
 const r=new WavRecorder(session,update);await expect(r.start()).rejects.toThrow(/OPFS/);r.dispose();
});

test('receiver PCM node records without a MediaStream and finalizes on session disconnect',async()=>{
 delete session.stream;session.onEnd=new Set();const update=jest.fn(),r=new WavRecorder(session,update);await r.start();expect(session.onEnd.size).toBe(1);expect(session.source.connect).toHaveBeenCalledWith(node);
 const done=[...session.onEnd][0]();await Promise.resolve();expect(node.port.postMessage).toHaveBeenCalledWith({type:'stop'});node.port.onmessage({data:{type:'stopped'}});worker.onmessage({data:{type:'file',file:new Blob(['wav'])}});await done;
 expect(update).toHaveBeenLastCalledWith(expect.objectContaining({status:'available',message:expect.stringContaining('Fonte encerrada')}));expect(session.onEnd.size).toBe(0);
});
