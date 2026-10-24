import {expect,test,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {Transport} from '../src/transport';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';
import {hash} from '../src/core/scenario';
import {canonical} from '../src/core/snapshot';

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
    const changed=structuredClone(delivered.view);changed.reports[0].record_ref!.run_id='another-run';
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
