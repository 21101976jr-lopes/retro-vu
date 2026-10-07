export function nextTrack(index,length,{direction=1,repeat=false,shuffle=false,random=Math.random}={}){
 if(!length)return null;
 if(shuffle&&length>1){const offset=1+Math.floor(random()*(length-1));return(index+offset)%length;}
 const next=index+direction;if(next>=0&&next<length)return next;
 return repeat?(next+length)%length:null;
}
