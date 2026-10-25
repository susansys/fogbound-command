import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {apply_received_collection_report} from '../src/core/knowledge-collection-knowledge';
import type {CollectionKnowledge} from '../src/knowledge-collection-contracts';
import {is_collection_report} from '../src/knowledge-collection-contracts';

test.each([{issue_at:null,qualified:false},{issue_at:60000,qualified:true},{issue_at:61000,qualified:false}])('KA-E12 derives correction only from actually completed and delivered work: $issue_at',async({issue_at,qualified})=>{
  const store=new Persistence('ka-owned-actual-correction-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const collect=async(actor:'R'|'W')=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-'+actor,expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000}})).view;};
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    await collect('R');
    if(issue_at===null){await at(200000);expect(view).toMatchObject({reports:[{source_actor:'R'}],correction_records:[],facility_knowledge:null});}
    else{
      await at(issue_at);await collect('W');await at(93000);
      expect(view).toMatchObject({reports:[{source_actor:'R'}],correction_records:[],facility_knowledge:null});
      await at(94000);
      if(qualified)expect(view).toMatchObject({reports:[{source_actor:'R'},{source_actor:'W',observed_time:{kind:'known',value:91000},generated_at:93000}],facility_knowledge:{observed_at:91000,received_at:94000},correction_records:[{recorded_at:94000}]});
      else expect(view).toMatchObject({reports:[{source_actor:'R'},{source_actor:'W',body:{kind:'collection_failed',collection_work_ms:29000},observation_ref:null,record_ref:null}],facility_knowledge:null,correction_records:[]});
    }
  }finally{await store.delete();}
});

// Consumer fault vectors use immutable real Game products; E11 proves the normal producer/consumer chain.
test.each(['wrong-qualification','wrong-scope','wrong-method','wrong-object-version','wrong-geometry','missing-observation','cross-run'])('KA-E13 refuses an inapplicable actual report at the field consumer: %s',async(mutation)=>{
  const store=new Persistence('ka-owned-correction-qualification-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    for(const actor of ['R','W'] as const)view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-'+actor,expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'complete',expected_revision:view.revision,intent:{kind:'advance',to:93000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    const report=structuredClone(view.reports[1]),delivery=structuredClone(view.deliveries[1]);
    if(!is_collection_report(report))throw Error('Expected actual collection');
    const geometry_version=report.coverage.geometry_version;
    if(report.body.kind!=='qualified_facility_field')throw Error('Missing actual inspection');
    if(mutation==='wrong-qualification')report.body.qualification_ref.id='not-a-registered-qualification';
    else if(mutation==='wrong-scope')report.scope_ref.id='B-LIMITED';
    else if(mutation==='wrong-method')report.method_ref.id='limited-text-collection';
    else if(mutation==='wrong-object-version')Reflect.set(report.body,'object_version',2);
    else if(mutation==='wrong-geometry')report.coverage.geometry_version='f'.repeat(64);
    else if(mutation==='missing-observation')report.observation_ref=null;
    else{
      const reroot=(value:unknown)=>{if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(key==='run_id')Reflect.set(value,key,'another-run');else reroot(item);}};
      reroot(report);reroot(delivery);
    }
    const knowledge:CollectionKnowledge={assessments:[],corrections:[],facility:null};
    apply_received_collection_report(knowledge,{run_id:view.run_id,report,delivery,received_reports:view.reports.filter(is_collection_report),geometry_version});
    expect(knowledge).toEqual({assessments:[],corrections:[],facility:null});
  }finally{await store.delete();}
});
test('KA-E11 a real qualified report corrects the current field at 93s without rewriting the 40s judgment or view',async()=>{
  const store=new Persistence('ka-owned-correction-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const collect=async(actor:'R'|'W')=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-'+actor,expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000}})).view;};
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    await collect('R');await at(40000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    const original=structuredClone(view.reports[0]);
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'old-judgment',expected_revision:view.revision,intent:{kind:'record_collection_assessment',field:'B.condition',conclusion:'unconfirmed',basis_refs:[original.ref]}})).view;
    const old=structuredClone(view);
    const oldHistory=await (await game.get_replay(view.run_id,40000)).get_view(view.run_id);
    await at(59000);await collect('W');await at(92000);
    expect(view).toMatchObject({correction_records:[],facility_knowledge:null});
    await at(93000);
    expect(view).toMatchObject({facility_knowledge:{field:'B.condition',condition:'operable',observed_at:90000,received_at:93000},correction_records:[{field:'B.condition',superseded_report_ref:original.ref}]});
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(view.reports[0]).toEqual(original);
    expect(view.assessments).toEqual(Reflect.get(old,'assessments'));
    expect(await (await game.get_replay(view.run_id,40000)).get_view(view.run_id)).toEqual(oldHistory);
    const committed=await store.read_committed(view.run_id);
    if(committed?.schema!==14)throw Error('Wrong collection branch');
    const last=committed.inputs[committed.inputs.length-1].envelope;
    await game.apply_collection_intent(last);
    expect(await store.read_committed(view.run_id)).toEqual(committed);
  }finally{await store.delete();}
});
