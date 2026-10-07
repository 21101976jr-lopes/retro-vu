import {renderHook,act} from '@testing-library/react';
import useVoiceInput from './useVoiceInput';
let track,ctx,stream;
beforeEach(()=>{
 track={enabled:true,stop:jest.fn(),getSettings:()=>({channelCount:1,sampleRate:48000}),addEventListener:jest.fn()};stream={getAudioTracks:()=>[track],getTracks:()=>[track]};
 ctx={state:'running',destination:{},resume:jest.fn().mockResolvedValue(),close:jest.fn().mockResolvedValue(),createAnalyser:()=>({disconnect:jest.fn()}),createMediaStreamSource:()=>({connect:jest.fn(),disconnect:jest.fn()})};
 window.AudioContext=jest.fn(()=>ctx);Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:jest.fn().mockResolvedValue(stream)}});
});
test('one speech capture shared by monitor and mute; no musical PCM buffer',async()=>{
 const {result,unmount}=renderHook(()=>useVoiceInput());await act(()=>result.current.start());
 expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({audio:expect.objectContaining({echoCancellation:true,noiseSuppression:true,autoGainControl:true})});
 const session=result.current.session;await act(()=>result.current.toggleMonitor());act(()=>result.current.toggleMute());expect(track.enabled).toBe(false);expect(result.current.muted).toBe(true);
 act(()=>result.current.toggleMute());expect(track.enabled).toBe(true);expect(result.current.session).toBe(session);expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
 unmount();expect(track.stop).toHaveBeenCalled();expect(ctx.close).toHaveBeenCalled();
});
test('denied permission and late permission resolution release resources',async()=>{
 navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(new DOMException('denied','NotAllowedError'));
 const {result}=renderHook(()=>useVoiceInput());await act(()=>result.current.start());expect(result.current.message).toBe('AUDIO PERMISSION REQUIRED');expect(result.current.session).toBeNull();
 let resolve;navigator.mediaDevices.getUserMedia.mockReturnValueOnce(new Promise(r=>resolve=r));let pending;await act(async()=>{pending=result.current.start();await Promise.resolve();await Promise.resolve();});act(()=>result.current.stop());await act(async()=>{resolve(stream);await pending;});expect(track.stop).toHaveBeenCalled();expect(result.current.session).toBeNull();
});
