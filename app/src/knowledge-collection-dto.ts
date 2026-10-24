import {record,valid_id} from './protocol';
import {valid_collection_ref} from './knowledge-collection-protocol';
import type {KnowledgeCollectionPlayerView} from './knowledge-collection-contracts';
type Check=(value:unknown)=>boolean;
const one=(...values:unknown[]):Check=>v=>values.includes(v);
const time:Check=v=>Number.isSafeInteger(v)&&Number(v)>=0;
const number:Check=v=>typeof v==='number'&&Number.isFinite(v);
const text:Check=v=>typeof v==='string'&&v.length<=2000;
const bool:Check=v=>typeof v==='boolean';
const shape=(v:unknown,checks:Record<string,Check>):boolean=>record(v)&&Object.keys(v).length===Object.keys(checks).length&&Object.entries(checks).every(([key,check])=>Object.hasOwn(v,key)&&check(v[key]));
const list=(check:Check,max=100):Check=>v=>Array.isArray(v)&&v.length<=max&&Object.keys(v).length===v.length&&Array.from({length:v.length},(_,i)=>i).every(i=>Object.hasOwn(v,i)&&check(v[i]));
const nullable=(check:Check):Check=>v=>v===null||check(v);
const point:Check=v=>Array.isArray(v)&&v.length===2&&list(number,2)(v);
const rectangle:Check=v=>shape(v,{min_x:number,max_x:number,min_y:number,max_y:number})&&record(v)&&Number(v.max_x)>Number(v.min_x)&&Number(v.max_y)>Number(v.min_y);
const digest:Check=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function canonical_public(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical_public);
  if(record(value))return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical_public(item)]));
  return value;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical_public(a))===JSON.stringify(canonical_public(b));
