import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition} from './intelligence-fixtures';
import {intelligence_player_view} from '../src/intelligence-dto';
import {project_intelligence_view} from '../src/core/intelligence-knowledge';

test('B23 E26 equipment planning rejects17load13space without allocation;16load12space saves but one repair pack is insufficient',async()=>{
  const store=new Persistence('b23-owned-t03-loadout');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const draft=(repair_packs:number)=>({purpose:'校对装备容量',repair_packs:2,loadout:{actor_ref:{run_id:initial.run_id,kind:'actor',id:'R',version:1},equipment:['REC','LINK','WORK'],record_packs:2,repair_packs}});
    await expect(game.save_plan({run_id:initial.run_id,operation_id:'over-capacity',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:draft(2)}})).rejects.toThrow('CAPACITY_CONFLICT');
    expect(await game.get_view(initial.run_id)).toEqual(initial);expect(await game.get_receipt(initial.run_id,'over-capacity')).toBeNull();
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'capacity-valid',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:draft(1)}});
    expect(saved.view).toMatchObject({plan:{loadout:{load:16,space:12,record_packs:2,repair_packs:1,repair_supplies_met:false}},processing:{energy_reserved:0,queue:[]},supply_commitments:[]});
    expect(intelligence_player_view(saved.view)).toBe(true);
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({load:9,space:7,resources:{record_energy:20,record_packs:2,repair_packs:0}});
    expect(await new Game(store).get_view(initial.run_id)).toEqual(saved.view);
  }finally{await store.delete();}
});

test('B23 E28 the Knowledge public projection ignores private balances, artifacts and pending terminal report content before Delivery',async()=>{
  const store=new Persistence('b23-owned-t03-private-artifact-pair');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});let revision=1;
    const issue=async(id:string)=>{const r=await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});revision=r.view.revision;};
    const advance=async(to:number)=>{const r=await game.control_clock({run_id:initial.run_id,operation_id:'at-'+to,expected_revision:revision,intent:{kind:'advance',to}});revision=r.view.revision;return r.view;};
    await issue('R-to-A');await advance(32000);await issue('A-record');const before=await advance(78000);
    // Read only our owned synthetic committed state to construct this pure
    // Knowledge seam fixture. Neither variant is written or accepted by Game.
    const original=await store.read_committed(initial.run_id);if(original?.schema!==9)throw Error('Expected owned intelligence fixture');
    const variant=structuredClone(original);variant.field.actors[0].resources.record_energy=1;variant.field.actors[0].resources.record_packs=0;variant.field.artifacts=[];
    const pending=variant.field.reports.find(r=>r.artifact!==null)!;pending.artifact=null;pending.confirmation.resources.record_energy=1;pending.confirmation.resources.record_packs=0;
    expect(project_intelligence_view(variant)).toEqual(project_intelligence_view(original));
    expect(project_intelligence_view(variant)).toEqual(before);expect(before).toMatchObject({artifact_reports:[],actors:[{equipment_energy:20,packs:2},{}]});
    const received=await advance(79000);expect(Reflect.get(received,'artifact_reports')).toHaveLength(1);expect(intelligence_player_view(received)).toBe(true);
  }finally{await store.delete();}
});
