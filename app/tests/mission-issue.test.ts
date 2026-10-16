import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft,mission_variant} from './mission-fixtures';
import type {MissionDefinition} from '../src/core/mission-definition';
import type {MissionDraft,IssueMissionEnvelope} from '../src/mission-contracts';

async function prepared(store:Persistence,value:MissionDefinition|typeof definition=definition,change?:(draft:MissionDraft)=>void){
  const game=new Game(store),initial=await game.create_run(value,'research','create'),draft=mission_draft(initial.run_id);change?.(draft);
  const saved=await game.save_plan({run_id:initial.run_id,operation_id:'save',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
  const preview=await game.preview_plan(initial.run_id,saved.view.revision,0,draft),ref=<K extends string>(kind:K,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const input:IssueMissionEnvelope={run_id:initial.run_id,operation_id:'issue',expected_revision:saved.view.revision,intent:{kind:'issue_mission',expected_object_revision:1,plan_ref:ref('plan','plan-M1'),phase_ref:ref('phase','P1'),grant_ref:ref('authority','B22-STATIC-GRANT'),preview,evidence_refs:[...draft.evidence_refs]}};
  return {game,view:saved.view,input,draft};
}

test.each(['area','radius'] as const)('B22 PG16 a fully contained %s is still not a unique exact movement start',async kind=>{
  const variant=await mission_variant(value=>{
    if(kind==='area')value.catalogs.initial_evidence.scope_ref='HA-area';
    else{
      value.catalogs.map.scopes.push({...value.catalogs.map.scopes.find(s=>s.id==='H')!,id:'uncertain-start',kind:'point',typed_geometry:{position:[100,150]},uncertainty:{kind:'known',value:3,unit:'fictional_metre',evidence:'B22-INITIAL-POSITION'}});
      value.catalogs.initial_evidence.scope_ref='uncertain-start';
    }
  }),store=new Persistence('b22-owned-t02-not-exact-'+kind,[],[variant]);
  try{
    const {game,view,input}=await prepared(store,variant,draft=>{draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'in',typed_value:'HA-area'};});
    expect(input.intent.preview.phases[0].gate.result).toBe('T');await expect(game.issue_order(input)).rejects.toThrow('EVIDENCE_REQUIRED');expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test.each(['unreceived','nonactor','cross_run'] as const)('B22 PG17 actual registered %s proof cannot be supplied to the current issue',async kind=>{
  const variant=await mission_variant(value=>{value.catalogs.position_reports=[{id:'registered-proof',origin:kind==='nonactor'?'Q':'R',target:'HQ',scope_ref:'H',observed:{kind:'known',value:0,evidence:'registered-proof'},source_event_time:{kind:'unknown'},reported_at:0,delivery_at:1000}];}),store=new Persistence('b22-owned-t02-owned-proof-'+kind,[],[variant]);
  try{
    const {game,view,input}=await prepared(store,variant,draft=>{draft.phases[0].latest_finish_time_ms=100000;});
    let current=await game.get_view(view.run_id);
    if(kind==='nonactor')current=(await game.control_clock({run_id:view.run_id,operation_id:'deliver',expected_revision:current.revision,intent:{kind:'advance',to:1000}})).view;
    input.expected_revision=current.revision;input.intent.preview=await game.preview_plan(view.run_id,current.revision,1,view.plans[0].draft);
    if(kind==='cross_run'){
      const other=await game.create_run(variant,'research','other-create');input.intent.phase_ref.run_id=other.run_id;
    }else input.intent.evidence_refs=['registered-proof'];
    await expect(game.issue_order(input)).rejects.toThrow(kind==='cross_run'?'INVALID_REQUEST':'EVIDENCE_REQUIRED');
    expect(await game.get_view(view.run_id)).toEqual(current);expect(await game.get_receipt(view.run_id,'issue')).toBeNull();
  }finally{await store.delete();}
});

test('B22 PG17 private actor origin alternatives never change the same lawful HQ facts or preview',async()=>{
  const stores:Persistence[]=[],results:Array<{view:unknown;phases:unknown;error:string}>=[];
  try{
    for(const origin of ['H','A']){
      const variant=await mission_variant(value=>{value.catalogs.actor.origin=origin;}),store=new Persistence('b22-owned-t02-private-'+origin,[],[variant]);stores.push(store);
      const game=new Game(store),view=await game.create_run(variant,'research','create'),draft=mission_draft(view.run_id),preview=await game.preview_plan(view.run_id,view.revision,0,draft);
      const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value).replaceAll(view.run_id,'SAME-HQ-RUN'));
      draft.evidence_refs=['unknown-proof'];let error='';try{await game.preview_plan(view.run_id,view.revision,1,draft);}catch(e){error=e instanceof Error?e.message:String(e);}
      results.push({view:normalize(await game.get_view(view.run_id)),phases:normalize(preview.phases),error});
    }
    expect(results[1]).toEqual(results[0]);expect(results[0].error).toBe('EVIDENCE_REQUIRED');
  }finally{for(const store of stores)await store.delete();}
});

test('B22 issue transaction abort leaves no partial order, held window, outbound message or charge',async()=>{
  const store=new Persistence('b22-owned-t02-abort'),native=IDBObjectStore.prototype.put;
  try{
    const {game,view,input}=await prepared(store);
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const request=native.apply(this,args);if(this.transaction.db.name===store.name&&this.name==='runs')request.addEventListener('success',()=>this.transaction.abort(),{once:true});return request;};
    await expect(game.issue_order(input)).rejects.toThrow('STORAGE_UNCONFIRMED');IDBObjectStore.prototype.put=native;
    expect(await game.get_view(view.run_id)).toEqual(view);expect(await game.get_receipt(view.run_id,'issue')).toBeNull();
    const fresh=new Game(store),restored=await fresh.restore(view.run_id,'restore');
    if(restored.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    input.expected_revision=restored.view.revision;input.intent.preview=await fresh.preview_plan(view.run_id,restored.view.revision,1,view.plans[0].draft);
    const result=await fresh.issue_order(input);expect(result.view.issued_orders).toHaveLength(1);expect(result.view.resources.hq_energy).toBe(15);
  }finally{IDBObjectStore.prototype.put=native;await store.delete();}
});

test.each([[4999,'ready',true],[5000,'preparing',false],[5001,'preparing',false]] as const)('B22 PG15 saving and restoring at %i retains the old evaluation but current readiness is %s',async(at,status,can_issue)=>{
  const variant=await mission_variant(value=>{value.profile.parameters.position_max_age_ms=5000;value.profile.parameters.evidence_valid_until=9000;value.catalogs.initial_evidence.max_age_ms=5000;value.catalogs.initial_evidence.valid_until_time_ms=9000;}),store=new Persistence('b22-owned-t02-ready-restore-'+at,[],[variant]);
  try{
    const {game,view}=await prepared(store,variant,draft=>{draft.phases[0].earliest_start_time_ms=10000;draft.phases[0].latest_finish_time_ms=100000;draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};});
    expect(view).toMatchObject({status:'ready',can_issue:true});
    const advanced=await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:at}});
    expect(advanced.view).toMatchObject({status,can_issue});
    const fresh=new Game(store),restored=await fresh.restore(view.run_id,'restore');
    if(restored.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    expect(restored.view).toMatchObject({run_id:view.run_id,sim_time:at,paused:true,status,can_issue,plans:view.plans});
    expect(restored.view.plans[0].preview.phases[0].gate).toMatchObject({evaluated_at_time_ms:0,result:'T',expires_at_time_ms:{kind:'known',value:5000}});
    const preview=await fresh.preview_plan(view.run_id,restored.view.revision,0,view.plans[0].draft);
    expect(preview.phases[0].gate.result).toBe(at===4999?'T':'U');
  }finally{await store.delete();}
});

