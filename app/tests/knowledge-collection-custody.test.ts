import {expect,test,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {canonical,state_hash} from '../src/core/snapshot';
import {hash} from '../src/core/scenario';
import {valid_response} from '../src/dto';
import {verify_collection_record} from '../src/core/knowledge-collection-records';

async function owned_handover_fixture(){
  const store=new Persistence('ka-owned-record-fault-vector-'+crypto.randomUUID()),game=new Game(store);
  let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
  const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
  view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
  view=(await game.control_clock({run_id:view.run_id,operation_id:'at-32',expected_revision:view.revision,intent:{kind:'advance',to:32000}})).view;
  view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'return',expected_revision:view.revision,intent:{kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')}})).view;
  view=(await game.control_clock({run_id:view.run_id,operation_id:'at-receipt',expected_revision:view.revision,intent:{kind:'advance',to:276648}})).view;
  const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
  const report=state.process_reports.find(report=>report.method==='H-record-handover');if(!report||report.method!=='H-record-handover')throw Error('No actual handover');
  return {store,game,view,state,material:state.records[0],context:{run_id:view.run_id,package_hash:state.definition.hashes.record_identity,geometry_hash:state.definition.hashes.geometry,handover_report:report,handover_delivery:state.process_deliveries[0],qualifications:[ref('qualification','R-LIMITED-COLLECTOR'),ref('qualification','W-FACILITY-INSPECTOR')]}};
}

// Consumer fault vectors use actual received H material. E23 separately proves the real20s Game pipeline.
test.each(['content-bytes','content-digest','cross-run','wrong-package','wrong-version','old-A-artifact','custody-version','unsupported-media'])('KA-E24 rejects corrupted or foreign actual material at the record consumer: %s',async(mutation)=>{
  const f=await owned_handover_fixture();
  try{
    const material=structuredClone(f.material);
    if(mutation==='content-bytes')material.canonical_content+=' ';
    else if(mutation==='content-digest')material.content_digest='f'.repeat(64);
    else if(mutation==='cross-run')material.ref.run_id='foreign-run';
    else if(mutation==='wrong-package')Reflect.set(material.definition_ref,'id','B33-INTEGRATED-FIELD-01');
    else if(mutation==='wrong-version')Reflect.set(material.ref,'version',2);
    else if(mutation==='old-A-artifact')Reflect.set(material,'record_kind','A-evidence-artifact');
    else if(mutation==='custody-version')Reflect.set(material.custody[1].handover_ref!,'version',2);
    else{
      const payload=JSON.parse(material.canonical_content);payload.report.media={kind:'image',storage_ref:'private'};material.canonical_content=JSON.stringify(canonical(payload));material.logical_size_bytes=new TextEncoder().encode(material.canonical_content).byteLength;
    }
    expect((await verify_collection_record(material,f.context)).result).toBe('invalid');
    expect(await f.store.read_committed(f.view.run_id)).toEqual(f.state);
  }finally{await f.store.delete();}
});

test.each(['handover-report','handover-delivery','qualification'])('KA-E25 requires actual %s evidence instead of defaulting to World truth',async(missing)=>{
  const f=await owned_handover_fixture();
  try{
    const context={...f.context,handover_report:missing==='handover-report'?undefined:f.context.handover_report,handover_delivery:missing==='handover-delivery'?undefined:f.context.handover_delivery,qualifications:missing==='qualification'?[]:f.context.qualifications};
    const result=await verify_collection_record(f.material,context);
    expect(result.result).toBe('not_evaluable');expect(result.reasons.length).toBeGreaterThan(0);
    expect((await verify_collection_record(f.material,f.context)).result).toBe('authentic_limited');
    expect(f.state.knowledge.assessments).toEqual([]);
  }finally{await f.store.delete();}
});

test('KA-E24 public commands reject foreign record injection atomically',async()=>{
  const f=await owned_handover_fixture();
  try{
    await expect(f.game.apply_collection_intent({run_id:f.view.run_id,operation_id:'foreign-record',expected_revision:f.view.revision,intent:{kind:'return_to_headquarters',actor:'W',authority_ref:{run_id:f.view.run_id,kind:'authority',id:'KA-INITIAL',version:1},record_ref:{run_id:'foreign-run',kind:'record',id:'old-A-artifact',version:1}}})).rejects.toThrow('INVALID_INPUT');
    expect(await f.store.read_committed(f.view.run_id)).toEqual(f.state);expect(await f.game.get_receipt(f.view.run_id,'foreign-record')).toBeNull();
  }finally{await f.store.delete();}
});

test('KA-E24 preserves a corrupted owned save when view or restore rejects it',async()=>{
  const f=await owned_handover_fixture();
  try{
    const bad=structuredClone(f.state);bad.records[0].ref.run_id='foreign-run';bad.integrity=await state_hash(bad);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(f.store.name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('runs','readwrite');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);tx.objectStore('runs').put(bad);});}finally{db.close();}
    const reopened=new Game(new Persistence(f.store.name));
    await expect(reopened.get_view(f.view.run_id)).rejects.toThrow('INVALID_SAVE');
    await expect(reopened.restore(f.view.run_id,'reject-corrupt-restore')).rejects.toThrow('INVALID_SAVE');
    expect(await f.store.read_committed(f.view.run_id)).toEqual(bad);
    expect(await f.store.receipt(f.view.run_id,'reject-corrupt-restore')).toBeUndefined();
  }finally{await f.store.delete();}
});

