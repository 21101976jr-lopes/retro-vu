import {act,renderHook,waitFor} from '@testing-library/react';
import useStreamRecorder from './useStreamRecorder';
import {loadRecordings,deleteRecording,exportRecording} from './recording/archive';
import {WavRecorder} from './recording/WavRecorder';
jest.mock('./recording/WavRecorder');
jest.mock('./recording/archive',()=>({loadRecordings:jest.fn().mockResolvedValue([]),deleteRecording:jest.fn().mockResolvedValue(),exportRecording:jest.fn().mockResolvedValue('Download solicitado; não confirmado')}));
let source,recorder,update;
beforeEach(()=>{
 loadRecordings.mockResolvedValue([]);deleteRecording.mockResolvedValue();exportRecording.mockResolvedValue('Download solicitado; não confirmado');
 source={ready:true,stream:{getAudioTracks:()=>[{readyState:'live'}]}};
 WavRecorder.mockImplementation((session,callback)=>{
 update=callback;recorder={session,start:jest.fn(async()=>callback({status:'recording'})),stop:jest.fn(async()=>callback({status:'finalizing'})),dispose:jest.fn(),fail:jest.fn()};return recorder;
 });
 URL.createObjectURL=jest.fn();URL.revokeObjectURL=jest.fn();
});
afterEach(()=>jest.clearAllMocks());
test('uses existing session and keeps file unavailable until writer validation completes',async()=>{
 const {result}=renderHook(()=>useStreamRecorder(source));
 await act(async()=>result.current.toggle());expect(WavRecorder).toHaveBeenCalledWith(source,expect.any(Function));
 expect(result.current.status).toBe('recording');await act(async()=>result.current.toggle());
 expect(result.current.status).toBe('finalizing');expect(result.current.file).toBeNull();
 const file={id:'rec.wav',url:'blob:wav',name:'test.wav',dispose:jest.fn()};await act(async()=>update({status:'available',file}));
 expect(result.current.file).toBe(file);await act(async()=>result.current.discard());expect(file.dispose).not.toHaveBeenCalled();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:wav');
});
test('no source reports error without opening any capture',()=>{
 const {result}=renderHook(()=>useStreamRecorder(null));act(()=>result.current.toggle());expect(result.current.status).toBe('error');expect(WavRecorder).not.toHaveBeenCalled();
});
test('same session rerender preserves REC; removing session stops writer; unmount disposes',async()=>{
 const {result,rerender,unmount}=renderHook(({session})=>useStreamRecorder(session),{initialProps:{session:source}});
 await act(async()=>result.current.toggle());rerender({session:source});expect(recorder.stop).not.toHaveBeenCalled();
 rerender({session:null});expect(recorder.stop).toHaveBeenCalledTimes(1);unmount();expect(recorder.dispose).toHaveBeenCalled();
});
test('storage/validation failure is error, never an available file',async()=>{
 const {result}=renderHook(()=>useStreamRecorder(source));await act(async()=>result.current.toggle());
 act(()=>update({status:'error',file:null,message:'Falha WAV'}));expect(result.current.status).toBe('error');expect(result.current.file).toBeNull();
});

test('recover pending WAV without deleting on unmount; new REC preserves prior recording',async()=>{
 const previous={id:'old.wav',url:'blob:old',name:'old.wav'};
 loadRecordings.mockResolvedValue([previous]);
 const {result,unmount}=renderHook(()=>useStreamRecorder(source));
 await waitFor(()=>expect(result.current.file).toBe(previous));
 await act(async()=>result.current.toggle());
 const fresh={id:'new.wav',url:'blob:new',name:'new.wav'};
 await act(async()=>update({status:'available',file:fresh}));
 expect(result.current.files.map(f=>f.id)).toEqual(['new.wav','old.wav']);
 expect(exportRecording).not.toHaveBeenCalled();
 exportRecording.mockRejectedValue(new DOMException('cancel','AbortError'));
 await act(async()=>result.current.exportFile());
 expect(result.current.message).toMatch(/cancelada.*preservado/);
 expect(result.current.files).toHaveLength(2);
 act(()=>result.current.select('old.wav'));expect(result.current.file).toBe(previous);
 unmount();expect(deleteRecording).not.toHaveBeenCalled();
});