test('B22 PG17 a future initial observation is rejected before the first persisted run',async()=>{
  const variant=await mission_variant(value=>{value.catalogs.initial_evidence.observed={kind:'known',value:1,evidence:'B22-INITIAL-POSITION'};}),store=new Persistence('b22-owned-t02-future-start',[],[variant]);
  try{
    await expect(new Game(store).create_run(variant,'research','create')).rejects.toThrow('INVALID_DEFINITION');expect(await store.list_runs()).toEqual([]);
  }finally{await store.delete();}
});

test.each(['mission','actor','action','space','time','risk'] as const)('B22 PG11 issue independently rejects the uncovered %s dimension without effects',async dimension=>{
  const variant=await mission_variant(value=>{
    const grant=value.catalogs.authority;
    if(dimension==='mission')grant.mission_scope=['M2'];
    if(dimension==='actor')grant.actors=['Q'];
    if(dimension==='action')grant.action_kinds=['record'];
    if(dimension==='space')grant.spatial_scope=['AB'];
    if(dimension==='time')grant.valid_from_time_ms=1;
    if(dimension==='risk')grant.risk_limits=['other_risk'];
  }),store=new Persistence('b22-owned-t02-issue-denied-'+dimension,[],[variant]);
  try{
    const {game,view,input}=await prepared(store,variant);
    expect(input.intent.preview.phases[0].authorization.dimensions[dimension]).toBe(false);
    await expect(game.issue_order(input)).rejects.toThrow('AUTHORITY_DENIED');
    expect(await game.get_view(view.run_id)).toEqual(view);expect(await game.get_receipt(view.run_id,'issue')).toBeNull();
  }finally{await store.delete();}
});

