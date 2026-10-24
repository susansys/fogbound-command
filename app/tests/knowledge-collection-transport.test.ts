import {expect,test,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {Transport} from '../src/transport';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';
import {hash} from '../src/core/scenario';
import {canonical} from '../src/core/snapshot';
import {is_collection_report} from '../src/knowledge-collection-contracts';
import {IDBFactory} from 'fake-indexeddb';
import type {Response} from '../src/transport';

async function actualWorkerModule(action:(send:(frame:Record<string,unknown>)=>Promise<Response>,pulse:()=>Promise<Response>)=>Promise<void>){
  // Browser host carrier only: the actual worker module, Game and Persistence run.
  // An independent fake-IDB factory owns every DB; this is not native evidence.
  vi.resetModules();vi.stubGlobal('indexedDB',new IDBFactory());
  let interval:(()=>void)|null=null,automatic:((value:Response)=>void)|null=null;
  const pending=new Map<string,(value:Response)=>void>();
  const host:{onmessage:((event:MessageEvent<unknown>)=>void)|null;postMessage:(value:Response)=>void}={onmessage:null,postMessage(value){const resolve=pending.get(value.request_id);if(resolve){pending.delete(value.request_id);resolve(value);}else automatic?.(value);}};
  vi.stubGlobal('self',host);vi.stubGlobal('navigator',{locks:{request:(_name:string,_options:unknown,callback:(lock:object)=>Promise<void>)=>callback({name:'owned-lock'})}});
  vi.stubGlobal('setInterval',(callback:()=>void)=>{interval=callback;return 1;});
  const now=vi.spyOn(performance,'now').mockReturnValue(0);
  try{
    await import('../src/worker');
    const send=(frame:Record<string,unknown>)=>new Promise<Response>(resolve=>{const request_id=crypto.randomUUID();pending.set(request_id,resolve);host.onmessage!(new MessageEvent('message',{data:{...frame,request_id}}));});
    let time=0;
    const pulse=()=>new Promise<Response>(resolve=>{time=time===0?910000:1222000;now.mockReturnValue(time);automatic=resolve;interval!();});
    await action(send,pulse);
  }finally{
    const {Persistence:WorkerPersistence}=await import('../src/core/persistence');await new WorkerPersistence('fogbound-map-b-game-1').delete();
    vi.unstubAllGlobals();vi.restoreAllMocks();vi.resetModules();
  }
}

test('KA-E29 actual Worker module routes schema14 controls, contextual operation lookup, list and cleanup past910 (owned host carrier)',async()=>{
  await actualWorkerModule(async(send)=>{
    const created=await send({kind:'create',definition_ref:'KA-TEXT-KNOWLEDGE-01',case_ref:'KA-NORMAL-01',mode:'research',operation_id:'create'});
    expect(created.ok).toBe(true);if(!created.ok||!created.view)throw Error('No actual worker run');let view=created.view;
    const prepared=await send({kind:'operate_knowledge_collection',envelope:{run_id:view.run_id,operation_id:'prepare',expected_revision:view.revision,intent:{kind:'request_hq_preparation',method_ref:{run_id:view.run_id,kind:'method',id:'HQ-SOURCE-PREPARATION',version:1},authority_ref:{run_id:view.run_id,kind:'authority',id:'KA-INITIAL',version:1}}}});
    expect(prepared.ok).toBe(true);if(!prepared.ok||!prepared.view)throw Error('No preparation');view=prepared.view;
    const lookup=await send({kind:'receipt',run_id:view.run_id,operation_id:'prepare'});expect(lookup).toMatchObject({ok:true,receipt:{kind:'request_hq_preparation'},view:{scenario_kind:'play_knowledge_collection'}});
    const listed=await send({kind:'list'});expect(listed).toMatchObject({ok:true,runs:[{run_id:view.run_id,scenario_kind:'play_knowledge_collection'}]});
    for(const to of [910000,1222000]){const advanced=await send({kind:'operate_knowledge_collection',envelope:{run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}}});expect(advanced.ok).toBe(true);if(!advanced.ok||!advanced.view)throw Error('No advance');view=advanced.view;}
    expect(view).toMatchObject({sim_time:1120648,finished:true,result:{outcome:'failure',safe_people:6}});
  });
});

test('KA-E29 actual Worker command timer uses schema14 cleanup horizon rather than legacy610/910 (owned monotonic host carrier)',async()=>{
  await actualWorkerModule(async(send,pulse)=>{
    expect(await send({kind:'create',definition_ref:'KA-TEXT-KNOWLEDGE-01',mode:'command',operation_id:'create'})).toMatchObject({ok:true,view:{scenario_kind:'play_knowledge_collection',paused:false}});
    expect(await pulse()).toMatchObject({ok:true,view:{sim_time:910000,status:'terminating',finished:false}});
    expect(await pulse()).toMatchObject({ok:true,view:{sim_time:1120648,status:'finished',finished:true,paused:true}});
  });
});

