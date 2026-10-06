import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { StreamTransport } from './stream/transport';
jest.mock('./stream/transport', () => ({ StreamTransport: jest.fn() }));
let images, controller;
beforeEach(() => {
  images = [];
  jest.spyOn(window, 'Image').mockImplementation(() => { const image = { decode: jest.fn().mockResolvedValue() }; images.push(image); return image; });
  StreamTransport.mockImplementation((role, session, update) => {
    controller = { role, start: jest.fn(() => update({ status: 'PLAYING', role, seconds: 5, playing: true })),
      close: jest.fn(), togglePlay: jest.fn() };
    return controller;
  });
});
afterEach(() => jest.restoreAllMocks());
test('RECEBER survives VOLTAR, keeps its session on re-entry, STOP delegates, explicit off cleans up', async () => {
  const view = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'STREAM', exact: true }));
  await act(async () => images.find(image => image.src === '/images/stream.png').onload());
  fireEvent.click(screen.getByRole('button', { name: 'RECEBER', exact: true }));
  fireEvent.click(screen.getByRole('button',{name:'ENTRAR EM MODO PRIVADO'}));
  fireEvent.change(screen.getByLabelText('Convite'),{target:{value:'a'.repeat(64)}});
  fireEvent.click(screen.getByRole('button',{name:'CONECTAR'}));
  expect(screen.getByText('RECEBENDO')).toBeInTheDocument();
  const active = controller;
  fireEvent.click(screen.getByRole('button', { name: 'VOLTAR', exact: true }));
  expect(active.close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'STREAM', exact: true }));
  await screen.findByText('RECEBENDO');
  expect(StreamTransport).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'PLAY / STOP' }));
  expect(active.togglePlay).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'RECEBER', exact: true }));
  expect(active.close).toHaveBeenCalledTimes(1);
  expect(screen.getByText('PRONTO')).toBeInTheDocument();
  view.unmount();
});