test.each([{actor:'R' as const,return_at:32000,handover_received:276648,verified:296648,received:297648,result:'authentic_limited'},{actor:'W' as const,return_at:93000,handover_received:344429,verified:364429,received:365429,result:'authentic_qualified'}])('KA-E23 actually verifies the $actor record on INTEL after custody receipt, preserving its own content qualification',async({actor,return_at,handover_received,verified,received,result})=>{
  const store=new Persistence('ka-owned-actual-record-verification-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect',expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000}})).view;
    await at(return_at);view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'return',expected_revision:view.revision,intent:{kind:'return_to_headquarters',actor,authority_ref:ref('authority','KA-INITIAL')}})).view;
    await at(handover_received);
    let state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
    expect(state.intel).toMatchObject({resource_ref:'INTEL',capacity:1,jobs:[{kind:'verification',resource_ref:'INTEL',started_at:handover_received,used_ms:0,status:'processing'}]});
    await at(verified);state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
    expect(state.verifications).toMatchObject([{actor,started_at:handover_received,completed_at:verified,used_ms:20000,result}]);
    expect(view).toMatchObject({verification_records:[]});
    await at(received);
    expect(view).toMatchObject({verification_records:[{actor,started_at:handover_received,completed_at:verified,used_ms:20000,result}],process_reports:[{source_actor:'H'},{source_actor:'INTEL',method:'INTEL-record-verification',body:{kind:'record_verification',verification:{result}}}]});
    state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
    expect(state.intel.jobs).toMatchObject([{resource_ref:'INTEL',used_ms:20000,status:'completed',started_at:handover_received,completed_at:verified}]);
    expect(state.records[0].custody).toHaveLength(2);expect(state.records[0].holder).toBe('H');
    expect(valid_response({request_id:'owned-INTEL-record-result',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E21 record bytes and H receipt do not encode an unread private archive variant',async()=>{
  const views:Array<Awaited<ReturnType<Game['get_view']>>>=[];
  for(const source_profile of ['normal','missing_pair_WS']){
    const store=new Persistence('ka-owned-record-private-pair-'+crypto.randomUUID()),game=new Game(store),uuid=vi.spyOn(crypto,'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000021');
    try{
      let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01',source_profile},'research','create');uuid.mockRestore();
      const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
      view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-R',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
      view=(await game.control_clock({run_id:view.run_id,operation_id:'at-32',expected_revision:view.revision,intent:{kind:'advance',to:32000}})).view;
      view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'return-R',expected_revision:view.revision,intent:{kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')}})).view;
      view=(await game.control_clock({run_id:view.run_id,operation_id:'at-H-receipt',expected_revision:view.revision,intent:{kind:'advance',to:276648}})).view;
      expect(valid_response({request_id:'owned-record-public-identity',ok:true,view})).toBe(true);views.push(view);
    }finally{uuid.mockRestore();await store.delete();}
  }
  expect(views[1]).toEqual(views[0]);
});

test.each([false,true])('KA-E22 H receives the real R record for25s and atomically transfers custody only on completion, restore=%s',async(restore)=>{
  const store=new Persistence('ka-owned-H-custody-'+crypto.randomUUID());let game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-R',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
    await at(32000);
    const envelope={run_id:view.run_id,operation_id:'return-and-deliver-R',expected_revision:view.revision,intent:{kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')}};
    const issued=await game.apply_collection_intent(envelope);view=issued.view;
    await at(250648);
    let state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
    expect(state.handovers).toMatchObject([{actor:'R',arrived_at:250648,started_at:250648,completed_at:null,status:'receiving'}]);
    expect(state.records[0].holder).toBe('R');expect(state.actors.R.load_kg).toBe(4);expect(state.H_inventory).toMatchObject({mass_kg:0,logical_size_bytes:0,record_refs:[]});
    if(restore){
      await at(260000);view=(await game.save({run_id:view.run_id,operation_id:'save-handover',expected_revision:view.revision,intent:{kind:'save'}})).view;
      game=new Game(new Persistence(store.name));view=(await game.restore(view.run_id,'restore-handover')).view;
    }
    await at(275647);state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');expect(state.records[0].holder).toBe('R');
    await at(275648);state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
    expect(state.records[0]).toMatchObject({holder:'H',custody:[{kind:'created',to:'R'},{kind:'transferred',from:'R',to:'H',at:275648}]});
    expect(state.actors.R.load_kg).toBe(3.99);expect(state.H_inventory).toMatchObject({mass_kg:0.01,logical_size_bytes:state.records[0].logical_size_bytes,record_refs:[state.records[0].ref]});
    expect(view).toMatchObject({process_reports:[],process_deliveries:[]});
    await at(276648);
    expect(view).toMatchObject({process_reports:[{source_actor:'H',method:'H-record-handover',body:{kind:'record_handover',actor:'R',outcome:'transferred',completed_at:275648}}],process_deliveries:[{sender:'H',sent_at:275648,received_at:276648}]});
    expect(valid_response({request_id:'received-H-custody',ok:true,view})).toBe(true);
    const before=await store.read_committed(view.run_id);expect((await game.apply_collection_intent(envelope)).receipt).toEqual(issued.receipt);expect(await store.read_committed(view.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test.each([{actor:'R' as const,at:31000,kind:'B-limited-collection-record',qualification:'R-LIMITED-COLLECTOR',load:4},{actor:'W' as const,at:92000,kind:'B-qualified-inspection-record',qualification:'W-FACILITY-INSPECTOR',load:3}])('KA-E21 registers the actual $actor content, identity and blank-to-record custody without creating mass',async({actor,at,kind,qualification,load})=>{
  const store=new Persistence('ka-owned-record-registration-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect',expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'register',expected_revision:view.revision,intent:{kind:'advance',to:at}})).view;
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong collection branch');
    const record=state.records[0],report=state.reports[0];
    expect(record).toMatchObject({ref:ref('record','collection-1.record'),record_kind:kind,source_actor:actor,holder:actor,mass_kg:0.01,collection_task_ref:ref('collection_task','collection-1.task'),observation_ref:ref('observation','collection-1.observation'),report_ref:report.ref,report_digest:report.content_digest,definition_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1,hash:state.definition.hashes.record_identity},qualification_refs:[ref('qualification',qualification)],custody:[{kind:'created',at,from:null,to:actor,material_ref:ref('material',actor+'.blank-registration')} ]});
    expect(record.logical_size_bytes).toBe(new TextEncoder().encode(record.canonical_content).byteLength);
    expect(record.content_digest).toBe(await hash(canonical(JSON.parse(record.canonical_content))));
    expect(JSON.parse(record.canonical_content)).toMatchObject({source_actor:actor,record_kind:kind,report,collection_task_ref:ref('collection_task','collection-1.task')});
    expect(state.actors[actor]).toMatchObject({blank_record:false,load_kg:load});
    expect(state.records.reduce((sum,item)=>sum+item.mass_kg,0)).toBe(0.01);
    expect(view).toMatchObject({reports:[]});
  }finally{await store.delete();}
});
