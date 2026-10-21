/// <reference lib="webworker" />
// Build-time only carrier. This file is not imported by production source.
const scope=self as unknown as DedicatedWorkerGlobalScope;let wall:number|null=null;
export const verification_now=()=>wall??performance.now();
scope.addEventListener('message',(event:MessageEvent<unknown>)=>{
 const value=event.data;if(!value||typeof value!=='object'||Reflect.get(value,'kind')!=='__B33_VERIFICATION_CLOCK__')return;event.stopImmediatePropagation();
 const at=Reflect.get(value,'at'),request_id=Reflect.get(value,'request_id');if(typeof request_id!=='string'||!Number.isSafeInteger(at)||at<0||at>910000||wall!==null&&at<wall||Object.keys(value).sort().join(',')!=='at,kind,request_id'){if(typeof request_id==='string')scope.postMessage({request_id,ok:false,code:'INVALID_REQUEST'});return;}
 wall=at;scope.postMessage({request_id,ok:true,receipt:null});
});