test.each(['root_context','intent_context'] as const)('B22 PG13 forged commander at %s is refused at the session seam',async kind=>{
  const store=new Persistence('b22-owned-t02-forged-'+kind);
  try{
    const {game,view,input}=await prepared(store);
    Reflect.set(kind==='root_context'?input:input.intent,'actor_context','commander');
    await expect(game.issue_order(input)).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(view.run_id)).toEqual(view);expect(await game.get_receipt(view.run_id,'issue')).toBeNull();
  }finally{await store.delete();}
});

test.each([['known_false','CONSTRAINT_DENIED'],['unknown','CONSTRAINT_HOLD']] as const)('B22 hard entry %s cannot issue or charge resources',async(kind,code)=>{
  const variant=await mission_variant(value=>{if(kind==='unknown')value.catalogs.initial_evidence.observed={kind:'unknown'};}),store=new Persistence('b22-owned-t02-entry-'+kind,[],[variant]);
  try{
    const {game,view,input}=await prepared(store,variant,draft=>{draft.phases[0].entry_gate=kind==='known_false'?{kind:'compare',field_ref:'capability.ready',operator:'ne',typed_value:true}:{kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};});
    await expect(game.issue_order(input)).rejects.toThrow(code);expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B22 PG18 an old preview cannot be forced into a current write revision',async()=>{
  const store=new Persistence('b22-owned-t02-stale-preview');
  try{
    const {game,view,input}=await prepared(store);
    const advanced=await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:10}});
    input.expected_revision=advanced.view.revision;
    await expect(game.issue_order(input)).rejects.toThrow('STALE_REVISION');
    expect(await game.get_view(view.run_id)).toEqual(advanced.view);expect(await game.get_receipt(view.run_id,'issue')).toBeNull();
  }finally{await store.delete();}
});

test.each(['excess_load','excess_space','no_movement_energy'] as const)('B22 PG12 known hard constraint %s is not overridden by an accepted risk label',async kind=>{
  const variant=await mission_variant(value=>{
    if(kind==='excess_load')value.catalogs.actor.load=21;
    if(kind==='excess_space')value.catalogs.actor.space=13;
    if(kind==='no_movement_energy')value.profile.parameters.movement_energy=0;
  }),store=new Persistence('b22-owned-t02-hard-'+kind,[],[variant]);
  try{
    const {game,view,input}=await prepared(store,variant,draft=>{draft.phases[0].latest_finish_time_ms=100000;});
    await expect(game.issue_order(input)).rejects.toThrow('CONSTRAINT_DENIED');
    expect(await game.get_view(view.run_id)).toEqual(view);expect(await game.get_receipt(view.run_id,'issue')).toBeNull();
  }finally{await store.delete();}
});

test('B22 PG10 explicitly issuing a saved phase freezes its existing grant, held window and one real outbound message',async()=>{
  const store=new Persistence('b22-owned-t02-issue-normal');
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create'),draft=mission_draft(initial.run_id);
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'save-plan',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    const preview=await game.preview_plan(initial.run_id,saved.view.revision,0,draft),ref=<K extends string>(kind:K,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const input={run_id:initial.run_id,operation_id:'issue',expected_revision:saved.view.revision,intent:{kind:'issue_mission' as const,expected_object_revision:1,plan_ref:ref('plan','plan-M1'),phase_ref:ref('phase','P1'),grant_ref:ref('authority','B22-STATIC-GRANT'),preview,evidence_refs:['B22-INITIAL-POSITION']}};
    const issued=await game.issue_order(input);
    expect(issued.receipt).toMatchObject({result:'committed',kind:'issue_mission',revision:3,sim_time:0});
    expect(issued.view.resources).toMatchObject({movement_energy:20,movement_energy_reserved:0,equipment_energy:16,equipment_wear:100,hq_energy:15,hq_wear:99});
    expect(issued.view.issued_orders).toHaveLength(1);
    expect(issued.view.issued_orders[0]).toMatchObject({origin:'staff',phase_ref:ref('phase','P1'),plan_ref:ref('plan','plan-M1'),grant_ref:ref('authority','B22-STATIC-GRANT'),supersedes_id:null,issued:0,sent:0,message_ref:expect.any(String)});
    expect(issued.view.held_windows).toEqual([{order_ref:issued.view.issued_orders[0].id,capability_ref:'R:move',concurrency_group:'R:execution',from:1000,to:31000,amount:1,status:'held'}]);
    const again=await game.issue_order(input);
    expect(again.receipt).toEqual(issued.receipt);expect(again.view).toEqual(issued.view);
    expect((await new Game(store).restore(initial.run_id,'restore')).view).toMatchObject({paused:true,issued_orders:issued.view.issued_orders,held_windows:issued.view.held_windows,resources:issued.view.resources});
  }finally{await store.delete();}
});
