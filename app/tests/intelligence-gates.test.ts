import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_variant} from './intelligence-fixtures';

test('B23 E24 an unreported missing record qualification is checked locally and cannot leak through HQ issue or pre-receipt projection',async()=>{
  const observations=[];
  for(const missing of [false,true]){
    const definition=await intelligence_variant(d=>{if(missing)Reflect.set(d.catalogs,'local_conditions',[{actor:'R',qualifications:[],equipment:null,record_energy:null,record_packs:null,position_scope:null,facility_authorized:null,source_ref:'B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E24'}]);}),store=new Persistence('b23-owned-t03-qualification-'+missing,[],[],[definition]);
    try{
      const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=await game.get_view(initial.run_id);const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
      const issue=async(id:string)=>{view=(await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;return view;};
      const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'advance-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;return view;};
      await issue('R-to-A');await advance(32000);await issue('A-record');await advance(33000);observations.push(JSON.stringify(view).replaceAll(initial.run_id,'<run>'));
      const local=await game.get_actor_view(initial.run_id,'R');expect(local).toMatchObject({activities:[{status:'completed'},{status:missing?'refused':'running'}]});
      if(missing)expect(local).toMatchObject({resources:{record_energy:20,equipment_energy_reserved:0,record_packs:2,packs_reserved:0}});
      await advance(34000);expect(Reflect.get(view,'field_activities')[1].status).toBe(missing?'refused':'accepted');
    }finally{await store.delete();}
  }
  expect(observations[0]).toEqual(observations[1]);
});

test('B23 review local actor view cannot see an HQ order or its evidence until actual1000ms delivery',async()=>{
  const store=new Persistence('b23-owned-t03-local-visibility');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_variant(()=>{}),'research','create'),before=await game.get_actor_view(initial.run_id,'R'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issued=await game.issue_activity({run_id:initial.run_id,operation_id:'move',expected_revision:1,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
    expect(await game.get_actor_view(initial.run_id,'R')).toEqual(before);
    const pending=await game.control_clock({run_id:initial.run_id,operation_id:'before-delivery',expected_revision:issued.view.revision,intent:{kind:'advance',to:999}});
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({activities:[],message_facts:[]});
    await game.control_clock({run_id:initial.run_id,operation_id:'delivered',expected_revision:pending.view.revision,intent:{kind:'advance',to:1000}});
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({activities:[{status:'running',arrives_at:1000,payload:{activity_ref:{id:'R-to-A'}}}]});
  }finally{await store.delete();}
});

test('B23 E24 WORK-only R retains movement but has no portable report capability; HQ cannot infer its private arrival',async()=>{
  const definition=await intelligence_variant(d=>Reflect.set(d.catalogs,'local_conditions',[{actor:'R',qualifications:null,equipment:['WORK'],record_energy:null,record_packs:null,position_scope:null,facility_authorized:null,source_ref:'B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E24'}])),store=new Persistence('b23-owned-t03-work-only-R',[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issued=await game.issue_activity({run_id:initial.run_id,operation_id:'move',expected_revision:1,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}}),result=await game.control_clock({run_id:initial.run_id,operation_id:'arrival',expected_revision:issued.view.revision,intent:{kind:'advance',to:31500}});
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({position:{site:'A'},resources:{movement_energy:19,link_energy:16,link_durability:100},message_facts:[{status:'unsent'},{status:'unsent'}],activities:[{status:'completed'}]});
    expect(result.view).toMatchObject({actors:[{position_scope:'H',movement_energy:20},{}],field_reports:[],field_activities:[{status:'issued'}]});
  }finally{await store.delete();}
});

test('B23 E30 private W position outside B/H is rechecked locally and cannot create a fixed-facility Delivery',async()=>{
  const definition=await intelligence_variant(d=>Reflect.set(d.catalogs,'local_conditions',[{actor:'W',qualifications:null,equipment:null,record_energy:null,record_packs:null,position_scope:'A',facility_authorized:null,source_ref:'B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E30'}])),store=new Persistence('b23-owned-t03-fixed-position',[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create'),saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'维修',repair_packs:2}}}),prep=await game.request_preparation({run_id:initial.run_id,operation_id:'prep',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}}),ready=await game.control_clock({run_id:initial.run_id,operation_id:'approval',expected_revision:prep.view.revision,intent:{kind:'advance',to:146000}}),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issued=await game.issue_activity({run_id:initial.run_id,operation_id:'repair',expected_revision:ready.view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','W'),activity_ref:ref('activity','W-repair'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[Reflect.get(ready.view,'preparation_results')[0].delivery.ref]}}),checked=await game.control_clock({run_id:initial.run_id,operation_id:'checked',expected_revision:issued.view.revision,intent:{kind:'advance',to:148000}});
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({position:{site:'A'},activities:[{status:'refused'}],resources:{work_energy:24,repair_packs:2,packs_reserved:0,equipment_energy_reserved:0},message_facts:[{status:'unsent'}]});expect(Reflect.get(checked.view,'field_reports')).toEqual([]);expect(Reflect.get(checked.view,'actors')[1].position_scope).toBe('B');
  }finally{await store.delete();}
});

