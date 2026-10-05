// Per-peer bounded PCM queue. Playout buffering is unrelated to this queue.
export class SenderQueue {
  constructor(channel, onFatal, onMetrics = () => {}, onEvent = () => {}) {
    this.channel = channel; this.onFatal = onFatal; this.onMetrics = onMetrics; this.onEvent = onEvent;
    this.queue = []; this.bytes = 0; this.limit = 1024 * 1024; this.high = 256 * 1024;
    this.low = 64 * 1024; this.maxBufferedAmount = 0; this.maxQueueBytes = 0;
    this.maxMessageBytes = 0; this.sentBytes = 0; this.droppedBytes = 0; this.sendErrors = 0;
    this.paused = false; this.closed = false; this.blockedSince = null; this.maxBlockedMs = 0;
    channel.bufferedAmountLowThreshold = this.low;
    channel.onbufferedamountlow = () => { this.retryAt = 0; this.flush(); };
  }
  snapshot() {
    const amount = this.channel.bufferedAmount;
    this.maxBufferedAmount = Math.max(this.maxBufferedAmount, amount);
    const blockedMs = this.blockedSince === null ? 0 : Date.now() - this.blockedSince;
    return { bufferedAmount: amount, maxBufferedAmount: this.maxBufferedAmount,
      queuedBytes: this.bytes, maxQueueBytes: this.maxQueueBytes, queuedBlocks: this.queue.length,
      high: this.high, low: this.low, limit: this.limit, blockedMs, maxBlockedMs: Math.max(this.maxBlockedMs, blockedMs),
      paused: this.paused, dropping: !!this.dropping, droppedBytes: this.droppedBytes,
      sentBytes: this.sentBytes, sendErrors: this.sendErrors, maxMessageBytes: this.maxMessageBytes };
  }
  event(reason, details = {}) { this.onEvent({ reason, ...this.snapshot(), ...details }); }
  wait(reason) {
    if (this.blockedSince === null) { this.blockedSince = Date.now(); this.event(reason); }
    // Fallback for send(OperationError) below the low threshold: no crossing event may occur.
    if (!this.timer && !this.closed) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 250);
  }
  push(packet) {
    if (this.closed) return;
    this.flush();
    if (this.dropping || this.bytes + packet.byteLength > this.limit) {
      if (!this.dropping) { this.dropping = true; this.event('sender-queue-cap'); }
      this.droppedBytes += packet.byteLength;
      // Preserve already queued music. Stop accepting new PCM for only this peer until drained.
      this.wait('sender-queue-cap'); return;
    }
    this.queue.push(packet); this.bytes += packet.byteLength;
    this.maxQueueBytes = Math.max(this.maxQueueBytes, this.bytes);
    this.flush();
  }
  send(data, control = false) {
    try {
      this.channel.send(data);
      this.snapshot();
      if (!control) {
        this.sentBytes += data.byteLength;
        this.maxMessageBytes = Math.max(this.maxMessageBytes, data.byteLength);
        this.onMetrics(data.byteLength);
      }
      return true;
    } catch (error) {
      this.sendErrors++;
      this.event('send-exception', { error: { name: error.name, message: error.message },
        messageBytes: typeof data === 'string' ? data.length : data.byteLength });
      if (error.name === 'OperationError') {
        this.retryAt = Date.now() + 250; this.wait('send-operation-error'); return false;
      }
      this.onFatal({ reason: 'send-fatal', error: { name: error.name, message: error.message }, ...this.snapshot() });
      return false;
    }
  }
  flush() {
    if (this.closed) return;
    this.snapshot();
    if (!this.queue.length && !this.dropping) return;
    if (this.channel.readyState !== 'open') {
      if (this.channel.readyState === 'connecting') { this.wait('channel-connecting'); return; }
      this.onFatal({ reason: 'send-channel-not-open', ...this.snapshot() }); return;
    }
    if (Date.now() < (this.retryAt || 0)) { this.wait('send-retry-wait'); return; }
    if (this.paused && this.channel.bufferedAmount > this.low) { this.wait('dc-high-water'); return; }
    this.paused = false;
    while (this.queue.length) {
      if (this.channel.bufferedAmount + this.queue[0].byteLength > this.high) {
        this.paused = true; this.wait('dc-high-water'); return;
      }
      const packet = this.queue[0];
      if (!this.send(packet)) return;
      this.queue.shift(); this.bytes -= packet.byteLength;
    }
    if (this.dropping) {
      if (this.channel.bufferedAmount > this.low) { this.paused = true; this.wait('draining-before-resync'); return; }
      // Ordered boundary: never join samples across an explicitly dropped interval.
      if (!this.send(JSON.stringify({ type: 'resync', reason: 'sender-queue-cap', droppedBytes: this.droppedBytes }), true)) return;
      this.dropping = false; this.event('sender-resync');
    }
    if (this.blockedSince !== null) {
      this.maxBlockedMs = Math.max(this.maxBlockedMs, Date.now() - this.blockedSince);
      this.blockedSince = null; this.event('send-resumed');
    }
    clearTimeout(this.timer); this.timer = null;
  }
  close() {
    this.closed = true; clearTimeout(this.timer); this.timer = null;
    this.queue = []; this.bytes = 0; this.channel.onbufferedamountlow = null;
  }
}
