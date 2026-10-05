import { packPCM, unpackPCM, Sequence } from './pcm';
import { SenderQueue } from './flow';
const format = { epoch: 3, sequence: 0, position: 0, sampleRate: 48000, channels: 1, frames: 4 };
test('PCM16 little-endian exact round trip, logical position, stereo-ready header', () => {
  const samples = new Int16Array([-32768, -17, 0, 32767]);
  const packet = unpackPCM(packPCM(samples, format));
  expect(packet).toEqual({ ...format, samples });
  expect(unpackPCM(packPCM(samples, { ...format, channels: 2, frames: 2 })).channels).toBe(2);
});
test('malformed, truncated and unknown protocol PCM is rejected', () => {
  expect(() => unpackPCM(new ArrayBuffer(10))).toThrow();
  const buffer = packPCM(new Int16Array(4), format);
  new DataView(buffer).setUint16(4, 9);
  expect(() => unpackPCM(buffer)).toThrow();
});
test('sequence detects loss, reorder, position and format changes; new epoch permits reset', () => {
  const sequence = new Sequence();
  sequence.accept(format);
  sequence.accept({ ...format, sequence: 1, position: 4 });
  expect(() => sequence.accept({ ...format, sequence: 3, position: 8 })).toThrow();
  expect(() => sequence.accept({ ...format, sequence: 2, position: 9 })).toThrow();
  expect(() => sequence.accept({ ...format, sequence: 2, position: 8, sampleRate: 44100 })).toThrow();
  expect(() => sequence.accept({ ...format, epoch: 4 })).not.toThrow();
});
test('backpressure queues bounded PCM, resumes at low water, keeps bounded queue without closing a congested peer', () => {
  const channel = { readyState: 'open', bufferedAmount: 300000, send: jest.fn() }, overflow = jest.fn();
  const queue = new SenderQueue(channel, overflow);
  const packet = new ArrayBuffer(2000);
  queue.push(packet);
  expect(channel.send).not.toHaveBeenCalled();
  channel.bufferedAmount = 0; channel.onbufferedamountlow();
  expect(channel.send).toHaveBeenCalledWith(packet);
  expect(queue.bytes).toBe(0);
  channel.bufferedAmount = 300000;
  for (let i = 0; i < 600; i++) queue.push(packet);
  expect(overflow).not.toHaveBeenCalled();
  expect(queue.droppedBytes).toBeGreaterThan(0);
  expect(queue.bytes).toBeLessThanOrEqual(1024 * 1024);
  queue.close(); expect(queue.bytes).toBe(0);
});
