import { readWavHeader, validateWav, wavName } from './wav';
const fs = require('fs'), vm = require('vm'), path = require('path');
const { Blob: NodeBlob } = require('buffer');
const box = {module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../public/recording/wav-writer.js'),'utf8'),box);
const {wavHeader,writeAll,WavWriter}=box.module.exports;
test.each([[48000,1],[44100,1],[48000,2]])('PCM16 WAV header, duration and format %i Hz/%i channels', (rate,channels)=>{
 const bytes=rate*channels*2*3, header=wavHeader(rate,channels,bytes), v=new DataView(header);
 expect(readWavHeader(header,44+bytes)).toEqual({rate,channels,bytes,frames:rate*3,seconds:3});
 expect(v.getUint16(20,true)).toBe(1); expect(v.getUint16(34,true)).toBe(16);
 expect(v.getUint32(28,true)).toBe(rate*channels*2);
 expect(()=>readWavHeader(header,43+bytes)).toThrow();
});
test('writer handles partial disk writes, sequence and final size without retaining audio',()=>{
 const disk=new Uint8Array(1000); let size=0;
 const handle={truncate:n=>{size=n;},write:(buffer,{at})=>{const n=Math.min(7,buffer.length);disk.set(buffer.subarray(0,n),at);size=Math.max(size,at+n);return n;},flush:jest.fn(),close:jest.fn()};
 const writer=new WavWriter(handle,48000,1,1000);
 const pcm=new ArrayBuffer(8);const v=new DataView(pcm);[-32768,0,16384,32767].forEach((x,i)=>v.setInt16(i*2,x,true));
 writer.append({buffer:pcm,frames:4,sequence:0});
 expect(()=>writer.append({buffer:pcm,frames:4,sequence:5})).toThrow();
 writer.finish();expect(size).toBe(52);expect([...disk.slice(44,52)]).toEqual([...new Uint8Array(pcm)]);
 expect(readWavHeader(disk.slice(0,44).buffer,size).frames).toBe(4);expect(handle.close).toHaveBeenCalled();
 expect(()=>writeAll({write:()=>0},pcm,0)).toThrow();
});
test('45 minute mono LP uses sequential disk writes with constant JS storage',()=>{
 let size=0,head;
 const handle={truncate:n=>{size=n;},write:(b,{at})=>{if(!at)head=b.slice().buffer;size=Math.max(size,at+b.length);return b.length;},flush:()=>{},close:()=>{}};
 const writer=new WavWriter(handle,48000,1,2**31-44), block=new ArrayBuffer(48000*2);
 for(let sequence=0;sequence<2700;sequence++) writer.append({sequence,frames:48000,buffer:block});
 writer.finish();expect(size).toBe(259200044);expect(readWavHeader(head,size).seconds).toBe(2700);
 expect(writer.bytes).toBe(259200000);expect(writer.queue).toBeUndefined();expect(writer.chunks).toBeUndefined();
});
test('quota/cap failure preserves only complete frames and yields explicit partial warning',()=>{
 let size=0,header;
 const h={truncate:n=>{size=n;},write:(b,{at})=>{if(!at)header=b.slice().buffer;return b.length;},flush:()=>{},close:()=>{}};
 const writer=new WavWriter(h,48000,1,8);
 writer.append({sequence:0,frames:4,buffer:new ArrayBuffer(8)});
 writer.append({sequence:1,frames:4,buffer:new ArrayBuffer(8)});writer.finish();
 expect(writer.warning).toMatch(/Limite/);expect(size).toBe(52);expect(readWavHeader(header,size).frames).toBe(4);
});
test('validation decodes both ends in <=1s slices, checks channels/rate/frames and rejects decoder errors',async()=>{
 const original=global.Blob;global.Blob=NodeBlob;
 try {
 const file=new NodeBlob([wavHeader(48000,1,192000),new Uint8Array(192000)]);
 const decode=jest.fn(async(buffer,format)=>({numberOfChannels:format.channels,sampleRate:format.rate,length:(buffer.byteLength-44)/2}));
 expect((await validateWav(file,decode)).seconds).toBe(2);expect(decode).toHaveBeenCalledTimes(2);
 expect(decode.mock.calls.every(([buffer])=>buffer.byteLength<=96044)).toBe(true);
 await expect(validateWav(file,async()=>{throw new Error('decode failed');})).rejects.toThrow('decode failed');
 } finally {global.Blob=original;}
});
test('filename is local calendar/time and WAV extension',()=>{
 expect(wavName(new Date(2026,9,3,15,30,0))).toBe('Retro-VU-2026-10-03-153000.wav');
});