export function knowledge_collection_player_view(value:unknown):value is KnowledgeCollectionPlayerView{
  if(!record(value)||!valid_id(value.run_id))return false;
  const run=value.run_id,ref=(kind:string):Check=>v=>valid_collection_ref(v,run,kind);
  const observed:Check=v=>shape(v,{kind:one('unknown')})||shape(v,{kind:one('known'),value:time,evidence:ref('observation')});
  const coverage:Record<string,Check>={planned_scope:rectangle,actual_scope:list(rectangle,20),planned_area_m2:number,actual_area_m2:nullable(number),geometry_version:digest,model_version:one(1)};
  const body:Check=v=>record(v)&&(v.kind==='limited_indication'?shape(v,{kind:one('limited_indication'),field:one('B.condition'),quality:one('limited'),outcome:one('inconclusive'),limits:list(text,10)}):v.kind==='qualified_facility_field'?shape(v,{kind:one('qualified_facility_field'),field:one('B.condition'),condition:one('operable'),object_version:one(1),quality:one('qualified'),outcome:one('detected'),qualification_ref:ref('qualification'),limits:list(text,10)}):v.kind==='collection_failed'?shape(v,{kind:one('collection_failed'),field:one('B.condition'),quality:one('failed'),outcome:one('not_covered'),conclusion:one('unknown'),reason:one('window_closed','empty_scope','local_gate_unknown','local_gate_not_met'),attempted_interval:w=>shape(w,{from:time,to:time}),collection_work_ms:time,limits:list(text,10)}):shape(v,{kind:one('collection_cancelled'),field:one('B.condition'),quality:one('failed'),outcome:one('not_covered'),conclusion:one('unknown'),reason:one('cancelled_before_start'),collection_work_ms:one(0),limits:list(text,10)}));
  const report:Check=v=>shape(v,{ref:ref('report'),source_actor:one('R','W'),method:one('limited-text-collection','qualified-facility-inspection','task-control-receipt'),target_ref:ref('facility'),scope_ref:ref('scope'),method_ref:ref('method'),requested_method_ref:ref('method'),observation_ref:nullable(ref('observation')),record_ref:nullable(ref('record')),observed_time:observed,generated_at:time,source_reported_time:w=>shape(w,{kind:one('unknown')}),body,control_outcomes:list(w=>shape(w,{request_ref:ref('cancellation'),result:one('cancelled','already_started','already_completed'),decided_at:time}),1),resource_snapshot:w=>shape(w,{actor:one('R','W'),at:time,energy_used_j:number}),coverage:w=>shape(w,coverage),content_digest:digest});
  if(!shape(value,{
    scenario_kind:one('play_knowledge_collection'),run_id:valid_id,revision:v=>time(v)&&Number(v)>=1,sim_time:time,mode:one('research','command'),rate:one(1,2,4),paused:bool,finished:bool,source_run:nullable(valid_id),status:one('ready'),can_issue:bool,next_action:text,gap:text,
    actors:list(v=>shape(v,{id:one('R','W'),position:w=>shape(w,{point,observed_at:time,received_at:time,evidence:valid_id})}),2),
    public_rules:v=>shape(v,{deadline:one(900000),receipt_grace:one(10000),cleanup_duration:one(322000)}),geometry:v=>shape(v,{unit:one('m'),metres_per_coordinate:one(1),points:w=>shape(w,{H:point,A:point,B:point})}),
    replay_nodes:list(v=>shape(v,{revision:time,at:time,meaningful:bool,label:text})),
    collection_requests:list(v=>shape(v,{ref:ref('collection_request'),actor:one('R','W'),issued_at:time,status:one('tasking','collecting','processing','inconclusive','answered','expired','cancelled'),local_receipt:nullable(w=>shape(w,{kind:one('cancelled_before_send'),at:time,remote_task_created:one(false)})),acknowledgement:nullable(w=>shape(w,{stage:one('waiting_window','waiting_gate','refused_gate','collecting'),sent_at:time,received_at:time,planned_start_at:time}))})),
    reports:list(report),deliveries:list(v=>shape(v,{ref:ref('delivery'),report_ref:ref('report'),message_ref:ref('message'),sender:one('R','W'),recipient:one('HQ'),sent_at:time,received_at:time,knowledge_seq:time})),
    coverage:list(v=>shape(v,{ref:ref('coverage'),report_ref:ref('report'),delivery_ref:ref('delivery'),quality:one('limited','qualified','failed'),outcome:one('inconclusive','detected','not_covered'),observed_time:observed,method_ref:ref('method'),limits:list(text,10),...coverage})),facility_knowledge:one(null),
  }))return false;
  const view=value as unknown as KnowledgeCollectionPlayerView;
  if(view.actors.length!==2||new Set(view.actors.map(actor=>actor.id)).size!==2||view.reports.length!==view.deliveries.length||view.coverage.length!==view.reports.length)return false;
  for(const records of [view.collection_requests,view.reports,view.deliveries,view.coverage])if(new Set(records.map(item=>item.ref.id)).size!==records.length)return false;
  for(const request of view.collection_requests){
    if(request.issued_at>view.sim_time)return false;
    const ack=request.acknowledgement;
    if(ack){
      const earliest=Math.max(request.actor==='R'?1000:60000,request.issued_at+1000),windowEnd=request.actor==='R'?31000:91000;
      if(ack.planned_start_at<earliest||ack.planned_start_at>=windowEnd||ack.sent_at<request.issued_at+1000||ack.received_at!==ack.sent_at+1000||ack.received_at>view.sim_time)return false;
    }
  }
  for(const report of view.reports){
    const delivery=view.deliveries.find(item=>item.report_ref.id===report.ref.id),known=view.coverage.find(item=>item.report_ref.id===report.ref.id);
    const request=view.collection_requests.find(item=>report.ref.id===item.ref.id+'.report');
    if(!request||request.actor!==report.source_actor||request.issued_at>view.sim_time)return false;
    const method=request.actor==='R'?'limited-text-collection':'qualified-facility-inspection',scope=request.actor==='R'?'B-LIMITED':'B-QUALIFIED';
    if(report.target_ref.id!=='B'||report.scope_ref.id!==scope||report.requested_method_ref.id!==method)return false;
    if(report.body.kind==='collection_cancelled'){
      if(report.method!=='task-control-receipt'||report.method_ref.id!=='task-control-receipt')return false;
    }else if(report.method!==method||report.method_ref.id!==method)return false;
    if(report.body.quality!=='failed'){
      if(!report.observation_ref||!report.record_ref||report.observed_time.kind!=='known'||!request.acknowledgement)return false;
      if(report.observation_ref.id!==request.ref.id+'.observation'||report.record_ref.id!==request.ref.id+'.record')return false;
      const duration=request.actor==='R'?29000:30000,registration=request.actor==='R'?1000:2000;
      const observedAt=report.observed_time.value,start=request.acknowledgement.planned_start_at;
      if(observedAt<start+duration||observedAt>(request.actor==='R'?31000:91000)||report.generated_at!==observedAt+registration)return false;
      if(request.acknowledgement.stage==='collecting'&&observedAt!==start+duration)return false;
      const planned=request.actor==='R'?{min_x:245,max_x:255,min_y:145,max_y:155}:{min_x:249,max_x:251,min_y:149,max_y:151};
      const actual=request.actor==='R'?{min_x:245,max_x:250,min_y:145,max_y:155}:planned;
      if(!same(report.coverage.planned_scope,planned)||!same(report.coverage.actual_scope,[actual])||report.coverage.actual_area_m2!==(request.actor==='R'?50:4)||report.coverage.planned_area_m2!==(request.actor==='R'?100:4))return false;
      if(request.actor==='R'&&report.body.kind!=='limited_indication')return false;
      if(request.actor==='W'&&(report.body.kind!=='qualified_facility_field'||report.body.qualification_ref.id!=='W-FACILITY-INSPECTOR'))return false;
    }
    if(!delivery||!known||delivery.sender!==report.source_actor||delivery.sent_at<report.generated_at||delivery.received_at<delivery.sent_at||delivery.received_at>view.sim_time||report.resource_snapshot.actor!==report.source_actor||report.resource_snapshot.at!==report.generated_at)return false;
    if(report.observed_time.kind==='known'&&(report.observed_time.value>report.generated_at||report.observation_ref?.id!==report.observed_time.evidence.id))return false;
    if(report.body.quality==='failed'&&(report.observation_ref!==null||report.record_ref!==null||report.observed_time.kind!=='unknown'||report.coverage.actual_scope.length!==0||report.coverage.actual_area_m2!==null))return false;
    if(known.delivery_ref.id!==delivery.ref.id||known.quality!==report.body.quality||known.outcome!==report.body.outcome||JSON.stringify(known.observed_time)!==JSON.stringify(report.observed_time)||JSON.stringify(known.method_ref)!==JSON.stringify(report.method_ref))return false;
    if(!same(known.limits,report.body.limits)||delivery.received_at!==delivery.sent_at+1000)return false;
    for(const key of Object.keys(coverage) as Array<keyof typeof report.coverage>)if(JSON.stringify(known[key])!==JSON.stringify(report.coverage[key]))return false;
  }
  return true;
}
export async function verify_collection_report_digests(view:KnowledgeCollectionPlayerView):Promise<boolean>{
  for(const report of view.reports){
    const {content_digest,...content}=report;
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical_public(content))));
    const actual=Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
    if(actual!==content_digest)return false;
  }
  return true;
}