test('B23 E30 a controlled W movement cannot upload from a fixed terminal while moving; only actual H arrival permits its terminal report',async()=>{
  const definition=await intelligence_variant(d=>{
    d.capabilities.push({id:'W:move-fixture',actor:'W',action:'move',qualification:'none',equipment:'movement',unit:'fictional_metre',capacity:1});
    d.catalogs.activities.push({id:'E30-W-move',actor:'W',action:'move',from:'B',to:'H',capability:'W:move-fixture',prerequisite:null,conditions:[],label:'W受控移动探针'});
  });
  const store=new Persistence('b23-owned-t03-w-moving',[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issued=await game.issue_activity({run_id:initial.run_id,operation_id:'controlled-move',expected_revision:1,intent:{kind:'issue_activity',actor_ref:ref('actor','W'),activity_ref:ref('activity','E30-W-move'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
    const running=await game.control_clock({run_id:initial.run_id,operation_id:'moving',expected_revision:issued.view.revision,intent:{kind:'advance',to:1000}});
    expect(Reflect.get(running.view,'field_reports')).toEqual([]);
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({resources:{movement_energy:20,movement_energy_reserved:2},message_facts:[{status:'unsent',sent:null}]});
    const arrived=await game.control_clock({run_id:initial.run_id,operation_id:'arrival',expected_revision:running.view.revision,intent:{kind:'advance',to:59000}});
    expect(Reflect.get(arrived.view,'field_reports')).toEqual([]);
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({resources:{movement_energy:18,movement_energy_reserved:0},position:{site:'H',point:[50,150]},message_facts:[{status:'unsent'},{status:'sent',sent:59000}]});
    const received=await game.control_clock({run_id:initial.run_id,operation_id:'received',expected_revision:arrived.view.revision,intent:{kind:'advance',to:60000}});
    expect(Reflect.get(received.view,'field_reports')).toMatchObject([{report:{phase:'completed'},delivery:{facility_ref:'H',received:60000}}]);
  }finally{await store.delete();}
});

test('B23 E30 unavailable fixed-facility authority retains unsent local facts and creates no Delivery or fixed energy charge',async()=>{
  const definition=await intelligence_variant(d=>Reflect.set(d.catalogs,'local_conditions',[{actor:'W',qualifications:null,equipment:null,record_energy:null,record_packs:null,position_scope:null,facility_authorized:false,source_ref:'B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E30'}]));
  const store=new Persistence('b23-owned-t03-fixed-permission',[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create'),saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'维修',repair_packs:2}}});
    const prep=await game.request_preparation({run_id:initial.run_id,operation_id:'prep',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}});
    const ready=await game.control_clock({run_id:initial.run_id,operation_id:'approval',expected_revision:prep.view.revision,intent:{kind:'advance',to:146000}}),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const envelope={run_id:initial.run_id,operation_id:'repair',expected_revision:ready.view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','W'),activity_ref:ref('activity','W-repair'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[Reflect.get(ready.view,'preparation_results')[0].delivery.ref]}};
    const issued=await game.issue_activity(envelope),complete=await game.control_clock({run_id:initial.run_id,operation_id:'complete',expected_revision:issued.view.revision,intent:{kind:'advance',to:213000}});
    expect(Reflect.get(complete.view,'field_reports')).toEqual([]);expect(Reflect.get(complete.view,'repair_condition').status).toBe('required');
    const local=await game.get_actor_view(initial.run_id,'W');expect(local).toMatchObject({resources:{work_energy:18,repair_packs:0,durability:95},message_facts:[{status:'unsent',sent:null},{status:'unsent',sent:null}]});expect(Reflect.get(local,'published_reports')).toHaveLength(2);
    expect((await game.issue_activity(envelope)).receipt).toEqual(issued.receipt);expect(Reflect.get(await game.get_actor_view(initial.run_id,'W'),'message_facts')).toHaveLength(2);
  }finally{await store.delete();}
});

test.each([{actor:'R',activity:'A-record',equipment:['WORK','LINK']},{actor:'W',activity:'W-repair',equipment:['REC']}])('B23 E24 $actor cannot substitute $equipment for the registered recipe while unrelated movement remains legal',async({actor,activity,equipment})=>{
  const definition=await intelligence_variant(d=>Reflect.set(d.catalogs,'local_conditions',[{actor,qualifications:null,equipment,record_energy:null,record_packs:null,position_scope:null,facility_authorized:null,source_ref:'B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E24'}]));
  const store=new Persistence('b23-owned-t03-wrong-equipment-'+actor,[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=await game.get_view(initial.run_id);const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    if(actor==='R'){
      view=(await game.issue_activity({run_id:initial.run_id,operation_id:'move',expected_revision:1,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;
      view=(await game.control_clock({run_id:initial.run_id,operation_id:'arrive',expected_revision:view.revision,intent:{kind:'advance',to:32000}})).view;
    }else{
      const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'维修',repair_packs:2}}});
      view=(await game.request_preparation({run_id:initial.run_id,operation_id:'prep',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}})).view;
      view=(await game.control_clock({run_id:initial.run_id,operation_id:'approval',expected_revision:view.revision,intent:{kind:'advance',to:146000}})).view;
    }
    const start=view.sim_time,basis=actor==='W'?[Reflect.get(view,'preparation_results')[0].delivery.ref]:[];
    view=(await game.issue_activity({run_id:initial.run_id,operation_id:'work',expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',activity),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:basis}})).view;
    await game.control_clock({run_id:initial.run_id,operation_id:'local-check',expected_revision:view.revision,intent:{kind:'advance',to:start+1000}});
    const local=await game.get_actor_view(initial.run_id,actor);expect(Reflect.get(local,'activities').at(-1)).toMatchObject({status:'refused'});expect(local).toMatchObject({resources:{equipment_energy_reserved:0,packs_reserved:0},artifacts:[]});
    if(actor==='R')expect(local).toMatchObject({resources:{movement_energy:19,record_energy:20,record_packs:2}});else expect(local).toMatchObject({resources:{work_energy:24,repair_packs:2}});
  }finally{await store.delete();}
});

test('B23 E27 a second overlapping actor/device activity is rejected atomically while portable accepted communication runs concurrently',async()=>{
  const store=new Persistence('b23-owned-t03-overlap');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_variant(()=>{}),'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const intent={kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]};
    const first=await game.issue_activity({run_id:initial.run_id,operation_id:'first',expected_revision:1,intent});
    await expect(game.issue_activity({run_id:initial.run_id,operation_id:'overlap',expected_revision:first.view.revision,intent:{...intent,activity_ref:ref('activity','A-record')}})).rejects.toThrow('CAPACITY_CONFLICT');
    expect(await game.get_view(initial.run_id)).toEqual(first.view);expect(await game.get_receipt(initial.run_id,'overlap')).toBeNull();
    const running=await game.control_clock({run_id:initial.run_id,operation_id:'accept',expected_revision:first.view.revision,intent:{kind:'advance',to:1000}});
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{movement_energy_reserved:1,link_energy:15},activities:[{status:'running'}]});
    expect(Reflect.get(running.view,'field_reports')).toEqual([]);
  }finally{await store.delete();}
});

test('B23 E25 REC energy3 with one pack refuses locally without consuming stock or borrowing another energy account',async()=>{
  const definition=await intelligence_variant(d=>Reflect.set(d.catalogs,'local_conditions',[{actor:'R',qualifications:null,equipment:null,record_energy:3,record_packs:1,position_scope:null,facility_authorized:null,source_ref:'B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E25'}]));
  const store=new Persistence('b23-owned-t03-rec-shortage',[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=await game.get_view(initial.run_id);const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issue=async(id:string)=>{view=(await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;};
    await issue('R-to-A');view=(await game.control_clock({run_id:initial.run_id,operation_id:'arrive',expected_revision:view.revision,intent:{kind:'advance',to:32000}})).view;await issue('A-record');view=(await game.control_clock({run_id:initial.run_id,operation_id:'check',expected_revision:view.revision,intent:{kind:'advance',to:33000}})).view;
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{record_energy:3,record_packs:1,equipment_energy_reserved:0,packs_reserved:0,durability:100,movement_energy:19,work_energy:0},activities:[{}, {status:'refused'}],artifacts:[]});
    expect(Reflect.get(view,'actors')[0]).toMatchObject({equipment_energy:20,packs:2});
  }finally{await store.delete();}
});
