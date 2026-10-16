import {record,fields,valid_id} from './protocol';
import {dense_array,type PublicMap} from './spatial';
import {mission_ref,parse_mission_draft,parse_mission_intent} from './mission-protocol';
import {mission_position_knowledge,mission_preview} from './mission-dto';
import type {MissionDecisionHistory,MissionEvaluationRecord,MissionDecisionEvaluation} from './mission-contracts';

type Check=(value:unknown)=>boolean;
const integer:Check=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const text:Check=v=>typeof v==='string'&&[...v].length<=2000;
const one=(...values:unknown[]):Check=>v=>values.includes(v);
const list=(check:Check,max=32):Check=>v=>dense_array(v)&&v.length<=max&&v.every(check);
const shape=(v:unknown,checks:Record<string,Check>)=>record(v)&&fields(v,Object.keys(checks))&&Object.entries(checks).every(([key,check])=>check(v[key]));
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

function history_record(value:unknown,geometry:PublicMap):value is MissionEvaluationRecord{
  if(!record(value)||!valid_id(value.run_id))return false;const run=value.run_id;
  const mission:Check=v=>shape(v,{id:one('M1'),object_revision:q=>integer(q)&&Number(q)>0,status:one('draft'),current_plan_ref:q=>mission_ref(q,run,'plan'),support_refs:list(()=>false,0)});
  const plan:Check=v=>shape(v,{plan_id:valid_id,version:q=>integer(q)&&Number(q)>0,draft:q=>{try{parse_mission_draft(q,run);return true;}catch{return false;}},preview:q=>mission_preview(q)&&record(q)&&q.run_id===run});
  const resources:Check=v=>shape(v,{movement_energy:integer,movement_energy_reserved:integer,equipment_energy:integer,equipment_wear:integer,hq_energy:integer,hq_wear:integer,confirmed_at:q=>integer(q)&&Number(q)<=Number(value.at)});
  // The approved pair records a first attempted choice, before any Order.
  // It cannot supply an arbitrary saved journal, activity, Report or Delivery.
  const known:Record<string,Check>={mission,plan,position_knowledge:q=>mission_position_knowledge(q,geometry,Number(value.at)),resources,phase_results:list(()=>false,0),prior_orders:list(()=>false,0),held_windows:list(()=>false,0),outbound_sent_times:list(()=>false,0)};
  if(!shape(value,{id:valid_id,run_id:one(run),version:one(1),actor:one('staff'),operation:one('issue_mission'),knowledge_revision:q=>integer(q)&&Number(q)>0,view_digest:q=>typeof q==='string'&&/^[a-f0-9]{64}$/.test(q),at:q=>integer(q)&&Number(q)<=900000,actual_intent:q=>{try{parse_mission_intent(q,run);return true;}catch{return false;}},selected_action:q=>shape(q,{kind:one('move'),actor:one('R'),route_ref:r=>mission_ref(r,run,'route')}),plan_ref:q=>mission_ref(q,run,'plan'),phase_ref:q=>mission_ref(q,run,'phase'),authority_ref:q=>mission_ref(q,run,'authority'),order_ref:valid_id,evidence_refs:list(valid_id),reason_status:one('recorded','not_recorded'),...(Object.hasOwn(value,'declared_reason')?{declared_reason:text}:{}),known_then:q=>record(q)&&Object.keys(q).every(key=>Object.hasOwn(known,key)&&known[key](q[key]))}))return false;
  const r=value as unknown as MissionEvaluationRecord,c=r.known_then;
  if(r.reason_status==='recorded'?typeof r.declared_reason!=='string'||!r.declared_reason.trim():Object.hasOwn(r,'declared_reason'))return false;
  if(c.plan){const phase=c.plan.draft.phases.find(p=>p.id===r.phase_ref.id&&p.version===r.phase_ref.version);if(c.plan.plan_id!==r.plan_ref.id||c.plan.version!==r.plan_ref.version||!phase||!equal(r.actual_intent,c.plan.draft.intent)||!equal(r.selected_action,phase.activity)||!equal(r.authority_ref,c.plan.draft.intent.delegation_ref))return false;}
  if(c.mission&&!equal(c.mission.current_plan_ref,r.plan_ref))return false;
  if(c.position_knowledge){const candidates=c.position_knowledge.status==='conflicting'?c.position_knowledge.candidates:[c.position_knowledge];for(const p of candidates)if(p.observed.kind==='known'&&p.observed.value>r.at||p.reported.kind==='known'&&p.reported.value>r.at||p.source_event_time.kind==='known'&&p.source_event_time.value>r.at)return false;}
  return true;
}

