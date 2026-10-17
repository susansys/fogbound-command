import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,playCorridorDefinition} from '../src/core/scenario';
import mission from '../src/core/mission-definition.json';
import {intelligence_definition} from './intelligence-fixtures';
import {state_hash,validate_state} from '../src/core/snapshot';
import {valid_response} from '../src/dto';

test('B23 E36 activity requests reject array reference kinds without a receipt or state change',async()=>{
  const store=new Persistence('b23-owned-t04-request-enum');
  try{
    const game=new Game(store),view=await game.create_run(await intelligence_definition(),'research','create'),before=await store.read_committed(view.run_id);
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    for(const key of ['actor_ref','activity_ref','authority_ref'] as const){
      const request={run_id:view.run_id,operation_id:'bad-'+key,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}};
      Reflect.set(request.intent[key],'kind',[request.intent[key].kind]);
      await expect(game.issue_activity(request)).rejects.toThrow('INVALID_REQUEST');
      expect(await store.read_committed(view.run_id)).toEqual(before);expect(await store.receipt(view.run_id,request.operation_id)).toBeUndefined();
    }
  }finally{await store.delete();}
});

test('B23 E36 cold schema9 validation refuses a self-hashed array mode without coercion',async()=>{
  const store=new Persistence('b23-owned-t04-mode-enum');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create'),original=await store.read_committed(initial.run_id);
    for(const mode of [['research'],['command']]){
      const damaged=structuredClone(original);if(!damaged||damaged.schema!==9)throw Error('Owned schema9 missing');
      Reflect.set(damaged,'mode',mode);damaged.paused=false;damaged.integrity=await state_hash(damaged);
      await expect(validate_state(damaged)).rejects.toThrow('INVALID_SAVE');
    }
    expect(await store.read_committed(initial.run_id)).toEqual(original);
  }finally{await store.delete();}
});

test('B23 E36 the response boundary rejects coerced mode and rate while retaining legal enum values',async()=>{
  const store=new Persistence('b23-owned-t04-dto-enum');
  try{
    const view=await new Game(store).create_run(await intelligence_definition(),'research','create');
    for(const mode of ['research','command'])for(const rate of [1,2,4])expect(valid_response({request_id:'enum',ok:true,view:{...view,mode,rate}})).toBe(true);
    for(const [key,value] of [['mode',['research']],['mode',['command']],['rate','1'],['rate',[1]],['rate',true]]){
      const damaged=structuredClone(view);Reflect.set(damaged,key as string,value);
      expect(valid_response({request_id:'enum',ok:true,view:damaged})).toBe(false);
    }
  }finally{await store.delete();}
});

test.each([engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,playCorridorDefinition,mission])('B23 E36 keeps legacy schema$schema identities and recovery branches beside a new intelligence run',async definition=>{
  const store=new Persistence('b23-owned-t04-legacy-'+definition.schema);
  try{
    const game=new Game(store),old=await game.create_run(definition,'research','legacy'),saved=await game.save({run_id:old.run_id,operation_id:'legacy-save',expected_revision:1,intent:{kind:'save'}}),original=await store.read_committed(old.run_id);
    const created=await game.create_run(await intelligence_definition(),'research','new-intelligence');expect(created).toMatchObject({scenario_kind:'play_intelligence',sim_time:0,public_rules:{deadline:900000,receipt_grace:10000}});expect(created.run_id).not.toBe(old.run_id);
    expect(await store.read_committed(old.run_id)).toEqual(original);expect(await game.get_view(old.run_id)).toEqual(saved.view);
    const fresh=new Game(store),restored=await fresh.restore(old.run_id,'legacy-restore');expect(restored.view.run_id).toBe(old.run_id);expect(restored.view.scenario_kind).toBe(saved.view.scenario_kind);expect(restored.view.paused).toBe(true);
    const recovered=await store.read_committed(old.run_id);expect(recovered).toMatchObject({schema:definition.schema,definition_hash:definition.definition_hash,hashes:definition.hashes});expect(await fresh.get_view(created.run_id)).toEqual(created);
  }finally{await store.delete();}
});

test.each(['schema','definition','profile_hash','invented_handover','invented_energy','input_clock'] as const)('B23 E36 refuses and retains a self-hashed owned %s corruption rather than trusting its digest',async kind=>{
  const store=new Persistence('b23-owned-t04-invalid-'+kind);
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create'),ref=(type:string,id:string)=>({run_id:initial.run_id,kind:type,id,version:1});let revision=1;
    const issue=async(id:string)=>{revision=(await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view.revision;},advance=async(to:number)=>{revision=(await game.control_clock({run_id:initial.run_id,operation_id:'at-'+to,expected_revision:revision,intent:{kind:'advance',to}})).view.revision;};
    await issue('R-to-A');await advance(32000);await issue('A-record');await advance(79000);
    const damaged=await store.read_committed(initial.run_id);if(!damaged||damaged.schema!==9)throw Error('Owned schema9 missing');
    if(kind==='schema')Reflect.set(damaged,'schema',99);if(kind==='definition')damaged.definition_hash='0'.repeat(64);if(kind==='profile_hash')damaged.hashes.profile='0'.repeat(64);
    if(kind==='invented_handover')damaged.field.artifacts[0].custody_holder='HQ';if(kind==='invented_energy')damaged.field.actors[0].resources.record_energy=20;if(kind==='input_clock')damaged.inputs.at(-1)!.clock_to=79000;
    damaged.integrity=await state_hash(damaged);
    await new Promise<void>((resolve,reject)=>{const open=indexedDB.open(store.name);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['runs','snapshots'],'readwrite');tx.objectStore('runs').put(damaged);tx.objectStore('snapshots').put({key:damaged.run_id+':'+damaged.revision,run_id:damaged.run_id,state:damaged});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};});
    await expect(new Game(store).restore(initial.run_id,'refused')).rejects.toThrow('INVALID_SAVE');expect(await store.read_committed(initial.run_id)).toEqual(damaged);expect(await store.receipt(initial.run_id,'refused')).toBeUndefined();
  }finally{await store.delete();}
});
