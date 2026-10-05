/* global sampleRate */
// Independent REC branch of the EXISTING source. No USB acquisition, mixing, codec or network.
class PCMRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super(); this.channels = options.processorOptions.channels;
    this.frames = 4096; this.buffer = new ArrayBuffer(this.frames * this.channels * 2);
    this.offset = 0; this.credit = 4; this.queue = []; this.sequence = 0;
    this.maxBlocks = Math.ceil(sampleRate * 2 / this.frames); this.stopping = false; this.done = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'credit') { this.credit = Math.min(4, this.credit + 1); this.drain(); }
      if (data.type === 'stop') this.stop();
    };
  }
  drain() {
    while (this.credit && this.queue.length) {
      const block = this.queue.shift(); this.credit--;
      this.port.postMessage({ type: 'pcm', ...block }, [block.buffer]);
    }
    if (this.stopping && !this.queue.length && !this.done) {
      this.done = true; this.port.postMessage({ type: 'stopped', warning: this.warning || '' });
    }
  }
  block() {
    if (!this.offset) return true;
    if (this.queue.length >= this.maxBlocks) {
      this.offset = 0; this.stopping = true; this.warning = 'REC interrompido: escrita local atrasada; arquivo contém somente o trecho contínuo recebido.';
      this.drain(); return false;
    }
    const buffer = this.offset === this.frames ? this.buffer : this.buffer.slice(0, this.offset * this.channels * 2);
    this.queue.push({ buffer, frames: this.offset, sequence: this.sequence++ }); this.offset = 0;
    this.buffer = new ArrayBuffer(this.frames * this.channels * 2); this.drain(); return true;
  }
  stop(warning) {
    if (this.stopping) return;
    this.stopping = true; this.warning = warning || ''; this.block(); this.drain();
  }
  process(inputs) {
    if (this.stopping) return true;
    const input = inputs[0];
    if (!input?.[0]) return true;
    if (input.length !== this.channels) { this.stop('REC interrompido: canais da fonte mudaram.'); return true; }
    const view = () => new DataView(this.buffer);
    let v = view();
    for (let frame = 0; frame < input[0].length; frame++) {
      for (let c = 0; c < this.channels; c++) {
        const x = Math.max(-1, Math.min(1, input[c][frame]));
        v.setInt16((this.offset * this.channels + c) * 2, Math.round(x < 0 ? x * 32768 : x * 32767), true);
      }
      if (++this.offset === this.frames) { if (!this.block()) return true; v = view(); }
    }
    return true; // Output stays zero; never audible and never includes destination/monitor.
  }
}
if (typeof registerProcessor === 'function') registerProcessor('retro-wav-recorder', PCMRecorder);
if (typeof module !== 'undefined') module.exports = { PCMRecorder };
