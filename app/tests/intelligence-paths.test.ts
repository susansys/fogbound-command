import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition} from './intelligence-fixtures';
import type {IntelligencePlayerView} from '../src/intelligence-contracts';

test('B23 E32 preparation first reaches two collected-record HQ reports at261000 without claiming handover or an Outcome',async()=>{
  const store=new Persistence('b23-owned-t04-preparation-first');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');let view=await game.get_view(initial.run_id);
    const current=()=>view as IntelligencePlayerView,ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const issue=async(actor:string,activity:string)=>{view=(await game.issue_activity({run_id:initial.run_id,operation_id:activity,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',activity),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[...current().assessments.map(a=>a.delivery.ref),...current().preparation_results.map(a=>a.delivery.ref),...current().field_reports.filter(r=>r.report.repair_condition==='repaired').map(r=>r.delivery.ref)]}})).view;};
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得B记录',repair_packs:2}}});
    view=(await game.request_preparation({run_id:initial.run_id,operation_id:'prepare',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}})).view;
    await issue('R','R-to-A');await advance(32000);await issue('R','A-record');await advance(79000);await advance(80000);await issue('R','R-to-B');await advance(86000);
    view=(await game.request_source_validation({run_id:initial.run_id,operation_id:'verify',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
    await advance(146000);expect(current().preparation_results[0].delivery.received).toBe(146000);await issue('W','W-repair');await advance(166000);expect(current().assessments[0].delivery.received).toBe(166000);
    await advance(213000);expect(current().repair_condition).toMatchObject({status:'confirmed_repaired',confirmed_at:213000});await advance(214000);await issue('R','B-record');
    await advance(260000);expect(current().artifact_reports).toHaveLength(1);expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({artifacts:[{site:'A'},{site:'B',created_at:260000}]});
    await advance(261000);expect(current().artifact_reports.map(a=>[a.report.artifact!.site,a.report.artifact!.created_at,a.delivery.received])).toEqual([['A',78000,79000],['B',260000,261000]]);
    expect(current()).toMatchObject({finished:false,processing:{energy_confirmed:12,energy_reserved:0},actors:[{actor:'R',movement_energy:18,equipment_energy:12,durability:94,packs:0,link:{energy:8,durability:92}},{actor:'W',equipment_energy:18,durability:95,packs:0}]});
    expect(await game.get_actor_view(initial.run_id,'ArchiveSource')).toMatchObject({resources:{energy:16,durability:97,packs:0}});
    for(const {report} of current().artifact_reports)expect(report.artifact).toMatchObject({custody_holder:'R',lifecycle_state:'collected',verification_state:'not_requested',custody_events:[],verification_events:[]});
    expect(current().next_action).toBe('A、B两处现场成果回报已收到；记录仍由R保管，返程与交接留待后续。');
  }finally{await store.delete();}
});

test('B23 E31 verification first receives the B record at284000, exactly23000 later than the preparation-first oracle',async()=>{
  const store=new Persistence('b23-owned-t04-verification-first');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');let view=await game.get_view(initial.run_id);
    const current=()=>view as IntelligencePlayerView,ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const issue=async(actor:string,activity:string)=>{view=(await game.issue_activity({run_id:initial.run_id,operation_id:activity,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',activity),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[...current().assessments.map(a=>a.delivery.ref),...current().preparation_results.map(a=>a.delivery.ref),...current().field_reports.filter(r=>r.report.repair_condition==='repaired').map(r=>r.delivery.ref)]}})).view;};
    await advance(86000);view=(await game.request_source_validation({run_id:initial.run_id,operation_id:'verify',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
    await advance(107000);expect(current().assessments[0].delivery.received).toBe(107000);await issue('R','R-to-A');
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'核实后准备',repair_packs:2}}});view=saved.view;
    await advance(108000);view=(await game.request_preparation({run_id:initial.run_id,operation_id:'prepare',expected_revision:view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}})).view;
    await advance(139000);await issue('R','A-record');await advance(169000);expect(current().preparation_results[0].delivery.received).toBe(169000);await issue('W','W-repair');
    await advance(187000);await issue('R','R-to-B');await advance(236000);expect(current().repair_condition).toMatchObject({status:'confirmed_repaired',confirmed_at:236000});await advance(237000);await issue('R','B-record');
    await advance(283000);expect(current().artifact_reports).toHaveLength(1);await advance(284000);
    expect(current().artifact_reports.map(a=>[a.report.artifact!.site,a.report.artifact!.created_at,a.delivery.received])).toEqual([['A',185000,186000],['B',283000,284000]]);
    expect(current()).toMatchObject({finished:false,processing:{energy_confirmed:12,energy_reserved:0},actors:[{actor:'R',movement_energy:18,equipment_energy:12,durability:94,packs:0,link:{energy:8,durability:92}},{actor:'W',equipment_energy:18,durability:95,packs:0}]});
    expect(current().next_action).toBe('A、B两处现场成果回报已收到；记录仍由R保管，返程与交接留待后续。');
  }finally{await store.delete();}
});

test.each(['verification','repair'] as const)('B23 E33 missing %s evidence refuses B recording without effects even after three blue forwards',async missing=>{
  const store=new Persistence('b23-owned-t04-missing-'+missing);
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');let view=await game.get_view(initial.run_id);
    const current=()=>view as IntelligencePlayerView,ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const envelope=(actor:string,activity:string)=>({run_id:initial.run_id,operation_id:activity,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',activity),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[...current().assessments.map(a=>a.delivery.ref),...current().preparation_results.map(a=>a.delivery.ref),...current().field_reports.filter(r=>r.report.repair_condition==='repaired').map(r=>r.delivery.ref)]}});
    const issue=async(actor:string,id:string)=>{view=(await game.issue_activity(envelope(actor,id))).view;};
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'条件探针',repair_packs:2}}});view=(await game.request_preparation({run_id:initial.run_id,operation_id:'prepare',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan!.ref}})).view;
    await issue('R','R-to-A');await advance(32000);await issue('R','A-record');await advance(80000);await issue('R','R-to-B');await advance(86000);
    expect(current().source_groups[0].delivery_refs).toHaveLength(3);expect(current().access.blue).toBe('unverified');
    if(missing!=='verification')view=(await game.request_source_validation({run_id:initial.run_id,operation_id:'verify',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
    await advance(146000);if(missing!=='repair')await issue('W','W-repair');await advance(214000);
    const before=view,local=await game.get_actor_view(initial.run_id,'R'),blocked=envelope('R','B-record');
    await expect(game.issue_activity(blocked)).rejects.toThrow('EVIDENCE_REQUIRED');expect(await game.get_receipt(initial.run_id,'B-record')).toBeNull();expect(await game.get_view(initial.run_id)).toEqual(before);expect(await game.get_actor_view(initial.run_id,'R')).toEqual(local);
    await advance(910000);expect(current().artifact_reports.map(r=>r.report.artifact!.site)).toEqual(['A']);expect(view.finished).toBe(false);
  }finally{await store.delete();}
});
