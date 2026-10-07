import {nextTrack} from './playlist';
test('sequential queue ends, repeat wraps, previous and shuffle do not repeat current',()=>{
 expect(nextTrack(0,3)).toBe(1);expect(nextTrack(2,3)).toBeNull();expect(nextTrack(2,3,{repeat:true})).toBe(0);
 expect(nextTrack(0,3,{direction:-1,repeat:true})).toBe(2);expect(nextTrack(1,3,{shuffle:true,random:()=>0})).toBe(2);expect(nextTrack(0,0)).toBeNull();
});
