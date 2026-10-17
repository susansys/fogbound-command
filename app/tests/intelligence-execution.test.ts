import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition} from './intelligence-fixtures';
import {intelligence_player_view} from '../src/intelligence-dto';

test('B23 E22 a public per-phase move travels registered 100m with load9; local arrival precedes HQ confirmation',async()=>{
  const store=new Persistence('b23-owned-t03-first-move');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const request={run_id:initial.run_id,operation_id:'move-to-A',expected_revision:1,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}};
    const issued=await game.issue_activity(request);
    expect(issued).toMatchObject({receipt:{kind:'issue_activity'},view:{actors:[{actor:'R',position_scope:'H',movement_energy:20},{actor:'W'}],field_activities:[{status:'issued',issued_at:0}],field_reports:[]}});
    const accepted=await game.control_clock({run_id:initial.run_id,operation_id:'accept-move',expected_revision:Reflect.get(issued,'view').revision,intent:{kind:'advance',to:1000}});
    expect(accepted.view).toMatchObject({actors:[{actor:'R',position_scope:'H',movement_energy:20},{actor:'W'}],field_reports:[]});
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({position:{site:'H',point:[50,150]},resources:{movement_energy_reserved:1,link_energy:15}});
    const local=await game.control_clock({run_id:initial.run_id,operation_id:'local-arrival',expected_revision:accepted.view.revision,intent:{kind:'advance',to:30500}});
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({position:{site:'A',point:[150,150]},resources:{movement_energy:19,movement_energy_reserved:0,link_energy:14}});
    expect(local.view).toMatchObject({actors:[{actor:'R',position_scope:'H',movement_energy:20},{actor:'W'}]});
    const hq=await game.control_clock({run_id:initial.run_id,operation_id:'HQ-arrival',expected_revision:local.view.revision,intent:{kind:'advance',to:31500}});
    expect(hq.view).toMatchObject({actors:[{actor:'R',position_scope:'A',movement_energy:19,confirmed_at:31500},{actor:'W'}],field_reports:[{report:{phase:'accepted'},delivery:{received:2000}},{report:{phase:'completed',observed:{kind:'known',value:30500}},delivery:{received:31500}}]});
    expect(hq.view).toMatchObject({position_knowledge:{status:'known_scope',scope:{typed_geometry:{position:[150,150]}},observed:{kind:'known',value:30500},received:31500,provenance:{kind:'delivered',delivery_ref:'D-O1-completed'}}});expect(intelligence_player_view(hq.view)).toBe(true);
    expect(Reflect.get(hq.view,'field_reports')[1].report).toMatchObject({source_event_time:{kind:'unknown'},observed:{kind:'known',value:30500},source_published:30500,source_descriptor:'R在本次现场活动中的回报',quality:'unknown',reliability:'unassessed',claimed_confirmation:'unverified',typed_payload:{kind:'field_status',phase:'completed'},provenance:{kind:'local_observation',origin_event:'O1-completed'},attachment_refs:[]});
    expect((await game.issue_activity(request)).receipt).toEqual(Reflect.get(issued,'receipt'));
  }finally{await store.delete();}
});

test('B23 an already-issued repair freezes its lawful approval while a later draft version cannot use the old approval for a new issue',async()=>{
  const store=new Persistence('b23-owned-t03-frozen-approval');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'原维修目的',repair_packs:2}}});
    const prep=await game.request_preparation({run_id:initial.run_id,operation_id:'prep',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}}),ready=await game.control_clock({run_id:initial.run_id,operation_id:'approval',expected_revision:prep.view.revision,intent:{kind:'advance',to:146000}}),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const intent={kind:'issue_activity',actor_ref:ref('actor','W'),activity_ref:ref('activity','W-repair'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[Reflect.get(ready.view,'preparation_results')[0].delivery.ref]};
    const issued=await game.issue_activity({run_id:initial.run_id,operation_id:'repair',expected_revision:ready.view.revision,intent});
    const edited=await game.save_plan({run_id:initial.run_id,operation_id:'new-draft',expected_revision:issued.view.revision,intent:{kind:'save_plan',base_plan_ref:saved.view.plan!.ref,draft:{purpose:'后来草案',repair_packs:2}}});
    await game.control_clock({run_id:initial.run_id,operation_id:'local-accept',expected_revision:edited.view.revision,intent:{kind:'advance',to:147000}});
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({activities:[{status:'running'}],resources:{equipment_energy_reserved:6,packs_reserved:2}});
    const final=await game.get_view(initial.run_id);expect(Reflect.get(final,'plan').ref.version).toBe(2);expect(Reflect.get(final,'preparation').status).toBe('not_requested');
  }finally{await store.delete();}
});

