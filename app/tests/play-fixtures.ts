import definition from './fixtures/play-corridor.json';
import {hash,load_definition,is_play_definition,type PlayDefinition} from '../src/core/scenario';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import type {Coordinate} from '../src/spatial';
import type {StoredState} from '../src/core/state';
import {state_hash} from '../src/core/snapshot';
import type {Mode} from '../src/contracts';

export async function play_variant(change:(value:PlayDefinition)=>void,rebuild_geometry=false):Promise<PlayDefinition>{
  const loaded=await load_definition(definition);if(!is_play_definition(loaded))throw Error('Expected registered corridor definition');
  const value=structuredClone(loaded);change(value);
  if(rebuild_geometry){
    const map=value.catalogs.map,{map_id,map_version,crs_id}=map;
    const rules=Object.fromEntries(Object.entries(value.rules).filter(([key])=>key!=='disabled_capabilities'));
    map.geometry_version=await hash({identity:{map_id,map_version,crs_id},extent:map.extent,unit:map.unit,scopes:map.scopes.map(({geometry_version,...scope})=>scope),rules});
    for(const scope of map.scopes)scope.geometry_version=map.geometry_version;
  }
  for(const entry of value.profile.registry)entry.value=value.profile.parameters[entry.id as keyof typeof value.profile.parameters];
  for(const key of ['profile','capabilities','rules','catalogs'] as const)value.hashes[key]=await hash(value[key]);
  const {definition_hash,...payload}=value;value.definition_hash=await hash(payload);return value;
}
export function zero_load(value:PlayDefinition){
  for(const item of [...value.catalogs.equipment,...value.catalogs.items]){item.load=0;item.space=0;}
  value.catalogs.actor.load=0;value.catalogs.actor.space=0;
}
export async function movement_run(name:string,value:PlayDefinition,path:Coordinate[],issue_at=0,mode:Mode='research'){
  const store=new Persistence('b21-owned-movement-'+name,[value]),game=new Game(store);
  let view=await game.create_run(value,mode,'create-'+name);
  if(view.scenario_kind!=='play_corridor')throw Error('Expected corridor');
  const run=view.run_id;
  const advance=async(to:number)=>{const current=await game.get_view(run);return (mode==='command'?await game.tick(run,to,'advance-'+to):await game.control_clock({run_id:run,operation_id:'advance-'+to,expected_revision:current.revision,intent:{kind:'advance',to}})).view;};
  if(issue_at>0){const next=await advance(issue_at);if(next.scenario_kind!=='play_corridor')throw Error('Expected corridor');view=next;}
  const {map_id,map_version,crs_id,geometry_version}=view.geometry;
  const plan=await game.preview_plan(run,view.revision,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path});
  await game.issue_order({run_id:run,operation_id:'issue-'+name,expected_revision:view.revision,intent:{kind:'issue',command_id:'move-'+name,plan}});
  return {game,store,run,advance,plan,initial:view};
}
export async function replace_owned_archive(store:Persistence,state:StoredState){
  if(!store.name.startsWith('b21-owned-'))throw Error('Owned synthetic database required');
  state.integrity=await state_hash(state);
  await new Promise<void>((resolve,reject)=>{const open=indexedDB.open(store.name);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['runs','snapshots'],'readwrite');tx.objectStore('runs').put(state);tx.objectStore('snapshots').put({key:`${state.run_id}:${state.revision}`,run_id:state.run_id,state});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};});
}
