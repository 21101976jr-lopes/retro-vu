import { render, screen, fireEvent } from '@testing-library/react';
import StreamDiagnostic from './StreamDiagnostic';
import { debug as logStream } from './stream/debug';
test('temporary mobile diagnostic shows actual rates and selectable report when clipboard unavailable', async () => {
  logStream('metrics', { role: 'send', pcmProducedBps: 96000, peers: [{ peer: 'one', pcmSentBps: 96000,
    queue: { bufferedAmount: 1952, maxBufferedAmount: 3904, queuedBytes: 0 }, dataChannelState: 'open', iceConnectionState: 'connected' }] });
  logStream('peer-closing', { reason: 'capture-ring-cap', bufferedAmount: 0 });
  render(<StreamDiagnostic color="#91e5a1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir diagnóstico STREAM' }));
  expect(screen.getByText('Produzido: 96000 B/s PCM')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Relatório completo' }).value).toContain('capture-ring-cap');
  fireEvent.click(screen.getByRole('button', { name: 'COPIAR' }));
  await screen.findByText('Selecione o texto abaixo → Selecionar tudo → Copiar.');
  fireEvent.click(screen.getByRole('button', { name: 'FECHAR' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
