import definition from './fixtures/play-corridor.json';
import {hash,type PlayDefinition} from '../src/core/scenario';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import type {Coordinate} from '../src/spatial';

export async function play_variant(change:(value:PlayDefinition)=>void):Promise<PlayDefinition>{
  const value=structuredClone(definition) as PlayDefinition;change(value);
  for(const entry of value.profile.registry)entry.value=value.profile.parameters[entry.id as keyof typeof value.profile.parameters];
  for(const key of ['profile','capabilities','rules','catalogs'] as const)value.hashes[key]=await hash(value[key]);
  const {definition_hash,...payload}=value;value.definition_hash=await hash(payload);return value;
}
export function zero_load(value:PlayDefinition){
  for(const item of [...value.catalogs.equipment,...value.catalogs.items]){item.load=0;item.space=0;}
  value.catalogs.actor.load=0;value.catalogs.actor.space=0;
}
export async function movement_run(name:string,value:PlayDefinition,path:Coordinate[],issue_at=0){
  const store=new Persistence('b21-owned-movement-'+name,[value]),game=new Game(store);
  let view=await game.create_run(value,'research','create-'+name);
  if(view.scenario_kind!=='play_corridor')throw Error('Expected corridor');
  const run=view.run_id;
  const advance=async(to:number)=>{const current=await game.get_view(run);return (await game.control_clock({run_id:run,operation_id:'advance-'+to,expected_revision:current.revision,intent:{kind:'advance',to}})).view;};
  if(issue_at>0){const next=await advance(issue_at);if(next.scenario_kind!=='play_corridor')throw Error('Expected corridor');view=next;}
  const {map_id,map_version,crs_id,geometry_version}=view.geometry;
  const plan=await game.preview_plan(run,view.revision,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path});
  await game.issue_order({run_id:run,operation_id:'issue-'+name,expected_revision:view.revision,intent:{kind:'issue',command_id:'move-'+name,plan}});
  return {game,store,run,advance,plan,initial:view};
}
