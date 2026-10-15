import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft} from './mission-fixtures';
import {valid_response} from '../src/dto';

test.each(['missing_delivery','wrong_phase_version','wrong_plan_version','wrong_order','accepted_confirmation','future_reported','duplicate_delivery','unreceived_original','wrong_result_version','wrong_arrival_point','wrong_route_version','premature_goal'] as const)('B22 report contract rejects %s without manufacturing a Game execution',async(kind)=>{
  const store=new Persistence('b22-owned-t03-report-contract-'+kind);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create'),draft=mission_draft(initial.run_id),ref=<K extends string>(type:K,id:string)=>({run_id:initial.run_id,kind:type,id,version:1});
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'save',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}}),issued=await game.issue_order({run_id:initial.run_id,operation_id:'issue',expected_revision:saved.view.revision,intent:{kind:'issue_mission',expected_object_revision:1,plan_ref:ref('plan','plan-M1'),phase_ref:ref('phase','P1'),grant_ref:ref('authority','B22-STATIC-GRANT'),preview:await game.preview_plan(initial.run_id,saved.view.revision,0,draft),evidence_refs:draft.evidence_refs}}),result=await game.control_clock({run_id:initial.run_id,operation_id:'arrival',expected_revision:issued.view.revision,intent:{kind:'advance',to:31500}});
    if(result.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    const response={request_id:'reported',ok:true as const,receipt:result.receipt,view:structuredClone(result.view)};expect(valid_response(response)).toBe(true);
    const before=await store.read_committed(initial.run_id),arrival=response.view.reports.find(r=>r.kind==='arrived')!;
    if(kind==='missing_delivery')response.view.deliveries=response.view.deliveries.filter(d=>d.report_ref!==arrival.id);
    if(kind==='wrong_phase_version')arrival.phase_ref.version=999;
    if(kind==='wrong_plan_version')arrival.plan_ref.version=999;
    if(kind==='wrong_order')arrival.order_ref='different-order';
    if(kind==='accepted_confirmation'){const accepted=response.view.reports.find(r=>r.kind==='accepted')!;response.view.phase_results[0].known_report_delivery_refs=[accepted.id,response.view.deliveries.find(d=>d.report_ref===accepted.id)!.id];}
    if(kind==='future_reported')arrival.reported=response.view.sim_time+1;
    if(kind==='duplicate_delivery')response.view.deliveries.push(structuredClone(response.view.deliveries[0]));
    if(kind==='unreceived_original')response.view.reports.push({...structuredClone(arrival),id:'not-delivered-original'});
    if(kind==='wrong_result_version')response.view.phase_results[0].phase_ref.version=999;
    if(kind==='wrong_arrival_point'&&arrival.position_scope?.kind==='point')arrival.position_scope.typed_geometry.position=[50,150];
    if(kind==='wrong_route_version')response.view.plans[0].draft.phases[0].activity.route_ref.version=999;
    if(kind==='premature_goal'){response.view.status='completed';response.view.mission!.status='completed';response.view.can_issue=false;response.view.gap='移动目标已确认';}
    expect(valid_response(response)).toBe(false);expect(await store.read_committed(initial.run_id)).toEqual(before);
  }finally{await store.delete();}
});
