import {expect} from '@playwright/test';
export {trace,view,keyboardActivate,diagnosticSnapshot} from './local-persistence-observer.mjs';
import {trace,view} from './local-persistence-observer.mjs';

// Test-only passive observation of real public messages; request/reply payloads are never edited.
export async function observe(page){
  await page.addInitScript(()=>{
    const trace={requests:[],responses:[],view:null,worker:null,request_times:new Map()};window.fpPersistenceTrace=trace;
    const Native=window.Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args);if(!String(args[0]).includes('/assets/worker-'))return worker;
      trace.worker=worker;
      worker.addEventListener('message',event=>{const now=performance.now(),sent=trace.request_times.get(event.data.request_id);trace.responses.push({message:structuredClone(event.data),page_now:now,utc:Date.now(),response_ms:sent===undefined?null:now-sent});if(event.data.ok&&event.data.view)trace.view=event.data.view;});
      const post=worker.postMessage.bind(worker);worker.postMessage=(message,...rest)=>{trace.request_times.set(message.request_id,performance.now());trace.requests.push(structuredClone(message));post(message,...rest);};return worker;
    }});
    window.b21FocusEvents=[];
    for(const kind of ['blur','focus','visibilitychange'])(kind==='visibilitychange'?document:window).addEventListener(kind,event=>window.b21FocusEvents.push({kind,trusted:event.isTrusted,hidden:document.hidden,focused:document.hasFocus(),at:performance.now()}));
  });
}

export async function operation(page,kind,activate){
  const attempts=[];
  for(let attempt=0;attempt<3;attempt++){
    const since=(await trace(page)).requests.length;await activate();let pair;
    await expect.poll(async()=>{
      const t=await trace(page),requests=t.requests.slice(since).filter(r=>kind==='restore'?r.kind==='takeover':r.kind==='operate_corridor'&&r.envelope.intent.kind===kind);
      for(const request of requests){const response=t.responses.find(r=>r.message.request_id===request.request_id&&r.message.ok&&r.message.receipt?.kind===kind);if(response){pair={request,response};return true;}}
      // UI confirmation owns its bounded definitive-stale retry; wait for that actual result.
      if(kind==='issue')return false;
      const request=requests.at(-1),response=t.responses.find(r=>r.message.request_id===request?.request_id);if(request&&response){pair={request,response};return true;}return false;
    },{timeout:15000,intervals:[100]}).toBe(true);
    attempts.push(pair);const reply=pair.response.message;
    if(reply.ok){expect(reply.receipt).toMatchObject({kind,result:'committed'});return {...pair,attempts};}
    if(reply.code!=='STALE_REVISION'||kind==='restore')throw Error('Definitive public operation rejection: '+reply.code);
    await expect.poll(async()=>(await view(page)).revision).toBeGreaterThan(pair.request.envelope.expected_revision);
  }
  throw Error('Three definitively stale UI attempts; retain evidence and reassess');
}

export async function display_record(page,run){
  return page.evaluate(run=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('fogbound-map-b-display-1');open.onerror=()=>reject(Error('Owned display open failed'));
    open.onupgradeneeded=()=>{open.transaction.abort();reject(Error('Expected display DB absent; never create a fixture'));};
    open.onsuccess=()=>{const db=open.result,tx=db.transaction(['heads','records'],'readonly'),request=tx.objectStore('heads').get(run);let result=null;
      request.onsuccess=()=>{const head=request.result;if(!head)return;const record=tx.objectStore('records').get(head.id);record.onsuccess=()=>{result={head,record:record.result};};};
      tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=()=>{db.close();reject(Error('Owned display read aborted'));};
    };
  }),run);
}
