import {test,expect} from 'vitest';
import {Game} from '../src/core/game';import {Persistence} from '../src/core/persistence';
import {valid_response} from '../src/dto';import type {IntegratedFieldEnvelope,IntegratedFieldPlayerView} from '../src/integrated-field-contracts';
const selector={schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}};
type Registered={object_ref:{run_id:string;kind:string;id:string;version:number};scope_ref:{run_id:string;kind:string;id:string;version:number};configuration_ref:unknown;properties:string[]};
function objects(view:IntegratedFieldPlayerView):Registered[]{const entries=Reflect.get(view.model_catalog,'objects');expect(Array.isArray(entries)).toBe(true);return entries;}
async function fixture(){const store=new Persistence('b33-owned-object-'+crypto.randomUUID()),game=new Game(store),view=await game.create_run(selector,'research',crypto.randomUUID()) as IntegratedFieldPlayerView;return{store,game,view};}

test('NB3-AT017 registered HQ targets, local activity objects and report subjects retain separate roles',async()=>{
 const f=await fixture();try{
  const catalog=objects(f.view),byId=(id:string)=>catalog.find(item=>item.object_ref.id===id)!;
  for(const [id,kind] of [['HQ','facility'],['H','facility'],['INTEL','facility'],['A','facility'],['B','facility'],['HA','road'],['AB','road'],['R','actor'],['W','actor']])expect(byId(id)?.object_ref).toEqual({run_id:f.view.run_id,kind,id,version:1});
  expect(byId('AB').scope_ref).toEqual({run_id:f.view.run_id,kind:'scope',id:'AB',version:1});
  expect(byId('R').configuration_ref).toEqual({run_id:f.view.run_id,kind:'configuration',id:'R-INTEGRATED-4KG',version:1});
  const inspect:IntegratedFieldEnvelope={run_id:f.view.run_id,operation_id:crypto.randomUUID(),expected_revision:1,intent:{kind:'integrated_activity',actor:'W',action:'inspect',target:'B',plan_ref:{run_id:f.view.run_id,id:'B33-PLAN-1',version:1},model_ref:f.view.model_catalog.model_ref,basis_refs:[]}};
  const signed=await f.game.apply_integrated_intent(inspect);expect(signed.view).toMatchObject({facility_knowledge:null,activity_reports:[]});
  const next=await f.game.apply_integrated_intent({run_id:f.view.run_id,operation_id:crypto.randomUUID(),expected_revision:signed.view.revision,intent:{kind:'advance',to:32000}});
  expect(next.view).toMatchObject({facility_knowledge:{condition:'faulted',method:'diagnostic',observed_at:31000,received_at:32000}});expect(valid_response({request_id:'objects-roles',ok:true,view:next.view})).toBe(true);
  const received=next.view as IntegratedFieldPlayerView;expect(received.activity_reports.at(-1)).toMatchObject({object_ref:{run_id:f.view.run_id,kind:'facility',id:'B',version:1},scope_ref:{run_id:f.view.run_id,kind:'scope',id:'B',version:1},configuration_ref:{run_id:f.view.run_id,kind:'configuration',id:'W-INTEGRATED-3KG',version:1}});
  const mismatched=structuredClone(received);mismatched.activity_reports.at(-1)!.target='A';expect(valid_response({request_id:'wrong-report-subject',ok:true,view:mismatched})).toBe(false);
 }finally{await f.store.delete();}
});

test('NB3-AT018 cross-run references, unregistered objects and wrong model versions reject without partial commits',async()=>{
 const f=await fixture();try{
  const model_ref=f.view.model_catalog.model_ref,base={kind:'integrated_move',actor:'R',target:'A',model_ref};
  const badIntents=[{...base,target:'INTEL'},{...base,target:'AB'},{...base,target:'UNREGISTERED'},{...base,actor:'HQ'},{...base,model_ref:{...model_ref,version:2}},{...base,model_ref:{id:'B32-CONFLICTING-ACTION-01',version:1}},{...base,configuration_ref:{run_id:f.view.run_id,id:'UNREGISTERED',version:1}},{kind:'integrated_activity',actor:'W',action:'read',target:'B',model_ref,basis_refs:[]},{kind:'integrated_activity',actor:'R',action:'read',target:'A',model_ref,basis_refs:[{run_id:crypto.randomUUID(),id:'opening-R',version:1}]},{kind:'integrated_activity',actor:'R',action:'read',target:'A',model_ref,basis_refs:[{run_id:f.view.run_id,id:'opening-R',version:2}]}];
  const before=await f.store.read_committed(f.view.run_id);
  for(const intent of badIntents){const operation_id=crypto.randomUUID();await expect(f.game.apply_integrated_intent({run_id:f.view.run_id,operation_id,expected_revision:1,intent} as unknown as IntegratedFieldEnvelope)).rejects.toThrow();expect(await f.store.read_committed(f.view.run_id)).toEqual(before);expect(await f.game.get_receipt(f.view.run_id,operation_id)).toBeNull();}
 }finally{await f.store.delete();}
});

test('NB3-AT019 weather declarations and road ground conditions are distinct objects and quantities',async()=>{
 const f=await fixture();try{
  const catalog=objects(f.view),road=catalog.find(item=>item.object_ref.id==='AB')!,rain=catalog.find(item=>item.object_ref.id==='RAIN-HA-AB')!,fog=catalog.find(item=>item.object_ref.id==='FOG-HA-AB')!;
  expect(road.object_ref.kind).toBe('road');expect(road.properties).toContain('ground_condition');expect(rain.object_ref.kind).toBe('environment');expect(rain.properties).toEqual(['rain']);expect(fog.properties).toEqual(['fog']);
  expect(rain.scope_ref).toEqual({run_id:f.view.run_id,kind:'scope',id:'HA-AB',version:1});expect(rain.object_ref).not.toEqual(road.object_ref);expect(fog.object_ref).not.toEqual(rain.object_ref);
 }finally{await f.store.delete();}
});

test('NB3-AT020 B facility meanings and object DTO are bound to the independent model',async()=>{
 const f=await fixture();try{
  const catalog=objects(f.view),b=catalog.find(item=>item.object_ref.id==='B')!;expect(b.object_ref.kind).toBe('facility');expect(b.properties).toEqual(['facility_condition','data_source']);expect(f.view.model_catalog.model_ref).toEqual({id:'INTEGRATED-FIELD-MODEL-3',version:1});expect(valid_response({request_id:'registered-object',ok:true,view:f.view})).toBe(true);
  for(const mutation of [{kind:'road'},{run_id:crypto.randomUUID()},{version:2},{id:'UNKNOWN'}]){const changed=structuredClone(f.view),entries=objects(changed),target=entries.find(item=>item.object_ref.id==='B')!;Object.assign(target.object_ref,mutation);expect(valid_response({request_id:'wrong-object',ok:true,view:changed})).toBe(false);}
  const wrongScope=structuredClone(f.view);objects(wrongScope).find(item=>item.object_ref.id==='B')!.scope_ref.id='H';expect(valid_response({request_id:'wrong-scope',ok:true,view:wrongScope})).toBe(false);
 }finally{await f.store.delete();}
});
