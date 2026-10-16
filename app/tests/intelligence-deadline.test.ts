import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition,intelligence_variant} from './intelligence-fixtures';

test('B23 HQ estimates expose the one-millisecond preparation and validation gaps before submission and include accepted queue work',async()=>{
  const store=new Persistence('b23-owned-t04-hq-estimate-gap');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const at=await game.control_clock({run_id:initial.run_id,operation_id:'late-prep',expected_revision:1,intent:{kind:'advance',to:840001}});
    expect(at.view).toMatchObject({processing:{estimated_complete_at:{preparation:900001,source_validation:860001}}});
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:at.view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'公开时间缺口',repair_packs:2}}});
    const prep=await game.request_preparation({run_id:initial.run_id,operation_id:'prepare',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}});
    expect(prep.receipt.result).toBe('committed');
    expect(prep.view).toMatchObject({processing:{estimated_complete_at:{preparation:960001,source_validation:920001}}});
  }finally{await store.delete();}
  const second=new Persistence('b23-owned-t04-hq-validation-gap');
  try{
    const game=new Game(second),initial=await game.create_run(await intelligence_definition(),'research','create'),at=await game.control_clock({run_id:initial.run_id,operation_id:'late-validation',expected_revision:1,intent:{kind:'advance',to:880001}});
    expect(at.view).toMatchObject({processing:{estimated_complete_at:{source_validation:900001}}});
    const validation=await game.request_source_validation({run_id:initial.run_id,operation_id:'verify',expected_revision:at.view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:initial.run_id,kind:'report_delivery',id:'D-R3',version:1}]}});
    expect(validation.receipt.result).toBe('committed');
  }finally{await second.delete();}
});

test('B23 a public one-millisecond record estimate gap warns without forbidding the already-authorized pre-deadline attempt',async()=>{
  const store=new Persistence('b23-owned-t04-known-time-gap');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const move=await game.issue_activity({run_id:initial.run_id,operation_id:'move',expected_revision:1,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
    const {view}=await game.control_clock({run_id:initial.run_id,operation_id:'late-known',expected_revision:move.view.revision,intent:{kind:'advance',to:854001}});
    expect(view).toMatchObject({public_rules:{deadline:900000,receipt_grace:10000}});
    const option=Reflect.get(view,'field_options').find((o:{intent:{activity_ref:{id:string}}})=>o.intent.activity_ref.id==='A-record');expect(option).toMatchObject({available:true,estimated_complete_at:900001});
    const issued=await game.issue_activity({run_id:initial.run_id,operation_id:'late-record',expected_revision:view.revision,intent:option.intent});expect(issued.receipt.result).toBe('committed');
  }finally{await store.delete();}
});

test('B23 E42 queued work that cannot start before the deadline releases its unused reservation without inventing a start',async()=>{
  const store=new Persistence('b23-owned-t04-queued-cutoff');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create'),at=await game.control_clock({run_id:initial.run_id,operation_id:'late',expected_revision:1,intent:{kind:'advance',to:840001}});
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:at.view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'边界准备',repair_packs:2}}}),prep=await game.request_preparation({run_id:initial.run_id,operation_id:'prepare',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}});
    const queued=await game.request_source_validation({run_id:initial.run_id,operation_id:'verify',expected_revision:prep.view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:initial.run_id,kind:'report_delivery',id:'D-R3',version:1}]}});
    expect(queued.view.processing).toMatchObject({energy_confirmed:20,energy_reserved:8,queue:[{status:'running'},{status:'queued',started_at:null}]});
    const cutoff=await game.control_clock({run_id:initial.run_id,operation_id:'cutoff',expected_revision:queued.view.revision,intent:{kind:'advance',to:900000}});
    expect(cutoff.view).toMatchObject({assessments:[],preparation_results:[],supply_commitments:[],processing:{energy_confirmed:14,energy_reserved:0,queue:[{status:'cutoff',started_at:840001,completed_at:900000,work_done_ms:59999},{status:'cutoff',started_at:null,completed_at:900000,work_done_ms:0}]}});
    const after=await game.control_clock({run_id:initial.run_id,operation_id:'old-due',expected_revision:cutoff.view.revision,intent:{kind:'advance',to:901001}});
    expect(Reflect.get(after.view,'processing')).toEqual({...Reflect.get(cutoff.view,'processing'),confirmed_at:901001,estimated_complete_at:{preparation:961001,source_validation:921001}});expect(Reflect.get(after.view,'assessments')).toEqual([]);expect(Reflect.get(after.view,'preparation_results')).toEqual([]);
  }finally{await store.delete();}
});

