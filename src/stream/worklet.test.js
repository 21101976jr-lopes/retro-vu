const fs = require('fs');
const vm = require('vm');
const path = require('path');
const sandbox = { module: { exports: {} }, sampleRate: 48000, AudioWorkletProcessor: class {
  constructor() { this.port = { postMessage: jest.fn() }; }
} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../public/stream/pcm-worklet.js'), 'utf8'), sandbox);
const { PCMBuffer, CapturePCM } = sandbox.module.exports;
test('real buffer duration, threshold, silence, underflow and recovery use actual queued frames', () => {
  const buffer = new PCMBuffer(1000, 1), output = [new Float32Array(100)];
  buffer.push(new Int16Array(4900).fill(16000));
  buffer.render(output);
  expect(output[0].every(x => x === 0)).toBe(true);
  expect(buffer.length / buffer.rate).toBe(4.9);
  buffer.push(new Int16Array(100).fill(16000)); buffer.render(output);
  expect(buffer.state).toBe('PLAYING');
  expect(output[0][99]).toBeCloseTo(16000 / 32768);
  for (let i = 0; i < 49; i++) buffer.render(output);
  expect(buffer.state).toBe('RECOVERING');
  buffer.render(output); expect(output[0].every(x => x === 0)).toBe(true);
  buffer.push(new Int16Array(5000).fill(4000)); buffer.render(output);
  expect(buffer.state).toBe('PLAYING'); expect(buffer.underflows).toBe(1);
});
test('STOP keeps only five seconds of recent audio and PLAY waits for its threshold', () => {
  const buffer = new PCMBuffer(1000, 1); buffer.play = false;
  for (let i = 0; i < 100; i++) buffer.push(new Int16Array(1000).fill(i));
  expect(buffer.length).toBe(5000);
  const out = [new Float32Array(100)]; buffer.render(out);
  expect(out[0].every(x => x === 0)).toBe(true);
  buffer.play = true; buffer.render(out); expect(buffer.state).toBe('PLAYING');
});
test('overflow is explicit and stereo channels stay independent', () => {
  const b = new PCMBuffer(1000, 2);
  expect(b.push(new Int16Array(32000))).toBe(false);
  const input = new Int16Array(10000);
  for (let i = 0; i < input.length; i += 2) { input[i] = 32000; input[i + 1] = -16000; }
  b.push(input); const output = [new Float32Array(100), new Float32Array(100)]; b.render(output);
  expect(output[0][99]).toBeCloseTo(32000 / 32768); expect(output[1][99]).toBeCloseTo(-16000 / 32768);
});
test('capture quantizes actual input in 20ms blocks with bounded MessagePort credits', () => {
  const capture = new CapturePCM({ processorOptions: { channels: 1 } });
  capture.port.onmessage({ data: { type: 'enable', enabled: true } });
  for (let i = 0; i < 40; i++) capture.process([[new Float32Array(128).fill(0.5)]]);
  const blocks = capture.port.postMessage.mock.calls.map(([x]) => x).filter(x => x.type === 'pcm');
  expect(blocks).toHaveLength(4); expect(blocks[0].frames).toBe(960);
  expect(blocks[0].samples[0]).toBe(16384);
  expect(blocks[1].position).toBe(960);
  expect(capture.port.postMessage.mock.calls.some(([x]) => x.type === 'overrun')).toBe(false);
  expect(capture.queue).toHaveLength(1);
  capture.port.onmessage({ data: { type: 'credit', run: capture.run } });
  expect(capture.queue).toHaveLength(0);
  expect(capture.port.postMessage.mock.calls.at(-1)[0].position).toBe(3840);
});

test('one second main-thread stall preserves all blocks; two-second ring is strictly bounded', () => {
  const capture = new CapturePCM({ processorOptions: { channels: 1 } });
  capture.port.onmessage({ data: { type: 'enable', enabled: true } });
  for (let i = 0; i < 375; i++) capture.process([[new Float32Array(128).fill(0.1)]]);
  expect(capture.generatedFrames).toBe(48000);
  expect(capture.queue.length).toBe(46);
  for (let i = 0; i < 50; i++) capture.port.onmessage({ data: { type: 'credit', run: capture.run } });
  const blocks = capture.port.postMessage.mock.calls.map(([m]) => m).filter(m => m.type === 'pcm');
  expect(blocks).toHaveLength(50);
  expect(blocks.reduce((sum, b) => sum + b.samples.byteLength, 0)).toBe(96000);
  expect(blocks.map(b => b.position)).toEqual(Array.from({ length: 50 }, (_, i) => i * 960));
  for (let i = 0; i < 2000; i++) capture.process([[new Float32Array(128)]]);
  expect(capture.queue.length).toBeLessThanOrEqual(100);
  expect(capture.port.postMessage.mock.calls.at(-1)[0]).toMatchObject({ type: 'overrun', reason: 'capture-ring-cap', queuedFrames: 96000 });
});
