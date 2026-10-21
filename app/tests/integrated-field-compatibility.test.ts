import {expect,test,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,playCorridorDefinition} from '../src/core/scenario';
import mission from '../src/core/mission-definition.json';
import intelligence from '../src/core/intelligence-definition.json';
import outcome from '../src/core/outcome-definition.json';
import source from '../src/core/source-time-definition.json';
import conflicting from '../src/core/conflicting-action-definition.json';
import {valid_response} from '../src/dto';
import {valid_request} from '../src/protocol';
import type {IntegratedFieldEnvelope,IntegratedFieldPlayerView} from '../src/integrated-field-contracts';
const selector={schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}};

test('NB3-AT013 metre and process units remain the same through public DTO and saved execution',async()=>{
 const store=new Persistence('b33-owned-compat-units-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(selector,'research',crypto.randomUUID()) as IntegratedFieldPlayerView;
  const apply=async(intent:IntegratedFieldEnvelope['intent'])=>{view=(await game.apply_integrated_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent})).view as IntegratedFieldPlayerView;};
  expect(view.geometry).toMatchObject({unit:'m',metres_per_coordinate:1,extent:[400,300],segments:[{id:'HA',length_m:100},{id:'AB',length_m:100}]});
  const catalog=structuredClone(view.model_catalog),model_ref=catalog.model_ref;
  await apply({kind:'integrated_move',actor:'R',target:'A',model_ref});await apply({kind:'advance',to:102000});
  await apply({kind:'integrated_activity',actor:'R',action:'read',target:'A',model_ref,basis_refs:[{run_id:view.run_id,id:view.actors.find(actor=>actor.id==='R')!.position.evidence,version:1},{run_id:view.run_id,id:'opening-A-access',version:1}]});await apply({kind:'advance',to:147750});
  expect(view.model_catalog).toEqual(catalog);expect(valid_response({request_id:'compat-units',ok:true,view})).toBe(true);
  expect(view.artifacts[0]).toMatchObject({logical_size_bytes:1000000000,observed_at:146750,received_at:147750});
  const before=await store.read_committed(view.run_id);if(before?.schema!==13)throw Error('Expected new model');
  expect(before.work.portable_energy_uJ.R).toBe(645500000);expect(before.work.fixed_source_energy_uJ.A).toBe(218750000);expect(before.work.storage_free_bytes.R).toBe(15000000000);
  await game.save({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'save'}});
  const restored=await new Game(store).restore(view.run_id,crypto.randomUUID());expect(restored.view).toMatchObject({model_catalog:catalog,geometry:view.geometry,artifacts:view.artifacts,sim_time:147750,paused:true});
  expect((await store.read_committed(view.run_id))?.schema).toBe(13);
 }finally{await store.delete();}
});

test.each([engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,playCorridorDefinition,mission,intelligence,outcome,source,conflicting])('NB3-AT014 schema$schema keeps its own identity and restore semantics beside the new model',async definition=>{
 const store=new Persistence('b33-owned-compat-old-'+definition.schema+'-'+crypto.randomUUID()),game=new Game(store);
 try{
  const old=await game.create_run(definition,'research',crypto.randomUUID());
  await game.save({run_id:old.run_id,operation_id:crypto.randomUUID(),expected_revision:old.revision,intent:{kind:'save'}});
  const original=await store.read_committed(old.run_id),newView=await game.create_run(selector,'research',crypto.randomUUID());
  expect(await store.read_committed(old.run_id)).toEqual(original);expect(newView.run_id).not.toBe(old.run_id);
  const restored=await new Game(store).restore(old.run_id,crypto.randomUUID());
  expect(restored.view).toMatchObject({run_id:old.run_id,sim_time:0,paused:true});expect(Object.hasOwn(restored.view,'model_catalog')).toBe(false);
  expect(await store.read_committed(old.run_id)).toMatchObject({schema:definition.schema,contract:definition.contract,definition_hash:definition.definition_hash,hashes:definition.hashes});
 }finally{await store.delete();}
});

test('NB3-AT015 page clock requests stay forbidden and command mode cannot use research advance',async()=>{
 const store=new Persistence('b33-owned-compat-clock-'+crypto.randomUUID()),game=new Game(store);
 try{
  const view=await game.create_run(selector,'command',crypto.randomUUID()),envelope={run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance' as const,to:1000}};
  await expect(game.apply_integrated_intent(envelope)).rejects.toThrow('MODE_LOCKED');
  expect(valid_request({kind:'operate_integrated_field',request_id:'page-tick',envelope:{...envelope,intent:{kind:'tick',to:1000}}})).toBe(false);
  expect(valid_request({kind:'tick',request_id:'direct-tick',run_id:view.run_id,to:1000})).toBe(false);
  const original=await store.read_committed(view.run_id);vi.spyOn(Date,'now').mockReturnValue(9999999999999);
  expect(await game.get_view(view.run_id)).toEqual(view);expect(await store.read_committed(view.run_id)).toEqual(original);
 }finally{vi.restoreAllMocks();await store.delete();}
});

test('NB3-AT016 pause, cold restore and duplicate operation preserve the work slot and spent energy',async()=>{
 const store=new Persistence('b33-owned-compat-pause-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(selector,'command',crypto.randomUUID()) as IntegratedFieldPlayerView;
  const envelope:IntegratedFieldEnvelope={run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'integrated_activity',actor:'W',action:'inspect',target:'B',plan_ref:{run_id:view.run_id,id:'B33-PLAN-1',version:1},model_ref:view.model_catalog.model_ref,basis_refs:[]}};
  const original=await game.apply_integrated_intent(envelope);view=(await game.tick(view.run_id,10000,crypto.randomUUID())).view as IntegratedFieldPlayerView;
  view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'pause',reason:'manual'}})).view as IntegratedFieldPlayerView;
  const paused=await store.read_committed(view.run_id);if(paused?.schema!==13)throw Error('Expected new state');
  // 1000ms idle at 0.5W, then 9000ms inspection at the registered 2W.
  expect(paused.work.activities[0]).toMatchObject({phase:'inspect',phase_ends_at:31000});expect(paused.work.portable_energy_uJ.W).toBe(18500000);
  vi.spyOn(Date,'now').mockReturnValue(9999999999999);const fresh=new Game(store),restored=await fresh.restore(view.run_id,crypto.randomUUID());
  expect(restored.view).toMatchObject({sim_time:10000,paused:true});const after=await store.read_committed(view.run_id);if(after?.schema!==13)throw Error('Expected restored state');expect(after.work).toEqual(paused.work);
  const duplicate=await fresh.apply_integrated_intent(envelope);expect(duplicate.receipt).toEqual(original.receipt);expect(await store.read_committed(view.run_id)).toEqual(after);
  await expect(fresh.tick(view.run_id,10001,crypto.randomUUID())).rejects.toThrow('CLOCK_PAUSED');
 }finally{vi.restoreAllMocks();await store.delete();}
});