test('B23 E23 five explicit field actions conserve separate recipes; B record requires carried verification and received repair evidence',async()=>{
  const store=new Persistence('b23-owned-t03-five-field-actions');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');let view=await game.get_view(initial.run_id);
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{const result=await game.control_clock({run_id:initial.run_id,operation_id:'advance-'+to,expected_revision:view.revision,intent:{kind:'advance',to}});view=result.view;return view;};
    const issue=async(id:string,actor:string,basis:unknown[]=[])=>{const result=await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:basis}});view=result.view;return view;};
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'两处记录',repair_packs:2}}});
    view=(await game.request_preparation({run_id:initial.run_id,operation_id:'prepare',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}})).view;
    await issue('R-to-A','R');await advance(32000);await issue('A-record','R');await advance(80000);await issue('R-to-B','R');await advance(86000);
    view=(await game.request_source_validation({run_id:initial.run_id,operation_id:'validate',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
    await advance(146000);await issue('W-repair','W',[Reflect.get(view,'preparation_results')[0].delivery.ref]);await advance(214000);
    const before=view;
    await expect(issue('B-record','R')).rejects.toThrow('EVIDENCE_REQUIRED');expect(await game.get_view(initial.run_id)).toEqual(before);
    const basis=[Reflect.get(view,'assessments')[0].delivery.ref,Reflect.get(view,'field_reports').find((r:{report:{repair_condition:string|null}})=>r.report.repair_condition==='repaired')!.delivery.ref];
    await issue('B-record','R',basis);await advance(260000);
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{movement_energy:18,record_energy:12,durability:94,record_packs:0,link_energy:8,link_durability:92},artifacts:[{site:'A',created_at:78000},{site:'B',created_at:260000}]});
    expect(Reflect.get(view,'artifact_reports')).toHaveLength(1);
    const hq=await advance(261000);expect(Reflect.get(hq,'artifact_reports')).toHaveLength(2);expect(Reflect.get(hq,'processing')).toMatchObject({energy_confirmed:12,energy_reserved:0});
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({resources:{work_energy:18,durability:95,repair_packs:0}});
    expect(await game.get_actor_view(initial.run_id,'ArchiveSource')).toMatchObject({resources:{energy:16,durability:97,packs:0}});
    expect(hq.finished).toBe(false);
  }finally{await store.delete();}
});

test('B23 E22 consuming A record pack reduces the next100m load to8 and movement duration to29000ms',async()=>{
  const store=new Persistence('b23-owned-t03-second-move');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');let revision=1;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issue=async(id:string)=>{const result=await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});revision=result.view.revision;return result.view;};
    const advance=async(to:number)=>{const result=await game.control_clock({run_id:initial.run_id,operation_id:'advance-'+to,expected_revision:revision,intent:{kind:'advance',to}});revision=result.view.revision;return result.view;};
    await issue('R-to-A');await advance(32000);await issue('A-record');await advance(80000);await issue('R-to-B');
    await advance(95500);expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({position:{point:[200,150]},resources:{movement_energy:19,movement_energy_reserved:1}});
    const local=await advance(110000);expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({position:{site:'B',point:[250,150]},resources:{movement_energy:18,movement_energy_reserved:0,link_energy:10},activities:[{duration_ms:29500},{duration_ms:45000},{duration_ms:29000}]});
    expect(Reflect.get(local,'actors')[0].position_scope).toBe('A');
    const hq=await advance(111000);expect(Reflect.get(hq,'actors')[0]).toMatchObject({position_scope:'B',movement_energy:18,load:8});
  }finally{await store.delete();}
});

