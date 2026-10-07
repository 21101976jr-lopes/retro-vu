export function radioLights({kind,muted=false,localPlaying=false,legacyMic=false,receiving=false,monitor=false,playerSending=false}){
 const mic=kind==='voice'?!muted:Boolean(!kind&&legacyMic);
 const player=Boolean((kind&&kind!=='voice')||(!kind&&localPlaying));
 return {mic,player,listening:Boolean(receiving||(monitor&&!muted)||(localPlaying&&(!playerSending||monitor)))};
}