test.each([900000,910000])('B23 E43 new field, verification and preparation requests at%i refuse with no committed effects',async at=>{
  const store=new Persistence('b23-owned-t04-after-deadline-'+at);
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create'),saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'截止拒绝',repair_packs:2}}});
    const {view}=await game.control_clock({run_id:initial.run_id,operation_id:'at-bound',expected_revision:saved.view.revision,intent:{kind:'advance',to:at}}),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1}),base={run_id:initial.run_id,expected_revision:view.revision};
    const local=await game.get_actor_view(initial.run_id,'R');
    await expect(game.issue_activity({...base,operation_id:'late-field',intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).rejects.toThrow();
    await expect(game.request_source_validation({...base,operation_id:'late-verify',intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).rejects.toThrow('RUN_ENDED');
    await expect(game.request_preparation({...base,operation_id:'late-prep',intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}})).rejects.toThrow('RUN_ENDED');
    for(const operation of ['late-field','late-verify','late-prep'])expect(await game.get_receipt(initial.run_id,operation)).toBeNull();
    expect(await game.get_view(initial.run_id)).toEqual(view);expect(await game.get_actor_view(initial.run_id,'R')).toEqual(local);
  }finally{await store.delete();}
});

test('B23 E44 save at899999 restores the same partial command run paused and cuts off once at900000 without a ghost artifact',async()=>{
  const store=new Persistence('b23-owned-t04-cutoff-restore');
  try{
    let game=new Game(store);const initial=await game.create_run(await intelligence_definition(),'command','create');let view=await game.get_view(initial.run_id);
    const tick=async(to:number)=>{view=(await game.tick(initial.run_id,to,'at-'+to)).view;},ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1}),issue=async(id:string)=>{view=(await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;};
    await issue('R-to-A');await tick(32000);await tick(854001);await issue('A-record');await tick(899999);
    view=(await game.save({run_id:initial.run_id,operation_id:'save-partial',expected_revision:view.revision,intent:{kind:'save'}})).view;
    const partial=await game.get_actor_view(initial.run_id,'R');expect(partial).toMatchObject({artifacts:[],activities:[{},{status:'running',work_done_ms:39998}],resources:{record_energy:20,record_packs:2,durability:97,equipment_energy_reserved:4,packs_reserved:1}});
    game=new Game(store);view=(await game.restore(initial.run_id,'restore-partial')).view;expect(view).toMatchObject({run_id:initial.run_id,sim_time:899999,paused:true});expect(await game.get_actor_view(initial.run_id,'R')).toEqual(partial);await expect(tick(900000)).rejects.toThrow('CLOCK_PAUSED');
    view=(await game.control_clock({run_id:initial.run_id,operation_id:'continue',expected_revision:view.revision,intent:{kind:'continue'}})).view;await tick(900000);
    expect(Reflect.get(view,'artifact_reports')).toEqual([]);expect(Reflect.get(view,'actors')[0]).toMatchObject({equipment_energy:20,packs:2});
    const cutoff=await game.get_actor_view(initial.run_id,'R');expect(cutoff).toMatchObject({artifacts:[],activities:[{},{status:'cutoff',terminal_at:900000,work_done_ms:39999,settled:true}],resources:{record_energy:16,record_packs:1,durability:97,equipment_energy_reserved:0,packs_reserved:0,link_energy:12,link_durability:96}});
    await tick(901001);expect(Reflect.get(view,'artifact_reports')).toEqual([]);expect(Reflect.get(view,'actors')[0]).toMatchObject({equipment_energy:16,packs:1});const final=await game.get_actor_view(initial.run_id,'R');expect({...final,sim_time:900000}).toEqual(cutoff);
  }finally{await store.delete();}
});