test('B23 E21 W receives an exact approval, reserves locally, repairs for65s and reports through its authorized B facility',async()=>{
  const store=new Persistence('b23-owned-t03-W-repair');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');let view=await game.get_view(initial.run_id);
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'B维修',repair_packs:2}}});
    const prep=await game.request_preparation({run_id:initial.run_id,operation_id:'prepare',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}});
    const ready=await game.control_clock({run_id:initial.run_id,operation_id:'approval-received',expected_revision:prep.view.revision,intent:{kind:'advance',to:146000}});view=ready.view;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const request={run_id:initial.run_id,operation_id:'repair-B',expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','W'),activity_ref:ref('activity','W-repair'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[Reflect.get(view,'preparation_results')[0].delivery.ref]}};
    const issued=await game.issue_activity(request);
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({resources:{work_energy:24,equipment_energy_reserved:0,repair_packs:2,packs_reserved:0}});
    const advance=async(to:number)=>{const result=await game.control_clock({run_id:initial.run_id,operation_id:'advance-'+to,expected_revision:view.revision,intent:{kind:'advance',to}});view=result.view;return view;};view=issued.view;
    await advance(147000);expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({resources:{work_energy:24,equipment_energy_reserved:6,repair_packs:2,packs_reserved:2,durability:100}});
    const complete=await advance(212000);
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({resources:{work_energy:18,equipment_energy_reserved:0,repair_packs:0,packs_reserved:0,durability:95},artifacts:[]});
    expect(Reflect.get(complete,'repair_condition')).toMatchObject({status:'required'});
    const hq=await advance(213000);
    expect(Reflect.get(hq,'repair_condition')).toMatchObject({status:'confirmed_repaired',confirmed_at:213000,evidence_ref:'D-O1-completed'});
    expect(Reflect.get(hq,'field_reports')).toMatchObject([{report:{phase:'accepted'},delivery:{received:148000,facility_ref:'B'}},{report:{phase:'completed',observed:{kind:'known',value:212000}},delivery:{received:213000,facility_ref:'B'}}]);
    expect(Reflect.get(hq,'actors')[1]).toMatchObject({equipment_energy:18,packs:0,durability:95,link:null});
    expect(Reflect.get(hq,'supply_commitments')).toMatchObject([{status:'consumed'}]);
    expect(JSON.stringify(hq)).not.toContain('fixed_terminal_energy');
  }finally{await store.delete();}
});

test('B23 E21 A record reserves its own recipe, excludes setup from work, and creates an artifact before HQ receives it',async()=>{
  const store=new Persistence('b23-owned-t03-A-record');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');let revision=1;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{const result=await game.control_clock({run_id:initial.run_id,operation_id:'advance-'+to,expected_revision:revision,intent:{kind:'advance',to}});revision=result.view.revision;return result.view;};
    const issue=async(id:string)=>{const result=await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});revision=result.view.revision;return result.view;};
    await issue('R-to-A');await advance(32000);await issue('A-record');await advance(33000);
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{record_energy:20,equipment_energy_reserved:4,record_packs:2,packs_reserved:1,durability:100},artifacts:[]});
    await advance(38000);expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{durability:100},activities:[{}, {work_done_ms:0}]});
    await advance(38001);expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{durability:97},activities:[{}, {work_done_ms:1}]});
    const local=await advance(78000);
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{record_energy:16,equipment_energy_reserved:0,record_packs:1,packs_reserved:0,durability:97,link_energy:12,link_durability:96},load:8,space:6,artifacts:[{site:'A',created_at:78000,custody_holder:'R',condition:'intact',lifecycle_state:'collected',verification_state:'not_requested',custody_events:[],verification_events:[]}]});
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({artifacts:[{material_refs:[{kind:'record_material',id:'MAT-O2',version:1}]}],record_materials:[{ref:{kind:'record_material',id:'MAT-O2',version:1},site:'A',captured_at:78000,source_event_time:{kind:'unknown'},typed_payload:{kind:'site_record',site:'A'},body:'A处记录的虚构采集素材。'}]});
    expect(Reflect.get(local,'artifact_reports')).toEqual([]);
    expect(Reflect.get(local,'actors')[0]).toMatchObject({equipment_energy:20,packs:2});
    const received=await advance(79000);
    expect(Reflect.get(received,'artifact_reports')).toMatchObject([{report:{artifact:{site:'A',created_at:78000,custody_holder:'R',lifecycle_state:'collected',verification_state:'not_requested'}},delivery:{received:79000}}]);
    expect(Reflect.get(received,'actors')[0]).toMatchObject({equipment_energy:16,packs:1,load:8,space:6,confirmed_at:79000});
  }finally{await store.delete();}
});
