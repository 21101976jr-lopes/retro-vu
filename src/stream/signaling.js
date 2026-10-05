import { debug } from './debug';
export class Signaling {
  constructor(role, onUpdate, onError, credentials) {
    this.credentials = credentials;
    this.id = crypto.randomUUID(); this.role = role; this.onUpdate = onUpdate;
    this.onError = onError; this.pending = []; this.ack = 0; this.closed = false;
  }
  send(to, type, value) {
    if (this.pending.length >= 128) throw new Error('Signaling backlog');
    this.pending.push({ key: crypto.randomUUID(), to, type, value });
  }
  async poll() {
    if (this.closed) return;
    const batch = this.pending.slice(0, 48);
    this.abort = new AbortController();
    const timeout = setTimeout(() => this.abort?.abort(), 8000);
    try {
      const response = await fetch('/api/stream-signal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...this.credentials, id: this.id, role: this.role, ack: this.ack, generation: this.generation, messages: batch }), signal: this.abort.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Signaling unavailable');
      if (this.closed) return;
      this.pending.splice(0, batch.length);
      if (result.generation !== this.generation) { this.ack = 0; this.generation = result.generation; }
      await this.onUpdate(result);
      this.ack = result.messages.reduce((max, m) => Math.max(max, m.serial), this.ack);
      this.failures = 0;
    } catch (error) {
      if (!this.closed) { this.failures = (this.failures || 0) + 1; debug('signaling-error', { message: error.message }); this.onError(error); }
    } finally {
      clearTimeout(timeout);
      if (!this.closed) this.timer = setTimeout(() => this.poll(), Math.min(8000, 750 * 2 ** (this.failures || 0)));
    }
  }
  close() {
    this.closed = true; clearTimeout(this.timer); this.abort?.abort();
    fetch('/api/stream-signal', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...this.credentials, id: this.id, role: this.role, leave: true }) }).catch(() => {});
  }
}