test('KA-E29 real collection operation receipts require their own schema14 view and cannot be accepted with an older scenario',async()=>{
  const store=new Persistence('ka-owned-receipt-routing-'+crypto.randomUUID()),game=new Game(store);
  try{
    const initial=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const actual=await game.apply_collection_intent({run_id:initial.run_id,operation_id:'terminate',expected_revision:initial.revision,intent:{kind:'terminate_task',authority_ref:{run_id:initial.run_id,kind:'authority',id:'KA-INITIAL',version:1}}});
    expect(valid_response({request_id:'actual-ka-receipt',ok:true,...actual})).toBe(true);
    expect(valid_response({request_id:'missing-ka-context',ok:true,receipt:actual.receipt})).toBe(false);
    expect(valid_response({request_id:'wrong-scenario',ok:true,receipt:actual.receipt,view:{...actual.view,scenario_kind:'play_integrated_field'}})).toBe(false);
    expect(valid_response({request_id:'wrong-run',ok:true,...actual,receipt:{...actual.receipt,run_id:'foreign-run'}})).toBe(false);
    expect(valid_response({request_id:'old-intent',ok:true,...actual,receipt:{...actual.receipt,kind:'integrated_move'}})).toBe(false);
  }finally{await store.delete();}
});

test.each(['before-issue-and-window','ack-before-issue','ack-short-service'])('KA-E09 rejects a digest-consistent W timeline that violates public causality: %s',async(mutation)=>{
  const store=new Persistence('ka-owned-dto-causality-'+crypto.randomUUID()),game=new Game(store);let transport:Transport|undefined;
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    view=(await game.control_clock({run_id:view.run_id,operation_id:'at-59',expected_revision:view.revision,intent:{kind:'advance',to:59000}})).view;
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-W',expected_revision:view.revision,intent:{kind:'request_collection',actor:'W',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-QUALIFIED'),method_ref:ref('method','qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-W')],collection_window:{from:60000,to:91000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'at-93',expected_revision:view.revision,intent:{kind:'advance',to:93000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(valid_response({request_id:'actual-W',ok:true,view})).toBe(true);
    const changed=structuredClone(view),ack=changed.collection_requests[0].acknowledgement!,report=changed.reports[0];
    if(!is_collection_report(report))throw Error('Expected actual collection');
    if(mutation==='before-issue-and-window'){
      ack.planned_start_at=0;report.observed_time={kind:'known',value:30000,evidence:report.observation_ref!};report.generated_at=32000;report.resource_snapshot.at=32000;
      changed.deliveries[0].sent_at=32000;changed.deliveries[0].received_at=33000;changed.coverage[0].observed_time=structuredClone(report.observed_time);
    }else if(mutation==='ack-before-issue'){ack.sent_at=0;ack.received_at=1000;}
    else ack.received_at=ack.sent_at+500;
    const {content_digest:_oldDigest,...content}=report;report.content_digest=await hash(canonical(content));
    expect(valid_response({request_id:'impossible-W',ok:true,view:changed})).toBe(false);
    vi.stubGlobal('Worker',OwnedPort);transport=new Transport();
    const pending=transport.request({kind:'current',run_id:view.run_id}),port=OwnedPort.current,request_id=port.latest?.request_id;
    port.emit({request_id,ok:true,view:changed});expect(await pending).toEqual({request_id,ok:false,code:'CHANNEL_UNCERTAIN'});
  }finally{transport?.close();vi.unstubAllGlobals();await store.delete();}
});

class OwnedPort{
  static current:OwnedPort;
  latest:Record<string,unknown>|null=null;
  onmessage:((event:MessageEvent<unknown>)=>void)|null=null;
  onerror:(()=>void)|null=null;
  constructor(){OwnedPort.current=this;}
  postMessage(value:Record<string,unknown>){this.latest=value;}
  emit(value:unknown){this.onmessage?.(new MessageEvent('message',{data:value}));}
  terminate(){}
}

