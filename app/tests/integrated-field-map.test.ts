import {expect,test,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {regionOrigin,sampleSimulationHeight} from '../src/regional-terrain';
import {publicGeometryDigest} from '../src/map-binding';
import {toIntegratedRegion,fromIntegratedRegion} from '../src/integrated-field-map-binding';
import type {IntegratedFieldPlayerView} from '../src/integrated-field-contracts';
import {project_integrated_field_view} from '../src/core/integrated-field-engine';
import {valid_response} from '../src/dto';
import manifest from '../src/regional-assets/manifest.json';
import release from '../src/regional-assets/trusted-release.json';
import type {RegionalBundle} from '../src/regional-terrain';
import {RegionalDisplayStore,RegionalDisplaySession,RegionalDisplayError} from '../src/regional-display';
const selector={schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}};
test('NB3-MAP-AT005 unreported private positions and facility state cannot change the HQ scene or object catalogue',async()=>{
 const store=new Persistence('b33-owned-hq-map-pair-'+crypto.randomUUID());try{
  const game=new Game(store),view=await game.create_run(selector,'research',crypto.randomUUID()),state=await store.read_committed(view.run_id);if(state?.schema!==13)throw Error('Expected integrated state');
  // Projection-only alternatives; never loaded as Game states or used to prove
  // physical transitions. Only hidden fields differ; lawful evidence is fixed.
  const other=structuredClone(state);other.actors.W.position_um=[50000000,150000000];other.work.facility={condition:'operable',version:3};other.work.inventory.available_spares=0;
  expect(project_integrated_field_view(other)).toEqual(project_integrated_field_view(state));expect(project_integrated_field_view(other).actors.find(actor=>actor.id==='W')!.position.point).toEqual([250,150]);expect(project_integrated_field_view(other).facility_knowledge).toBeNull();
  Reflect.set(state.actors.W,'known',null);Reflect.set(other.actors.W,'known',null);const unknown=project_integrated_field_view(state);expect(unknown.actors.some(actor=>actor.id==='W')).toBe(false);expect(project_integrated_field_view(other)).toEqual(unknown);
  expect(valid_response({request_id:'unknown-position',ok:true,view:unknown})).toBe(true);
 }finally{await store.delete();}
});

test('NB3-MAP-AT002 actual metre geometry uses its own extent and independent regional control points',async()=>{
 const store=new Persistence('b33-owned-map-binding-'+crypto.randomUUID());try{
  const view=await new Game(store).create_run(selector,'research',crypto.randomUUID()) as IntegratedFieldPlayerView;
  // Reflect calls the existing boundary with the new registered geometry, without pretending it is a legacy DTO.
  const origin=Reflect.apply(regionOrigin,undefined,[view.geometry]) as readonly[number,number];expect(origin).toEqual([-4800,-4850]);
  expect(Object.values(view.geometry.points).map(point=>toIntegratedRegion(view.geometry,point))).toEqual([[4850,5000],[4950,5000],[5050,5000]]);
  expect(fromIntegratedRegion(view.geometry,[5000,5000])).toEqual([200,150]);
  const digest=await Reflect.apply(publicGeometryDigest,undefined,[view.geometry]);expect(digest).toMatch(/^[a-f0-9]{64}$/);
  const larger={...view.geometry,extent:[800,600]};expect(Reflect.apply(regionOrigin,undefined,[larger])).toEqual([-4600,-4700]);
  const largerGeometry={...view.geometry,extent:[800,600] as [number,number]};expect(toIntegratedRegion(largerGeometry,[50,150])).toEqual([4650,4850]);expect(fromIntegratedRegion(largerGeometry,[4650,4850])).toEqual([50,150]);
  expect(await Reflect.apply(publicGeometryDigest,undefined,[larger])).not.toBe(digest);
  for(const extent of [[0,300],[400,NaN],[-1,300],[10001,300]])expect(()=>Reflect.apply(regionOrigin,undefined,[{...view.geometry,extent}])).toThrow();
 }finally{await store.delete();}
});

test('NB3-MAP-AT004 four-corner height sampling distinguishes real zero from masked or out-of-domain unknown',()=>{
 const field={width:2,height:2,step:25,values:new Float32Array([10,20,30,40]),mask:new Uint8Array([1,1,1,1])};
 expect(sampleSimulationHeight(field,12.5,12.5)).toBe(25);
 for(let index=0;index<4;index++){const mask=field.mask.slice();mask[index]=0;expect(sampleSimulationHeight({...field,mask},12.5,12.5)).toBeNull();}
 expect(sampleSimulationHeight(field,-0.01,12.5)).toBeNull();expect(sampleSimulationHeight(field,25.01,12.5)).toBeNull();
 expect(sampleSimulationHeight({...field,values:new Float32Array(4)},12.5,12.5)).toBe(0);
 expect(sampleSimulationHeight({...field,values:new Float32Array([10,20,NaN,40])},12.5,12.5)).toBeNull();
});

