import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import registered from '../src/core/outcome-definition.json';
import {valid_response} from '../src/dto';
import type {IntelligenceDefinition} from '../src/core/intelligence-definition';
import {intelligence_variant} from './intelligence-fixtures';
import {hash} from '../src/core/scenario';
import type {OutcomeDefinition} from '../src/core/outcome-definition';

test('B24 E23 120000 without a new delivered HQ goal fact only reminds, and viewing or saving cannot reset it',async()=>{
  const store=new Persistence('b24-owned-t02-visible-progress');
  try {
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    let view=(await game.control_clock({run_id:initial.run_id,operation_id:'before-warning',expected_revision:initial.revision,intent:{kind:'advance',to:205999}})).view;
    expect(view).toMatchObject({finished:false,progress:{last_progress_at:86000,warning_at:206000,warning:false,message:null}});
    view=(await game.control_clock({run_id:initial.run_id,operation_id:'warning',expected_revision:view.revision,intent:{kind:'advance',to:206000}})).view;
    expect(view).toMatchObject({finished:false,outcome:null,progress:{last_progress_at:86000,warning_at:206000,warning:true,message:'暂无新增总部反馈'}});
    expect(await game.get_view(initial.run_id)).toEqual(view);
    view=(await game.save({run_id:initial.run_id,operation_id:'save-not-progress',expected_revision:view.revision,intent:{kind:'save'}})).view;
    expect(view).toMatchObject({progress:{last_progress_at:86000,warning_at:206000,warning:true},finished:false,outcome:null});
    const decisions=Reflect.get(view,'decision_records').length;
    view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'unrelated-plan-edit',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'整理记录，尚无新增现场事实',repair_packs:2}}})).view;
    expect(Reflect.get(view,'plan')).toMatchObject({purpose:'整理记录，尚无新增现场事实'});
    expect(Reflect.get(view,'decision_records')).toHaveLength(decisions+1);
    expect(view).toMatchObject({progress:{last_progress_at:86000,warning_at:206000,warning:true},finished:false,outcome:null});
    expect(valid_response({request_id:'progress',ok:true,view})).toBe(true);
  } finally {await store.delete();}
});

