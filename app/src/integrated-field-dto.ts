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
    actors:list(v=>shape(v,{id:one('R','W'),position:v=>shape(v,{point,observed_at:time,received_at:time,evidence:valid_id})}),2),
    artifacts:list(v=>shape(v,{id:valid_id,source:one('A','B'),logical_size_bytes:one(1000000000),verified:one(true),observed_at:time,received_at:time}),32),
    activity_reports:list(v=>shape(v,{id:valid_id,report_ref:valid_id,actor:one('R','W'),action:one('read','observe','inspect','repair'),target:one('A','B'),phase:one('accepted','completed','refused','blocked'),reason:one(null,'missing_part','station_busy','actor_in_transit','position_unconfirmed','capacity','facility_unconfirmed','preparation_unavailable','facility_condition','deadline'),observed_at:time,received_at:time}),128),
    facility_knowledge:v=>v===null||shape(v,{condition:one('faulted','unverified_after_replacement','operable'),version:v=>time(v)&&Number(v)>=1,method:one('diagnostic','functional'),observed_at:time,received_at:time,evidence:valid_id,report_ref:valid_id}),
    preparation:v=>v===null||shape(v,{plan_ref:v=>shape(v,{run_id:valid_id,id:one('B33-PLAN-1'),version:one(1)}),approval_ref:v=>v===null||shape(v,{run_id:valid_id,id:one('B33-PLAN-1-preparation-approval'),version:one(1)}),status:one('queued','validating','preparing','approved'),approved_at:v=>v===null||time(v)}),
    model_catalog:v=>shape(v,{model_ref:v=>shape(v,{id:one('INTEGRATED-FIELD-MODEL-3'),version:one(1)}),geometry,configurations:list(configuration,2),calibration_status:one('conditional_not_measured'),parameters:list(parameter,128),sources:list(source,64)}),
    replay_nodes:list(v=>shape(v,{revision:time,at:time,meaningful:bool,label:text}),10000),log:list(v=>shape(v,{id:valid_id,at:time,kind:text,text,evidence:valid_id}),10000)}))return false;
  const view=v as IntegratedFieldPlayerView,catalog=view.model_catalog,a=view.geometry,b=catalog.geometry;
  if(view.actors.length!==2||new Set(view.actors.map(actor=>actor.id)).size!==2||view.actors.some(actor=>actor.position.observed_at>actor.position.received_at||actor.position.received_at>view.sim_time))return false;
  if(new Set(view.artifacts.map(artifact=>artifact.id)).size!==view.artifacts.length||view.artifacts.some(artifact=>artifact.observed_at>artifact.received_at||artifact.received_at>view.sim_time))return false;
  if(new Set(view.activity_reports.map(report=>report.id)).size!==view.activity_reports.length||view.activity_reports.some(report=>report.observed_at>report.received_at||report.received_at>view.sim_time))return false;
  const readRecipe=catalog.parameters.find(parameter=>parameter.id==='P-READ');if(!readRecipe||readRecipe.category!=='C'||readRecipe.unit!=='ms'||!Number.isSafeInteger(readRecipe.value)||readRecipe.value<=0)return false;
  if(view.preparation&&(view.preparation.plan_ref.run_id!==view.run_id||(view.preparation.status==='approved'?view.preparation.approved_at===null||view.preparation.approved_at>view.sim_time||view.preparation.approval_ref?.run_id!==view.run_id:view.preparation.approved_at!==null||view.preparation.approval_ref!==null)))return false;
  if(view.facility_knowledge){const known=view.facility_knowledge,report=view.activity_reports.find(report=>report.id===known.evidence);if(!report||report.report_ref!==known.report_ref||report.target!=='B'||report.phase!=='completed'||report.actor!=='W'||report.action!==(known.method==='functional'?'repair':'inspect')||report.observed_at!==known.observed_at||report.received_at!==known.received_at)return false;}
  if(a.id!==b.id||a.version!==b.version||(['H','A','B'] as const).some(id=>a.points[id].some((value,index)=>value!==b.points[id][index]))||a.segments.length!==2||b.segments.length!==2||a.segments.some((segment,index)=>segment.id!==b.segments[index].id||segment.length_m!==b.segments[index].length_m)||new Set(a.segments.map(segment=>segment.id)).size!==2)return false;
  if(catalog.configurations.length!==2||new Set(catalog.configurations.map(config=>config.actor)).size!==2||new Set(catalog.configurations.map(config=>config.id)).size!==2)return false;
  for(const config of catalog.configurations){
    const registered=config.actor==='R'?{id:'R-INTEGRATED-4KG',equipment:'EQ-G2-TU'}:{id:'W-INTEGRATED-3KG',equipment:'W-FICTIONAL-TOOL'};
    if(config.id!==registered.id||config.equipment.id!==registered.equipment||config.capacity_l<=0||config.occupied_l<0||config.occupied_l>config.capacity_l||config.equipment.mass_kg<0||config.equipment.mass_kg>config.load_kg||config.equipment.battery_wh<=0||config.equipment.battery_available_j<0||config.equipment.battery_available_j>config.equipment.battery_nominal_j)return false;
  }
  const sources=new Set(catalog.sources.map(source=>source.id+':'+source.version));
  if(sources.size!==catalog.sources.length||new Set(catalog.parameters.map(parameter=>parameter.id)).size!==catalog.parameters.length||!['A','C','T'].every(category=>catalog.parameters.some(parameter=>parameter.category===category)))return false;
  return catalog.parameters.every(parameter=>sources.has(parameter.source_ref.id+':'+parameter.source_ref.version));
}
