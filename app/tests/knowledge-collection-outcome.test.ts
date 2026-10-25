import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {valid_response} from '../src/dto';

test.each([{case_ref:'KA-NORMAL-01',goal:365429,R_energy:790858000},{case_ref:'KA-SOURCE3-01',goal:390429,R_energy:846858000},{case_ref:'KA-LATE-POSITION-01',goal:365429,R_energy:792858000}])('KA-E19 completes the actual $case_ref two-record/six-person Game chain at its independently expected time and energy',async({case_ref,goal,R_energy})=>{
  const store=new Persistence('ka-owned-full-case-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    const collect=async(actor:'R'|'W')=>apply('collect-'+actor,{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000,...(actor==='R'&&case_ref==='KA-SOURCE3-01'?{delivery_copies:3}:{})});
    const returning=async(actor:'R'|'W')=>apply('return-'+actor,{kind:'return_to_headquarters',actor,authority_ref:ref('authority','KA-INITIAL')});
    await collect('R');await at(32000);
    if(case_ref!=='KA-SOURCE3-01')await returning('R');
    await at(40000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    await apply('old-judgment',{kind:'record_collection_assessment',field:'B.condition',conclusion:'unconfirmed',basis_refs:[view.reports[0].ref]});
    await at(59000);await collect('W');
    if(case_ref==='KA-LATE-POSITION-01'){await at(88000);await apply('new-position',{kind:'request_self_position',actor:'R',recipient:'HQ',method_ref:ref('method','self-position-registration'),authority_ref:ref('authority','KA-INITIAL')});}
    await at(93000);await returning('W');
    if(case_ref==='KA-SOURCE3-01'){
      await at(100000);await apply('read-and-forward',{kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'all'});await at(108000);await returning('R');
    }
    if(case_ref==='KA-LATE-POSITION-01'){
      await at(118000);if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');await apply('old-position',{kind:'forward_position_report',actor:'R',recipient:'HQ',collection_request_ref:view.collection_requests[0].ref,output_role:'collection_end_self_position',authority_ref:ref('authority','KA-INITIAL')});
    }
    await at(goal-1);expect(view).toMatchObject({finished:false,result:null});
    await at(1222000);
    expect(view).toMatchObject({sim_time:goal,finished:true,can_issue:false,result:{outcome:'success',known_at:goal,safe_people:6},verification_records:expect.arrayContaining([expect.objectContaining({actor:'R',result:'authentic_limited'}),expect.objectContaining({actor:'W',result:'authentic_qualified'})])});
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong branch');
    expect(state.actors.R).toMatchObject({position:[50,150],energy_used_uj:R_energy,load_kg:3.99,off:true});
    expect(state.actors.W).toMatchObject({position:[50,150],energy_used_uj:204214500,load_kg:2.99,off:true});
    expect(state.H_inventory.mass_kg).toBe(0.02);expect(state.records).toHaveLength(2);expect(state.records.every(record=>record.holder==='H'&&record.custody.length===2)).toBe(true);
    expect(state.intel.jobs.map(job=>job.used_ms)).toEqual([20000,20000]);
    expect(view.assessments[0]).toMatchObject({recorded_at:40000,conclusion:'unconfirmed',reason:{kind:'not_recorded'}});
    expect(view.correction_records).toHaveLength(1);
    if(case_ref==='KA-SOURCE3-01')expect(view.source_relationships).toMatchObject({content_delivery_count:5,report_identity_count:3,global_independence:{kind:'confirmed',count:3}});
    expect(valid_response({request_id:'actual-full-case',ok:true,view})).toBe(true);
    for(const patch of [{safe_people:3},{known_at:goal-1},{verified_records:[]},{evidence_refs:[]},{verified_records:[view.result!.verified_records[0],view.result!.verified_records[0]]}]){
      const forged=structuredClone(view);Object.assign(forged.result!,patch);
      expect(valid_response({request_id:'forged-outcome',ok:true,view:forged})).toBe(false);
    }
    for(const patch of [{can_issue:true},{status:'ready'},{result:null}]){
      expect(valid_response({request_id:'forged-lifecycle',ok:true,view:{...view,...patch}})).toBe(false);
    }
  }finally{await store.delete();}
});

test.each([-1,0,1])('KA-E27 actual W verification completes at900000%+d under the real kernel completion phase',async(delta)=>{
  const store=new Persistence('ka-owned-entity-boundary-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-NORMAL-01'},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    const collect=async(actor:'R'|'W')=>apply('collect-'+actor,{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000});
    await collect('R');await at(32000);await apply('return-R',{kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')});
    await at(59000);await collect('W');await at(635352+delta);await apply('late-return-W',{kind:'return_to_headquarters',actor:'W',authority_ref:ref('authority','KA-INITIAL')});
    await at(900000);expect(view).toMatchObject({status:'terminating',finished:false,result:null});
    await at(1222000);expect(view).toMatchObject({sim_time:903000,finished:true,result:{outcome:delta<=0?'success':'partial',known_at:delta<=0?901000+delta:903000}});
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong view');
    expect(view.verification_records.find(record=>record.actor==='W')).toMatchObject({completed_at:900000+delta,result:'authentic_qualified',used_ms:20000});
    expect(valid_response({request_id:'actual-900-boundary',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});
