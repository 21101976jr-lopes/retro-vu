import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import App from './App';
// Capture/visual regression suite isolates transport; integration has its own suite.
jest.mock('./useStreamNetwork', () => () => ({ stop: jest.fn(), toggleReceive: jest.fn(), togglePlay: jest.fn() }));

const originalEnvironment = process.env.NODE_ENV;
let images;
beforeEach(() => {
  localStorage.clear();
  images = [];
  jest.spyOn(window, 'Image').mockImplementation(() => {
    const image = { decode: jest.fn().mockResolvedValue() };
    images.push(image);
    return image;
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env.NODE_ENV = originalEnvironment;
  window.history.replaceState({}, '', '/');
});
const streamImage = () => images.filter(image => image.src === '/images/stream.png').slice(-1)[0];
async function finishLoading() {
  await act(async () => { await streamImage().onload(); });
}
async function openStream() {
  const view = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'STREAM', exact: true }));
  await finishLoading();
  return view;
}

test('normal entry still opens the existing radio and preloads STREAM', () => {
  render(<App />);
  expect(screen.getByAltText('Radio')).toBeInTheDocument();
  expect(screen.queryByAltText('STREAM')).not.toBeInTheDocument();
  expect(streamImage()).toBeDefined();
});

test('calibration preview does not change the production entry', () => {
  process.env.NODE_ENV = 'production';
  window.history.replaceState({}, '', '/?stream-calibration=1');
  render(<App />);
  expect(screen.getByAltText('Radio')).toBeInTheDocument();
});

test.each(['PLAY / STOP'])(
  '%s has no action and stays on STREAM', async label => {
    await openStream();
    fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
    expect(screen.getByAltText('STREAM')).toBeInTheDocument();
    expect(screen.queryByAltText('Radio')).not.toBeInTheDocument();
  }
);

test('only VOLTAR returns to radio', async () => {
  await openStream();
  fireEvent.click(screen.getByRole('button', { name: 'VOLTAR' }));
  expect(screen.getByAltText('Radio')).toBeInTheDocument();
  expect(screen.queryByAltText('STREAM')).not.toBeInTheDocument();
});

test('stream hotspots retain the approved geometry and the calibration overlay is absent', async () => {
  await openStream();
  const buttons = ['TRANSMITIR', 'RECEBER', 'PLAY / STOP', 'MONITOR', 'REC', 'VOLTAR'].map(name => screen.getByRole('button', { name, exact: true }));
  expect(buttons).toHaveLength(6);
  buttons.forEach((button, i) => {
    expect(parseFloat(button.style.left) * 3070 / 100).toBeCloseTo(2222.5, 8);
    expect(parseFloat(button.style.top) * 2048 / 100).toBeCloseTo(180 + 280 * i, 8);
    expect(parseFloat(button.style.width) * 3070 / 100).toBeCloseTo(755, 8);
    expect(parseFloat(button.style.height) * 2048 / 100).toBeCloseTo(240, 8);
  });
  // Calibration frame is absent; five functional status symbols now use SVG.
  expect(screen.getAllByRole('img', { name: /desligado/ })).toHaveLength(5);
});

test('radio STREAM hotspot retains exact geometry and opens stream after decode', async () => {
  render(<App />);
  const button = screen.getByRole('button', { name: 'STREAM', exact: true });
  expect(parseFloat(button.style.left) * 3070 / 100).toBeCloseTo(1940, 8);
  expect(parseFloat(button.style.top) * 2048 / 100).toBeCloseTo(1682.5, 8);
  expect(parseFloat(button.style.width) * 3070 / 100).toBeCloseTo(780, 8);
  expect(parseFloat(button.style.height) * 2048 / 100).toBeCloseTo(225, 8);
  expect(button).toHaveStyle({ background: 'transparent', border: '0px' });
  fireEvent.click(button);
  expect(screen.queryByAltText('STREAM')).not.toBeInTheDocument();
  await finishLoading();
  expect(screen.getByAltText('STREAM')).toBeInTheDocument();
});

