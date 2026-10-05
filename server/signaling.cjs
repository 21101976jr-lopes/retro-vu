const crypto = require('crypto');
const TTL = 30000;
const TOKEN = /^[a-f0-9]{64}$/;
// Invite is a 256-bit bearer capability for listening; its preimage authorizes sending.
function roomKey(request) {
  if (!TOKEN.test(request.invite || '')) throw new Error('Convite privado obrigatório');
  if (request.role === 'send' && (!TOKEN.test(request.owner || '') ||
      crypto.createHash('sha256').update(request.owner).digest('hex') !== request.invite))
    throw new Error('Transmissor não autorizado');
  return crypto.createHash('sha256').update(request.invite).digest('hex');
}
function transition(state, request, now = Date.now()) {
  state = JSON.parse(JSON.stringify(state || { clients: {}, serial: 0, generation: crypto.randomUUID() }));
  const { id, role, ack = 0, messages = [], leave = false } = request;
  const effectiveAck = request.generation && request.generation !== state.generation ? 0 : ack;
  if (!/^[a-f0-9-]{36}$/.test(id || '') || !['send', 'receive'].includes(role) ||
      !Array.isArray(messages) || messages.length > 48) throw new Error('Invalid signaling request');
  for (const [key, value] of Object.entries(state.clients)) if (now - value.seen > TTL) delete state.clients[key];
  if (leave) { delete state.clients[id]; return { state, result: { peers: [], messages: [], generation: state.generation } }; }
  if (!state.clients[id]) {
    if (Object.keys(state.clients).length >= 4 || (role === 'receive' &&
        Object.values(state.clients).filter(c=>c.role === 'receive').length >= 3)) throw new Error('Session full');
    if (role === 'send' && Object.values(state.clients).some(c => c.role === 'send')) throw new Error('Transmitter already active');
    state.clients[id] = { role, seen: now, inbox: [], seenMessages: [] };
  }
  const client = state.clients[id];
  if (client.role !== role) throw new Error('Role mismatch');
  client.seen = now; client.inbox = client.inbox.filter(m => m.serial > effectiveAck);
  for (const m of messages) {
    if (!m || typeof m.key !== 'string' || !['description', 'candidate', 'reset'].includes(m.type) ||
        JSON.stringify(m).length > 24000) throw new Error('Invalid signaling message');
    if (client.seenMessages.includes(m.key)) continue;
    const target = state.clients[m.to];
    if (target && target.role !== role) {
      if (target.inbox.length >= 128) throw new Error('Signaling queue full');
      target.inbox.push({ ...m, from: id, serial: ++state.serial });
    }
    client.seenMessages.push(m.key); client.seenMessages = client.seenMessages.slice(-256);
  }
  return { state, result: {
    generation: state.generation,
    peers: Object.entries(state.clients).filter(([key, c]) => key !== id && c.role !== role).map(([key, c]) => ({ id: key, role: c.role })),
    messages: client.inbox,
  } };
}
function createHandler({ local = false } = {}) {
  const memory = new Map();
  async function redis(command) {
    const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: 'POST', headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN,
        'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Signaling storage unavailable');
    const data = await response.json(); if (data.error) throw new Error('Signaling storage error');
    return data.result;
  }
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    try { if (origin && new URL(origin).host !== host) return res.status(403).json({ error: 'Origin denied' }); }
    catch { return res.status(403).json({ error: 'Origin denied' }); }
    if (!local && (process.env.STREAM_ENABLED !== 'true' ||
        !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN))
      return res.status(503).json({ error: 'Configure STREAM_ENABLED and Redis before enabling STREAM' });
    try {
      const request = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!request || JSON.stringify(request).length > 60000) return res.status(413).json({ error: 'Signaling body too large' });
      let room;
      try { room = roomKey(request); } catch(error) { return res.status(403).json({error:error.message}); }
      if (local) {
        const now = Date.now();
        for(const [key,value] of memory) if(now-value.at > 120000) memory.delete(key);
        const next = transition(memory.get(room)?.state, request);
        memory.set(room,{state:next.state,at:now});return res.json(next.result);
      }
      // CAS makes presence/mailboxes atomic across independent Vercel instances.
      const key = 'retro-vu:signal:' + (process.env.STREAM_NAMESPACE || 'personal') + ':' + room;
      for (let attempt = 0; attempt < 12; attempt++) {
        const previous = await redis(['GET', key]);
        const next = transition(previous ? JSON.parse(previous) : null, request);
        const changed = await redis(['EVAL',
          "if (redis.call('GET', KEYS[1]) or '') == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2], 'EX', 120); return 1 else return 0 end",
          1, key, previous || '', JSON.stringify(next.state)]);
        if (changed) return res.json(next.result);
      }
      throw new Error('Signaling busy; retry');
    } catch (error) {
      return res.status(409).json({ error: error.message });
    }
  };
}
module.exports = { transition, createHandler, roomKey, id: () => crypto.randomUUID() };
