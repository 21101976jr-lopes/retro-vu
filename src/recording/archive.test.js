import {commitRecording,loadRecordings,deleteRecording,exportRecording} from './archive';
import {readWavHeader} from './wav';
jest.mock('./wav',()=>({readWavHeader:jest.fn(()=>({rate:48000,channels:1,seconds:1}))}));
let entries;
beforeEach(()=>{
 entries=new Map();
 const dir={
  getFileHandle:async(name,options)=>{
   if(!entries.has(name)&&!options?.create)throw new Error('missing');
   return {createWritable:async()=>{let text;return {write:async value=>{text=value;},close:async()=>entries.set(name,{text:async()=>text})};},getFile:async()=>entries.get(name)};
  },
  entries:async function*(){for(const [name,file] of entries)yield [name,{getFile:async()=>file}];},
  removeEntry:jest.fn(async name=>entries.delete(name))
 };
 Object.defineProperty(navigator,'storage',{configurable:true,value:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}});
 URL.createObjectURL=jest.fn(()=> 'blob:restored');delete window.showSaveFilePicker;
});
test('committed records recover after reload; two files never overwrite and discard affects only selected file',async()=>{
 for(const id of ['rec-1.wav','rec-2.wav']){
  entries.set(id,{size:96044,slice:()=>({arrayBuffer:async()=>new ArrayBuffer(44)})});
  await commitRecording(id,{name:`Retro-VU-${id}`,created:id==='rec-1.wav'?1:2});
 }
 const restored=await loadRecordings();expect(restored).toHaveLength(2);expect(restored[0].id).toBe('rec-2.wav');
 expect(restored[0].type).toBe('audio/wav');expect(readWavHeader).toHaveBeenCalled();
 await deleteRecording('rec-2.wav');expect(await loadRecordings()).toHaveLength(1);
 expect(entries.has('rec-1.wav')).toBe(true);
});
test('download request never claims completion or removes OPFS file',async()=>{
 const click=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 entries.set('rec.wav',{});
 expect(await exportRecording({url:'blob:test',name:'test.wav'})).toMatch(/conclusão não verificável/);
 expect(click).toHaveBeenCalled();expect(entries.has('rec.wav')).toBe(true);click.mockRestore();
});
test('cancelled export preserves archive; explicit writer completion is required for success',async()=>{
 window.showSaveFilePicker=jest.fn().mockRejectedValue(new DOMException('cancel','AbortError'));
 entries.set('rec.wav',{});
 await expect(exportRecording({name:'test.wav'})).rejects.toHaveProperty('name','AbortError');expect(entries.has('rec.wav')).toBe(true);
 let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const pipeTo=jest.fn(()=>pending);
 window.showSaveFilePicker.mockResolvedValue({createWritable:async()=>({})});
 let complete=false;const job=exportRecording({name:'test.wav',blob:{stream:()=>({pipeTo})}}).then(value=>{complete=true;return value;});
 await Promise.resolve();await Promise.resolve();expect(complete).toBe(false);finish();
 await expect(job).resolves.toMatch(/escrita concluída/);
});
