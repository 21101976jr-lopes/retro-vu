// Finalized WAVs remain in OPFS. Sidecars commit only after WAV validation.
import { readWavHeader } from './wav';
const folder = () => navigator.storage.getDirectory().then(root => root.getDirectoryHandle('retro-vu-recordings', {create:true}));
export async function commitRecording(id, metadata) {
  const dir = await folder();
  const handle = await dir.getFileHandle(`${id}.json`, {create:true});
  const writer = await handle.createWritable();
  await writer.write(JSON.stringify({...metadata,id})); await writer.close();
}
export async function deleteRecording(id) {
  const dir = await folder();
  await dir.removeEntry(id);
  await dir.removeEntry(`${id}.json`).catch(error => { if(error.name !== 'NotFoundError') throw error; });
}
export async function loadRecordings() {
  if (!navigator.storage?.getDirectory) return [];
  const dir = await folder(), files = [];
  for await (const [key, handle] of dir.entries()) {
    if (!key.endsWith('.wav.json')) continue;
    try {
      const meta = JSON.parse(await (await handle.getFile()).text());
      if (meta.id !== key.slice(0,-5)) continue;
      const raw = await (await dir.getFileHandle(meta.id)).getFile();
      const format = readWavHeader(await raw.slice(0,44).arrayBuffer(),raw.size);
      const blob = new File([raw],meta.name,{type:'audio/wav'});
      files.push({...meta,...format,size:blob.size,type:'audio/wav',blob,url:URL.createObjectURL(blob)});
    } catch { /* Ignore incomplete/uncommitted records, never delete them. */ }
  }
  return files.sort((a,b)=>b.created-a.created);
}
export async function exportRecording(file) {
  if (typeof window.showSaveFilePicker === 'function') {
    const handle = await window.showSaveFilePicker({suggestedName:file.name,startIn:'music',types:[{description:'Áudio WAV',accept:{'audio/wav':['.wav']}}]});
    const writer = await handle.createWritable();
    await file.blob.stream().pipeTo(writer);
    return 'Arquivo exportado: escrita concluída no destino escolhido.';
  }
  const link = document.createElement('a'); link.href=file.url; link.download=file.name;
  document.body.appendChild(link); link.click(); link.remove();
  return 'Download solicitado; conclusão não verificável. Confira Downloads ou o destino escolhido no Chrome. WAV preservado no aplicativo.';
}
