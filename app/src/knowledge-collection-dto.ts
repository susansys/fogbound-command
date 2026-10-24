import {record,valid_id} from './protocol';
import {valid_collection_ref} from './knowledge-collection-protocol';
import type {KnowledgeCollectionPlayerView} from './knowledge-collection-contracts';
import {is_collection_report,type CollectionPositionReport} from './knowledge-collection-contracts';
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
  const scope:Check=v=>shape(v,{id:one('B'),version:one(1)}),qualification:Check=v=>shape(v,{id:one('root-R','root-W','root-S'),version:one(1)});
  const rootRegistration:Check=v=>shape(v,{root_ref:ref('source-root'),actor:one('R','W','S'),method_ref:ref('method'),scope,issuer:one('scenario-source-registrar'),issued_at:one(-65000),qualification});
  const credential:Check=v=>shape(v,{id:one('pair-RW','pair-RS','pair-WS'),version:one(1),issuer:one('scenario-source-registrar'),issued_at:one(-65000),roots:list(one('root-R','root-W','root-S'),2),scope:v=>shape(v,{id:one('B'),version:one(1,2)}),registrations:list(w=>shape(w,{root_id:one('root-R','root-W','root-S'),actor:one('R','W','S'),method:one('limited-text-collection','qualified-facility-inspection','historical-survey-text'),qualification}),2)});
  const body:Check=v=>record(v)&&(v.kind==='limited_indication'?shape(v,{kind:one('limited_indication'),field:one('B.condition'),quality:one('limited'),outcome:one('inconclusive'),limits:list(text,10)}):v.kind==='qualified_facility_field'?shape(v,{kind:one('qualified_facility_field'),field:one('B.condition'),condition:one('operable'),object_version:one(1),quality:one('qualified'),outcome:one('detected'),qualification_ref:ref('qualification'),limits:list(text,10)}):v.kind==='collection_failed'?shape(v,{kind:one('collection_failed'),field:one('B.condition'),quality:one('failed'),outcome:one('not_covered'),conclusion:one('unknown'),reason:one('window_closed','empty_scope','local_gate_unknown','local_gate_not_met'),attempted_interval:w=>shape(w,{from:time,to:time}),collection_work_ms:time,limits:list(text,10)}):shape(v,{kind:one('collection_cancelled'),field:one('B.condition'),quality:one('failed'),outcome:one('not_covered'),conclusion:one('unknown'),reason:one('cancelled_before_start'),collection_work_ms:one(0),limits:list(text,10)}));
  const report:Check=v=>shape(v,{ref:ref('report'),source_actor:one('R','W'),method:one('limited-text-collection','qualified-facility-inspection','task-control-receipt'),target_ref:ref('facility'),scope_ref:ref('scope'),method_ref:ref('method'),requested_method_ref:ref('method'),observation_ref:nullable(ref('observation')),record_ref:nullable(ref('record')),observed_time:observed,generated_at:time,source_reported_time:w=>shape(w,{kind:one('unknown')}),body,control_outcomes:list(w=>shape(w,{request_ref:ref('cancellation'),result:one('cancelled','already_started','already_completed'),decided_at:time}),1),resource_snapshot:w=>shape(w,{actor:one('R','W'),at:time,energy_used_j:number}),coverage:w=>shape(w,coverage),content_digest:digest,...(record(v)&&Object.hasOwn(v,'root_registration')?{root_registration:rootRegistration}:{})});
  const original:Check=v=>shape(v,{id:one('archive-B-S-report'),version:one(1),author:one('S'),observed_at:one(-60000),generated_at:one(-59000),scope:w=>shape(w,{id:one('B'),version:one(1)}),method:one('historical-survey-text'),text,limits:list(text,10)});
  const historical:Check=v=>shape(v,{ref:ref('report'),source_actor:one('S'),method:one('historical-survey-text'),target_ref:ref('facility'),scope_ref:ref('scope'),method_ref:ref('method'),observation_ref:ref('observation'),record_ref:one(null),observed_time:w=>shape(w,{kind:one('known'),value:one(-60000),evidence:ref('observation')}),generated_at:one(-59000),source_reported_time:w=>shape(w,{kind:one('unknown')}),root_registration:rootRegistration,body:w=>shape(w,{kind:one('historical_survey'),field:one('B.condition'),quality:one('limited'),outcome:one('inconclusive'),original,original_digest:digest,limits:list(text,10)}),content_digest:digest});
  const positionReport:Check=v=>shape(v,{ref:ref('report'),source_actor:one('R'),method:one('self-position-registration','collection-end-self-position'),target_ref:ref('actor'),scope_ref:ref('scope'),method_ref:ref('method'),observation_ref:ref('observation'),observed_time:w=>shape(w,{kind:one('known'),value:time,evidence:ref('observation')}),generated_at:time,source_reported_time:w=>shape(w,{kind:one('known'),value:time,evidence:ref('registration')}),body:w=>shape(w,{kind:one('self_position'),field:one('R.position'),quality:one('registered'),outcome:one('recorded'),point,geometry_version:digest,route_version:digest,qualification_ref:ref('qualification'),limits:list(text,10)}),content_digest:digest});
  const archiveReceipt:Check=v=>shape(v,{request_ref:ref('archive_request'),reader:one('R'),entry:one('survey','revocation','contradiction'),read_started_at:time,read_completed_at:time,registered_at:time,available_credential_roles:list(one('pair-RW','pair-RS','pair-WS'),3)});
  if(!shape(value,{
    scenario_kind:one('play_knowledge_collection'),case_ref:one('KA-NORMAL-01','KA-SOURCE3-01','KA-LATE-POSITION-01'),run_id:valid_id,revision:v=>time(v)&&Number(v)>=1,sim_time:time,mode:one('research','command'),rate:one(1,2,4),paused:bool,finished:bool,source_run:nullable(valid_id),status:one('ready'),can_issue:bool,next_action:text,gap:text,
    source_relationships:v=>shape(v,{field_scope:one('B.condition'),content_delivery_count:time,report_identity_count:time,global_independence:w=>shape(w,{kind:one('unknown')})||shape(w,{kind:one('confirmed'),count:one(3),scope}),confirmed_pairs:list(w=>shape(w,{credential_ref:ref('source-credential'),roots:list(ref('source-root'),2),scope,status:one('valid','invalidated'),invalidation_ref:nullable(ref('source_notice_delivery'))}),3)}),
    actors:list(v=>shape(v,{id:one('R','W'),position:w=>shape(w,{point,observed_at:time,received_at:time,evidence:valid_id})}),2),
    public_rules:v=>shape(v,{deadline:one(900000),receipt_grace:one(10000),cleanup_duration:one(322000)}),geometry:v=>shape(v,{unit:one('m'),metres_per_coordinate:one(1),points:w=>shape(w,{H:point,A:point,B:point})}),
    replay_nodes:list(v=>shape(v,{revision:time,at:time,meaningful:bool,label:text})),
    collection_requests:list(v=>shape(v,{ref:ref('collection_request'),actor:one('R','W'),issued_at:time,status:one('tasking','collecting','processing','inconclusive','answered','expired','cancelled'),local_receipt:nullable(w=>shape(w,{kind:one('cancelled_before_send'),at:time,remote_task_created:one(false)})),acknowledgement:nullable(w=>shape(w,{stage:one('waiting_window','waiting_gate','refused_gate','collecting'),sent_at:time,received_at:time,planned_start_at:time}))})),
    archive_requests:list(v=>shape(v,{ref:ref('archive_request'),actor:one('R'),entry:one('survey','revocation','contradiction'),issued_at:time,status:one('tasking','reading','completed','failed'),acknowledgement:nullable(w=>shape(w,{sent_at:time,received_at:time})),terminal_receipt:nullable(w=>shape(w,{outcome:one('completed','not_at_site','capacity','deadline'),sent_at:time,received_at:time}))})),
    source_forward_requests:list(v=>shape(v,{ref:ref('source_forward'),issued_at:time,status:one('tasking','completed','failed'),receipt:nullable(w=>shape(w,{outcome:one('completed','not_available','busy','already_forwarded'),sent_at:time,received_at:time}))})),
    return_requests:list(v=>shape(v,{ref:ref('return_request'),actor:one('R','W'),issued_at:time,acknowledgement:nullable(w=>shape(w,{sent_at:time,received_at:time,outcome:one('moving','capacity')}))}),2),
    position_requests:list(v=>shape(v,{ref:ref('position_request'),kind:one('request_self_position','forward_position_report'),issued_at:time,acknowledgement:nullable(w=>shape(w,{sent_at:time,received_at:time})),terminal_receipt:nullable(w=>shape(w,{sent_at:time,received_at:time,outcome:one('completed','capacity','not_available','deadline')}))})),
    source_notices:list(v=>shape(v,{ref:ref('source_notice_delivery'),notice:w=>shape(w,{id:one('notice-WS-revocation','notice-WS-contradiction'),version:one(1),issuer:one('scenario-source-registrar'),issued_at:one(-10000),kind:one('revocation','contradiction'),credential_id:one('pair-WS'),scope,reason:text}),notice_digest:digest,message_ref:ref('message'),archive_read_receipt:archiveReceipt,sender:one('R'),recipient:one('HQ'),sent_at:time,received_at:time,knowledge_seq:time}),2),
    source_credentials:list(v=>shape(v,{ref:ref('credential_delivery'),credential,credential_digest:digest,message_ref:ref('message'),reader_request_ref:ref('archive_request'),sender:one('R'),recipient:one('HQ'),sent_at:time,received_at:time,knowledge_seq:time}),3),
    reports:list(v=>report(v)||historical(v)||positionReport(v)),deliveries:list(v=>shape(v,{ref:ref('delivery'),report_ref:ref('report'),message_ref:ref('message'),sender:one('R','W'),recipient:one('HQ'),sent_at:time,received_at:time,knowledge_seq:time,...(record(v)&&Object.hasOwn(v,'archive_read_receipt')?{archive_read_receipt:archiveReceipt}:{}),...(record(v)&&Object.hasOwn(v,'position_receipt')?{position_receipt:w=>shape(w,{request_ref:ref('position_request'),accepted_at:time})}:{})})),
    coverage:list(v=>shape(v,{ref:ref('coverage'),report_ref:ref('report'),delivery_ref:ref('delivery'),quality:one('limited','qualified','failed'),outcome:one('inconclusive','detected','not_covered'),observed_time:observed,method_ref:ref('method'),limits:list(text,10),...coverage})),
    facility_knowledge:nullable(v=>shape(v,{field:one('B.condition'),condition:one('operable'),scope_ref:ref('scope'),observed_at:time,received_at:time,report_ref:ref('report'),correction_ref:nullable(ref('correction'))})),
    assessments:list(v=>shape(v,{ref:ref('assessment'),recorded_at:time,field:one('B.condition'),conclusion:one('unconfirmed','operable','faulted'),basis_refs:list(ref('report'),10),reason:w=>shape(w,{kind:one('not_recorded')})||shape(w,{kind:one('recorded'),text}),context_digest:digest})),
    correction_records:list(v=>shape(v,{ref:ref('correction'),field:one('B.condition'),scope_ref:ref('scope'),superseded_report_ref:ref('report'),new_report_ref:ref('report'),delivery_ref:ref('delivery'),recorded_at:time,effective_knowledge_seq:time})),
  }))return false;
  const view=value as unknown as KnowledgeCollectionPlayerView;
  const content=new Set(view.reports.filter(report=>report.body.field==='B.condition'&&report.body.quality!=='failed').map(report=>report.ref.id));
  for(const delivery of view.source_notices){
    const receipt=delivery.archive_read_receipt,request=view.archive_requests.find(item=>item.ref.id===receipt.request_ref.id);
    if(!request||request.entry!==delivery.notice.kind||receipt.entry!==delivery.notice.kind||request.status!=='completed'||request.terminal_receipt?.received_at!==delivery.received_at||delivery.notice.id!=='notice-WS-'+delivery.notice.kind||receipt.read_started_at<request.issued_at+1000||receipt.read_completed_at!==receipt.read_started_at+2000||receipt.registered_at!==receipt.read_completed_at+1000||delivery.sent_at<receipt.registered_at||delivery.received_at!==delivery.sent_at+1000||delivery.received_at>view.sim_time||delivery.knowledge_seq<1)return false;
  }
  const actualPairs:typeof view.source_relationships.confirmed_pairs=[];
  for(const delivery of view.source_credentials){
    const request=view.archive_requests.find(item=>item.ref.id===delivery.reader_request_ref.id),receipt=view.deliveries.find(item=>item.archive_read_receipt?.request_ref.id===delivery.reader_request_ref.id)?.archive_read_receipt;
    const c=delivery.credential,expectedRoots=c.id==='pair-RW'?['root-R','root-W']:c.id==='pair-RS'?['root-R','root-S']:['root-W','root-S'];
    if(!request||!receipt||delivery.sent_at<receipt.registered_at||delivery.received_at!==delivery.sent_at+1000||delivery.received_at>view.sim_time||delivery.knowledge_seq<1||!receipt.available_credential_roles.includes(c.id)||!same(c.roots,expectedRoots)||c.registrations.length!==2)return false;
    const roots=[];
    for(const root of c.roots){
      const registration=c.registrations.find(item=>item.root_id===root),report=view.reports.find(item=>content.has(item.ref.id)&&item.root_registration?.root_ref.id===root),own=report?.root_registration;
      if(!registration||!report||!own||own.actor!==report.source_actor||own.actor!==registration.actor||own.method_ref.id!==report.method||own.method_ref.id!==registration.method||!same(own.scope,c.scope)||own.issuer!==c.issuer||own.issued_at!==c.issued_at||!same(own.qualification,registration.qualification))break;
      roots.push(own.root_ref);
    }
    const invalidation=view.source_notices.find(item=>item.notice.credential_id===c.id&&item.notice.issuer===c.issuer&&item.notice.issued_at>=c.issued_at&&same(item.notice.scope,c.scope));
    if(roots.length===2)actualPairs.push({credential_ref:{run_id:run,kind:'source-credential',id:c.id,version:1},roots,scope:{id:'B',version:1},status:invalidation?'invalidated':'valid',invalidation_ref:invalidation?.ref??null});
  }
  if(new Set(view.source_credentials.map(item=>item.credential.id)).size!==view.source_credentials.length||!same(actualPairs,view.source_relationships.confirmed_pairs))return false;
  const full=new Set(actualPairs.filter(pair=>pair.status==='valid').map(pair=>pair.roots.map(root=>root.id).sort().join('/')));
  const independent=['root-R/root-W','root-R/root-S','root-S/root-W'].every(pair=>full.has(pair));
  if(!same(view.source_relationships.global_independence,independent?{kind:'confirmed',count:3,scope:{id:'B',version:1}}:{kind:'unknown'}))return false;
  if(view.source_relationships.report_identity_count!==content.size||view.source_relationships.content_delivery_count!==view.deliveries.filter(delivery=>content.has(delivery.report_ref.id)).length)return false;
  if(view.actors.length!==2||new Set(view.actors.map(actor=>actor.id)).size!==2||view.reports.length!==new Set(view.deliveries.map(delivery=>delivery.report_ref.id)).size||view.coverage.length!==view.reports.filter(is_collection_report).length)return false;
  for(const records of [view.collection_requests,view.archive_requests,view.position_requests,view.return_requests,view.source_forward_requests,view.reports,view.deliveries,view.source_credentials,view.source_notices,view.coverage,view.assessments,view.correction_records])if(new Set(records.map(item=>item.ref.id)).size!==records.length)return false;
  const messages=[...view.deliveries,...view.source_credentials,...view.source_notices];
  if(new Set(messages.map(item=>item.message_ref.id)).size!==messages.length||new Set(messages.map(item=>item.knowledge_seq)).size!==messages.length)return false;
  const acknowledgement=(issued_at:number,ack:{sent_at:number;received_at:number}|null)=>!ack||ack.sent_at>=issued_at+1000&&ack.received_at===ack.sent_at+1000&&ack.received_at<=view.sim_time;
  for(const request of [...view.return_requests,...view.position_requests,...view.archive_requests])if(request.issued_at>view.sim_time||!acknowledgement(request.issued_at,request.acknowledgement))return false;
  for(const request of [...view.position_requests,...view.archive_requests])if(!acknowledgement(request.issued_at,request.terminal_receipt))return false;
  for(const request of view.source_forward_requests)if(request.issued_at>view.sim_time||!acknowledgement(request.issued_at,request.receipt))return false;
  const positions=view.reports.filter((report):report is CollectionPositionReport=>report.method==='self-position-registration'||report.method==='collection-end-self-position').sort((a,b)=>b.observed_time.value-a.observed_time.value);
  for(const actor of view.actors){
    const latest=actor.id==='R'?positions[0]:undefined;
    const expected=latest?{point:latest.body.point,observed_at:latest.observed_time.value,received_at:view.deliveries.find(delivery=>delivery.report_ref.id===latest.ref.id)?.received_at,evidence:latest.ref.id}:{point:[250,150],observed_at:0,received_at:0,evidence:'KA-BRIEF-INITIAL-'+actor.id};
    if(!same(actor.position,expected))return false;
  }
  for(const request of view.collection_requests){
    if(request.issued_at>view.sim_time)return false;
    const ack=request.acknowledgement;
    if(ack){
      const earliest=Math.max(request.actor==='R'?1000:60000,request.issued_at+1000),windowEnd=request.actor==='R'?31000:91000;
      if(ack.planned_start_at<earliest||ack.planned_start_at>=windowEnd||ack.sent_at<request.issued_at+1000||ack.received_at!==ack.sent_at+1000||ack.received_at>view.sim_time)return false;
    }
  }
  for(const delivery of view.deliveries){
    const report=view.reports.find(item=>item.ref.id===delivery.report_ref.id);
    if(!report||delivery.sender!==(is_collection_report(report)?report.source_actor:'R')||delivery.sent_at<report.generated_at||delivery.received_at!==delivery.sent_at+1000||delivery.received_at>view.sim_time||delivery.knowledge_seq<1)return false;
  }
  for(const report of view.reports){
    if(report.method==='self-position-registration'||report.method==='collection-end-self-position'){
      const delivery=view.deliveries.find(item=>item.report_ref.id===report.ref.id),receipt=delivery?.position_receipt,request=view.position_requests.find(item=>item.ref.id===receipt?.request_ref.id);
      if(view.case_ref!=='KA-LATE-POSITION-01'||!delivery||!receipt||!request||request.terminal_receipt?.outcome!=='completed'||request.terminal_receipt.received_at!==delivery.received_at||receipt.accepted_at<request.issued_at+1000||delivery.sent_at<receipt.accepted_at||report.target_ref.id!=='R'||report.scope_ref.id!=='R-self'||report.method_ref.id!==report.method||report.body.qualification_ref.id!=='R-SELF-POSITION'||report.body.geometry_version!==report.body.route_version||report.body.point[1]!==150||report.body.point[0]<50||report.body.point[0]>250||report.observed_time.value>report.generated_at||report.source_reported_time.value!==report.generated_at||!same(report.observed_time.evidence,report.observation_ref))return false;
      if(report.method==='self-position-registration'){
        if(request.kind!=='request_self_position'||report.ref.id!=='R-self-position-new'||report.generated_at!==receipt.accepted_at+1000||report.observed_time.value!==report.generated_at||report.observation_ref.id!==request.ref.id+'.observation'||report.source_reported_time.evidence.id!==request.ref.id+'.registration')return false;
      }else{
        const original=view.reports.filter(is_collection_report).find(item=>item.source_actor==='R'&&item.body.kind==='limited_indication'&&item.observation_ref?.id===report.observation_ref.id);
        if(request.kind!=='forward_position_report'||report.ref.id!=='R-self-position-old'||!original||original.observed_time.kind!=='known'||original.observed_time.value!==report.observed_time.value||original.generated_at!==report.generated_at||report.body.point[0]!==250)return false;
      }
      continue;
    }
    if(!is_collection_report(report)){
      const delivery=view.deliveries.find(item=>item.report_ref.id===report.ref.id),receipt=delivery?.archive_read_receipt;
      const request=view.archive_requests.find(item=>item.ref.id===receipt?.request_ref.id);
      if(report.method!=='historical-survey-text'||!delivery||!receipt||!request||request.status!=='completed'||request.terminal_receipt?.outcome!=='completed'||request.terminal_receipt.received_at!==delivery.received_at||report.ref.id!=='archive-B-S-report'||report.target_ref.id!=='B'||report.scope_ref.id!=='B'||report.method_ref.id!=='historical-survey-text'||report.observation_ref.id!=='archive-B-S-report.historical'||!same(report.observed_time.evidence,report.observation_ref)||receipt.read_started_at<request.issued_at+1000||receipt.read_completed_at!==receipt.read_started_at+2000||receipt.registered_at!==receipt.read_completed_at+1000||delivery.sent_at<receipt.registered_at||!same(report.body.limits,report.body.original.limits))return false;
      continue;
    }
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
  for(const assessment of view.assessments){
    if(assessment.recorded_at>view.sim_time||!assessment.basis_refs.length||new Set(assessment.basis_refs.map(ref=>ref.id)).size!==assessment.basis_refs.length||assessment.basis_refs.some(ref=>!view.deliveries.some(delivery=>delivery.report_ref.id===ref.id&&delivery.received_at<=assessment.recorded_at)))return false;
  }
  for(const correction of view.correction_records){
    const prior=view.reports.find(report=>report.ref.id===correction.superseded_report_ref.id),next=view.reports.find(report=>report.ref.id===correction.new_report_ref.id),delivery=view.deliveries.find(item=>item.ref.id===correction.delivery_ref.id);
    if(prior?.body.kind!=='limited_indication'||next?.body.kind!=='qualified_facility_field'||!delivery||delivery.report_ref.id!==next.ref.id||correction.scope_ref.id!==next.scope_ref.id||correction.recorded_at!==delivery.received_at||correction.effective_knowledge_seq!==delivery.knowledge_seq)return false;
  }
  const facility=view.facility_knowledge;
  if(facility){
    const report=view.reports.find(item=>item.ref.id===facility.report_ref.id),delivery=view.deliveries.find(item=>item.report_ref.id===facility.report_ref.id);
    if(report?.body.kind!=='qualified_facility_field'||report.observed_time.kind!=='known'||!delivery||facility.scope_ref.id!==report.scope_ref.id||facility.observed_at!==report.observed_time.value||facility.received_at!==delivery.received_at||facility.condition!==report.body.condition||facility.correction_ref!==null&&!view.correction_records.some(item=>item.ref.id===facility.correction_ref!.id&&item.new_report_ref.id===report.ref.id))return false;
  }
  return true;
}
export async function verify_collection_report_digests(view:KnowledgeCollectionPlayerView):Promise<boolean>{
  const sha=async(value:unknown)=>{
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical_public(value))));
    return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
  };
  for(const report of view.reports){
    const {content_digest,...content}=report;
    if(await sha(content)!==content_digest)return false;
    if(report.method==='historical-survey-text'&&await sha(report.body.original)!==report.body.original_digest)return false;
    if((report.method==='self-position-registration'||report.method==='collection-end-self-position')&&await sha(view.geometry)!==report.body.geometry_version)return false;
  }
  for(const delivery of view.source_credentials)if(await sha(delivery.credential)!==delivery.credential_digest)return false;
  for(const delivery of view.source_notices)if(await sha(delivery.notice)!==delivery.notice_digest)return false;
  return true;
}
