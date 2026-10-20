import {record,valid_id} from './protocol';
import type {IntegratedFieldPlayerView} from './integrated-field-contracts';
type Check=(value:unknown)=>boolean;
const text:Check=v=>typeof v==='string'&&v.length<=2000;
const finite:Check=v=>typeof v==='number'&&Number.isFinite(v);
const time:Check=v=>finite(v)&&Number.isSafeInteger(v)&&Number(v)>=0;
const bool:Check=v=>typeof v==='boolean';
const one=(...values:unknown[]):Check=>v=>values.includes(v);
const shape=(v:unknown,required:Record<string,Check>,optional:Record<string,Check>={}):boolean=>record(v)&&Object.keys(required).every(k=>Object.hasOwn(v,k)&&required[k](v[k]))&&Object.keys(v).every(k=>Object.hasOwn(required,k)||Object.hasOwn(optional,k)&&optional[k](v[k]));
const list=(check:Check,max:number):Check=>v=>Array.isArray(v)&&v.length<=max&&Object.keys(v).length===v.length&&v.every(check);
const point:Check=v=>Array.isArray(v)&&v.length===2&&v.every(finite);
const sourceRef:Check=v=>shape(v,{id:valid_id,version:one(1)});
const geometry:Check=v=>shape(v,{id:valid_id,version:one(1),unit:one('m'),metres_per_coordinate:one(1),points:v=>shape(v,{H:point,A:point,B:point}),segments:list(v=>shape(v,{id:one('HA','AB'),length_m:x=>finite(x)&&Number(x)>0}),2)});
const configuration:Check=v=>shape(v,{actor:one('R','W'),id:valid_id,load_kg:x=>finite(x)&&Number(x)>=0&&Number(x)<=8,capacity_l:finite,occupied_l:finite,equipment:v=>shape(v,{id:valid_id,mass_kg:finite,battery_included:bool,battery_wh:finite,battery_nominal_j:finite,battery_available_j:finite})},{storage_bytes:time});
const parameter:Check=v=>shape(v,{id:valid_id,value:finite,unit:one('kg','m/s','ms'),category:one('A','C','T'),label:text,source_ref:sourceRef});
const digest:Check=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const source:Check=v=>shape(v,{id:valid_id,version:one(1),document_version:text,publication_date:one(null),sales_sku:one(null)},{url:text,reading_scope:text,source_register_sha256:digest,content_sha256:digest});
export function integrated_field_player_view(v:unknown):v is IntegratedFieldPlayerView{
  if(!shape(v,{scenario_kind:one('play_integrated_field'),run_id:valid_id,revision:v=>time(v)&&Number(v)>=1,sim_time:time,mode:one('command','research'),rate:one(1,2,4),paused:bool,finished:bool,source_run:v=>v===null||valid_id(v),status:one('ready','queued','preparing','executing','terminating','finished','deadline'),can_issue:bool,next_action:text,gap:text,
    public_rules:v=>shape(v,{deadline:one(900000),receipt_grace:one(10000)}),geometry,
    model_catalog:v=>shape(v,{model_ref:v=>shape(v,{id:one('INTEGRATED-FIELD-MODEL-3'),version:one(1)}),geometry,configurations:list(configuration,2),calibration_status:one('conditional_not_measured'),parameters:list(parameter,128),sources:list(source,64)}),
    replay_nodes:list(v=>shape(v,{revision:time,at:time,meaningful:bool,label:text}),10000),log:list(v=>shape(v,{id:valid_id,at:time,kind:text,text,evidence:valid_id}),10000)}))return false;
  const view=v as IntegratedFieldPlayerView,catalog=view.model_catalog,a=view.geometry,b=catalog.geometry;
  if(a.id!==b.id||a.version!==b.version||(['H','A','B'] as const).some(id=>a.points[id].some((value,index)=>value!==b.points[id][index]))||a.segments.length!==2||b.segments.length!==2||a.segments.some((segment,index)=>segment.id!==b.segments[index].id||segment.length_m!==b.segments[index].length_m)||new Set(a.segments.map(segment=>segment.id)).size!==2)return false;
  if(catalog.configurations.length!==2||new Set(catalog.configurations.map(config=>config.actor)).size!==2||new Set(catalog.configurations.map(config=>config.id)).size!==2)return false;
  for(const config of catalog.configurations)if(config.capacity_l<=0||config.occupied_l<0||config.occupied_l>config.capacity_l||config.equipment.mass_kg<0||config.equipment.mass_kg>config.load_kg||config.equipment.battery_wh<=0||config.equipment.battery_available_j<0||config.equipment.battery_available_j>config.equipment.battery_nominal_j)return false;
  const sources=new Set(catalog.sources.map(source=>source.id+':'+source.version));
  if(sources.size!==catalog.sources.length||new Set(catalog.parameters.map(parameter=>parameter.id)).size!==catalog.parameters.length||!['A','C','T'].every(category=>catalog.parameters.some(parameter=>parameter.category===category)))return false;
  return catalog.parameters.every(parameter=>sources.has(parameter.source_ref.id+':'+parameter.source_ref.version));
}