test('even after load, radio stays complete until decode resolves', async () => {
  render(<App />);
  let decode;
  streamImage().decode.mockReturnValue(new Promise(resolve => { decode = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'STREAM', exact: true }));
  await act(async () => { streamImage().onload(); });
  expect(screen.getByAltText('Radio')).toBeInTheDocument();
  expect(screen.queryByAltText('STREAM')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'TRANSMITIR' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Display STREAM' })).not.toBeInTheDocument();
  await act(async () => { decode(); });
  expect(screen.getByAltText('STREAM')).toBeInTheDocument();
});

test('load failure preserves radio and a later click retries', async () => {
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'STREAM', exact: true }));
  await act(async () => { streamImage().onerror(); });
  expect(screen.getByAltText('Radio')).toBeInTheDocument();
  expect(screen.queryByAltText('STREAM')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'STREAM', exact: true }));
  await finishLoading();
  expect(screen.getByAltText('STREAM')).toBeInTheDocument();
});

test('decode failure never reveals STREAM content', async () => {
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  render(<App />);
  streamImage().decode.mockRejectedValue(new Error('Decode failed'));
  fireEvent.click(screen.getByRole('button', { name: 'STREAM', exact: true }));
  await finishLoading();
  expect(screen.getByAltText('Radio')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'TRANSMITIR' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Display STREAM' })).not.toBeInTheDocument();
});

test('development preview also waits for the image', async () => {
  process.env.NODE_ENV = 'development';
  window.history.replaceState({}, '', '/?stream-calibration=1');
  render(<App />);
  expect(screen.queryByAltText('STREAM')).not.toBeInTheDocument();
  await finishLoading();
  expect(screen.getByAltText('STREAM')).toBeInTheDocument();
});

test('already decoded image is reused on subsequent entries', async () => {
  await openStream();
  fireEvent.click(screen.getByRole('button', { name: 'VOLTAR' }));
  fireEvent.click(screen.getByRole('button', { name: 'STREAM', exact: true }));
  expect(await screen.findByAltText('STREAM')).toBeInTheDocument();
  expect(images.filter(image => image.src === '/images/stream.png')).toHaveLength(1);
  expect(streamImage().decode).toHaveBeenCalledTimes(1);
});

test('display uses the approved geometry and clips its content', async () => {
  await openStream();
  const display = screen.getByRole('region', { name: 'Display STREAM' });
  expect(parseFloat(display.style.left) * 3070 / 100).toBeCloseTo(234, 8);
  expect(parseFloat(display.style.top) * 2048 / 100).toBeCloseTo(280, 8);
  expect(parseFloat(display.style.width) * 3070 / 100).toBeCloseTo(1812, 8);
  expect(parseFloat(display.style.height) * 2048 / 100).toBeCloseTo(1440, 8);
  expect(display).toHaveClass('stream-terminal');
  expect(screen.queryByText('VISUAL PREVIEW')).not.toBeInTheDocument();
});

test('themes cycle green, warm, red, cyan, orange, green and persist across remounts', async () => {
  const view = await openStream();
  const display = screen.getByRole('region', { name: 'Display STREAM' });
  expect(display).toHaveAttribute('data-theme', 'green');
  for (const theme of ['warm', 'red', 'cyan', 'orange', 'green', 'warm']) {
    fireEvent.click(screen.getByRole('button', { name: /Alterar cor do display/ }));
    expect(display).toHaveAttribute('data-theme', theme);
    expect(localStorage.getItem('retro-vu.stream-theme')).toBe(theme);
  }
  view.unmount();
  await openStream();
  expect(screen.getByRole('region', { name: 'Display STREAM' })).toHaveAttribute('data-theme', 'warm');
});

test('invalid saved preference falls back to green', async () => {
  localStorage.setItem('retro-vu.stream-theme', 'invalid');
  await openStream();
  expect(screen.getByRole('region', { name: 'Display STREAM' })).toHaveAttribute('data-theme', 'green');
});

test('unavailable storage does not prevent displaying or switching the theme', async () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
  await openStream();
  fireEvent.click(screen.getByRole('button', { name: /Alterar cor do display/ }));
  expect(screen.getByRole('region', { name: 'Display STREAM' })).toHaveAttribute('data-theme', 'warm');
});


