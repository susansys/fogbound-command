import raw from './integrated-field-definition.json';
import {GameError} from '../contracts';
import {record,fields} from '../protocol';
import {hash} from './scenario';
import {canonical,json_data} from './snapshot';
import {load_kg,portable_energy} from './integrated-field-quantities';
export type IntegratedFieldDefinition=Omit<typeof raw,'schema'|'contract'|'scenario_kind'|'version'|'model_ref'|'geometry'>&{
  schema:13;contract:'0.5.1';scenario_kind:'play_integrated_field';version:1;
  model_ref:{id:'INTEGRATED-FIELD-MODEL-3';version:1};
  geometry:{id:string;version:1;unit:'m';metres_per_coordinate:1;extent:[number,number];
    points:Record<'H'|'A'|'B',[number,number]>;
    segments:Array<{id:'HA'|'AB';points:['H'|'A'|'B','H'|'A'|'B']}>};
  definition_hash:string;hashes:Record<string,string>;
};
export async function integrated_field_definition():Promise<IntegratedFieldDefinition>{
  const body=structuredClone(raw);
  if(body.schema!==13||body.contract!=='0.5.1'||body.scenario_kind!=='play_integrated_field'||body.geometry.unit!=='m'||body.geometry.metres_per_coordinate!==1||body.model_ref.id!=='INTEGRATED-FIELD-MODEL-3'||body.model_ref.version!==1)throw new GameError('INVALID_DEFINITION');
  for(const point of Object.values(body.geometry.points))if(point.length!==2||point.some(value=>!Number.isFinite(value)))throw new GameError('INVALID_DEFINITION');
  const extent=body.geometry.extent;if(extent.length!==2||extent.some(value=>!Number.isFinite(value)||value<=0||value>10000)||Object.values(body.geometry.points).some(point=>point.some((value,index)=>value<0||value>extent[index])))throw new GameError('INVALID_DEFINITION');
  if(body.configurations.length!==2||new Set(body.configurations.map(config=>config.actor)).size!==2)throw new GameError('INVALID_DEFINITION');
  for(const config of body.configurations){
    if(!['R','W'].includes(config.actor)||config.items.filter(item=>item.id===config.equipment_item_ref).length!==1||new Set(config.items.map(item=>item.id)).size!==config.items.length||!Number.isFinite(config.capacity_l)||!Number.isFinite(config.occupied_l)||config.occupied_l<0||config.occupied_l>config.capacity_l)throw new GameError('INVALID_DEFINITION');
    load_kg(config.items);portable_energy(config.battery_wh,config.initial_available_percent);
  }
  for(const speed of Object.values(body.parameters))if(speed.unit!=='m/s'||speed.category!=='C'||!Number.isSafeInteger(speed.value*1000)||speed.value<=0)throw new GameError('INVALID_DEFINITION');
  for(const value of Object.values(body.work_parameters))if(!Number.isSafeInteger(value*1000)||value<0)throw new GameError('INVALID_DEFINITION');
  if(body.parameters.ha_speed.unit!=='m/s'||body.parameters.ha_speed.category!=='C'||!Number.isFinite(body.parameters.ha_speed.value)||body.parameters.ha_speed.value<=0||body.parameter_sources.r_mass.unit!=='kg'||body.parameter_sources.deadline.unit!=='ms')throw new GameError('INVALID_DEFINITION');
  const hashes={model:await hash(canonical(body.model_ref)),geometry:await hash(canonical(body.geometry)),rules:await hash(canonical(body.public_rules)),configurations:await hash(canonical(body.configurations)),parameters:await hash(canonical({values:body.parameters,sources:body.parameter_sources})),sources:await hash(canonical(body.sources))};
  const work_hashes={...hashes,work:await hash(canonical(body.work_parameters)),data_sources:await hash(canonical(body.synthetic_data_sources)),data_payload_A:await hash(body.synthetic_data_sources[0].payload),data_payload_B:await hash(body.synthetic_data_sources[1].payload)};
  return {...body,hashes:work_hashes,definition_hash:await hash(canonical({...body,hashes:work_hashes}))} as unknown as IntegratedFieldDefinition;
}
export function is_integrated_field_definition(value:{schema:number}):value is IntegratedFieldDefinition{return value.schema===13;}
export async function load_integrated_field_definition(input:unknown):Promise<IntegratedFieldDefinition>{
  if(!json_data(input))throw new GameError('INVALID_DEFINITION');
  const expected=await integrated_field_definition();
  const selector=record(input)&&fields(input,['schema','contract','package_ref'])&&input.schema===13&&input.contract==='0.5.1'&&record(input.package_ref)&&fields(input.package_ref,['id','version'])&&input.package_ref.id===expected.id&&input.package_ref.version===1;
  if(!selector&&JSON.stringify(canonical(input))!==JSON.stringify(canonical(expected)))throw new GameError('INVALID_DEFINITION');
  return expected;
}
