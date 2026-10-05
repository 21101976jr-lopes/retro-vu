import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AudioDiagnostic from './AudioDiagnostic';

let track, stream, media, context, splitter, analysers, frame;
const settings = { deviceId: 'usb-id', channelCount: 2, sampleRate: 48000,
  echoCancellation: false, noiseSuppression: false, autoGainControl: false };

beforeEach(() => {
  track = { label: 'USB Audio', readyState: 'live', muted: false,
    stop: jest.fn(), getSettings: jest.fn(() => settings), addEventListener: jest.fn() };
  stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  media = {
    enumerateDevices: jest.fn().mockResolvedValue([
      { kind: 'audioinput', deviceId: 'internal', groupId: 'a', label: 'Microfone interno' },
      { kind: 'audioinput', deviceId: 'usb-id', groupId: 'b', label: 'USB Audio' },
      { kind: 'audiooutput', deviceId: 'speaker', label: 'Alto-falante' },
    ]),
    getUserMedia: jest.fn().mockResolvedValue(stream),
    getSupportedConstraints: () => ({ deviceId: true, channelCount: true, sampleRate: true }),
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
  };
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media });
  splitter = { connect: jest.fn(), disconnect: jest.fn() };
  analysers = [0.5, 0.125].map(value => ({ disconnect: jest.fn(),
    getFloatTimeDomainData: jest.fn(buffer => buffer.fill(value)) }));
  let analyserIndex = 0;
  context = { state: 'running', sampleRate: 48000,
    resume: jest.fn().mockResolvedValue(), close: jest.fn().mockResolvedValue(),
    createMediaStreamSource: jest.fn(() => ({ connect: jest.fn(), disconnect: jest.fn() })),
    createChannelSplitter: jest.fn(() => splitter),
    createAnalyser: jest.fn(() => analysers[analyserIndex++ % 2]),
  };
  window.AudioContext = jest.fn(() => context);
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

