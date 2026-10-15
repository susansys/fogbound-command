import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from './fixtures/play-corridor.json';
import {load_definition,is_play_definition,hash,engineeringDefinition,type PlayDefinition} from '../src/core/scenario';
import type {RouteDraft} from '../src/route-contracts';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';

test('PG05 schema7 route drafts and canonical plans cross only the exact public preview protocol',async()=>{
  const store=new Persistence('b21-owned-preview-protocol');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create-preview-protocol');
    if(view.scenario_kind!=='play_corridor')throw Error('Expected corridor branch');
    const {map_id,map_version,crs_id,geometry_version}=view.geometry,route_draft:RouteDraft={actor:'R',map_id,map_version,crs_id,geometry_version,path};
    const request={kind:'preview',request_id:'route-preview',run_id:view.run_id,revision:view.revision,editing_seq:1,route_draft};
    expect(valid_request(request)).toBe(true);
    expect(valid_request({...request,definition_hash:definition.definition_hash})).toBe(false);
    const plan=await game.preview_plan(view.run_id,view.revision,1,route_draft),response={request_id:'route-preview',ok:true,plan};
    expect(valid_response(response)).toBe(true);
    expect(valid_response({...response,plan:{...plan,definition_hash:definition.definition_hash}})).toBe(false);
    const extra=structuredClone(plan);Object.assign(extra.path[0],{engine_private:'MUST_REJECT'});
    expect(valid_response({...response,plan:extra})).toBe(false);
    expect(valid_response({request_id:'route-error',ok:false,code:'INVALID_REQUEST',field_path:'route_draft.path[2]'})).toBe(true);
  }finally{await store.delete();}
});

test('PG06 wrong identity, bad coordinates and self-intersection are refused without a partial preview commit',async()=>{
  const store=new Persistence('b21-owned-route-invalid-input');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create-route-invalid-input');
    if(view.scenario_kind!=='play_corridor')throw Error('Expected corridor branch');
    const before=await store.read_committed(view.run_id),{map_id,map_version,crs_id,geometry_version}=view.geometry;
    const original:RouteDraft={actor:'R',map_id,map_version,crs_id,geometry_version,path:[[50,150],[150,150]]};
    for(const change of [
      (v:RouteDraft)=>{v.geometry_version='f'.repeat(64);},
      (v:RouteDraft)=>{v.path=[[50,150],[401,150]];},
      (v:RouteDraft)=>{v.path=[[50,150],[100.001,150]];},
      (v:RouteDraft)=>{v.path=[[50,150],[NaN,150]];},
      (v:RouteDraft)=>{v.path=Array.from({length:65},(_,i)=>[50+i,150]);},
      (v:RouteDraft)=>{v.path=[[50,150],[150,158],[50,158],[150,150]];},
      (v:RouteDraft)=>{Object.assign(v.path,{engine_private:'MUST_REJECT'});},
      (v:RouteDraft)=>{Object.assign(v,{engine_private:'MUST_REJECT'});},
    ]){
      const input=structuredClone(original);change(input);
      await expect(game.preview_plan(view.run_id,view.revision,1,input)).rejects.toMatchObject({code:'INVALID_REQUEST'});
    }
    expect(await store.read_committed(view.run_id)).toEqual(before);
    await expect(game.preview_plan(view.run_id,view.revision+1,1,original)).rejects.toThrow('STALE_REVISION');
  }finally{await store.delete();}
});

