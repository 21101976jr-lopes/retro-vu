/* global globalThis */
// Disk-backed PCM16 writer. Runs only in a dedicated Worker, never on the audio thread.
function wavHeader(rate, channels, bytes) {
  if (!Number.isInteger(rate) || rate < 8000 || rate > 192000 || ![1, 2].includes(channels) ||
      !Number.isInteger(bytes) || bytes < 0 || bytes % (channels * 2) || bytes > 0xffffffff - 36) throw new Error('Formato WAV inválido');
  const buffer = new ArrayBuffer(44), v = new DataView(buffer);
  const text = (at, value) => [...value].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, bytes + 36, true); text(8, 'WAVE'); text(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, bytes, true); return buffer;
}
function writeAll(handle, buffer, at) {
  const bytes = new Uint8Array(buffer); let offset = 0;
  while (offset < bytes.length) {
    const count = handle.write(bytes.subarray(offset), { at: at + offset });
    if (!Number.isInteger(count) || count <= 0) throw new Error('Falha de escrita local');
    offset += count;
  }
}
class WavWriter {
  constructor(handle, rate, channels, limit) {
    this.handle = handle; this.rate = rate; this.channels = channels; this.limit = limit;
    this.bytes = 0; this.sequence = 0; this.warning = ''; this.checkpoint = 0;
    handle.truncate(0); writeAll(handle, wavHeader(rate, channels, 0), 0);
  }
  append(data) {
    if (this.warning) return;
    if (data.sequence !== this.sequence || data.buffer.byteLength !== data.frames * this.channels * 2)
      throw new Error('Sequência PCM inválida no REC');
    if (this.bytes + data.buffer.byteLength > this.limit) { this.warning = 'Limite de armazenamento atingido; WAV parcial finalizado.'; return; }
    try { writeAll(this.handle, data.buffer, 44 + this.bytes); }
    catch (error) { this.warning = `Escrita interrompida (${error.name}): arquivo parcial. Libere espaço.`; return; }
    this.sequence++; this.bytes += data.buffer.byteLength;
    if (this.bytes - this.checkpoint >= 1048576) { this.handle.flush(); this.checkpoint = this.bytes; }
  }
  finish() {
    this.handle.truncate(44 + this.bytes);
    writeAll(this.handle, wavHeader(this.rate, this.channels, this.bytes), 0);
    this.handle.flush(); this.handle.close(); this.handle = null;
  }
}
if (typeof module !== 'undefined') module.exports = { wavHeader, writeAll, WavWriter };
if (typeof WorkerGlobalScope !== 'undefined') {
  let writer, fileHandle, directory, name;
  globalThis.onmessage = async ({ data }) => {
    try {
      if (data.type === 'init') {
        name = data.name;
        const root = await navigator.storage.getDirectory();
        directory = await root.getDirectoryHandle('retro-vu-recordings', { create: true });
        fileHandle = await directory.getFileHandle(name, { create: true });
        const handle = await fileHandle.createSyncAccessHandle();
        writer = new WavWriter(handle, data.rate, data.channels, data.limit);
        globalThis.postMessage({ type: 'ready' });
      } else if (data.type === 'pcm') {
        writer.append(data);
        globalThis.postMessage({ type: 'ack', frames: writer.bytes / (writer.channels * 2), warning: writer.warning });
      } else if (data.type === 'finish') {
        writer.finish();
        const file = await fileHandle.getFile();
        globalThis.postMessage({ type: 'file', file, warning: writer.warning });
      }
    } catch (error) {
      try { writer?.handle?.close(); } catch { /* Best effort after storage failure. */ }
      globalThis.postMessage({ type: 'error', message: `${error.name}: ${error.message}` });
    }
  };
}