test('B24 E25 real same-time queued preparation privately extends verification; only its later delivered public commitment updates the HQ wait',async()=>{
  const store=new Persistence('b24-owned-t02-private-wait-extension');
  try {
    const game=new Game(store);let view=await game.create_run(registered,'research','create');
    const run=view.run_id,ref=(kind:string,id:string)=>({run_id:run,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:run,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    await advance(1000);
    view=(await game.return_and_deliver({run_id:run,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    await advance(86000);
    for(let i=0;i<6;i++)view=(await game.apply_outcome_intent({run_id:run,operation_id:'earlier-source-'+i,expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
    await advance(87000);
    // The queued report has already been authored locally with ETA227000.
    // A real request at the same SimTime sorts before V under the frozen
    // queue policy; it adds60k work without changing any definition or DTO.
    expect(await game.get_actor_view(run,'INTEL')).toMatchObject({published_status_reports:[{phase:'queued',expected_until:227000}]});
    view=(await game.apply_outcome_intent({run_id:run,operation_id:'plan',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'补给筹备',repair_packs:2}}})).view;
    const plan=Reflect.get(view,'plan');if(!plan)throw Error('Owned preparation plan missing');
    view=(await game.apply_outcome_intent({run_id:run,operation_id:'prepare',expected_revision:view.revision,intent:{kind:'request_preparation',plan_ref:plan.ref}})).view;
    await advance(88000);
    expect(Reflect.get(view,'verification_feedback')).toMatchObject([{report:{phase:'queued',expected_until:227000},delivery:{received:88000}}]);
    await advance(226999);
    expect(view).toMatchObject({progress:{last_progress_at:107000,warning_at:227000,waiting_until:227000,warning:false}});
    await advance(227000);
    expect(view).toMatchObject({finished:false,outcome:null,public_rules:{deadline:900000},progress:{last_progress_at:107000,warning_at:227000,waiting_until:227000,warning:true,message:'暂无新增总部反馈'}});
    expect(await game.get_actor_view(run,'INTEL')).toMatchObject({work:[{status:'completed'},{status:'completed'},{status:'completed'},{status:'completed'},{status:'completed'},{status:'completed'},{kind:'preparation',status:'running',started_at:206000,work_required_ms:60000}],verification_batches:[{status:'queued',started_at:null}]});
    await advance(266000);
    // INTEL has now authored a genuinely new commitment, but HQ has not
    // received it. Private knowledge must still leave the old wait expired.
    expect(await game.get_actor_view(run,'INTEL')).toMatchObject({published_status_reports:[{phase:'queued',expected_until:227000},{phase:'accepted',expected_until:287000,source_published:266000}],verification_batches:[{status:'running',started_at:266000}]});
    expect(Reflect.get(view,'verification_feedback')).toHaveLength(1);
    expect(view).toMatchObject({progress:{last_progress_at:107000,waiting_until:227000,warning:true},public_rules:{deadline:900000}});
    await advance(267000);
    expect(Reflect.get(view,'verification_feedback')).toMatchObject([{report:{phase:'queued',expected_until:227000}},{report:{phase:'accepted',expected_until:287000},delivery:{received:267000}}]);
    expect(view).toMatchObject({finished:false,outcome:null,progress:{last_progress_at:267000,waiting_until:287000,warning:false},public_rules:{deadline:900000}});
    expect(valid_response({request_id:'actual-new-public-commitment',ok:true,view})).toBe(true);
    await advance(287000);expect(view).toMatchObject({progress:{last_progress_at:287000,waiting_until:null,warning:false}});
  } finally {await store.delete();}
});

test('B24 E24 hidden qualifications and not-yet-delivered lineage cannot change the HQ view, warning timing, candidates or counts',async()=>{
  const stores:Persistence[]=[];
  try {
    const observed=[];
    for(const hidden of [false,true]){
      const prefix=await intelligence_variant(value=>{
        const catalogs:IntelligenceDefinition['catalogs']=value.catalogs;
        for(const [i,forward] of catalogs.forwardings.entries()){forward.received=500000+i*1000;forward.proof=hidden?null:'F'+(i+1);}
        if(hidden)catalogs.local_conditions.push({actor:'R',qualifications:[],equipment:null,record_energy:null,record_packs:null,position_scope:null,facility_authorized:null,source_ref:'B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E24'});
      });
      const definition=structuredClone(registered) as OutcomeDefinition;
      definition.prefix_definition=prefix;definition.catalogs=prefix.catalogs;
      definition.hashes.catalogs=await hash(definition.catalogs);const {definition_hash,...body}=definition;definition.definition_hash=await hash(body);
      const store=new Persistence('b24-owned-t02-private-pair-'+hidden,[],[],[],[definition]);stores.push(store);
      const game=new Game(store),initial=await game.create_run(definition,'research','create');
      const view=(await game.control_clock({run_id:initial.run_id,operation_id:'same-clock',expected_revision:initial.revision,intent:{kind:'advance',to:240000}})).view;
      expect(view).toMatchObject({finished:false,progress:{warning:true,last_progress_at:86000,warning_at:206000}});
      // Run identity is the sole normalization; every player-visible value,
      // array order and count is otherwise compared unchanged.
      observed.push(JSON.parse(JSON.stringify(view,(_key,value)=>value===initial.run_id?'<owned-run>':value)));
    }
    expect(observed[0]).toEqual(observed[1]);
  } finally {for(const store of stores)await store.delete();}
});

test('B24 E25 only an actually received long-wait estimate defers the no-progress reminder and repeated same-source assessments do not reset it',async()=>{
  const store=new Persistence('b24-owned-t02-public-long-wait');
  try {
    const game=new Game(store);let view=await game.create_run(registered,'research','create');
    const run=view.run_id,ref=(kind:string,id:string)=>({run_id:run,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:run,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    await advance(1000);
    view=(await game.return_and_deliver({run_id:run,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    await advance(86000);
    for(let i=0;i<9;i++)view=(await game.apply_outcome_intent({run_id:run,operation_id:'earlier-source-'+i,expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
    await advance(87000);expect(Reflect.get(view,'progress')).toMatchObject({waiting_until:null});
    await advance(88000);
    expect(Reflect.get(view,'verification_feedback')).toMatchObject([{report:{phase:'queued',expected_until:287000},delivery:{received:88000}}]);
    await advance(230000);
    expect(view).toMatchObject({finished:false,public_rules:{deadline:900000},progress:{last_progress_at:107000,warning_at:227000,waiting_until:287000,warning:false,message:null}});
    const forged=structuredClone(view);Reflect.get(forged,'progress').waiting_until=999999;
    expect(valid_response({request_id:'invented-wait',ok:true,view:forged})).toBe(false);
    expect(valid_response({request_id:'received-wait',ok:true,view})).toBe(true);
    await advance(287000);expect(view).toMatchObject({progress:{last_progress_at:287000,waiting_until:null,warning:false},finished:false});
  } finally {await store.delete();}
});
