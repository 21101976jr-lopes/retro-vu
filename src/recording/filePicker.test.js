import {openAudioFile,openAudioFolder,AUDIO_TYPES} from './filePicker';
test('folder walks subfolders once and preserves different files with the same name',async()=>{
 const a=new File(['a'],'song.wav'),b=new File(['bb'],'song.wav');
 const child={kind:'directory',name:'LP',async *values(){yield {kind:'file',name:b.name,getFile:async()=>b};}};
 window.showDirectoryPicker=jest.fn().mockResolvedValue({async *values(){yield {kind:'file',name:a.name,getFile:async()=>a};yield child;yield child;}});
 const change=jest.fn();await openAudioFolder(null,change);
 expect(change.mock.calls[0][0].target.files).toEqual([a,b]);
});
afterEach(()=>{delete window.showOpenFilePicker;delete window.showDirectoryPicker;});

test('folder automatically loads audio and handles empty, denied and cancelled choices without another prompt',async()=>{
 const file=new File(['pcm'],'test.wav'),change=jest.fn(),status=jest.fn(),input={click:jest.fn()};
 window.showDirectoryPicker=jest.fn().mockResolvedValue({async *values(){yield {kind:'file',name:file.name,getFile:async()=>file};yield {kind:'file',name:'photo.jpg'};}});
 await openAudioFolder(input,change,status);expect(change).toHaveBeenCalledWith({target:{files:[file],value:''}});
 window.showDirectoryPicker.mockResolvedValue({async *values(){}});await openAudioFolder(input,change,status);expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Nenhum áudio'));
 window.showDirectoryPicker.mockRejectedValue(new DOMException('denied','NotAllowedError'));await openAudioFolder(input,change,status);expect(status).toHaveBeenLastCalledWith(expect.stringContaining('não autorizada'));expect(input.click).not.toHaveBeenCalled();
 window.showDirectoryPicker.mockRejectedValue(new DOMException('cancel','AbortError'));await openAudioFolder(input,change,status);expect(status).toHaveBeenLastCalledWith('');
 delete window.showDirectoryPicker;await openAudioFolder(input,change,status);expect(input.click).toHaveBeenCalledTimes(1);
});
test.each(['wav','webm'])('audio document picker imports %s without camera capture',async ext=>{
 const file=new File(['audio'],`test.${ext}`,{type:`audio/${ext}`}),change=jest.fn();
 window.showOpenFilePicker=jest.fn().mockResolvedValue([{getFile:async()=>file}]);
 await openAudioFile(null,change);
 expect(window.showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({startIn:'music',types:AUDIO_TYPES}));
 expect(change).toHaveBeenCalledWith({target:{files:[file],value:''}});
});
test('unsupported API uses existing audio input; cancellation does not open another chooser',async()=>{
 const input={click:jest.fn()};await openAudioFile(input,jest.fn());expect(input.click).toHaveBeenCalledTimes(1);
 window.showOpenFilePicker=jest.fn().mockRejectedValue(new DOMException('cancel','AbortError'));
 await openAudioFile(input,jest.fn());expect(input.click).toHaveBeenCalledTimes(1);
});

test('multi-file selection preserves ordered local files',async()=>{const files=[new File(['a'],'a.wav'),new File(['b'],'b.webm')],change=jest.fn();window.showOpenFilePicker=jest.fn().mockResolvedValue(files.map(file=>({getFile:async()=>file})));await openAudioFile(null,change);expect(window.showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({multiple:true}));expect(change.mock.calls[0][0].target.files).toEqual(files);});
