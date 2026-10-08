test('waiting worker is retried on idle and visibility without reloading active audio',async()=>{
 jest.resetModules();const original=process.env.NODE_ENV;process.env.NODE_ENV='production';
 const listeners={},waiting={postMessage:jest.fn()},reg={waiting,addEventListener:jest.fn(),update:jest.fn().mockResolvedValue()};
 const sw={controller:{},register:jest.fn().mockResolvedValue(reg),addEventListener:(name,fn)=>{listeners[name]=fn;}};
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:sw});
 const {registerPwa,setPwaBusy}=require('./pwa');setPwaBusy(true);registerPwa();await Promise.resolve();await Promise.resolve();
 expect(waiting.postMessage).not.toHaveBeenCalled();
 const port={postMessage:jest.fn()};listeners.message({data:{type:'CHECK_IDLE'},ports:[port]});expect(port.postMessage).toHaveBeenCalledWith({idle:false});
 setPwaBusy(false);expect(waiting.postMessage).toHaveBeenCalledWith({type:'TRY_ACTIVATE'});
 listeners.message({data:{type:'CHECK_IDLE'},ports:[port]});expect(port.postMessage).toHaveBeenLastCalledWith({idle:true});
 setPwaBusy(true);listeners.controllerchange();expect(waiting.postMessage).toHaveBeenCalledTimes(1);
 delete navigator.serviceWorker;process.env.NODE_ENV=original;
});
