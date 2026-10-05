const events = [];
const snapshots = {};
let lastFault = null;
const KEY = 'retro-vu.stream-diagnostic';
export function readDiagnostic() {
  let previousFault = null;
  try { previousFault = JSON.parse(localStorage.getItem(KEY) || 'null')?.lastFault; } catch { /* Optional storage. */ }
  return JSON.stringify({ revision: 2, at: new Date().toISOString(), snapshots,
    lastFault: lastFault || previousFault, events }, null, 2);
}
export function debug(type, data = {}) {
  const entry = { ...data, at: new Date().toISOString(), type };
  events.push(entry); if (events.length > 300) events.shift();
  if (type === 'metrics' && data.role) snapshots[data.role] = entry;
  if ((type === 'peer-closing' && !['session-stop', 'presence-left'].includes(data.reason)) ||
      ['capture-discontinuity', 'error', 'send-exception', 'sender-queue-cap'].includes(type)) {
    lastFault = entry;
    // Preserve a failure before a mobile reload, without synchronous storage writes every block.
    try { localStorage.setItem(KEY, JSON.stringify({ revision: 2, lastFault, snapshots, events: events.slice(-50) })); } catch { /* Optional storage. */ }
  }
  if (process.env.NODE_ENV === 'development') {
    window.retroStreamDebug = () => JSON.stringify(events, null, 2);
    window.retroStreamDiagnostic = readDiagnostic;
    if (type !== 'metrics') console.debug('[Retro STREAM]', entry);
  }
}
