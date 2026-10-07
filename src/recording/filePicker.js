// Audio MIME filters keep Android away from photo/video capture choices.
export const AUDIO_TYPES = [{description:'Áudio — MP3, M4A, WAV, FLAC, AAC, WebM',accept:{
  'audio/mpeg':['.mp3'],'audio/mp4':['.m4a'],'audio/wav':['.wav'],
  'audio/flac':['.flac'],'audio/aac':['.aac'],'audio/webm':['.webm']
}}];
export async function openAudioFile(input, onChange) {
  if(typeof window.showOpenFilePicker !== 'function'){input?.click();return;}
  try {
    const handles=await window.showOpenFilePicker({id:'retro-vu-audio',startIn:'music',multiple:true,types:AUDIO_TYPES});
    const files=await Promise.all(handles.map(handle=>handle.getFile()));
    onChange({target:{files,value:''}});
  } catch(error) {if(error.name!=='AbortError')input?.click();}
}

export async function openAudioFolder(input,onChange){
 if(!window.showDirectoryPicker){await openAudioFile(input,onChange);return;}
 try{const dir=await window.showDirectoryPicker({startIn:'music'}),files=[];
 for await(const handle of dir.values())if(handle.kind==='file'&&/\.(mp3|m4a|wav|flac|aac|webm)$/i.test(handle.name))files.push(await handle.getFile());
 files.sort((a,b)=>a.name.localeCompare(b.name));if(files.length)onChange({target:{files,value:''}});
 }catch(error){if(error.name!=='AbortError')await openAudioFile(input,onChange);}
}