test('NB3-MAP-AT008 display options cannot enter the physical package or business request',async()=>{
 const store=new Persistence('b33-owned-map-isolation-'+crypto.randomUUID()),game=new Game(store);try{
  for(const display of [{background:false},{terrain_mode:'shade'},{camera:[0,0,1]},{elevation_speed_factor:2}])await expect(game.create_run({...selector,...display},'research',crypto.randomUUID())).rejects.toThrow('INVALID_DEFINITION');
  expect(await store.list_runs()).toEqual([]);
 }finally{await store.delete();}
});

function associationBundle(geometryDigest:string):RegionalBundle{return {manifest,manifestHash:release.manifest_sha256,geometryDigest,origin:[-4800,-4850],values:new Float32Array(),mask:new Uint8Array(),images:new Map(),bytes:0,decodedBytes:0,metrics:{start:0,end:0,manifestReady:0,assets:[]},release:()=>{}};}
const mapDefaults={camera:[20,30,2] as [number,number,number],mode:'shade' as const,background:true,terrain:true,labels:false};
test('NB3-MAP-AT010 integrated mapping or geometry mismatch retains the original until explicit verified rebind',async()=>{
 for(const mismatch of ['mapping','geometry']){
  const store=new RegionalDisplayStore('b33-owned-map-mismatch-'+crypto.randomUUID()),run=crypto.randomUUID(),signal=new AbortController().signal,notes:string[]=[];
  try{const bundle=associationBundle('a'.repeat(64)),original=new RegionalDisplaySession(run,store,true,null,text=>notes.push(text));expect(await original.connect(bundle,1,mapDefaults,signal)).toEqual(mapDefaults);const retained=await store.read(run);expect(retained).not.toBeNull();
   const changed=mismatch==='geometry'?{...bundle,geometryDigest:'b'.repeat(64)}:{...bundle,manifest:{...bundle.manifest,mapping:{...bundle.manifest.mapping,version:'different-mapping'}}};
   const restored=new RegionalDisplaySession(run,store,false,1,text=>notes.push(text));expect(await restored.connect(changed,2,mapDefaults,signal)).toBeNull();expect(await store.read(run)).toEqual(retained);expect(notes.at(-1)).toContain('身份不匹配');expect(await restored.save(2)).toBe(false);expect(await store.read(run)).toEqual(retained);
   expect(await restored.save(2,true)).toBe(true);const rebound=await store.read(run);expect(rebound?.id).not.toBe(retained?.id);expect(rebound?.association_revision).toBe(2);expect(rebound?.identity.geometryDigest).toBe(changed.geometryDigest);expect(rebound?.identity.mapping).toBe(changed.manifest.mapping.version);expect(notes.at(-1)).toContain('读回核验');
  }finally{store.close();}
 }
});
test('NB3-MAP-AT010 integrated conflict and uncertain committed readback never silently overwrite or duplicate a display write',async()=>{
 const store=new RegionalDisplayStore('b33-owned-map-uncertain-'+crypto.randomUUID()),run=crypto.randomUUID(),signal=new AbortController().signal,notes:string[]=[],bundle=associationBundle('a'.repeat(64));
 try{const session=new RegionalDisplaySession(run,store,true,null,text=>notes.push(text));expect(await session.connect(bundle,1,mapDefaults,signal)).toEqual(mapDefaults);const original=await store.read(run);if(!original)throw Error('Missing initial association');
  const competing={...original,id:crypto.randomUUID()};await store.write(competing,original.id);session.update({...mapDefaults,labels:true});expect(await session.save(2)).toBe(false);expect(notes.at(-1)).toContain('冲突');expect(await store.read(run)).toEqual(competing);
  const actualWrite=store.write.bind(store),write=vi.spyOn(store,'write').mockImplementation(async(...args)=>{await actualWrite(...args);throw new RegionalDisplayError('READBACK_UNCONFIRMED');});
  expect(await session.save(2,true)).toBe(false);expect(notes.at(-1)).toContain('未确认保存');const committed=await store.read(run);expect(committed?.id).not.toBe(competing.id);expect(committed?.preferences.labels).toBe(true);expect(await session.save(2,true)).toBe(false);expect(write).toHaveBeenCalledTimes(1);expect(await session.reconcile()).toBe(true);expect(write).toHaveBeenCalledTimes(1);expect(await store.read(run)).toEqual(committed);expect(notes.at(-1)).toContain('已核查保存');write.mockRestore();
 }finally{store.close();}
});