async function selectUsb() {
  await screen.findByRole('option', { name: '2. USB Audio' });
  fireEvent.change(screen.getByLabelText('2. Entrada a testar'), { target: { value: 'usb-id' } });
}
async function start() {
  await selectUsb();
  fireEvent.click(screen.getByRole('button', { name: 'TESTAR IDEAL 2 / CONSULTAR CAPACIDADES' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Captura ativa, sem reprodução'));
}

test('requests the exact USB device, reports actual settings and measures channels separately without monitoring', async () => {
  const view = render(<AudioDiagnostic />);
  await start();
  expect(media.getUserMedia).toHaveBeenCalledWith({ video: false, audio: {
    deviceId: { exact: 'usb-id' }, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 },
    echoCancellation: false, noiseSuppression: false, autoGainControl: false,
  } });
  expect(context.createChannelSplitter).toHaveBeenCalledWith(2);
  expect(splitter.connect.mock.calls).toEqual([[analysers[0], 0, 0], [analysers[1], 1, 0]]);
  expect(screen.getByText('ESTÉREO: 2 canais informados pelo navegador.')).toBeInTheDocument();
  expect(screen.getByText('Não informado pelo navegador')).toBeInTheDocument(); // sampleSize absent
  act(() => frame(100));
  expect(screen.getByText('RMS: -6.0 dBFS • Pico: -6.0 dBFS')).toBeInTheDocument();
  expect(screen.getByText('RMS: -18.1 dBFS • Pico: -18.1 dBFS')).toBeInTheDocument();
  view.unmount();
  expect(track.stop).toHaveBeenCalled();
  expect(context.close).toHaveBeenCalled();
});

test('permission enumeration releases the temporary microphone and filters outputs', async () => {
  render(<AudioDiagnostic />);
  fireEvent.click(screen.getByRole('button', { name: '1. Permitir microfone e listar entradas' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Permissão concedida; captura de permissão encerrada'));
  expect(media.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  expect(track.stop).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Alto-falante')).not.toBeInTheDocument();
  expect(window.AudioContext).not.toHaveBeenCalled();
});

test('mono is explicit and RIGHT is not a duplicate', async () => {
  track.getSettings.mockReturnValue({ deviceId: 'usb-id', channelCount: 1, sampleRate: 44100 });
  render(<AudioDiagnostic />);
  await start();
  expect(screen.getByText('MONO informado pelo navegador. RIGHT não está disponível.')).toBeInTheDocument();
  expect(screen.queryByLabelText('RIGHT RMS')).not.toBeInTheDocument();
  expect(screen.getByText('44100')).toBeInTheDocument();
});

test('missing channel count is unknown, not inferred from silence', async () => {
  track.getSettings.mockReturnValue({ deviceId: 'usb-id' });
  render(<AudioDiagnostic />);
  await start();
  expect(screen.getByText('Quantidade de canais não informada: mono/estéreo não confirmado.')).toBeInTheDocument();
});

test('an exact-device error is shown without a fallback capture', async () => {
  media.getUserMedia.mockRejectedValue(Object.assign(new Error('Device unavailable'), {
    name: 'OverconstrainedError', constraint: 'deviceId' }));
  render(<AudioDiagnostic />);
  await selectUsb();
  fireEvent.click(screen.getByRole('button', { name: 'TESTAR IDEAL 2 / CONSULTAR CAPACIDADES' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('OverconstrainedError: Device unavailable — restrição: deviceId'));
  expect(media.getUserMedia).toHaveBeenCalledTimes(1);
  expect(context.close).toHaveBeenCalled();
});

test('stopping while permission is pending also stops a late stream', async () => {
  let resolve;
  media.getUserMedia.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<AudioDiagnostic />);
  await selectUsb();
  fireEvent.click(screen.getByRole('button', { name: 'TESTAR IDEAL 2 / CONSULTAR CAPACIDADES' }));
  await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Parar captura' }));
  await act(async () => resolve(stream));
  expect(track.stop).toHaveBeenCalled();
  expect(screen.queryByText(/Captura ativa, sem reprodução/)).not.toBeInTheDocument();
});

test('insecure origins disable capture with an explanation', async () => {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  render(<AudioDiagnostic />);
  expect(screen.getByRole('button', { name: '1. Permitir microfone e listar entradas' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Captura indisponível');
  await screen.findByRole('option', { name: '2. USB Audio' });
  expect(media.getUserMedia).not.toHaveBeenCalled();
});

const report = () => JSON.parse(screen.getByLabelText('Relatório do diagnóstico').value);

test('exact stereo success exposes capabilities and identifies the test', async () => {
  track.getCapabilities = jest.fn(() => ({ channelCount: { min: 1, max: 2 },
    sampleRate: { min: 48000, max: 48000 }, sampleSize: { min: 16, max: 16 }, echoCancellation: [false] }));
  render(<AudioDiagnostic />);
  await selectUsb();
  fireEvent.click(screen.getByRole('button', { name: 'FORÇAR ESTÉREO 2CH' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Captura ativa'));
  expect(media.getUserMedia).toHaveBeenCalledWith({ video: false, audio: {
    deviceId: { exact: 'usb-id' }, channelCount: { exact: 2 }, sampleRate: { ideal: 48000 },
    echoCancellation: false, noiseSuppression: false, autoGainControl: false,
  } });
  expect(report().attempt.mode).toBe('EXACT 2');
  expect(report().attempt.capabilities.channelCount).toEqual({ min: 1, max: 2 });
  expect(report().result.settings.channelCount).toBe(2);
  expect(splitter.connect.mock.calls).toEqual([[analysers[0], 0, 0], [analysers[1], 1, 0]]);
});

test('exact rejection retains constraints, full error and preceding ideal capabilities without fallback', async () => {
  track.getCapabilities = jest.fn(() => ({ channelCount: { min: 1, max: 1 } }));
  render(<AudioDiagnostic />);
  await start();
  fireEvent.click(screen.getByRole('button', { name: 'Parar captura' }));
  media.getUserMedia.mockRejectedValue(Object.assign(new Error('Only mono available'), {
    name: 'OverconstrainedError', constraint: 'channelCount' }));
  fireEvent.click(screen.getByRole('button', { name: 'FORÇAR ESTÉREO 2CH' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('OverconstrainedError'));
  const data = report();
  expect(media.getUserMedia).toHaveBeenCalledTimes(2);
  expect(data.attempt.mode).toBe('EXACT 2');
  expect(data.attempt.requested.audio.channelCount).toEqual({ exact: 2 });
  expect(data.attempt.error).toMatchObject({ name: 'OverconstrainedError', message: 'Only mono available', constraint: 'channelCount' });
  expect(data.attempt.settings).toBeNull();
  expect(data.attempt.capabilities).toBeNull();
  expect(data.history[0].mode).toBe('IDEAL 2');
  expect(data.history[0].capabilities.channelCount.max).toBe(1);
  expect(data.supported.channelCount).toBe(true);
});

test('unavailable capabilities is explicit without preventing capture', async () => {
  render(<AudioDiagnostic />);
  await start();
  expect(screen.getByText('getCapabilities() não disponível neste navegador.')).toBeInTheDocument();
  expect(report().attempt.capabilities).toBeNull();
});

test('capabilities errors are reported without replacing settings', async () => {
  track.getCapabilities = () => { throw new Error('Unavailable'); };
  render(<AudioDiagnostic />);
  await start();
  expect(report().attempt.capabilitiesStatus).toContain('getCapabilities() falhou: Error: Unavailable');
  expect(report().result.settings.sampleRate).toBe(48000);
});

test('exact returning mono is not described as confirmed stereo', async () => {
  track.getSettings.mockReturnValue({ channelCount: 1 });
  render(<AudioDiagnostic />);
  await selectUsb();
  fireEvent.click(screen.getByRole('button', { name: 'FORÇAR ESTÉREO 2CH' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('EXACT 2 não confirmado'));
  expect(screen.queryByLabelText('RIGHT RMS')).not.toBeInTheDocument();
  expect(media.getUserMedia).toHaveBeenCalledTimes(1);
});

async function expectReleased(mode) {
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`${mode} concluído. Captura liberada`), { timeout: 2500 });
  expect(screen.getByRole('button', { name: 'TESTAR IDEAL 2 / CONSULTAR CAPACIDADES' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'FORÇAR ESTÉREO 2CH' })).toBeEnabled();
  expect(screen.getByRole('heading', { name: `ÚLTIMO TESTE: ${mode}` })).toBeInTheDocument();
  expect(track.stop).toHaveBeenCalled();
  expect(context.close).toHaveBeenCalled();
}

test('ideal releases itself and exact makes a fresh independent call without pressing stop', async () => {
  render(<AudioDiagnostic />);
  await start();
  await expectReleased('IDEAL 2');
  expect(report().result.settings.channelCount).toBe(2);
  fireEvent.click(screen.getByRole('button', { name: 'FORÇAR ESTÉREO 2CH' }));
  await expectReleased('EXACT 2');
  expect(media.getUserMedia).toHaveBeenCalledTimes(2);
  expect(media.getUserMedia.mock.calls.map(([request]) => request.audio.channelCount)).toEqual([{ ideal: 2 }, { exact: 2 }]);
});

test('exact may run first, releases on rejection and allows a subsequent ideal test', async () => {
  media.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Only mono'), {
    name: 'OverconstrainedError', constraint: 'channelCount' }));
  render(<AudioDiagnostic />);
  await selectUsb();
  fireEvent.click(screen.getByRole('button', { name: 'FORÇAR ESTÉREO 2CH' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('OverconstrainedError: Only mono — restrição: channelCount'));
  expect(media.getUserMedia).toHaveBeenCalledTimes(1);
  expect(media.getUserMedia.mock.calls[0][0].audio.channelCount).toEqual({ exact: 2 });
  expect(screen.getByRole('heading', { name: 'ÚLTIMO TESTE: EXACT 2' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'FORÇAR ESTÉREO 2CH' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'TESTAR IDEAL 2 / CONSULTAR CAPACIDADES' }));
  await expectReleased('IDEAL 2');
  expect(media.getUserMedia).toHaveBeenCalledTimes(2);
});


describe('temporary mono content recording', () => {
  let recorder, originalRecorder, originalCreateUrl, originalRevokeUrl;
  beforeEach(() => {
    originalRecorder = window.MediaRecorder;
    originalCreateUrl = URL.createObjectURL;
    originalRevokeUrl = URL.revokeObjectURL;
    track.getSettings.mockReturnValue({ deviceId: 'usb-id', channelCount: 1, sampleRate: 48000,
      sampleSize: 16, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    recorder = { state: 'inactive', mimeType: 'audio/webm;codecs=opus',
      start: jest.fn(() => { recorder.state = 'recording'; }),
      stop: jest.fn(() => {
        recorder.state = 'inactive';
        recorder.ondataavailable?.({ data: new Blob(['native audio'], { type: recorder.mimeType }) });
        recorder.onstop?.();
      }) };
    window.MediaRecorder = jest.fn(() => recorder);
    URL.createObjectURL = jest.fn(() => 'blob:mono-test');
    URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });
  afterEach(() => {
    window.MediaRecorder = originalRecorder;
    URL.createObjectURL = originalCreateUrl;
    URL.revokeObjectURL = originalRevokeUrl;
  });
  async function beginRecording() {
    await selectUsb();
    fireEvent.click(screen.getByRole('button', { name: 'GRAVAR TESTE' }));
    await screen.findByText('Gravando a entrada selecionada. Pressione PARAR quando terminar.');
  }

  test('records the untouched selected stream, stops manually and creates a local player with metadata', async () => {
    const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
    const view = render(<AudioDiagnostic />);
    await beginRecording();
    expect(media.getUserMedia).toHaveBeenCalledWith({ video: false, audio: {
      deviceId: { exact: 'usb-id' }, echoCancellation: { exact: false },
      noiseSuppression: { exact: false }, autoGainControl: { exact: false },
    } });
    expect(window.MediaRecorder).toHaveBeenCalledWith(stream);
    expect(window.AudioContext).not.toHaveBeenCalled();
    expect(recorder.start).toHaveBeenCalledWith();
    expect(screen.getByRole('button', { name: 'FORÇAR ESTÉREO 2CH' })).toBeDisabled();
    clock.mockReturnValue(60000);
    fireEvent.click(screen.getByRole('button', { name: 'PARAR', exact: true }));
    expect(screen.getByLabelText('Gravação do teste mono')).toHaveAttribute('src', 'blob:mono-test');
    expect(screen.getByText(/Duração da gravação.*60.0 s/)).toBeInTheDocument();
    expect(screen.getByText('48000')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'FORÇAR ESTÉREO 2CH' })).toBeEnabled();
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mono-test');
  });

  test('does not apply the one-second IDEAL/EXACT limit to recording', async () => {
    render(<AudioDiagnostic />);
    await beginRecording();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1150)); });
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'PARAR', exact: true })).toBeEnabled();
  });

  test('cancelling a pending recording releases a late arriving stream', async () => {
    let resolve;
    media.getUserMedia.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<AudioDiagnostic />);
    await selectUsb();
    fireEvent.click(screen.getByRole('button', { name: 'GRAVAR TESTE' }));
    fireEvent.click(screen.getByRole('button', { name: 'PARAR', exact: true }));
    await act(async () => resolve(stream));
    expect(track.stop).toHaveBeenCalled();
    expect(window.MediaRecorder).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'GRAVAR TESTE' })).toBeEnabled();
  });

  test('unmount stops the recorder and tracks without creating a stale player URL', async () => {
    const view = render(<AudioDiagnostic />);
    await beginRecording();
    view.unmount();
    expect(recorder.stop).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('capture failure is displayed and re-enables recording without fallback', async () => {
    media.getUserMedia.mockRejectedValue(Object.assign(new Error('Processing cannot be disabled'), {
      name: 'OverconstrainedError', constraint: 'echoCancellation' }));
    render(<AudioDiagnostic />);
    await selectUsb();
    fireEvent.click(screen.getByRole('button', { name: 'GRAVAR TESTE' }));
    await screen.findByText('OverconstrainedError: Processing cannot be disabled — constraint: echoCancellation');
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'GRAVAR TESTE' })).toBeEnabled();
    expect(window.MediaRecorder).not.toHaveBeenCalled();
  });
});
