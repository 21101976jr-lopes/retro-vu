import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StreamNightMode from './StreamNightMode';

function sentinel() {
  const lock = new EventTarget(); lock.released = false;
  lock.release = jest.fn(async () => { lock.released = true; lock.dispatchEvent(new Event('release')); });
  return lock;
}
let request;
beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  request = jest.fn();
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
});
async function enter(lock) {
  request.mockResolvedValueOnce(lock);
  fireEvent.click(screen.getByRole('button', { name: 'MODO NOTURNO' }));
  await screen.findByRole('button', { name: 'Sair do modo noturno' });
}
test('requests screen lock; overlay exit releases only that lock and preserves mounted content', async () => {
  const lock = sentinel();
  render(<><input aria-label="session marker" defaultValue="same session" /><StreamNightMode /></>);
  const marker = screen.getByRole('textbox');
  await enter(lock);
  expect(request).toHaveBeenCalledWith('screen');
  expect(screen.getByRole('textbox')).toBe(marker);
  fireEvent.click(screen.getByRole('button', { name: 'Sair do modo noturno' }));
  expect(lock.release).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Sair do modo noturno' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBe(marker);
});
test('loss is reported without retry loop; visibility return reacquires', async () => {
  const first = sentinel(), second = sentinel(); render(<StreamNightMode />); await enter(first);
  await act(async () => { await first.release(); });
  expect(screen.getByRole('status')).toHaveTextContent('BLOQUEIO PERDIDO');
  expect(request).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  fireEvent(document, new Event('visibilitychange'));
  request.mockResolvedValueOnce(second);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('TELA ATIVA'));
  expect(request).toHaveBeenCalledTimes(2);
});
test('unsupported or refused request leaves normal interface visible', async () => {
  request.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
  render(<StreamNightMode />);
  fireEvent.click(screen.getByRole('button', { name: 'MODO NOTURNO' }));
  await screen.findByText('WAKE LOCK NÃO OBTIDO: NotAllowedError');
  expect(screen.queryByRole('button', { name: 'Sair do modo noturno' })).not.toBeInTheDocument();
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
  fireEvent.click(screen.getByRole('button', { name: 'MODO NOTURNO' }));
  expect(screen.getByRole('status')).toHaveTextContent('INDISPONÍVEL');
});
test('unmount releases held lock', async () => {
  const lock = sentinel(); const view = render(<StreamNightMode />); await enter(lock);
  view.unmount(); expect(lock.release).toHaveBeenCalledTimes(1);
});
test('late acquisition after unmount is released', async () => {
  let resolve; request.mockReturnValue(new Promise(done => { resolve = done; }));
  const view = render(<StreamNightMode />);
  fireEvent.click(screen.getByRole('button', { name: 'MODO NOTURNO' })); view.unmount();
  const lock = sentinel(); await act(async () => resolve(lock));
  expect(lock.release).toHaveBeenCalledTimes(1);
});
