import {newInvitation,parseInvitation,invitationURL} from './invitation';
const nodeCrypto=require('crypto');
beforeEach(()=>{Object.defineProperty(window,'crypto',{configurable:true,value:nodeCrypto.webcrypto});global.TextEncoder=require('util').TextEncoder;});
test('unpredictable invitations authorize listeners without revealing sender credential',async()=>{
 const a=await newInvitation(),b=await newInvitation();expect(a.invite).not.toBe(b.invite);
 expect(a.invite).toBe(nodeCrypto.createHash('sha256').update(a.owner).digest('hex'));
 expect(invitationURL(a.invite)).not.toContain(a.owner);
 expect(parseInvitation(invitationURL(a.invite))).toBe(a.invite);
 expect(parseInvitation('http://another.example/#stream='+a.invite)).toBeNull();
 expect(parseInvitation('123456')).toBeNull();
});