async function variant(change:(value:PlayDefinition)=>void){
  const value=await load_definition(definition);if(!is_play_definition(value))throw Error('Expected author definition');change(value);
  const map=value.catalogs.map,{map_id,map_version,crs_id}=map,identity={map_id,map_version,crs_id};
  const rules=Object.fromEntries(Object.entries(value.rules).filter(([key])=>key!=='disabled_capabilities'));
  map.geometry_version=await hash({identity,extent:map.extent,unit:map.unit,scopes:map.scopes.map(({geometry_version,...scope})=>scope),rules});
  for(const scope of map.scopes)scope.geometry_version=map.geometry_version;
  for(const key of ['profile','capabilities','rules','catalogs'] as const)value.hashes[key]=await hash(value[key]);
  const {definition_hash,...body}=value;value.definition_hash=await hash(body);return value;
}
test('PG07 previews use the public exact start and remain identical for private closure variants',async()=>{
  const closed=await variant(value=>{value.catalogs.engine_conditions.closed_at_x=160;}),aBasis=await variant(value=>{value.catalogs.initial_evidence.scope_ref='A';});
  const normalStore=new Persistence('b21-owned-preview-normal'),closedStore=new Persistence('b21-owned-preview-closed',[closed]),aStore=new Persistence('b21-owned-preview-known-A',[aBasis]);
  try{
    const plans=[];
    for(const [store,input] of [[normalStore,definition],[closedStore,closed]] as const){
      const game=new Game(store),view=await game.create_run(input,'research','create-private-pair');
      if(view.scenario_kind!=='play_corridor')throw Error('Expected corridor branch');
      const {map_id,map_version,crs_id,geometry_version}=view.geometry,before=await store.read_committed(view.run_id);
      const plan=await game.preview_plan(view.run_id,view.revision,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path:[[50,150],[250,150]]});
      plans.push({...plan,run_id:'same'});expect(plan.allowed).toBe(true);expect(plan.assumptions).toContain('按已知地形估计，途中条件待回报');
      const wrongStart=await game.preview_plan(view.run_id,view.revision,2,{actor:'R',map_id,map_version,crs_id,geometry_version,path:[[60,150],[150,150]]});
      expect(wrongStart).toMatchObject({allowed:false,gap:'路线起点必须与总部精确定位一致'});
      expect(await store.read_committed(view.run_id)).toEqual(before);
    }
    expect(plans[1]).toEqual(plans[0]);
    const game=new Game(aStore),view=await game.create_run(aBasis,'research','create-known-A');
    if(view.scenario_kind!=='play_corridor')throw Error('Expected corridor branch');
    const {map_id,map_version,crs_id,geometry_version}=view.geometry;
    // The registered World origin remains H. Only the legal PlayerView basis may be used.
    expect(await game.preview_plan(view.run_id,view.revision,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path:[[150,150],[250,150]]})).toMatchObject({allowed:true,distance:100});
  }finally{await normalStore.delete();await closedStore.delete();await aStore.delete();}
});
test('PG06 endpoint containment cannot authorize a segment crossing a public corridor gap',async()=>{
  const separated=await variant(value=>{
    const corridor=value.catalogs.map.scopes.find(x=>x.id==='AB'),area=value.catalogs.map.scopes.find(x=>x.id==='AB-area');
    if(corridor?.kind!=='corridor'||area?.kind!=='area')throw Error('Expected registered AB domain');
    corridor.typed_geometry.centerline=[[170,150],[250,150]];
    area.typed_geometry.outer=[[170,140],[250,140],[250,160],[170,160],[170,140]];
  });
  const store=new Persistence('b21-owned-route-gap',[separated]);
  try{
    const game=new Game(store),view=await game.create_run(separated,'research','create-route-gap');
    if(view.scenario_kind!=='play_corridor')throw Error('Expected corridor branch');
    const before=await store.read_committed(view.run_id),{map_id,map_version,crs_id,geometry_version}=view.geometry;
    const plan=await game.preview_plan(view.run_id,view.revision,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path:[[50,150],[250,150]]});
    expect(plan.allowed).toBe(false);expect(plan.gap).toBe('第 1 段离开已知走廊');
    expect(await store.read_committed(view.run_id)).toEqual(before);
  }finally{await store.delete();}
});

const path:[number,number][]=[[50,150],[56,158],[140,158],[146,150],[162,150]];
test('PG06 backtracking is refused before collinear simplification and valid redundant points have one canonical digest',async()=>{
  const store=new Persistence('b21-owned-route-normalization');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create-route-normalization');
    if(view.scenario_kind!=='play_corridor')throw Error('Expected corridor branch');
    const {map_id,map_version,crs_id,geometry_version}=view.geometry,identity={actor:'R' as const,map_id,map_version,crs_id,geometry_version};
    const before=await store.read_committed(view.run_id);
    await expect(game.preview_plan(view.run_id,view.revision,1,{...identity,path:[[50,150],[150,150],[100,150],[200,150]]})).rejects.toMatchObject({code:'INVALID_REQUEST',field_path:'route_draft.path[2]'});
    const direct=await game.preview_plan(view.run_id,view.revision,2,{...identity,path:[[50,150],[150,150]]});
    const redundant=await game.preview_plan(view.run_id,view.revision,3,{...identity,path:[[50,150],[50,150],[100,150],[150,150]]});
    expect(redundant.path).toEqual([[50,150],[150,150]]);expect(redundant.path_digest).toBe(direct.path_digest);expect(redundant.estimated_move_ms).toBe(29500);
    expect(await store.read_committed(view.run_id)).toEqual(before);
  }finally{await store.delete();}
});
test('PG05 a schema7 route preview returns the real 120 metre canonical polyline without committing anything',async()=>{
  const store=new Persistence('b21-owned-route-preview');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create-route-preview');
    if(view.scenario_kind!=='play_corridor')throw Error('Expected public corridor branch');
    const before=await store.read_committed(view.run_id),{map_id,map_version,crs_id,geometry_version}=view.geometry;
    const plan=await game.preview_plan(view.run_id,view.revision,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path});
    expect(plan).toMatchObject({kind:'corridor_move',actor:'R',allowed:true,path,distance:120,estimated_move_ms:35400,capability_ref:'R-MOVE-4',editing_seq:1});
    expect(await store.read_committed(view.run_id)).toEqual(before);
    expect(await game.get_view(view.run_id)).toEqual(view);
    expect(JSON.stringify(plan)).not.toContain(definition.definition_hash);
    expect(JSON.stringify(plan)).not.toContain('engine_conditions');
    const encoded=JSON.parse(JSON.stringify({actor:'R',map_id,map_version,crs_id,geometry_version,path}));
    expect((await game.preview_plan(view.run_id,view.revision,2,encoded)).path_digest).toBe(plan.path_digest);
  }finally{await store.delete();}
});

