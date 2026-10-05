export function readWavHeader(buffer, size) {
  const v = new DataView(buffer);
  const text = (at, n) => Array.from({length:n}, (_, i) => String.fromCharCode(v.getUint8(at + i))).join('');
  if (buffer.byteLength < 44 || text(0,4) !== 'RIFF' || text(8,4) !== 'WAVE' || text(12,4) !== 'fmt ' ||
      text(36,4) !== 'data' || v.getUint32(16,true) !== 16 || v.getUint16(20,true) !== 1 || v.getUint16(34,true) !== 16)
    throw new Error('Cabeçalho WAV PCM16 inválido');
  const channels = v.getUint16(22,true), rate = v.getUint32(24,true), bytes = v.getUint32(40,true);
  if (![1,2].includes(channels) || rate < 8000 || rate > 192000 || !bytes || bytes % (channels * 2) ||
      v.getUint16(32,true) !== channels * 2 || v.getUint32(28,true) !== rate * channels * 2 ||
      size !== bytes + 44 || v.getUint32(4,true) !== bytes + 36) throw new Error('Tamanho/formato WAV inconsistente');
  return { channels, rate, bytes, frames:bytes / (channels * 2), seconds: bytes / (rate * channels * 2) };
}
export async function validateWav(file, decode) {
  const header = await file.slice(0,44).arrayBuffer();
  const format = readWavHeader(header, file.size);
  // Decode first and last <=1 s, not an entire LP into Float32 memory.
  const length = Math.min(format.bytes, format.rate * format.channels * 2);
  for (const offset of new Set([44, file.size - length])) {
    const h = header.slice(0); const v = new DataView(h);
    v.setUint32(4,length + 36,true); v.setUint32(40,length,true);
    const sample = await new Blob([h,file.slice(offset,offset + length)]).arrayBuffer();
    const decoded = await decode(sample, format);
    if (decoded.numberOfChannels !== format.channels || decoded.sampleRate !== format.rate ||
        decoded.length !== length / (format.channels * 2)) throw new Error('Falha na decodificação WAV');
  }
  return format;
}
export function wavName(date = new Date()) {
  const pad = n => String(n).padStart(2,'0');
  return `Retro-VU-${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.wav`;
}
