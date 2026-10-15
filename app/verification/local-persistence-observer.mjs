import {expect} from '@playwright/test';

// Test-only observer of the real public channel. It never edits requests/replies.
export async function observe(page){
  await page.addInitScript(()=>{
    const trace={requests:[],responses:[],view:null,worker:null};window.fpPersistenceTrace=trace;
    const Native=Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){
      const worker=Reflect.construct(Target,args);if(!String(args[0]).includes('/assets/worker-'))return worker;
      trace.worker=worker;
      worker.addEventListener('message',event=>{trace.responses.push({message:structuredClone(event.data),page_now:performance.now(),utc:Date.now()});if(event.data.ok&&event.data.view)trace.view=event.data.view;});
      const post=worker.postMessage.bind(worker);worker.postMessage=(message,...rest)=>{trace.requests.push(structuredClone(message));post(message,...rest);};return worker;
    }});
  });
}

export const trace=page=>page.evaluate(()=>({requests:window.fpPersistenceTrace.requests,responses:window.fpPersistenceTrace.responses,view:window.fpPersistenceTrace.view}));

export async function view(page){
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const state=window.fpPersistenceTrace,request_id=crypto.randomUUID();if(!state.worker||!state.view){reject(Error('No actual current Worker view'));return;}
    const timer=setTimeout(()=>{state.worker.removeEventListener('message',receive);reject(Error('Actual public view timeout'));},10000);
    function receive(event){if(event.data.request_id!==request_id)return;clearTimeout(timer);state.worker.removeEventListener('message',receive);if(!event.data.ok){reject(Error(event.data.code));return;}resolve(event.data.view);}
    state.worker.addEventListener('message',receive);state.worker.postMessage({kind:'view',run_id:state.view.run_id,request_id});
  }));
}

export async function keyboardActivate(page,locator){
  for(let i=0;i<80;i++){
    if(await locator.evaluate(element=>element===document.activeElement)){await page.keyboard.press('Enter');return;}
    // Walk toward the target without wrapping through browser chrome and
    // accidentally causing a genuine focus-loss management pause.
    const backwards=await locator.evaluate(element=>!!(element.compareDocumentPosition(document.activeElement)&Node.DOCUMENT_POSITION_FOLLOWING));
    await page.keyboard.press(backwards?'Shift+Tab':'Tab');
  }
  throw Error('Named control not reached by80 real Tab keys');
}

export async function operation(page,kind,activate){
  const attempts=[];
  for(let i=0;i<3;i++){
    const start=(await trace(page)).requests.length;await activate();
    let pair;
    await expect.poll(async()=>{const t=await trace(page),request=t.requests.slice(start).find(r=>kind==='restore'?r.kind==='takeover':r.kind==='operate'&&r.envelope.intent.kind===kind);const response=t.responses.find(r=>r.message.request_id===request?.request_id);if(request&&response)pair={request,response};return !!pair;},{timeout:30000,intervals:[100]}).toBe(true);
    attempts.push(pair);const reply=pair.response.message;
    if(reply.ok){const operation_id=kind==='restore'?pair.request.operation_id:pair.request.envelope.operation_id;expect(reply.receipt).toMatchObject({kind,operation_id,result:'committed'});return{...pair,attempts};}
    // A new UI request is allowed only after definitive stale rejection and newer real view.
    if(reply.code!=='STALE_REVISION'||kind==='restore')throw Error('Public operation rejected: '+reply.code);
    await expect.poll(async()=>((await view(page)).revision),{timeout:10000,intervals:[100]}).toBeGreaterThan(pair.request.envelope.expected_revision);
  }
  throw Error('Three definitively stale UI attempts; preserve and reassess');
}

export async function diagnosticSnapshot(page,run){
  return page.evaluate(run_id=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('fogbound-map-b-game-1');
    request.onerror=()=>reject(Error('Owned diagnostic DB open failed'));
    request.onupgradeneeded=()=>{request.transaction.abort();reject(Error('Expected current database absent; never create a fixture here'));};
    request.onsuccess=()=>{const db=request.result,tx=db.transaction(['runs','snapshots'],'readonly'),current=tx.objectStore('runs').get(run_id);let state,snapshot;
      current.onsuccess=()=>{state=current.result;if(!state){reject(Error('Owned current run absent'));db.close();return;}const saved=tx.objectStore('snapshots').get(`${run_id}:${state.revision}`);saved.onsuccess=()=>{snapshot=saved.result?.state;};};
      tx.oncomplete=()=>{db.close();resolve({state,snapshot});};tx.onabort=()=>{db.close();reject(Error('Owned diagnostic read aborted'));};
    };
  }),run);
}