test.each(['queued-before-basis','processing-before-basis','completed-before-basis','started-before-issue','preparation-started-before-issue','actual-later-duplicates'])('KA-E23 rejects digest-consistent HQ processing with impossible causality: %s',async(mutation)=>{
  const store=new Persistence('ka-owned-processing-causality-'+crypto.randomUUID()),game=new Game(store);let transport:Transport|undefined;
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    await apply('collect-R',{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000,delivery_copies:3});
    await at(32000);if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    await apply('prepare',{kind:'request_hq_preparation',method_ref:ref('method','HQ-SOURCE-PREPARATION'),authority_ref:ref('authority','KA-INITIAL')});
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    await apply('process',{kind:'request_hq_processing',method_ref:ref('method','HQ-TEXT-PROCESSING'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[view.reports[0].ref]});
    if(mutation!=='queued-before-basis')await at(mutation==='processing-before-basis'?53000:72000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(valid_response({request_id:'actual-processing',ok:true,view})).toBe(true);
    if(mutation==='actual-later-duplicates'){
      expect(view.deliveries.map(item=>item.received_at)).toEqual([32000,33000,34000]);
      expect(view.hq_work.find(work=>work.kind==='processing')!.issued_at).toBe(32000);
      vi.stubGlobal('Worker',OwnedPort);transport=new Transport();
      const pending=transport.request({kind:'current',run_id:view.run_id}),port=OwnedPort.current,request_id=port.latest?.request_id;
      port.emit({request_id,ok:true,view});expect(await pending).toEqual({request_id,ok:true,view});return;
    }
    const changed=structuredClone(view),job=changed.hq_work.find(work=>work.kind===(mutation==='preparation-started-before-issue'?'preparation':'processing'))!;
    job.issued_at=mutation==='started-before-issue'?53000:mutation==='preparation-started-before-issue'?33000:1000;
    if(mutation==='completed-before-basis'){
      job.started_at=1000;job.completed_at=21000;
      const product=changed.hq_products.find(item=>item.kind==='processing')!;product.completed_at=21000;
      const {content_digest:_oldDigest,...content}=product;product.content_digest=await hash(canonical(content));
    }
    expect(valid_response({request_id:'impossible-processing',ok:true,view:changed})).toBe(false);
    vi.stubGlobal('Worker',OwnedPort);transport=new Transport();
    const pending=transport.request({kind:'current',run_id:view.run_id}),port=OwnedPort.current,request_id=port.latest?.request_id;
    port.emit({request_id,ok:true,view:changed});expect(await pending).toEqual({request_id,ok:false,code:'CHANNEL_UNCERTAIN'});
  }finally{transport?.close();vi.unstubAllGlobals();await store.delete();}
});

test('KA-E09 an actual IndexedDB abort commits neither a collection task nor its receipt and blocks further candidates',async()=>{
  const store=new Persistence('ka-owned-atomic-collection-'+crypto.randomUUID()),game=new Game(store);
  try{
    const view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const envelope={run_id:view.run_id,operation_id:'failed',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}};
    const before=await store.read_committed(view.run_id),native=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const result=native.apply(this,args);if(this.name==='runs')result.addEventListener('success',()=>this.transaction.abort(),{once:true});return result;};
    try{await expect(game.apply_collection_intent(envelope)).rejects.toThrow('STORAGE_UNCONFIRMED');}
    finally{IDBObjectStore.prototype.put=native;}
    expect(await store.read_committed(view.run_id)).toEqual(before);
    expect(await game.get_view(view.run_id)).toEqual(view);
    expect(await game.get_receipt(view.run_id,'failed')).toBeNull();
    await expect(game.apply_collection_intent({...envelope,operation_id:'another-candidate'})).rejects.toThrow('STORAGE_UNCONFIRMED');
    expect(await store.read_committed(view.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test('KA-E09 transports only lawful collection Game views and rejects private data and unsupported media',async()=>{
  const store=new Persistence('ka-owned-transport-'+crypto.randomUUID()),game=new Game(store);let transport:Transport|undefined;
  try{
    const view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const envelope={run_id:view.run_id,operation_id:'collect',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}};
    expect(valid_request({request_id:'ka-collect',kind:'operate_knowledge_collection',envelope})).toBe(true);
    expect(valid_request({request_id:'ka-collect-media',kind:'operate_knowledge_collection',envelope:{...envelope,intent:{...envelope.intent,attachment:{kind:'image',storage_ref:'private'}}}})).toBe(false);
    vi.stubGlobal('Worker',OwnedPort);transport=new Transport();
    for(const payload of [view,{...view,world:{facility:'operable'}},{...view,media:[{storage_ref:'private'}]},{...view,actors:[{...view.actors[0],private_position:[0,0]},view.actors[1]]}]){
      const pending=transport.request({kind:'current',run_id:view.run_id}),port=OwnedPort.current,request_id=port.latest?.request_id;
      port.emit({request_id,ok:true,view:payload});
      expect(await pending).toEqual(payload===view?{request_id,ok:true,view}:{request_id,ok:false,code:'CHANNEL_UNCERTAIN'});
    }
    const issued=await game.apply_collection_intent(envelope);
    expect(await game.get_receipt(view.run_id,'collect')).toEqual(issued.receipt);
    expect(await game.get_receipt(view.run_id,'not-submitted')).toBeNull();
    const delivered=await game.control_clock({run_id:view.run_id,operation_id:'to-delivery',expected_revision:issued.view.revision,intent:{kind:'advance',to:32000}});
    const before=await store.read_committed(view.run_id);
    expect((await game.apply_collection_intent(envelope)).receipt).toEqual(issued.receipt);
    expect(await store.read_committed(view.run_id)).toEqual(before);
    await expect(game.apply_collection_intent({...envelope,intent:{...envelope.intent,needed_by:800000}})).rejects.toThrow('OPERATION_CONFLICT');
    expect(await store.read_committed(view.run_id)).toEqual(before);
    expect(valid_response({request_id:'ka-delivered',ok:true,view:delivered.view})).toBe(true);
    if(delivered.view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    const changed=structuredClone(delivered.view),report=changed.reports[0];
    if(!is_collection_report(report))throw Error('Expected actual collection');
    report.record_ref!.run_id='another-run';
    expect(valid_response({request_id:'ka-corrupt',ok:true,view:changed})).toBe(false);
  }finally{transport?.close();vi.unstubAllGlobals();await store.delete();}
});

test.each([{actor:new String('W')},{actor:['W']}])('KA-E09 rejects coercible actor input atomically: %j',async({actor})=>{
  const store=new Persistence('ka-owned-actor-type-'+crypto.randomUUID()),game=new Game(store);
  try{
    const view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const envelope={run_id:view.run_id,operation_id:'bad-actor',expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-QUALIFIED'),method_ref:ref('method','qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-W')],collection_window:{from:60000,to:91000},needed_by:900000}};
    const before=await store.read_committed(view.run_id);
    await expect(game.apply_collection_intent(envelope)).rejects.toThrow('INVALID_INPUT');
    expect(await store.read_committed(view.run_id)).toEqual(before);
    expect(await game.get_receipt(view.run_id,'bad-actor')).toBeNull();
    expect(await new Game(store).get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test.each(['R-qualified','R-impersonates-W','W-evidence-missing','wrong-scope','wrong-time','digest-only'])('KA-E09 rejects a mutated real Game report at the receiving boundary: %s',async(mutation)=>{
  const store=new Persistence('ka-owned-dto-binding-'+crypto.randomUUID()),game=new Game(store);let transport:Transport|undefined;
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    for(const actor of ['R','W'] as const)view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-'+actor,expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'complete',expected_revision:view.revision,intent:{kind:'advance',to:93000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(valid_response({request_id:'lawful',ok:true,view})).toBe(true);
    const changed=structuredClone(view),report=changed.reports[mutation==='W-evidence-missing'?1:0],coverage=changed.coverage[mutation==='W-evidence-missing'?1:0];
    if(!is_collection_report(report))throw Error('Expected actual collection');
    if(mutation==='R-qualified'||mutation==='R-impersonates-W'){
      Object.assign(report,{method:'qualified-facility-inspection',method_ref:ref('method','qualified-facility-inspection'),requested_method_ref:ref('method','qualified-facility-inspection'),scope_ref:ref('scope','B-QUALIFIED'),body:{kind:'qualified_facility_field',field:'B.condition',condition:'operable',object_version:1,quality:'qualified',outcome:'detected',qualification_ref:ref('qualification','W-FACILITY-INSPECTOR'),limits:['forged promotion']}});
      Object.assign(coverage,{quality:'qualified',outcome:'detected',method_ref:report.method_ref,limits:report.body.limits});
      if(mutation==='R-impersonates-W'){report.source_actor='W';report.resource_snapshot.actor='W';changed.deliveries[0].sender='W';}
    }else if(mutation==='W-evidence-missing'){
      Object.assign(report,{observation_ref:null,record_ref:null,observed_time:{kind:'unknown'}});coverage.observed_time={kind:'unknown'};
    }else if(mutation==='wrong-scope')report.scope_ref=ref('scope','B-QUALIFIED');
    else if(mutation==='wrong-time'){
      report.observed_time={kind:'known',value:1000,evidence:report.observation_ref!};coverage.observed_time=structuredClone(report.observed_time);
    }else{
      report.body.limits.push('modified in transit');coverage.limits.push('modified in transit');
    }
    expect(valid_response({request_id:'mutated',ok:true,view:changed})).toBe(mutation==='digest-only');
    vi.stubGlobal('Worker',OwnedPort);transport=new Transport();
    const lawful=transport.request({kind:'current',run_id:view.run_id}),lawfulPort=OwnedPort.current,lawfulId=lawfulPort.latest?.request_id;
    lawfulPort.emit({request_id:lawfulId,ok:true,view});
    expect(await lawful).toEqual({request_id:lawfulId,ok:true,view});
    const pending=transport.request({kind:'current',run_id:view.run_id}),port=OwnedPort.current,request_id=port.latest?.request_id;
    port.emit({request_id,ok:true,view:changed});
    expect(await pending).toEqual({request_id,ok:false,code:'CHANNEL_UNCERTAIN'});
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{transport?.close();vi.unstubAllGlobals();await store.delete();}
});
