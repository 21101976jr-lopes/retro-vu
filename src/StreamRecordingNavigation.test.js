import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import useStreamInput from './useStreamInput';
import {WavRecorder} from './recording/WavRecorder';
import { StreamTransport } from './stream/transport';
jest.mock('./recording/WavRecorder');
jest.mock('./stream/invitation',()=>({newInvitation:async()=>({invite:'a'.repeat(64),owner:'b'.repeat(64)}),pendingInvitation:()=>'',invitationURL:()=> 'https://example.test/#stream=private'}));
jest.mock('./useStreamInput');
jest.mock('./stream/transport', () => ({ StreamTransport: jest.fn() }));
test('REC, USB, monitor and transmission survive RADIO / VU / STROBE / STREAM navigation', async () => {
  const images = [], track = Object.assign(new EventTarget(), { readyState:'live', stop:jest.fn() });
  const session = { analyser:{fftSize:8,getByteTimeDomainData:data=>data.fill(128)}, ready:true, stream:{getAudioTracks:()=>[track]} };
  const stopCapture = jest.fn(), closeNetwork = jest.fn(), stopRecorder = jest.fn();
  let recorder;
  WavRecorder.mockImplementation((source,update)=>{
    recorder={session:source,state:'inactive',start:async()=>{recorder.state='recording';update({status:'recording'});},
      stop:async()=>{stopRecorder();recorder.state='inactive';},dispose:()=>stopRecorder()};return recorder;
  });
  useStreamInput.mockReturnValue({ session,status:'READY',settings:{},monitor:true,signal:3,stop:stopCapture });
  StreamTransport.mockImplementation((role, source, update) => ({ start:()=>update({role,status:'CONNECTED'}),close:closeNetwork }));
  jest.spyOn(window,'Image').mockImplementation(()=>{const image={ decode:jest.fn().mockResolvedValue() }; images.push(image); return image;});
  window.ResizeObserver = class { observe() {} disconnect() {} };
  const { container, unmount } = render(<App />);
  fireEvent.click(screen.getByRole('button',{name:'STREAM',exact:true}));
  await act(async()=>images.find(i=>i.src==='/images/stream.png').onload());
  fireEvent.click(screen.getByRole('button',{name:'REC',exact:true}));
  expect(await screen.findByRole('img',{name:'REC: ativo'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'VOLTAR',exact:true}));
  expect(screen.getByAltText('Radio')).toBeInTheDocument();
  // Existing art hotspots are intentionally transparent divs, identified by their calibrated coordinates.
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  fireEvent.click(container.querySelector('div[style*="left: 3%;"][style*="top: 7%;"]'));
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  fireEvent.click(container.querySelector('div[style*="left: 73.75%;"]'));
  fireEvent.click(screen.getByText('◀ VU'));
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  fireEvent.click(container.querySelector('div[style*="left: 1%;"][style*="cursor: pointer"]'));
  fireEvent.click(screen.getByRole('button',{name:'STREAM',exact:true}));
  expect(await screen.findByRole('img',{name:'REC: ativo'})).toBeInTheDocument();
  expect(screen.getByRole('img',{name:'MONITOR: ativo'})).toBeInTheDocument();
  expect(recorder.state).toBe('recording'); expect(stopRecorder).not.toHaveBeenCalled();
  expect(stopCapture).not.toHaveBeenCalled(); expect(track.stop).not.toHaveBeenCalled();
  expect(closeNetwork).not.toHaveBeenCalled(); expect(StreamTransport).toHaveBeenCalledTimes(1);
  unmount(); expect(stopRecorder).toHaveBeenCalledTimes(1);
  delete window.ResizeObserver; jest.restoreAllMocks();
});
