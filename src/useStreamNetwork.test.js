import {renderHook,act,waitFor} from '@testing-library/react';
import useStreamNetwork from './useStreamNetwork';
import {StreamTransport} from './stream/transport';
jest.mock('./stream/transport',()=>({StreamTransport:jest.fn()}));
jest.mock('./stream/invitation',()=>({newInvitation:async()=>({invite:'a'.repeat(64),owner:'b'.repeat(64)}),pendingInvitation:()=>'',invitationURL:()=> 'https://example.test/#stream=private'}));
beforeEach(()=>{StreamTransport.mockClear();StreamTransport.mockImplementation((role,source,update)=>({role,start:()=>update({role,status:'WAITING'}),close:jest.fn()}));});
test.each(['open','private'])('confirmed %s capture creates exactly one transport with correct visibility',async mode=>{
 const {result,rerender}=renderHook(({session})=>useStreamNetwork(session),{initialProps:{session:null}});
 const capture=jest.fn();act(()=>result.current.requestTransmit(capture));
 expect(StreamTransport).not.toHaveBeenCalled();
 act(()=>result.current.confirmTransmit(mode));expect(capture).toHaveBeenCalledTimes(1);
 const session={source:{}};rerender({session});
 await waitFor(()=>expect(StreamTransport).toHaveBeenCalledTimes(1));
 expect(StreamTransport).toHaveBeenCalledWith('send',session,expect.any(Function),expect.objectContaining({visibility:mode}));
 expect(result.current.share).toBe(mode==='private'?'https://example.test/#stream=private':'');
 expect(result.current.dialog).toBe(mode==='private'?'share':null);
});
