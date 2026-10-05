const { transition, createHandler } = require('../../server/signaling.cjs');
const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
test('automatic presence, delivery, deduplication, ack, lease expiry and explicit leave', () => {
  let { state } = transition(null, { id: a, role: 'send' }, 100);
  let next = transition(state, { id: b, role: 'receive' }, 101);
  expect(next.result.peers[0].id).toBe(a); state = next.state;
  const message = { key: 'one', to: b, type: 'description', value: { type: 'offer', sdp: 'example' } };
  state = transition(state, { id: a, role: 'send', messages: [message] }, 102).state;
  state = transition(state, { id: a, role: 'send', messages: [message] }, 103).state;
  next = transition(state, { id: b, role: 'receive' }, 104);
  expect(next.result.messages).toHaveLength(1);
  next = transition(next.state, { id: b, role: 'receive', ack: next.result.messages[0].serial }, 105);
  expect(next.result.messages).toHaveLength(0);
  next = transition(next.state, { id: a, role: 'send', leave: true }, 106);
  expect(next.state.clients[a]).toBeUndefined();
  expect(transition(next.state, { id: a, role: 'send' }, 40000).result.peers).toEqual([]);
});
test('rejects a second transmitter and non-signaling payloads', () => {
  const { state } = transition(null, { id: a, role: 'send' });
  expect(() => transition(state, { id: b, role: 'send' })).toThrow('Transmitter already active');
  expect(() => transition(state, { id: a, role: 'send', messages: [{ key: 'bad', type: 'audio' }] })).toThrow();
});
test('production refuses to invent shared storage when not configured', async () => {
  const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  await createHandler()({ method: 'POST', headers: { host: 'localhost' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(503);
});