export function valid_mission_decision_history(value:unknown,geometry:PublicMap,authority:{id:string;version:number;risk_limits:string[]}):value is MissionDecisionHistory{
  if(!shape(value,{id:one('B22-AT236-HISTORY-01'),version:one(1),source_ref:one('B22-MISSION-DESIGN-1.0.0/mission-contract/AT236/registered-history'),records:q=>dense_array(q)&&q.length===2&&q.every(item=>shape(item,{case_id:one('complete_public_violation','missing_necessary_evidence'),record:r=>history_record(r,geometry)}))}))return false;
  const history=value as MissionDecisionHistory,[full,partial]=history.records;
  if(full.case_id!=='complete_public_violation'||partial.case_id!=='missing_necessary_evidence'||full.record.id===partial.record.id||Object.keys(full.record.known_then).length!==8||Object.keys(partial.record.known_then).length>=8||full.record.authority_ref.id!==authority.id||full.record.authority_ref.version!==authority.version||authority.risk_limits.includes(full.record.actual_intent.acceptable_risk))return false;
  const {id:full_id,known_then:full_context,...full_record}=full.record,{id:partial_id,known_then:partial_context,...partial_record}=partial.record;
  if(!equal(full_record,partial_record)||Object.entries(partial_context).some(([key,entry])=>!equal(entry,Reflect.get(full_context,key))))return false;
  return true;
}

export function mission_decision_evaluation(value:unknown):boolean{
  if(!record(value)||!record(value.decision_ref)||!valid_id(value.decision_ref.run_id))return false;
  const run=value.decision_ref.run_id,ids=['context_completeness','public_rule_compliance','declared_reason_evaluability'];
  const missing:Check=v=>typeof v==='string'&&(['mission','plan','position_knowledge','resources','phase_results','prior_orders','held_windows','outbound_sent_times','plan_or_phase_ref','declared_reason'].includes(v)||/^evidence:[A-Za-z0-9_.-]{1,128}$/.test(v));
  const reference:Check=v=>record(v)&&(v.kind==='evidence'?shape(v,{run_id:one(run),kind:one('evidence'),id:valid_id}):['decision','plan','authority'].includes(String(v.kind))&&mission_ref(v,run,String(v.kind)));
  const source:Check=v=>shape(v,{kind:one('current_run')})||shape(v,{kind:one('registered_history'),catalog_ref:one('B22-AT236-HISTORY-01'),source_ref:one('B22-MISSION-DESIGN-1.0.0/mission-contract/AT236/registered-history')});
  if(!shape(value,{run_id:valid_id,decision_ref:q=>mission_ref(q,run,'decision'),view_revision:q=>integer(q)&&Number(q)>0,known_at_time_ms:q=>integer(q)&&Number(q)<=900000,record_source:source,checks:q=>dense_array(q)&&q.length===3&&q.every((check,index)=>shape(check,{rule_ref:r=>shape(r,{id:one(ids[index]),version:one(1)}),known_then_refs:list(reference,35),result:one('met','violated','not_evaluable'),missing:list(missing,40),violations:list(one('AUTHORITY_DENIED','EVIDENCE_REQUIRED','CONSTRAINT_HOLD','CONSTRAINT_DENIED','STATE_CONFIRMATION_REQUIRED','CAPACITY_CONFLICT','INVALID_REQUEST'),7)}))}))return false;
  const result=value as MissionDecisionEvaluation;
  if(result.record_source.kind==='current_run'&&result.run_id!==run)return false;
  const sameRef=(a:unknown,b:unknown)=>record(a)&&record(b)&&a.run_id===b.run_id&&a.kind===b.kind&&a.id===b.id&&a.version===b.version;
  for(const [index,check] of result.checks.entries()){
    if(!sameRef(check.known_then_refs[0],result.decision_ref)||check.result==='met'&&(check.missing.length>0||check.violations.length>0)||check.result==='not_evaluable'&&(!check.missing.length||check.violations.length>0)||check.result==='violated'&&(index!==1||check.missing.length>0||!check.violations.length))return false;
    if(index===2){if(check.known_then_refs.length!==1)return false;}
    else if(check.known_then_refs.length<3||check.known_then_refs[1].kind!=='plan'||check.known_then_refs[2].kind!=='authority'||index===0&&check.known_then_refs.length!==3||index===1&&(!sameRef(check.known_then_refs[1],result.checks[0].known_then_refs[1])||!sameRef(check.known_then_refs[2],result.checks[0].known_then_refs[2])||check.known_then_refs.slice(3).some(ref=>ref.kind!=='evidence')))return false;
  }
  return true;
}
