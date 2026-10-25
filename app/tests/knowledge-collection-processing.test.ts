import {expect,test} from 'vitest';
import {create_intel_work,queue_intel_work,advance_intel_work,start_intel_work,cancel_intel_work} from '../src/core/knowledge-collection-work';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {valid_response} from '../src/dto';

test('KA-E23 HQ processing keeps source age/quality and cancels only queued work on the same INTEL pool',async()=>{
  const store=new Persistence('ka-owned-local-processing-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    await apply('collect-R',{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000});await at(32000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    const source=structuredClone(view.reports[0]),basis_refs=[source.ref];
    await apply('prepare',{kind:'request_hq_preparation',method_ref:ref('method','HQ-SOURCE-PREPARATION'),authority_ref:ref('authority','KA-INITIAL')});
    await apply('processing-queued',{kind:'request_hq_processing',method_ref:ref('method','HQ-TEXT-PROCESSING'),authority_ref:ref('authority','KA-INITIAL'),basis_refs});
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    const queued=view.hq_work[1].ref,active=view.hq_work[0].ref;
    await apply('cancel-queued',{kind:'cancel_hq_work',job_ref:queued,authority_ref:ref('authority','KA-INITIAL')});
    await at(37000);await apply('cancel-active',{kind:'cancel_hq_work',job_ref:active,authority_ref:ref('authority','KA-INITIAL')});
    await at(52000);
    expect(view).toMatchObject({hq_work:[{status:'completed',used_ms:20000,cancellations:[{result:'already_started'}]},{status:'cancelled',used_ms:0,cancellations:[{result:'cancelled'}]}]});
    await apply('processing-retry',{kind:'request_hq_processing',method_ref:ref('method','HQ-TEXT-PROCESSING'),authority_ref:ref('authority','KA-INITIAL'),basis_refs});await at(72000);
    expect(view).toMatchObject({hq_products:[{kind:'preparation',completed_at:52000},{kind:'processing',completed_at:72000,basis_refs,basis_digests:[source.content_digest],source_observation_times:[source.observed_time]}],source_relationships:{content_delivery_count:1,report_identity_count:1,global_independence:{kind:'unknown'}},facility_knowledge:null,correction_records:[]});
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
    expect(state.intel.jobs.map(job=>[job.ticket,job.used_ms,job.status])).toEqual([[1,20000,'completed'],[2,0,'cancelled'],[3,20000,'completed']]);
    expect(valid_response({request_id:'local-products-remain-derived',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E23 actual HQ preparation and received-record verification share one INTEL slot and stable tickets',async()=>{
  const store=new Persistence('ka-owned-intel-shared-consumers-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    await apply('collect-R',{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000});
    await at(32000);await apply('return-R',{kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')});
    await at(276000);
    await apply('prepare',{kind:'request_hq_preparation',method_ref:ref('method','HQ-SOURCE-PREPARATION'),authority_ref:ref('authority','KA-INITIAL')});
    await at(276648);
    let state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
    expect(state.intel).toMatchObject({resource_ref:'INTEL',capacity:1,jobs:[{kind:'preparation',ticket:1,status:'processing',started_at:276000,used_ms:648},{kind:'verification',ticket:2,status:'queued',used_ms:0}]});
    await at(296000);state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
    expect(state.intel.jobs).toMatchObject([{kind:'preparation',status:'completed',used_ms:20000},{kind:'verification',status:'processing',started_at:296000,used_ms:0}]);
    expect(view).toMatchObject({hq_products:[{kind:'preparation',completed_at:296000,basis_refs:[]}]});
    await at(317000);
    expect(view).toMatchObject({verification_records:[{result:'authentic_limited',started_at:296000,completed_at:316000,used_ms:20000}]});
    state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
    expect(state.intel.jobs.reduce((total,job)=>total+job.used_ms,0)).toBe(40000);
    expect(state.intel.jobs.every(job=>job.resource_ref==='INTEL')).toBe(true);
    expect(valid_response({request_id:'shared-INTEL-consumers',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

// KA-E07 is the approved scheduler mechanism identity. Actual H/INTEL Game consumers follow in T03.
test('KA-E07 uses one INTEL pool for preparation, processing and verification with stable FIFO',()=>{
  const pool=create_intel_work();
  const preparation=queue_intel_work(pool,{id:'prepare',kind:'preparation',eligible_at:0,work_ms:10000});
  const processing=queue_intel_work(pool,{id:'process',kind:'processing',eligible_at:1000,work_ms:20000});
  const verification=queue_intel_work(pool,{id:'verify',kind:'verification',eligible_at:1000,work_ms:20000});
  expect([preparation.ticket,processing.ticket,verification.ticket]).toEqual([1,2,3]);
  expect(pool).toMatchObject({resource_ref:'INTEL',capacity:1,at:0});
  start_intel_work(pool);
  advance_intel_work(pool,10000);
  expect(preparation).toMatchObject({resource_ref:'INTEL',status:'completed',used_ms:10000,completed_at:10000});
  expect(processing).toMatchObject({status:'queued',used_ms:0});
  // Completion/release precedes received controls and the subsequent start phase at the same SimTime.
  expect(cancel_intel_work(pool,'process')).toBe('cancelled');
  start_intel_work(pool);
  expect(verification).toMatchObject({resource_ref:'INTEL',status:'processing',started_at:10000,used_ms:0});
  advance_intel_work(pool,15000);
  expect(cancel_intel_work(pool,'verify')).toBe('already_started');
  expect(verification).toMatchObject({status:'processing',used_ms:5000});
  advance_intel_work(pool,30000);
  expect(verification).toMatchObject({status:'completed',used_ms:20000,completed_at:30000});
  expect(processing).toMatchObject({status:'cancelled',used_ms:0,ticket:2});
  expect(pool.jobs.filter(job=>job.status==='processing')).toHaveLength(0);
  expect(pool.jobs.reduce((used,job)=>used+job.used_ms,0)).toBe(30000);
});

test('KA-E07 preserves tickets, consumed work and resource identity through recovery and coarse/fine advancement',()=>{
  const pool=create_intel_work();
  queue_intel_work(pool,{id:'later-ticket',kind:'verification',eligible_at:2000,work_ms:20000});
  queue_intel_work(pool,{id:'earlier-eligible',kind:'processing',eligible_at:1000,work_ms:10000});
  start_intel_work(pool);
  advance_intel_work(pool,6500);
  expect(pool.jobs.find(job=>job.id==='earlier-eligible')).toMatchObject({status:'processing',started_at:1000,used_ms:5500});
  const recovered=JSON.parse(JSON.stringify(pool));
  advance_intel_work(pool,40000);
  for(const at of [7000,11000,11001,15000,21000,31000,40000]){advance_intel_work(recovered,at);start_intel_work(recovered);}
  expect(recovered).toEqual(pool);
  expect(pool.jobs.map(job=>[job.id,job.ticket,job.started_at,job.completed_at,job.used_ms])).toEqual([
    ['later-ticket',1,11000,31000,20000],['earlier-eligible',2,1000,11000,10000],
  ]);
  expect(()=>queue_intel_work(pool,{id:'later-ticket',kind:'processing',eligible_at:40000,work_ms:1})).toThrow('INVALID_REQUEST');
  expect(()=>advance_intel_work(pool,39999)).toThrow('INVALID_INPUT');
});
