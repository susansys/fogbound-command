import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,playCorridorDefinition} from '../src/core/scenario';
import mission from '../src/core/mission-definition.json';
import {intelligence_definition} from './intelligence-fixtures';
import {state_hash} from '../src/core/snapshot';

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