describe('STREAM USB input', () => {
  let media, track, stream, ctx, source, analyser, frame, sample;
  let originalMedia, originalSecure, originalContext;
  const usb = { kind: 'audioinput', deviceId: 'usb-ttusb', label: 'USB audio' };
  const internal = { kind: 'audioinput', deviceId: 'internal', label: 'Built-in microphone' };
  beforeEach(() => {
    originalMedia = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    originalSecure = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    originalContext = window.AudioContext;
    sample = 0;
    track = { readyState: 'live', muted: false, stop: jest.fn(),
      getSettings: jest.fn(() => ({ deviceId: 'usb-ttusb', channelCount: 1, sampleRate: 44100, sampleSize: 24,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false })),
      addEventListener: jest.fn(), removeEventListener: jest.fn() };
    stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    media = { enumerateDevices: jest.fn().mockResolvedValue([internal, usb]),
      getUserMedia: jest.fn().mockResolvedValue(stream) };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    source = { connect: jest.fn(), disconnect: jest.fn() };
    analyser = { disconnect: jest.fn(), getFloatTimeDomainData: jest.fn(data => data.fill(sample)) };
    ctx = { destination: { channelCount: 2 }, state: 'running', currentTime: 2,
      getOutputTimestamp: jest.fn(() => ({ contextTime: 1.9, performanceTime: 100 })),
      addEventListener: jest.fn(), removeEventListener: jest.fn(), resume: jest.fn().mockResolvedValue(), close: jest.fn().mockResolvedValue(),
      createMediaStreamSource: jest.fn(() => source), createAnalyser: jest.fn(() => analyser) };
    window.AudioContext = jest.fn(() => ctx);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });
  afterEach(() => {
    if (originalMedia) Object.defineProperty(navigator, 'mediaDevices', originalMedia);
    else delete navigator.mediaDevices;
    if (originalSecure) Object.defineProperty(window, 'isSecureContext', originalSecure);
    else delete window.isSecureContext;
    window.AudioContext = originalContext;
  });
  async function begin() {
    await openStream();
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    await screen.findByText('USB CONECTADO');
  }
  test('TRANSMITIR selects USB explicitly and displays actual mono settings, without playback', async () => {
    await begin();
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(media.getUserMedia).toHaveBeenCalledWith({ video: false, audio: {
      deviceId: { exact: 'usb-ttusb' }, sampleRate: { ideal: 48000 },
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    } });
    expect(screen.getByText('MONO')).toBeInTheDocument();
    expect(screen.getByText('44.1 kHz / 24 BIT')).toBeInTheDocument();
    expect(screen.queryByText('BUFFER')).not.toBeInTheDocument();
    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('VISUAL PREVIEW')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
  });
  test('MONITOR before READY never requests capture or opens an audio context', async () => {
    await openStream();
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    expect(screen.getByText('ATIVE A ENTRADA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MONITOR', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(window.AudioContext).not.toHaveBeenCalled();
  });
  test('MONITOR toggles only the output of the existing source; SIGNAL and USB remain active', async () => {
    await begin();
    const button = screen.getByRole('button', { name: 'MONITOR', exact: true });
    fireEvent.click(button);
    expect(await screen.findByText('MONITOR ATIVO')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(source.connect).toHaveBeenLastCalledWith(ctx.destination);
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
    expect(ctx.createMediaStreamSource).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    expect(screen.getByText('TRANSMITIR ATIVO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MONITOR', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(source.disconnect.mock.calls).toEqual([[ctx.destination]]);
    expect(track.stop).not.toHaveBeenCalled();
    expect(analyser.disconnect).not.toHaveBeenCalled();
    expect(ctx.close).not.toHaveBeenCalled();
    sample = 0.5;
    act(() => frame(60));
    expect(Number(screen.getByRole('meter', { name: 'SIGNAL' }).getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    fireEvent.click(button);
    await screen.findByText('MONITOR ATIVO');
    expect(source.connect.mock.calls).toEqual([[analyser], [ctx.destination], [ctx.destination]]);
  });
  test('VOLTAR preserves MONITOR and USB; explicit toggle still releases capture', async () => {
    await begin();
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    await screen.findByText('MONITOR ATIVO');
    fireEvent.click(screen.getByRole('button', { name: 'VOLTAR' }));
    expect(track.stop).not.toHaveBeenCalled();
    expect(source.disconnect).not.toHaveBeenCalled();
    expect(ctx.close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'STREAM', exact: true }));
    await screen.findByText('MONITOR ATIVO');
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledWith();
    expect(ctx.close).toHaveBeenCalled();
  });
  test('pending MONITOR resume survives VOLTAR', async () => {
    await begin();
    ctx.state = 'suspended';
    let resume;
    ctx.resume.mockReturnValue(new Promise(resolve => { resume = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'VOLTAR' }));
    await act(async () => { ctx.state = 'running'; resume(); });
    expect(source.connect).toHaveBeenCalledWith(ctx.destination);
    expect(track.stop).not.toHaveBeenCalled();
  });
  test('turning MONITOR OFF while resume is pending cancels the requested output', async () => {
    await begin();
    ctx.state = 'suspended';
    let resume;
    ctx.resume.mockReturnValue(new Promise(resolve => { resume = resolve; }));
    const button = screen.getByRole('button', { name: 'MONITOR', exact: true });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => { ctx.state = 'running'; resume(); });
    expect(source.connect.mock.calls).toEqual([[analyser]]);
    expect(screen.getByText('TRANSMITIR ATIVO')).toBeInTheDocument();
    expect(track.stop).not.toHaveBeenCalled();
  });
  test('MONITOR resume failure preserves capture and reports an error', async () => {
    await begin();
    ctx.state = 'suspended';
    ctx.resume.mockRejectedValue(new Error('Denied'));
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    await screen.findByText('MONITOR INDISPONÍVEL');
    expect(screen.getByRole('button', { name: 'MONITOR', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(source.connect.mock.calls).toEqual([[analyser]]);
    expect(track.stop).not.toHaveBeenCalled();
  });
  test('MONITOR calls resume directly even when running and waits before connecting', async () => {
    await begin();
    let resolve;
    ctx.resume.mockReturnValue(new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(source.connect.mock.calls).toEqual([[analyser]]);
    await act(async () => resolve());
    expect(source.connect).toHaveBeenLastCalledWith(ctx.destination);
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(track.stop).not.toHaveBeenCalled();
  });
  test('resolved resume without running never connects output', async () => {
    await begin();
    ctx.state = 'suspended';
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    await screen.findByText('MONITOR INDISPONÍVEL');
    expect(source.connect.mock.calls).toEqual([[analyser]]);
    expect(track.stop).not.toHaveBeenCalled();
  });
  test('suspended context resumes to running before output is connected', async () => {
    await begin();
    ctx.state = 'suspended';
    ctx.resume.mockImplementation(async () => { ctx.state = 'running'; });
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    await screen.findByText('MONITOR ATIVO');
    expect(source.connect).toHaveBeenLastCalledWith(ctx.destination);
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
  });
  test('TRANSMITIR OFF stops monitor and capture; next ON creates one fresh session', async () => {
    await begin();
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    await screen.findByText('MONITOR ATIVO');
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    expect(screen.getByRole('heading', { name: 'PRONTO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TRANSMITIR' })).toHaveAttribute('aria-pressed', 'false');
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledWith();
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    await screen.findByText('USB CONECTADO');
    expect(media.getUserMedia).toHaveBeenCalledTimes(2);
    expect(ctx.createMediaStreamSource).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'MONITOR', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });
  test('TRANSMITIR cancels a pending capture and stops late tracks', async () => {
    let resolve;
    media.getUserMedia.mockReturnValue(new Promise(done => { resolve = done; }));
    await openStream();
    const transmit = screen.getByRole('button', { name: 'TRANSMITIR' });
    fireEvent.click(transmit);
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('heading', { name: 'ABRINDO USB' })).toBeInTheDocument();
    fireEvent.click(transmit);
    await act(async () => resolve(stream));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(ctx.createMediaStreamSource).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'PRONTO' })).toBeInTheDocument();
  });
  test('TRANSMITIR OFF invalidates a pending monitor resume', async () => {
    await begin();
    let resume;
    ctx.resume.mockReturnValue(new Promise(done => { resume = done; }));
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    await act(async () => resume());
    expect(source.connect.mock.calls).toEqual([[analyser]]);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'PRONTO' })).toBeInTheDocument();
  });
  test('MONITOR never invokes output experiments or changes stored diagnostics', async () => {
    await begin();
    localStorage.setItem('retro-vu.monitor-diagnostic', 'previous report');
    media.selectAudioOutput = jest.fn();
    ctx.setSinkId = jest.fn();
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    await screen.findByText('MONITOR ATIVO');
    expect(media.selectAudioOutput).not.toHaveBeenCalled();
    expect(ctx.setSinkId).not.toHaveBeenCalled();
    expect(media.enumerateDevices).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('retro-vu.monitor-diagnostic')).toBe('previous report');
    expect(screen.getByText('Sem áudio? Selecione a saída de mídia no Android.')).toBeInTheDocument();
  });
  test.each(['PLAY / STOP'])('%s does not affect an active capture or monitor', async label => {
    await begin();
    fireEvent.click(screen.getByRole('button', { name: 'MONITOR', exact: true }));
    await screen.findByText('MONITOR ATIVO');
    fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
    expect(track.stop).not.toHaveBeenCalled();
    expect(source.disconnect).not.toHaveBeenCalled();
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'MONITOR ATIVO' })).toBeInTheDocument();
  });
  test('known internal microphone is never selected when USB is absent', async () => {
    media.enumerateDevices.mockResolvedValue([internal]);
    await openStream();
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    await screen.findByText('USB NÃO ENCONTRADO');
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
  });
  test('hidden labels trigger temporary permission, re-enumeration and exact USB capture', async () => {
    const permissionTrack = { stop: jest.fn() };
    media.enumerateDevices.mockResolvedValueOnce([{ kind: 'audioinput', deviceId: '', label: '' }]);
    media.getUserMedia.mockResolvedValueOnce({ getTracks: () => [permissionTrack] });
    await begin();
    expect(media.enumerateDevices).toHaveBeenCalledTimes(2);
    expect(permissionTrack.stop).toHaveBeenCalled();
    expect(media.getUserMedia).toHaveBeenCalledTimes(2);
    expect(media.getUserMedia.mock.calls[1][0].audio.deviceId).toEqual({ exact: 'usb-ttusb' });
  });
  test('no USB after permission stops the probe and never promotes internal mic to input', async () => {
    media.enumerateDevices.mockResolvedValueOnce([]).mockResolvedValue([internal]);
    await openStream();
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    await screen.findByText('USB NÃO ENCONTRADO');
    expect(track.stop).toHaveBeenCalled();
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(ctx.createMediaStreamSource).not.toHaveBeenCalled();
  });
  test('permission rejection is shown clearly', async () => {
    media.getUserMedia.mockRejectedValue(Object.assign(new Error('Denied'), { name: 'NotAllowedError' }));
    await openStream();
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    await screen.findByText('PERMITA O ÁUDIO');
    expect(ctx.close).toHaveBeenCalled();
  });
  test('SIGNAL follows real analyser samples and decays to zero in silence', async () => {
    await begin();
    act(() => frame(0));
    expect(screen.getByRole('meter', { name: 'SIGNAL' })).toHaveAttribute('aria-valuenow', '0');
    sample = 0.5;
    act(() => frame(60));
    expect(Number(screen.getByRole('meter', { name: 'SIGNAL' }).getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    sample = 0;
    for (let t = 120; t < 1500; t += 60) {
      const nextFrame = frame;
      act(() => nextFrame(t));
    }
    expect(screen.getByRole('meter', { name: 'SIGNAL' })).toHaveAttribute('aria-valuenow', '0');
    expect(analyser.getFloatTimeDomainData).toHaveBeenCalled();
  });
  test('VOLTAR preserves capture and re-entry; unmount releases resources', async () => {
    const view = await openStream();
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    await screen.findByText('USB CONECTADO');
    fireEvent.click(screen.getByRole('button', { name: 'VOLTAR' }));
    expect(track.stop).not.toHaveBeenCalled();
    expect(ctx.close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'STREAM', exact: true }));
    await screen.findByText('USB CONECTADO');
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(ctx.close).toHaveBeenCalled();
  });
  test('navigation while capture is pending preserves the late stream', async () => {
    let resolve;
    media.getUserMedia.mockReturnValue(new Promise(done => { resolve = done; }));
    await openStream();
    fireEvent.click(screen.getByRole('button', { name: 'TRANSMITIR' }));
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'VOLTAR' }));
    await act(async () => resolve(stream));
    expect(track.stop).not.toHaveBeenCalled();
    expect(screen.getByAltText('Radio')).toBeInTheDocument();
    expect(ctx.createMediaStreamSource).toHaveBeenCalledTimes(1);
  });
  test('USB removal resets signal and allows a later retry', async () => {
    await begin();
    const ended = track.addEventListener.mock.calls.find(([name]) => name === 'ended')[1];
    act(() => ended());
    expect(screen.getByText('USB DESCONECTADO')).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByRole('meter', { name: 'SIGNAL' })).not.toBeInTheDocument();
  });
  test('missing settings are shown as unknown rather than fabricated', async () => {
    track.getSettings.mockReturnValue({});
    await begin();
    expect(screen.getByText('-- kHz / -- BIT')).toBeInTheDocument();
    expect(screen.queryByText('MONO')).not.toBeInTheDocument();
  });
});
