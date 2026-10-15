import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft,mission_variant} from './mission-fixtures';
import {valid_response} from '../src/dto';

test.each([
  ['held',0,2000,'accepted',1,20,15],
  ['hold',1500,7000,'not_started',2,20,14],
  ['moving',2000,31500,'arrived',2,19,14],
  ['report_inflight',30500,31500,'arrived',2,19,14]
] as const)('B22 command recovery at %s preserves every execution ledger until explicit continue',async(kind,at,to,status,reports,movement,link)=>{
  const value=await mission_variant(v=>{if(kind==='hold')v.catalogs.local_initial_evidence={id:'R-recovery-unknown',scope_ref:'pending-location',observed:{kind:'unknown'},source_event_time:{kind:'unknown'},max_age_ms:900000,valid_until_time_ms:900000};}),store=new Persistence('b22-owned-t03-recovery-'+kind,[],[value]);
  try{
    const game=new Game(store),initial=await game.create_run(value,'command','create'),draft=mission_draft(initial.run_id),ref=<K extends string>(type:K,id:string)=>({run_id:initial.run_id,kind:type,id,version:1});
    if(kind==='hold')draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'save',expected_revision:initial.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}}),issued=await game.issue_order({run_id:initial.run_id,operation_id:'issue',expected_revision:saved.view.revision,intent:{kind:'issue_mission',expected_object_revision:1,plan_ref:ref('plan','plan-M1'),phase_ref:ref('phase','P1'),grant_ref:ref('authority','B22-STATIC-GRANT'),preview:await game.preview_plan(initial.run_id,saved.view.revision,0,draft),evidence_refs:draft.evidence_refs}});
    if(at>0)await game.tick(initial.run_id,at,'checkpoint');
    const before=await store.read_committed(initial.run_id);if(before?.schema!==8)throw Error('Expected mission state');
    if(kind==='moving')expect(before.world.position).toEqual({x:{n:'3150',d:'59'},y:{n:'150',d:'1'}});
    if(kind==='report_inflight')expect(await game.get_view(initial.run_id)).toMatchObject({issued_orders:[{status:'accepted'}],reports:[{kind:'accepted'}],phase_results:[]});
    const fresh=new Game(store),restored=await fresh.restore(initial.run_id,'restore-'+kind),after=await store.read_committed(initial.run_id);
    expect(restored.view).toMatchObject({run_id:initial.run_id,sim_time:at,paused:true});
    for(const key of ['sim_time','mode','rate','run_id','source_run','rng','generation','origin_generation','phase','actual_mission_status','world','local','attempts','executions','reports','sent_reports','pending_reports','transmissions','deliveries','outbound_messages','held_windows','mission','plans','known'] as const)expect(Reflect.get(after!,key)).toEqual(Reflect.get(before,key));
    await expect(fresh.tick(initial.run_id,at+1,'paused-tick')).rejects.toThrow('CLOCK_PAUSED');expect(await fresh.get_view(initial.run_id)).toEqual(restored.view);expect(await fresh.get_receipt(initial.run_id,'paused-tick')).toBeNull();
    const continued=await fresh.control_clock({run_id:initial.run_id,operation_id:'explicit-continue',expected_revision:restored.view.revision,intent:{kind:'continue'}});expect(continued.view).toMatchObject({sim_time:at,paused:false});
    const result=await fresh.tick(initial.run_id,to,'resume-tick'),settled=await store.read_committed(initial.run_id);
    expect(result.view).toMatchObject({issued_orders:[{status}],resources:{movement_energy:movement,equipment_energy:link,hq_energy:15}});expect(Reflect.get(result.view,'reports')).toHaveLength(reports);expect(valid_response({request_id:'recover-'+kind,ok:true,...result})).toBe(true);
    const duplicate=await fresh.tick(initial.run_id,to,'resume-tick');expect(duplicate.receipt).toEqual(result.receipt);expect(await store.read_committed(initial.run_id)).toEqual(settled);
    if(kind==='report_inflight')expect(Reflect.get(settled!,'world')).toEqual(before.world);
    expect(issued.view.run_id).toBe(initial.run_id);
  }finally{await store.delete();}
});

test('B22 a retained private-arrival node never acquires the later HQ arrival Delivery',async()=>{
  const store=new Persistence('b22-owned-t03-history-receipt');
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create'),draft=mission_draft(initial.run_id),ref=<K extends string>(kind:K,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'save',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}}),issued=await game.issue_order({run_id:initial.run_id,operation_id:'issue',expected_revision:saved.view.revision,intent:{kind:'issue_mission',expected_object_revision:1,plan_ref:ref('plan','plan-M1'),phase_ref:ref('phase','P1'),grant_ref:ref('authority','B22-STATIC-GRANT'),preview:await game.preview_plan(initial.run_id,saved.view.revision,0,draft),evidence_refs:draft.evidence_refs}});
    const arrived=await game.control_clock({run_id:initial.run_id,operation_id:'private-arrival',expected_revision:issued.view.revision,intent:{kind:'advance',to:30500}}),current=await game.control_clock({run_id:initial.run_id,operation_id:'public-delivery',expected_revision:arrived.view.revision,intent:{kind:'advance',to:31500}});
    const history=await game.get_replay(initial.run_id,30500,arrived.view.revision),view=await history.get_view(initial.run_id);expect(view).toEqual({...arrived.view,next_action:'历史记录只能查看，请返回当前行动后安排任务'});expect(view).toMatchObject({issued_orders:[{status:'accepted'}],reports:[{kind:'accepted'}],phase_results:[]});
    await expect(history.control_clock({run_id:initial.run_id,operation_id:'forbidden',expected_revision:view.revision,intent:{kind:'advance',to:31000}})).rejects.toThrow('HISTORY_READ_ONLY');expect(await game.get_view(initial.run_id)).toEqual(current.view);
  }finally{await store.delete();}
});