test('PG07 unresolved and uncertain starts return an explicitly unknown estimate without fabricating a start',async()=>{
  for(const scope_ref of ['pending-location','approximate']){
    const input=await variant(value=>{value.catalogs.initial_evidence.scope_ref=scope_ref;value.catalogs.initial_evidence.observed={kind:'unknown'};});
    const store=new Persistence('b21-owned-preview-unknown-'+scope_ref,[input]);
    try{
      const game=new Game(store),view=await game.create_run(input,'research','create-unknown-start');
      if(view.scenario_kind!=='play_corridor')throw Error('Expected corridor branch');
      const {map_id,map_version,crs_id,geometry_version}=view.geometry,before=await store.read_committed(view.run_id);
      const plan=await game.preview_plan(view.run_id,view.revision,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path});
      expect(plan).toMatchObject({allowed:false,gap:'需要明确起点回报',estimate_kind:'unknown',estimated_move_ms:null,estimate_range:null});
      expect(valid_response({request_id:'unknown-estimate',ok:true,plan})).toBe(true);
      expect(await store.read_committed(view.run_id)).toEqual(before);
    }finally{await store.delete();}
  }
});

test('PG07 self-signed capability or load metadata cannot make an invalid registered preview basis authoritative',async()=>{
  for(const change of [
    (v:PlayDefinition)=>{v.capabilities[0].speed=0;},
    (v:PlayDefinition)=>{v.capabilities[0].speed=2;},
    (v:PlayDefinition)=>{v.catalogs.actor.qualification_refs=[];},
    (v:PlayDefinition)=>{v.catalogs.actor.load=-1;},
    (v:PlayDefinition)=>{v.catalogs.actor.load=10;},
  ]){
    const input=await variant(change),store=new Persistence('b21-owned-invalid-capability-'+crypto.randomUUID(),[input]);
    try{
      await expect(new Game(store).create_run(input,'research','invalid-capability')).rejects.toMatchObject({code:'INVALID_REQUEST'});
      expect(await store.list_runs()).toEqual([]);expect(await store.creation('invalid-capability')).toBeUndefined();
    }finally{await store.delete();}
  }
});

test('PG05 legacy and schema7 issued-order DTOs reject plans from the other scenario branch',async()=>{
  const oldStore=new Persistence('b21-owned-dto-legacy-orders'),newStore=new Persistence('b21-owned-dto-corridor-orders');
  try{
    const oldGame=new Game(oldStore),newGame=new Game(newStore);
    const legacy=await oldGame.create_run(engineeringDefinition,'research','create-legacy-dto'),view=await newGame.create_run(definition,'research','create-corridor-dto');
    if(legacy.scenario_kind==='play_corridor'||view.scenario_kind!=='play_corridor')throw Error('Expected distinct registered branches');
    const {map_id,map_version,crs_id,geometry_version}=view.geometry;
    const route=await newGame.preview_plan(view.run_id,view.revision,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path});
    const oldPlan=await oldGame.preview_plan(legacy.run_id,legacy.revision,1);
    expect(valid_response({request_id:'legacy-good',ok:true,view:legacy})).toBe(true);
    expect(valid_response({request_id:'corridor-good',ok:true,view})).toBe(true);
    expect(valid_response({request_id:'legacy-cross',ok:true,view:{...legacy,issued_orders:[{command_id:'wrong-branch',issued:0,plan:route}]}})).toBe(false);
    expect(valid_response({request_id:'corridor-cross',ok:true,view:{...view,issued_orders:[{command_id:'wrong-branch',issued:0,plan:oldPlan}]}})).toBe(false);
  }finally{await oldStore.delete();await newStore.delete();}
});
