export const HEADER = 32;
export const PROTOCOL = 1;
export function packPCM(samples, { epoch, sequence, position, sampleRate, channels, frames }) {
  if (!(samples instanceof Int16Array) || samples.length !== frames * channels) throw new Error('PCM size');
  const buffer = new ArrayBuffer(HEADER + samples.byteLength), v = new DataView(buffer);
  v.setUint32(0, 0x52565531); v.setUint16(4, PROTOCOL); v.setUint16(6, channels);
  v.setUint32(8, epoch); v.setUint32(12, sequence); v.setUint32(16, sampleRate);
  v.setUint32(20, frames); v.setFloat64(24, position);
  for (let i = 0; i < samples.length; i++) v.setInt16(HEADER + i * 2, samples[i], true);
  return buffer;
}
export function unpackPCM(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < HEADER) throw new Error('PCM header');
  const v = new DataView(buffer);
  const packet = { epoch: v.getUint32(8), sequence: v.getUint32(12), sampleRate: v.getUint32(16),
    channels: v.getUint16(6), frames: v.getUint32(20), position: v.getFloat64(24) };
  if (v.getUint32(0) !== 0x52565531 || v.getUint16(4) !== PROTOCOL ||
      ![1, 2].includes(packet.channels) || packet.sampleRate < 8000 || packet.sampleRate > 192000 ||
      packet.frames < 1 || packet.frames > 8192 || !Number.isSafeInteger(packet.position) ||
      packet.position < 0 || buffer.byteLength !== HEADER + packet.frames * packet.channels * 2)
    throw new Error('PCM invalid');
  packet.samples = new Int16Array(packet.frames * packet.channels);
  for (let i = 0; i < packet.samples.length; i++) packet.samples[i] = v.getInt16(HEADER + i * 2, true);
  return packet;
}
export class Sequence {
  accept(p) {
    if (this.epoch !== p.epoch) {
      this.epoch = p.epoch; this.rate = p.sampleRate; this.channels = p.channels;
    } else if (p.sequence !== this.next || p.position !== this.position ||
        p.sampleRate !== this.rate || p.channels !== this.channels) throw new Error('PCM sequence/format');
    this.next = (p.sequence + 1) >>> 0; this.position = p.position + p.frames;
  }
}
