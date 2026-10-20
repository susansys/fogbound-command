import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {regionOrigin,sampleSimulationHeight} from '../src/regional-terrain';
import {publicGeometryDigest} from '../src/map-binding';
import {toIntegratedRegion,fromIntegratedRegion} from '../src/integrated-field-map-binding';
import type {IntegratedFieldPlayerView} from '../src/integrated-field-contracts';
const selector={schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}};

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
