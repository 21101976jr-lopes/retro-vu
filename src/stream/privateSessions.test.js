import {Signaling} from './signaling';
const {createHandler,roomKey}=require('../../server/signaling.cjs');
const cryptoNode=require('crypto');
const ownerA='a'.repeat(64),ownerB='b'.repeat(64);
const invite=owner=>cryptoNode.createHash('sha256').update(owner).digest('hex');
const roomA={owner:ownerA,invite:invite(ownerA)},roomB={owner:ownerB,invite:invite(ownerB)};
const id=n=>`${String(n).padStart(8,'0')}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;
const request=(room,n,role='receive',extra={})=>({...room,id:id(n),role,...extra});
async function call(handler,body){const res={setHeader:jest.fn(),status:jest.fn(function(code){this.code=code;return this;}),json:jest.fn(function(data){this.data=data;return this;})};await handler({method:'POST',headers:{host:'test'},body},res);return res;}
test('private rooms support simultaneous transmitters, late joining and no cross-room SDP/ICE',async()=>{
 const handler=createHandler({local:true});
 await call(handler,request(roomA,1,'send'));await call(handler,request(roomB,2,'send'));
 expect((await call(handler,request(roomA,3))).data.peers.map(p=>p.id)).toEqual([id(1)]);
 expect((await call(handler,request(roomB,4))).data.peers.map(p=>p.id)).toEqual([id(2)]);
 await call(handler,request(roomA,1,'send',{messages:[{key:'cross',to:id(4),type:'candidate',value:{candidate:'private'}}]}));
 expect((await call(handler,request(roomB,4))).data.messages).toEqual([]);
 expect((await call(handler,{id:id(5),role:'receive'})).code).toBe(403);
 expect((await call(handler,request({invite:roomA.invite},6,'send'))).code).toBe(403);
 expect(()=>roomKey({invite:roomA.invite,owner:ownerB,role:'send'})).toThrow();
});
test('three receivers maximum, sender can join later, reconnect stays in same private room',async()=>{
 const handler=createHandler({local:true});
 for(let n=2;n<=4;n++)expect((await call(handler,request(roomA,n))).code).toBeUndefined();
 expect((await call(handler,request(roomA,5))).code).toBe(409);
 expect((await call(handler,request(roomA,1,'send'))).data.peers).toHaveLength(3);
 await call(handler,request(roomA,3,'receive',{leave:true}));
 expect((await call(handler,request(roomA,3))).data.peers).toEqual([{id:id(1),role:'send'}]);
 await call(handler,request(roomA,1,'send',{leave:true}));
 expect((await call(handler,request(roomA,3))).data.peers).toEqual([]);
});
test('production adapter isolates Redis keys across independent function instances',async()=>{
 const before={...process.env},store=new Map();
 process.env.STREAM_ENABLED='true';process.env.UPSTASH_REDIS_REST_URL='https://redis.example';process.env.UPSTASH_REDIS_REST_TOKEN='test-only';process.env.STREAM_NAMESPACE='test';
 const oldFetch=global.fetch,oldTimeout=AbortSignal.timeout;AbortSignal.timeout=()=>undefined;
 global.fetch=jest.fn(async(url,options)=>{
  const c=JSON.parse(options.body);let result;
  if(c[0]==='GET')result=store.get(c[1])||null;
  else {const key=c[3];if((store.get(key)||'')===c[4]){store.set(key,c[5]);result=1;}else result=0;}
  return {ok:true,json:async()=>({result})};
 });
 try{
  await call(createHandler(),request(roomA,1,'send'));await call(createHandler(),request(roomB,2,'send'));
  expect((await call(createHandler(),request(roomA,3))).data.peers).toEqual([{id:id(1),role:'send'}]);
  expect(store.size).toBe(2);expect([...store.keys()].join('')).not.toContain(roomA.invite);
  expect([...store.values()].join('')).not.toContain(ownerA);
 }finally{global.fetch=oldFetch;AbortSignal.timeout=oldTimeout;process.env=before;}
});
test('signaling sends private credentials on poll and leave, reconnect errors retain them',async()=>{
 jest.useFakeTimers();const oldFetch=global.fetch;
 Object.defineProperty(window,'crypto',{configurable:true,value:cryptoNode.webcrypto});
 global.fetch=jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ok:true,json:async()=>({peers:[],messages:[]})});
 try{
  const signal=new Signaling('receive',jest.fn(),jest.fn(),{invite:roomA.invite});
  await signal.poll();await signal.poll();signal.close();
  for(const [,options]of global.fetch.mock.calls)expect(JSON.parse(options.body).invite).toBe(roomA.invite);
 }finally{global.fetch=oldFetch;jest.useRealTimers();}
});

test('expired Redis state resets acknowledgment generation so new offers are not lost',()=>{
 const {transition}=require('../../server/signaling.cjs');
 const first=transition(null,request(roomA,1,'send'),1);
 let restarted=transition(null,request(roomA,1,'send'),200000);
 restarted=transition(restarted.state,request(roomA,2),200001);
 restarted=transition(restarted.state,request(roomA,1,'send',{messages:[{key:'new',to:id(2),type:'description',value:{type:'offer'}}]}),200002);
 const received=transition(restarted.state,request(roomA,2,'receive',{ack:999,generation:first.state.generation}),200003);
 expect(received.result.messages).toHaveLength(1);
 expect(received.result.generation).not.toBe(first.state.generation);
});
