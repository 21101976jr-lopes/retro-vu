import { SenderQueue } from './flow';
let channel, fatal, events, metrics;
beforeEach(() => {
  jest.useFakeTimers();
  channel = { readyState: 'open', bufferedAmount: 0, send: jest.fn() };
  fatal = jest.fn(); events = jest.fn(); metrics = jest.fn();
});
afterEach(() => jest.useRealTimers());
test('250ms OperationError retry preserves same packet even below low watermark, no close', () => {
  channel.send.mockImplementationOnce(() => { throw new DOMException('SCTP full', 'OperationError'); });
  const queue = new SenderQueue(channel, fatal, metrics, events), packet = new ArrayBuffer(1952);
  queue.push(packet);
  expect(queue.bytes).toBe(1952); expect(fatal).not.toHaveBeenCalled();
  jest.advanceTimersByTime(249); expect(channel.send).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  expect(channel.send).toHaveBeenLastCalledWith(packet); expect(queue.bytes).toBe(0);
  expect(metrics).toHaveBeenCalledTimes(1); expect(queue.sendErrors).toBe(1); queue.close();
});
test('five minutes of packets, 7s congestion: high watermark pauses, low event resumes without loss', () => {
  const queue = new SenderQueue(channel, fatal, metrics, events), packet = new ArrayBuffer(1952);
  channel.send.mockImplementation(data => { channel.bufferedAmount += data.byteLength || 0; });
  for (let tick = 0; tick < 15000; tick++) {
    if (tick < 3000 || tick >= 3350) {
      channel.bufferedAmount = 0; channel.onbufferedamountlow();
    }
    queue.push(packet); jest.advanceTimersByTime(20);
  }
  channel.bufferedAmount = 0; channel.onbufferedamountlow();
  expect(metrics).toHaveBeenCalledTimes(15000);
  expect(queue.sentBytes).toBe(15000 * 1952);
  expect(queue.maxBufferedAmount).toBeLessThanOrEqual(256 * 1024);
  expect(queue.maxQueueBytes).toBeLessThanOrEqual(1024 * 1024);
  expect(queue.droppedBytes).toBe(0); expect(fatal).not.toHaveBeenCalled();
  expect(queue.bytes).toBe(0); expect(queue.maxBlockedMs).toBeGreaterThan(1000); queue.close();
});
test('prolonged stall hits unchanged 1MiB cap, bounds memory, drains and orders explicit resync without closing', () => {
  const queue = new SenderQueue(channel, fatal, metrics, events), packet = new ArrayBuffer(1952);
  channel.bufferedAmount = 300000;
  for (let i = 0; i < 2000; i++) { queue.push(packet); jest.advanceTimersByTime(20); }
  expect(queue.maxQueueBytes).toBeLessThanOrEqual(1024 * 1024);
  expect(queue.droppedBytes).toBeGreaterThan(0);
  expect(fatal).not.toHaveBeenCalled();
  channel.bufferedAmount = 0; channel.onbufferedamountlow();
  expect(JSON.parse(channel.send.mock.calls.at(-1)[0])).toMatchObject({ type: 'resync', reason: 'sender-queue-cap' });
  queue.push(packet);
  expect(channel.send.mock.calls.at(-1)[0]).toBe(packet); expect(queue.bytes).toBe(0);
  queue.close(); expect(jest.getTimerCount()).toBe(0);
});
test('fatal send records the real exception rather than pretending congestion', () => {
  channel.send.mockImplementation(() => { throw new TypeError('Message too large'); });
  const queue = new SenderQueue(channel, fatal, metrics, events);
  queue.push(new ArrayBuffer(1952));
  expect(fatal).toHaveBeenCalledWith(expect.objectContaining({ reason: 'send-fatal', error: { name: 'TypeError', message: 'Message too large' } }));
  expect(metrics).not.toHaveBeenCalled(); queue.close();
});
