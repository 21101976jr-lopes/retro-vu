import {openAudioFile,AUDIO_TYPES} from './filePicker';
afterEach(()=>delete window.showOpenFilePicker);
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
