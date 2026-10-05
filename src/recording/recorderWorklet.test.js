const fs=require('fs'),vm=require('vm'),path=require('path');
function make(channels=1){
 const box={module:{exports:{}},sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:jest.fn()};}}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../public/recording/pcm-recorder.js'),'utf8'),box);
 return new box.module.exports.PCMRecorder({processorOptions:{channels}});
}
test('mono samples are PCM16 LE, stop includes partial final block without padding or duplication',()=>{
 const r=make();r.process([[new Float32Array([-1,0,0.5,1])]]);r.port.onmessage({data:{type:'stop'}});
 const data=r.port.postMessage.mock.calls.map(([x])=>x),pcm=data.find(x=>x.type==='pcm');
 expect(pcm.frames).toBe(4);expect(pcm.buffer.byteLength).toBe(8);
 const v=new DataView(pcm.buffer);expect([0,1,2,3].map(i=>v.getInt16(i*2,true))).toEqual([-32768,0,16384,32767]);
 expect(data.at(-1).type).toBe('stopped');r.process([[new Float32Array(128)]]);expect(r.sequence).toBe(1);
});
test('stereo preserves distinct interleaved channels',()=>{
 const r=make(2);r.process([[new Float32Array([1,0]),new Float32Array([-1,0.5])]]);r.stop();
 const v=new DataView(r.port.postMessage.mock.calls.find(([x])=>x.type==='pcm')[0].buffer);
 expect([0,1,2,3].map(i=>v.getInt16(i*2,true))).toEqual([32767,-32768,0,16384]);
});
test('writer stalls cannot cause unlimited worklet or MessagePort queues; recovery drains ordered prefix',()=>{
 const r=make();for(let i=0;i<1500;i++)r.process([[new Float32Array(128)]]);
 expect(r.stopping).toBe(true);expect(r.queue.length).toBeLessThanOrEqual(r.maxBlocks);
 expect(r.port.postMessage.mock.calls.filter(([x])=>x.type==='pcm')).toHaveLength(4);
 for(let i=0;i<30;i++)r.port.onmessage({data:{type:'credit'}});
 const data=r.port.postMessage.mock.calls.map(([x])=>x);const pcm=data.filter(x=>x.type==='pcm');
 expect(pcm.map(x=>x.sequence)).toEqual(pcm.map((_,i)=>i));expect(data.at(-1).type).toBe('stopped');expect(data.at(-1).warning).toMatch(/atrasada/);
});
