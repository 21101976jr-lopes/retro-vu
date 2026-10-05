/* PCM real. No microphone access, artificial signal or monitor route here. */
/* global sampleRate */
class PCMBuffer {
  constructor(rate, channels) {
    this.rate = rate; this.channels = channels; this.capacity = rate * 15;
    this.data = Array.from({ length: channels }, () => new Float32Array(this.capacity));
    this.read = 0; this.length = 0; this.play = true; this.started = false;
    this.recovering = false; this.underflows = 0; this.fade = 0;
  }
  reset() { this.read = 0; this.length = 0; this.started = false; this.fade = 0; }
  push(samples) {
    const frames = samples.length / this.channels;
    if (this.length + frames > this.capacity) return false;
    for (let f = 0; f < frames; f++) for (let c = 0; c < this.channels; c++)
      this.data[c][(this.read + this.length + f) % this.capacity] = samples[f * this.channels + c] / 32768;
    this.length += frames;
    if (!this.play && this.length > this.rate * 5) {
      const trim = this.length - this.rate * 5;
      this.read = (this.read + trim) % this.capacity; this.length -= trim;
    }
    return true;
  }
  render(out) {
    out.forEach(channel => channel.fill(0));
    if (!this.play) return;
    if (!this.started && this.length >= this.rate * 5) {
      this.started = true; this.recovering = false; this.fade = 0;
    }
    if (!this.started) return;
    const count = Math.min(out[0].length, this.length);
    for (let f = 0; f < count; f++) {
      // Only a short edge ramp (5 ms), unity gain during continuous playback.
      this.fade = Math.min(1, this.fade + 1 / (this.rate * 0.005));
      const end = this.length < this.rate * 0.005 ? this.length / (this.rate * 0.005) : 1;
      for (let c = 0; c < out.length; c++)
        out[c][f] = (this.data[c]?.[this.read] || 0) * Math.min(this.fade, end);
      this.read = (this.read + 1) % this.capacity; this.length--;
    }
    if (!this.length) { this.started = false; this.recovering = true; this.underflows++; }
  }
  get state() { return !this.play ? 'STOPPED' : this.started ? 'PLAYING' : this.recovering ? 'RECOVERING' : 'BUFFERING'; }
}
class CapturePCM extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channels = options.processorOptions.channels;
    this.frames = Math.round(sampleRate * 0.02);
    this.samples = new Int16Array(this.frames * this.channels);
    this.offset = 0; this.position = 0; this.enabled = false; this.credit = 0;
    this.queue = []; this.maxBlocks = Math.ceil(sampleRate * 2 / this.frames);
    this.generatedFrames = 0; this.maxQueuedFrames = 0; this.creditStalls = 0; this.run = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'enable') {
        this.enabled = data.enabled; this.offset = 0; this.credit = 4; this.queue = []; this.run++;
      }
      if (data.type === 'credit' && data.run === this.run) {
        this.credit = Math.min(4, this.credit + 1); this.drain();
      }
    };
  }
  drain() {
    while (this.enabled && this.credit > 0 && this.queue.length) {
      const block = this.queue.shift(); this.credit--;
      this.port.postMessage({ type: 'pcm', ...block, run: this.run,
        generatedFrames: this.generatedFrames, queuedFrames: this.queue.length * this.frames,
        maxQueuedFrames: this.maxQueuedFrames, creditStalls: this.creditStalls }, [block.samples.buffer]);
    }
  }
  process(inputs) {
    const input = inputs[0];
    if (!this.enabled || !input?.[0]) return true;
    if (input.length !== this.channels) {
      this.port.postMessage({ type: 'error', reason: 'capture-channel-mismatch', message: 'PCM channel mismatch' });
      this.enabled = false; return true;
    }
    for (let f = 0; f < input[0].length; f++) {
      for (let c = 0; c < this.channels; c++) {
        const x = Math.max(-1, Math.min(1, input[c][f]));
        this.samples[this.offset * this.channels + c] = Math.round(x < 0 ? x * 32768 : x * 32767);
      }
      if (++this.offset === this.frames) {
        this.generatedFrames += this.frames;
        if (this.queue.length === this.maxBlocks) {
          this.port.postMessage({ type: 'overrun', reason: 'capture-ring-cap', generatedFrames: this.generatedFrames,
            queuedFrames: this.queue.length * this.frames, limitFrames: this.maxBlocks * this.frames,
            credit: this.credit, creditStalls: this.creditStalls });
          this.enabled = false; return true;
        }
        if (!this.credit) this.creditStalls++;
        this.queue.push({ samples: this.samples, frames: this.frames, position: this.position });
        this.maxQueuedFrames = Math.max(this.maxQueuedFrames, this.queue.length * this.frames);
        this.position += this.frames; this.offset = 0;
        this.samples = new Int16Array(this.frames * this.channels);
        this.drain();
      }
    }
    return true;
  }
}
class PlaybackPCM extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.buffer = new PCMBuffer(sampleRate, options.processorOptions.channels);
    this.ticks = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'pcm') {
        if (!this.buffer.push(data.samples)) { this.buffer.reset(); this.port.postMessage({ type: 'overflow' }); }
        this.port.postMessage({ type: 'credit' });
      }
      if (data.type === 'reset') { this.buffer.reset(); this.buffer.recovering = true; }
      if (data.type === 'play') { this.buffer.play = data.value; this.buffer.started = false; }
    };
  }
  process(inputs, outputs) {
    this.buffer.render(outputs[0]);
    if (++this.ticks >= 32) {
      this.ticks = 0;
      this.port.postMessage({ type: 'status', state: this.buffer.state, seconds: this.buffer.length / sampleRate,
        underflows: this.buffer.underflows });
    }
    return true;
  }
}
if (typeof registerProcessor === 'function') {
  registerProcessor('retro-capture', CapturePCM); registerProcessor('retro-playback', PlaybackPCM);
}
// Tests load the same worklet source in a VM, never a duplicate buffer implementation.
if (typeof module !== 'undefined') module.exports = { PCMBuffer, CapturePCM, PlaybackPCM };
