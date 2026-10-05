// Audio MIME filters keep Android away from photo/video capture choices.
export const AUDIO_TYPES = [{description:'Áudio — MP3, M4A, WAV, FLAC, AAC, WebM',accept:{
  'audio/mpeg':['.mp3'],'audio/mp4':['.m4a'],'audio/wav':['.wav'],
  'audio/flac':['.flac'],'audio/aac':['.aac'],'audio/webm':['.webm']
}}];
export async function openAudioFile(input, onChange) {
  if(typeof window.showOpenFilePicker !== 'function'){input?.click();return;}
  try {
    const [handle]=await window.showOpenFilePicker({id:'retro-vu-audio',startIn:'music',multiple:false,types:AUDIO_TYPES});
    const file=await handle.getFile();
    onChange({target:{files:[file],value:''}});
  } catch(error) {if(error.name!=='AbortError')input?.click();}
}
