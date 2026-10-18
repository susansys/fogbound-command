import type {Response} from './transport';
import {prestart_case_refs} from './contracts';
import {record,valid_id,valid_envelope,valid_public_field_path} from './protocol';
import {validate_public_map} from './spatial';
import {valid_route_plan} from './route-validation';
import {mission_player_view,mission_preview} from './mission-dto';
import {mission_decision_evaluation} from './mission-record-dto';
import {outcome_participant_receipt,outcome_inference_receipt,outcome_decision_evaluation,outcome_player_view,outcome_debrief_session,outcome_truth_payload,outcome_truth_confirmation,outcome_fairness,outcome_debrief_answer,outcome_evidence_resolution} from './outcome-dto';
import {intelligence_player_view} from './intelligence-dto';
type Check=(value:unknown)=>boolean;
const text:Check=v=>typeof v==='string'&&v.length<=2000;
const bool:Check=v=>typeof v==='boolean';
const time:Check=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const number:Check=v=>typeof v==='number'&&Number.isFinite(v);
const oneOf=(values:readonly unknown[]):Check=>v=>values.includes(v);
function shape(value:unknown,required:Record<string,Check>,optional:Record<string,Check>={}):boolean{
  if(!record(value))return false;
  return Object.keys(required).every(key=>Object.hasOwn(value,key)&&required[key](value[key]))&&Object.keys(value).every(key=>Object.hasOwn(required,key)||(Object.hasOwn(optional,key)&&optional[key](value[key])));
}
const list=(entry:Check,max=10000):Check=>v=>{
  if(!Array.isArray(v)||v.length>max)return false;
  const keys=Reflect.ownKeys(v);
  return keys.length===v.length+1&&keys.every(key=>key==='length'||typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<v.length)&&v.every(entry);
};
const vector=(length:number):Check=>v=>Array.isArray(v)&&v.length===length&&list(number,length)(v);
const evidenceTime:Check=v=>shape(v,{value:time,evidence:text});
const sourceTime:Check=v=>shape(v,{kind:oneOf(['unknown'])})||shape(v,{kind:oneOf(['known']),value:time,evidence:text});
export const position:Check=v=>shape(v,{x:number,y:number,observed:time,received:time,evidence:text});
export const resources:Check=v=>shape(v,{equipment_energy:time,equipment_wear:time,movement_energy:time,confirmed_at:time},{movement_energy_reserved:time,record_energy:time,record_wear:time,record_packs:time,record_energy_reserved:time,record_packs_reserved:time,hq_energy:time,hq_wear:time});
const report:Check=v=>shape(v,{id:text,origin:text,target:text,source_event_time:sourceTime,observed:evidenceTime,reported:evidenceTime});
const delivery:Check=v=>shape(v,{id:text,report_id:text,received:evidenceTime});
const log:Check=v=>shape(v,{id:text,at:time,kind:oneOf(['report','issued','sent','accepted_receipt','replace_receipt','rejected_receipt','expired','control_unconfirmed','request_window_ended','start_receipt','fix_receipt','complete_receipt','deadline','deadline_receipt']),text,evidence:text},{observed:time,sender:text,activity_id:valid_id,rejection:oneOf(['window_closed','authority_closed','request_expired']),request_kind:oneOf(['task','replacement'])});
const artifact:Check=v=>shape(v,{id:valid_id,report_id:valid_id,delivery_id:valid_id,completed:time,verified:oneOf([false]),activity_id:valid_id});
const common_player_view:Check=v=>shape(v,{
  run_id:valid_id,revision:v=>time(v)&&Number(v)>=1,sim_time:time,mode:oneOf(['command','research']),rate:oneOf([1,2,4]),paused:bool,finished:bool,source_run:v=>v===null||valid_id(v),status:oneOf(['ready','queued','preparing','executing','terminating','finished','deadline']),
  position,report,delivery,resources,
  geometry:v=>shape(v,{H:vector(2),T:vector(2),extent:vector(2),corridor_width:number,plain:vector(4),rough:vector(4)},{N:vector(2)}),
  authority:v=>shape(v,{from:time,to:time}),can_issue:bool,next_action:text,gap:text,
  log:list(log),
  issued_orders:list(v=>shape(v,{command_id:valid_id,issued:time,plan:legacy_plan},{reason:text})),
},{replacement:v=>shape(v,{original_command_id:valid_id,replacement_command_id:valid_id,accepted_at:time,received_at:time,evidence:text}),scenario_case:oneOf(prestart_case_refs),scenario_kind:oneOf(['record','prestart_move']),artifacts:list(artifact),replay_nodes:list(v=>shape(v,{revision:v=>time(v)&&Number(v)>=1,at:time,meaningful:bool,label:text}))});
export const player_view:Check=v=>{
  if(record(v)&&v.scenario_kind==='play_outcome')return outcome_player_view(v);
  if(record(v)&&v.scenario_kind==='play_intelligence')return intelligence_player_view(v);
  if(record(v)&&v.scenario_kind==='play_mission')return mission_player_view(v);
  if(record(v)&&v.scenario_kind==='play_corridor')return play_player_view(v);
  if(!common_player_view(v)||!record(v)||!record(v.resources))return false;
  const keys=['record_energy','record_wear','record_packs','record_energy_reserved','record_packs_reserved','hq_energy','hq_wear'];
  if(v.scenario_kind==='prestart_move')return Object.hasOwn(v,'scenario_case')&& keys.slice(0,5).every(key=>!Object.hasOwn(v.resources as object,key))&&['hq_energy','hq_wear'].every(key=>Object.hasOwn(v.resources as object,key))&&!Object.hasOwn(v,'artifacts')&&Object.hasOwn(v,'replay_nodes')&&record(v.geometry)&&Object.hasOwn(v.geometry,'N')&&Object.hasOwn(v.resources,'movement_energy_reserved');
  if(Object.hasOwn(v,'scenario_case')||Object.hasOwn(v,'replacement')||record(v.geometry)&&Object.hasOwn(v.geometry,'N')||Object.hasOwn(v.resources,'movement_energy_reserved'))return false;
  return v.scenario_kind==='record'
    ?keys.every(key=>Object.hasOwn(v.resources as object,key))&&Object.hasOwn(v,'artifacts')&&Object.hasOwn(v,'replay_nodes')
    :keys.every(key=>!Object.hasOwn(v.resources as object,key))&&!Object.hasOwn(v,'artifacts')&&Object.hasOwn(v,'replay_nodes');
};
function public_map(value:unknown):boolean{try{validate_public_map(value);return true;}catch{return false;}}
function play_player_view(v:Record<string,unknown>):boolean{
  const scope:Check=value=>{
    if(!record(value)||value.kind==='unresolved'||!record(v.geometry)||!Array.isArray(v.geometry.scopes))return false;
    return public_map({...v.geometry,scopes:[...v.geometry.scopes.filter(s=>!record(s)||s.id!==value.id),value]});
  };
  const evidence={observed:sourceTime,reported:sourceTime,source_event_time:sourceTime,evidence_refs:list(valid_id,32)};
  const initial={received:oneOf([null]),provenance:(x:unknown)=>shape(x,{kind:oneOf(['registered_initial']),initial_evidence_ref:valid_id})};
  const delivered={received:time,provenance:(x:unknown)=>shape(x,{kind:oneOf(['delivered']),report_ref:valid_id,delivery_ref:valid_id})};
  const positionKnowledge:Check=value=>{
    if(!record(value))return false;
    if(value.status==='known_scope')return shape(value,{status:oneOf(['known_scope']),scope,...evidence,...initial})||shape(value,{status:oneOf(['known_scope']),scope,...evidence,...delivered});
    if(value.status==='unresolved')return shape(value,{status:oneOf(['unresolved']),...evidence,...initial})||shape(value,{status:oneOf(['unresolved']),...evidence,...delivered});
    return shape(value,{status:oneOf(['conflicting']),observed:x=>shape(x,{kind:oneOf(['known']),value:time,evidence:text}),candidates:x=>Array.isArray(x)&&x.length>=2&&list(c=>shape(c,{scope,...evidence,...delivered})||shape(c,{scope,...evidence,...initial}),32)(x)});
  };
  const portableFields={equipment_energy:time,equipment_wear:time,movement_energy:time,movement_energy_reserved:time,record_energy:time,record_wear:time,record_packs:time,confirmed_at:time};
  const playResources:Check=x=>shape(x,{...portableFields,hq_energy:time,hq_wear:time});
  const playReport:Check=x=>{
    if(!shape(x,{id:valid_id,origin:oneOf(['R']),target:oneOf(['HQ']),kind:oneOf(['accepted','arrived','blocked','cutoff','refused','position']),command_id:x=>x===null||valid_id(x),activity_id:x=>x===null||valid_id(x),source_event_time:sourceTime,observed:sourceTime,reported:sourceTime,position_scope:x=>x===null||scope(x),resources:x=>shape(x,portableFields),refusal_reason:oneOf([null,'start_mismatch','window_closed','insufficient_movement_energy'])})||!record(x)||!record(x.reported)||x.reported.kind!=='known'||!record(x.observed))return false;
    if(x.observed.kind==='known'&&Number(x.observed.value)>Number(x.reported.value))return false;
    if(x.kind==='position')return x.command_id===null&&x.activity_id===null&&x.refusal_reason===null;
    if(!valid_id(x.command_id)||x.observed.kind!=='known')return false;
    if(x.kind==='refused')return x.activity_id===null&&x.refusal_reason!==null&&x.position_scope!==null;
    return valid_id(x.activity_id)&&x.refusal_reason===null&&(x.kind==='accepted'?x.position_scope===null:x.position_scope!==null);
  };
  const receivedReport:Check=x=>shape(x,{report:playReport,delivery})&&record(x)&&record(x.report)&&record(x.report.reported)&&record(x.delivery)&&record(x.delivery.received)&&x.delivery.report_id===x.report.id&&Number(x.delivery.received.value)>=Number(x.report.reported.value)&&Number(x.delivery.received.value)<=Number(v.sim_time);
  const cause:Check=x=>shape(x,{cause_id:valid_id,rule_ref:valid_id,consumer:oneOf(['R:move']),slot:oneOf(['terrain','environment']),factor:x=>number(x)&&Number(x)>0,evidence_ref:valid_id});
  return shape(v,{
    scenario_kind:oneOf(['play_corridor']),run_id:valid_id,revision:x=>time(x)&&Number(x)>=1,sim_time:x=>time(x)&&Number(x)<=910000,mode:oneOf(['command','research']),rate:oneOf([1,2,4]),paused:bool,finished:oneOf([false]),source_run:x=>x===null||valid_id(x),status:oneOf(['ready','queued','accepted','arrived','blocked','cutoff_confirmed','window_ended_unconfirmed','window_sealed_unconfirmed']),
    geometry:public_map,position_knowledge:positionKnowledge,authority:x=>shape(x,{from:time,to:time}),public_rules:x=>shape(x,{deadline:oneOf([900000]),receipt_grace:oneOf([10000]),link_ms:oneOf([1000]),rules_hash:x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),report_policy:x=>shape(x,{budget:oneOf([2]),energy_per_send:oneOf([1]),wear_per_send:oneOf([1])})}),movement_basis:x=>shape(x,{capability_ref:valid_id,speed:x=>number(x)&&Number(x)>0,unit:oneOf(['fictional_metre/s']),load:time,terrain_factor:x=>number(x)&&Number(x)>0,environment_factor:x=>number(x)&&Number(x)>0,load_factor_per_unit:oneOf([0.02]),length_scale:oneOf([1000000]),applied_causes:list(cause,32),evidence_refs:list(valid_id,32)}),resources:playResources,can_issue:bool,next_action:text,gap:text,
    received_reports:list(receivedReport),
    issued_orders:list(x=>shape(x,{command_id:valid_id,issued:time,plan:valid_route_plan},{reason:text})),replay_nodes:list(x=>shape(x,{revision:x=>time(x)&&Number(x)>=1,at:time,meaningful:bool,label:text})),log:list(x=>shape(x,{id:text,at:time,kind:oneOf(['initial_evidence','issued','sent','accepted_receipt','complete_receipt','blocked_receipt','cutoff_receipt','position_receipt','refused_receipt']),text,evidence:text},{sender:oneOf(['总部指挥席','联络组 R']),observed:time,activity_id:valid_id}))
  });
}
const legacy_plan:Check=v=>valid_envelope({run_id:'dto',operation_id:'dto',expected_revision:1,intent:{kind:'issue',command_id:'dto',plan:v}});
const plan:Check=v=>valid_route_plan(v)||legacy_plan(v);
const receipt:Check=v=>v===null||shape(v,{run_id:valid_id,operation_id:valid_id,revision:v=>time(v)&&Number(v)>=1,sim_time:time,fingerprint:v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),result:oneOf(['committed']),kind:oneOf(['issue','replace_task','advance','tick','pause','continue','rate','mode','save','restore','save_plan','issue_mission','append_explanation','request_source_validation','request_preparation','issue_activity','return_and_deliver','abort_outcome'])},{snapshot_revision:v=>time(v)&&Number(v)>=1});
const run:Check=v=>shape(v,{run_id:valid_id,revision:time,sim_time:time,mode:oneOf(['command','research']),finished:bool},{scenario_kind:oneOf(['move','record','prestart_move','play_corridor','play_mission','play_intelligence','play_outcome']),read_only:bool});
const codes=['UNSUPPORTED','AUTHORITY_DENIED','EVIDENCE_REQUIRED','CONSTRAINT_HOLD','CONSTRAINT_DENIED','CAPACITY_CONFLICT','STATE_CONFIRMATION_REQUIRED','WRITER_BUSY','LOCK_UNSUPPORTED','INVALID_INPUT','INVALID_REQUEST','CONFIG_PARAMETER_MISSING','CONFIG_UNIT_MISMATCH','INVALID_DEFINITION','RUN_NOT_FOUND','STALE_REVISION','STALE_PLAN','OPERATION_CONFLICT','OBJECT_VERSION_CONFLICT','OPERATION_ID_REUSED','ORDER_EXISTS','REPLACEMENT_LIMIT','AUTHORITY_EXPIRED','MODE_LOCKED','TIME_REVERSED','TIME_NOT_ADVANCED','RUN_ENDED','STALE_WRITER','CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','CLOCK_PAUSED','INVALID_SAVE','HISTORY_READ_ONLY'];
export function valid_response(value:unknown):value is Response{
  if(!record(value))return false;
  if(Object.hasOwn(value,'debrief_participants'))return shape(value,{request_id:valid_id,ok:oneOf([true]),debrief_participants:outcome_participant_receipt});
  if(Object.hasOwn(value,'debrief_inference'))return shape(value,{request_id:valid_id,ok:oneOf([true]),debrief_inference:outcome_inference_receipt});
  if(value.ok===false&&['DEBRIEF_NOT_AVAILABLE','DEBRIEF_QUERY_REJECTED','DEBRIEF_BUILD_FAILED'].includes(String(value.code)))return shape(value,{request_id:valid_id,ok:oneOf([false]),code:oneOf(['DEBRIEF_NOT_AVAILABLE','DEBRIEF_QUERY_REJECTED','DEBRIEF_BUILD_FAILED'])});
  if(Object.hasOwn(value,'debrief'))return shape(value,{request_id:valid_id,ok:oneOf([true]),debrief:outcome_debrief_session});
  if(Object.hasOwn(value,'outcome_truth'))return shape(value,{request_id:valid_id,ok:oneOf([true]),outcome_truth:outcome_truth_payload});
  if(Object.hasOwn(value,'truth_confirmation'))return shape(value,{request_id:valid_id,ok:oneOf([true]),truth_confirmation:outcome_truth_confirmation});
  if(Object.hasOwn(value,'outcome_fairness'))return shape(value,{request_id:valid_id,ok:oneOf([true]),outcome_fairness});
  if(Object.hasOwn(value,'decision_evaluation'))return shape(value,{request_id:valid_id,ok:oneOf([true]),decision_evaluation:outcome_decision_evaluation});
  if(Object.hasOwn(value,'debrief_answer'))return shape(value,{request_id:valid_id,ok:oneOf([true]),debrief_answer:outcome_debrief_answer});
  if(Object.hasOwn(value,'evidence_resolution'))return shape(value,{request_id:valid_id,ok:oneOf([true]),evidence_resolution:outcome_evidence_resolution});
  if(value.ok===false)return shape(value,{request_id:valid_id,ok:oneOf([false]),code:oneOf(codes)},{field_path:path=>['INVALID_REQUEST','CONFIG_PARAMETER_MISSING','CONFIG_UNIT_MISMATCH'].includes(String(value.code))&&valid_public_field_path(path),mission_view:view=>value.code==='STALE_REVISION'&&mission_player_view(view)});
  if(!shape(value,{request_id:valid_id,ok:oneOf([true])},{view:player_view,plan,mission_preview,mission_evaluation:mission_decision_evaluation,receipt,runs:list(run)}))return false;
  const keys=Object.keys(value).filter(key=>key!=='request_id'&&key!=='ok').sort().join(',');
  return ['view','plan','mission_preview','mission_evaluation','receipt','runs','receipt,view'].includes(keys);
}
