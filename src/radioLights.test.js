import {radioLights} from './radioLights';
test('USB and received music never illuminate microphone',()=>{
 expect(radioLights({kind:'usb',receiving:true})).toEqual({mic:false,player:true,listening:true});
 expect(radioLights({kind:'player',localPlaying:true})).toEqual({mic:false,player:true,listening:true});
});
test('voice mute and actual monitor/playout control status independently',()=>{
 expect(radioLights({kind:'voice',muted:true})).toEqual({mic:false,player:false,listening:false});
 expect(radioLights({kind:'voice',monitor:true})).toEqual({mic:true,player:false,listening:true});
 expect(radioLights({kind:'usb'}).listening).toBe(false);
 expect(radioLights({kind:'player',localPlaying:true,playerSending:true,monitor:false}).listening).toBe(false);
});