test.each([1000,10000,10001] as const)('B23 E43 an explicitly registered owned %ims transport delivers a completed record only within receipt grace',async delay=>{
  const source='B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E43';
  const definition=await intelligence_variant(d=>{
    if(delay===1000)return;
    d.profile.parameters.link_ms=delay;const entry=d.profile.registry.find(r=>r.id==='link_ms')!;entry.value=delay;entry.source_ref=source;
    const resolved=d.profile.resolved_registry.find(r=>r.id==='S10 link.text')!;Reflect.set(resolved.value as object,'normal_ms',delay);resolved.source_ref=source;
    for(const forwarding of d.catalogs.forwardings)forwarding.received+=delay-1000;
  }),store=new Persistence('b23-owned-t04-grace-'+delay,[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=await game.get_view(initial.run_id);
    const ref=(type:string,id:string)=>({run_id:initial.run_id,kind:type,id,version:1}),advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const issue=async(id:string)=>{view=(await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;};
    await issue('R-to-A');await advance(50000);await advance(855000-delay);await issue('A-record');await advance(900000);
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({artifacts:[{created_at:900000}],resources:{record_energy:16,record_packs:1,durability:97}});expect(Reflect.get(view,'artifact_reports')).toEqual([]);
    if(delay===1000){await advance(901000);expect(Reflect.get(view,'artifact_reports')).toMatchObject([{delivery:{received:901000}}]);}
    await advance(910000);expect(Reflect.get(view,'artifact_reports')).toHaveLength(delay===10001?0:1);
    const before=view,local=await game.get_actor_view(initial.run_id,'R');await expect(game.control_clock({run_id:initial.run_id,operation_id:'outside-grace',expected_revision:view.revision,intent:{kind:'advance',to:910001}})).rejects.toThrow();
    expect(await game.get_view(initial.run_id)).toEqual(before);expect(await game.get_actor_view(initial.run_id,'R')).toEqual(local);expect(await game.get_receipt(initial.run_id,'outside-grace')).toBeNull();
    expect(Reflect.get(local,'published_reports').filter(r=>'order_ref' in r&&r.order_ref.id==='O2')).toHaveLength(2);
  }finally{await store.delete();}
});

test.each(['record','repair','validation','preparation'] as const)('B23 E41/E42 %s completes exactly at900000 but one millisecond late settles partial work without a product',async kind=>{
  for(const late of [false,true]){
    const store=new Persistence('b23-owned-t04-boundary-'+kind+'-'+late);
    try{
      const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');let view=await game.get_view(initial.run_id);
      const ref=(type:string,id:string)=>({run_id:initial.run_id,kind:type,id,version:1}),advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
      const prepare=async()=>{const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'截止边界',repair_packs:2}}});view=(await game.request_preparation({run_id:initial.run_id,operation_id:'prepare',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}})).view;};
      const issue=async(actor:string,id:string)=>{view=(await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:Reflect.get(view,'preparation_results').map((r:{delivery:{ref:unknown}})=>r.delivery.ref)}})).view;};
      if(kind==='record'){await issue('R','R-to-A');await advance(32000);await advance(854000+Number(late));await issue('R','A-record');}
      if(kind==='repair'){await prepare();await advance(146000);await advance(834000+Number(late));await issue('W','W-repair');}
      if(kind==='validation'){await advance(880000+Number(late));view=(await game.request_source_validation({run_id:initial.run_id,operation_id:'validate',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;}
      if(kind==='preparation'){await advance(840000+Number(late));await prepare();}
      await advance(900000);
      expect(view.finished).toBe(false);expect(Reflect.get(view,'artifact_reports')).toEqual([]);expect(Reflect.get(view,'assessments')).toEqual([]);expect(Reflect.get(view,'preparation_results')).toHaveLength(kind==='repair'?1:0);
      if(kind==='record'||kind==='repair'){
        const local=await game.get_actor_view(initial.run_id,kind==='record'?'R':'W'),last=Reflect.get(local,'activities').at(-1);
        expect(last).toMatchObject({status:late?'cutoff':'completed',terminal_at:900000,work_done_ms:(kind==='record'?40000:60000)-Number(late),settled:true});
        expect(local.resources).toMatchObject({equipment_energy_reserved:0,packs_reserved:0,durability:kind==='record'?97:95,...(kind==='record'?{record_energy:16,record_packs:1}:{work_energy:18,repair_packs:0})});
        expect(Reflect.get(local,'artifacts')).toHaveLength(kind==='record'&&!late?1:0);expect(Reflect.get(local,'published_reports').filter(r=>'order_ref' in r&&r.order_ref.id===last.ref.id)).toHaveLength(2);
      }else expect(Reflect.get(view,'processing')).toMatchObject({energy_confirmed:kind==='validation'?18:14,energy_reserved:0,queue:[{status:late?'cutoff':'completed',started_at:(kind==='validation'?880000:840000)+Number(late),completed_at:900000,work_done_ms:(kind==='validation'?20000:60000)-Number(late)}]});
      await advance(901000);
      if(kind==='record')expect(Reflect.get(view,'artifact_reports')).toHaveLength(late?0:1);
      if(kind==='repair')expect(Reflect.get(view,'repair_condition').status).toBe(late?'required':'confirmed_repaired');
      if(kind==='validation')expect(Reflect.get(view,'assessments')).toHaveLength(late?0:1);
      if(kind==='preparation')expect(Reflect.get(view,'preparation_results')).toHaveLength(late?0:1);
      const settled=kind==='record'||kind==='repair'?await game.get_actor_view(initial.run_id,kind==='record'?'R':'W'):Reflect.get(view,'processing').queue;
      await advance(910000);
      if(kind==='record'||kind==='repair'){const final=await game.get_actor_view(initial.run_id,kind==='record'?'R':'W');expect({...final,sim_time:901000}).toEqual(settled);}else expect(Reflect.get(view,'processing').queue).toEqual(settled);
    }finally{await store.delete();}
  }
});
