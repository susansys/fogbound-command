import {record,fields,valid_id} from './protocol';import {dense_array} from './spatial';import {intelligence_player_view} from './intelligence-dto';import {parse_outcome_envelope} from './outcome-protocol';
import type {OutcomePlayerView} from './outcome-contracts';
import {public_cleanup_complete} from './outcome-contracts';
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const one=(v:unknown,...values:unknown[])=>values.includes(v);
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const ref=(v:unknown,kind:string,run:unknown)=>record(v)&&fields(v,['run_id','kind','id','version'])&&v.run_id===run&&v.kind===kind&&valid_id(v.id)&&v.version===1;
const observed=(v:unknown,at:number)=>record(v)&&fields(v,['kind','value','evidence'])&&v.kind==='known'&&integer(v.value)&&v.value<=at&&valid_id(v.evidence);
const unknown=(v:unknown)=>record(v)&&fields(v,['kind'])&&v.kind==='unknown';
const extra=['decision_records','continuation_records','return_reports','reception_reports','verification_reports','verification_feedback','return_candidates','return_plans','handover','termination','outcome','hard_boundary','verification_receipt_delay','public_obligations','progress','abort_reports'];
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
// Run only after the individual public reports and deliveries have been checked.
// A self-consistent result vector is not evidence that its stages occurred.
function outcomeEvidence(view:OutcomePlayerView):boolean{
 if(view.hard_boundary&&view.sim_time>view.hard_boundary.hard_close_time||view.termination&&view.sim_time>view.termination.cleanup_deadline)return false;
 const outcome=view.outcome;if(!outcome)return true;
 if(view.termination){
  if(view.sim_time<view.termination.cleanup_deadline&&view.public_obligations.length>0&&!public_cleanup_complete(view,outcome))return false;
 }else if(outcome.result!=='success'&&view.sim_time!==view.hard_boundary?.hard_close_time&&view.sim_time!==view.public_rules.deadline+view.public_rules.receipt_grace)return false;
 const receptions=view.reception_reports.filter(item=>item.report.phase==='completed');
 const returns=view.return_reports.filter(item=>item.report.phase==='completed');
 const artifactIds=[...new Set([...view.field_reports.flatMap(item=>item.report.artifact?[item.report.artifact.ref.id]:[]),...receptions.flatMap(item=>item.report.artifact_refs.map(ref=>ref.id)),...view.verification_reports.flatMap(item=>item.report.artifacts.map(artifact=>artifact.artifact_ref.id))])].sort();
 if(!equal(outcome.artifact_status.map(item=>item.id),artifactIds))return false;
 for(const item of outcome.artifact_status){
  const acquisition=view.field_reports.find(proof=>proof.report.artifact?.ref.id===item.id);
  const reception=receptions.find(proof=>proof.report.artifact_refs.some(ref=>ref.id===item.id));
  const verification=view.verification_reports.find(proof=>proof.report.artifacts.some(artifact=>artifact.artifact_ref.id===item.id&&artifact.status==='verified'));
  if(item.acquired_at!==(acquisition?.report.artifact?.created_at??null)||item.delivered_at!==(reception?.report.observed.value??null)||item.verified_at!==(verification?.report.observed.value??null)||item.confirmed_at!==(verification?.delivery.received??null)||item.qualified!==(!!verification&&verification.report.observed.value<=outcome.scoring_cutoff))return false;
 }
 for(const item of outcome.personnel_status){
  const actor=item.id.startsWith('R-')?'R':'W';
  const returned=returns.find(proof=>proof.report.actor===actor),reception=receptions.find(proof=>proof.report.people_ids.includes(item.id));
  const verification=view.verification_reports.find(proof=>proof.report.personnel.some(person=>person.person_id===item.id&&person.status==='verified'));
  if(item.returned_at!==(returned?.report.observed.value??null)||item.received_at!==(reception?.report.observed.value??null)||item.verified_at!==(verification?.report.observed.value??null)||item.confirmed_at!==(verification?.delivery.received??null))return false;
 }
 return true;
}
function reportSubject(r:Record<string,unknown>,decisions:unknown[],run:unknown){
 if(!one(r.subject_actor,'R','W')||!ref(r.original_decision_ref,'decision_record',run)||!record(r.original_decision_ref))return false;const originalRef=r.original_decision_ref;
 const decision=decisions.find(d=>record(d)&&record(d.ref)&&d.ref.id===originalRef.id);return record(decision)&&record(decision.intent)&&decision.intent.kind==='return_and_deliver'&&record(decision.intent.actor_ref)&&decision.intent.actor_ref.id===r.subject_actor;
}
function initialPosition(base:Record<string,unknown>){
 const geometry=base.geometry,scope=record(geometry)&&dense_array(geometry.scopes)?geometry.scopes.find(s=>record(s)&&s.id==='H'):undefined;
 return {status:record(scope)&&scope.kind!=='unresolved'?'known_scope':'unresolved',...(record(scope)&&scope.kind!=='unresolved'?{scope}:{}),observed:{kind:'known',value:0,evidence:'B23-INITIAL-R-H'},reported:{kind:'unknown'},source_event_time:{kind:'unknown'},received:null,provenance:{kind:'registered_initial',initial_evidence_ref:'B23-INITIAL-R-H'},evidence_refs:['B23-INITIAL-R-H']};
}
function knowledge(v:unknown,base:Record<string,unknown>,at:number){
 if(!record(v)||!fields(v,['actors','received_reports','processing','plan'])||!dense_array(v.actors)||!record(v.processing)||v.actors.some(a=>!record(a)||!integer(a.confirmed_at)||a.confirmed_at>at)||!integer(v.processing.confirmed_at)||v.processing.confirmed_at>at)return false;
 // Reuse the existing strict public fragments in a validation-only context.
 // Unrelated later facts are excluded; this object is never sent or committed.
 return intelligence_player_view({...base,sim_time:at,revision:1,actors:v.actors,received_reports:v.received_reports,processing:v.processing,plan:v.plan,source_groups:[],field_options:[],field_activities:[],field_reports:[],artifact_reports:[],assessments:[],preparation:{status:'not_requested'},preparation_results:[],supply_commitments:[],position_knowledge:initialPosition(base),repair_condition:{site:'B',status:'required',confirmed_at:0,evidence_ref:'B23-INITIAL-B-REPAIR'},replay_nodes:[],log:[],access:{blue:'unverified',green:'unverified'}});
}
function returnPosition(value:Record<string,unknown>,base:Record<string,unknown>):boolean|null{
 const position=value.position_knowledge;
 if(!record(position)||!record(position.provenance)||position.provenance.kind!=='delivered'||!dense_array(value.return_reports))return null;
 const provenance=position.provenance;
 const proof=value.return_reports.find(item=>record(item)&&record(item.report)&&record(item.report.ref)&&record(item.delivery)&&record(item.delivery.ref)&&item.report.ref.id===provenance.report_ref&&item.delivery.ref.id===provenance.delivery_ref);
 if(!record(proof)||!record(proof.report)||!record(proof.delivery))return null;const r=proof.report,d=proof.delivery;
 if(!record(r.ref)||!record(d.ref)||r.actor!=='R'||!record(r.confirmation)||!record(r.confirmation.position)||!record(base.geometry)||!dense_array(base.geometry.scopes))return false;
 const scope=base.geometry.scopes.find(s=>record(s)&&s.id===r.position_scope);if(!record(scope)||scope.kind!=='point'||!record(scope.typed_geometry))return false;
 const expectedScope={...scope,id:equal(scope.typed_geometry.position,r.confirmation.position.point)?scope.id:'position-'+r.ref.id,typed_geometry:{...scope.typed_geometry,position:r.confirmation.position.point},uncertainty:{kind:'known',value:0,unit:'fictional_metre',evidence:r.ref.id},evidence_refs:[r.ref.id,d.ref.id]};
 return equal(position,{status:'known_scope',scope:expectedScope,observed:r.observed,reported:{kind:'known',value:d.sent,evidence:r.ref.id},source_event_time:r.source_event_time,received:d.received,provenance:{kind:'delivered',report_ref:r.ref.id,delivery_ref:d.ref.id},evidence_refs:[r.ref.id,d.ref.id]});
}
export function outcome_player_view(value:unknown):boolean{
 if(!record(value)||value.scenario_kind!=='play_outcome'||typeof value.finished!=='boolean'||!integer(value.sim_time))return false;
 const v=value,at=value.sim_time,run=v.run_id,base=Object.fromEntries(Object.entries(v).filter(([key])=>!extra.includes(key)));base.scenario_kind='play_intelligence';base.finished=false;
 const progress=v.progress;if(!record(progress)||!fields(progress,['last_progress_at','warning_at','waiting_until','warning','message'])||!integer(progress.last_progress_at)||progress.last_progress_at>at||progress.warning_at!==progress.last_progress_at+120000||!(progress.waiting_until===null||integer(progress.waiting_until)&&Array.isArray(v.verification_feedback)&&v.verification_feedback.some(item=>record(item)&&record(item.report)&&item.report.expected_until===progress.waiting_until))||progress.warning!==(!v.finished&&at>=Number(progress.warning_at)&&(progress.waiting_until===null||at>=Number(progress.waiting_until)))||progress.message!==(progress.warning?'暂无新增总部反馈':null))return false;
 if(!dense_array(v.public_obligations)||!v.public_obligations.every(valid_id)||new Set(v.public_obligations).size!==v.public_obligations.length||v.public_obligations.length!==0&&!equal(v.public_obligations,['R-person-1','R-person-2','R-person-3','W-person-1','W-person-2','W-person-3']))return false;
 if(!one(v.verification_receipt_delay,1000,10000,10001))return false;
 if(v.hard_boundary!==null&&!equal(v.hard_boundary,{id:'B24-OUTCOME-HARD-BOUNDARY-02',version:1,hard_close_time:391000}))return false;
 if(v.outcome===null){if(v.finished)return false;}else{const o=v.outcome;if(!v.finished||!record(o)||!fields(o,['result','finished_at','scoring_cutoff','qualified_artifacts','confirmed_people','missing_people','artifact_status','personnel_status'])||!one(o.result,'success','partial','aborted','failure')||o.finished_at!==at||!integer(o.scoring_cutoff)||o.scoring_cutoff>at||!['qualified_artifacts','confirmed_people','missing_people'].every(k=>dense_array(o[k])&&(o[k] as unknown[]).every(valid_id)))return false;}

 if(record(v.outcome)){
  const o=v.outcome,nullableTime=(x:unknown)=>x===null||integer(x)&&x<=at;
  if(!dense_array(o.artifact_status)||!o.artifact_status.every(a=>record(a)&&fields(a,['id','acquired_at','delivered_at','verified_at','confirmed_at','qualified','post_cutoff_effect'])&&valid_id(a.id)&&['acquired_at','delivered_at','verified_at','confirmed_at'].every(k=>nullableTime(a[k]))&&typeof a.qualified==='boolean'&&a.post_cutoff_effect===[a.acquired_at,a.delivered_at,a.verified_at].some(t=>t!==null&&Number(t)>Number(o.scoring_cutoff))))return false;
  if(!dense_array(o.personnel_status)||!o.personnel_status.every(a=>record(a)&&fields(a,['id','returned_at','received_at','verified_at','confirmed_at'])&&valid_id(a.id)&&['returned_at','received_at','verified_at','confirmed_at'].every(k=>nullableTime(a[k]))))return false;
  const artifacts=o.artifact_status as Array<{id:string;qualified:boolean}>,people=o.personnel_status as Array<{id:string;confirmed_at:number|null}>;
  if(new Set(artifacts.map(a=>a.id)).size!==artifacts.length||!equal(artifacts.filter(a=>a.qualified).map(a=>a.id),o.qualified_artifacts)||!equal(people.map(a=>a.id),v.public_obligations)||!equal(people.filter(a=>a.confirmed_at!==null).map(a=>a.id),o.confirmed_people)||!equal(people.filter(a=>a.confirmed_at===null).map(a=>a.id),o.missing_people))return false;
 }
 const returnPositionValid=returnPosition(v,base);if(returnPositionValid===false)return false;if(returnPositionValid===true)base.position_knowledge=initialPosition(base);
 if(!intelligence_player_view(base)||!extra.every(key=>Object.hasOwn(v,key))||!extra.filter(key=>!['handover','termination','outcome','hard_boundary','verification_receipt_delay','progress'].includes(key)).every(key=>dense_array(v[key])))return false;
 if(v.termination!==null){const t=v.termination;if(!record(t)||!fields(t,['original_decision_ref','operation_id','status','effective_at','scoring_cutoff','cleanup_deadline','notification_targets'])||!ref(t.original_decision_ref,'decision_record',run)||!valid_id(t.operation_id)||t.status!=='terminating'||!integer(t.effective_at)||t.effective_at>at||t.scoring_cutoff!==t.effective_at||!integer(t.cleanup_deadline)||!record(v.public_rules)||t.cleanup_deadline!==Math.min(t.effective_at+120000,Number(v.public_rules.deadline))||!equal(t.notification_targets,['R','W','H','INTEL']))return false;}
 if(!record(v.handover)||!fields(v.handover,['capacity','received_personnel'])||v.handover.capacity!==6||!integer(v.handover.received_personnel)||v.handover.received_personnel>6)return false;
 const decisions=v.decision_records as unknown[],continuations=v.continuation_records as unknown[],plans=v.return_plans as unknown[],returns=v.return_reports as unknown[],receptions=v.reception_reports as unknown[],verifications=v.verification_reports as unknown[];
 const decisionIds=new Set<string>(),operationIds=new Set<string>();
 for(const d of decisions){
  if(!record(d)||!fields(d,['ref','operation_id','at','actor','intent','knowledge','knowledge_digest','policy_ref','reason'])||!ref(d.ref,'decision_record',run)||!record(d.ref)||decisionIds.has(String(d.ref.id))||!valid_id(d.operation_id)||operationIds.has(d.operation_id)||!integer(d.at)||d.at>at||d.actor!=='HQ'||d.policy_ref!=='B24-OUTCOME-DESIGN-1.0.0'||!record(d.reason)||!(d.reason.kind==='not_recorded'&&fields(d.reason,['kind'])||d.reason.kind==='recorded'&&fields(d.reason,['kind','text'])&&typeof d.reason.text==='string'&&d.reason.text.trim().length>0&&d.reason.text.length<=600)||!digest(d.knowledge_digest)||!knowledge(d.knowledge,base,d.at))return false;
  try{parse_outcome_envelope({run_id:run,operation_id:d.operation_id,expected_revision:1,intent:d.intent});}catch{return false;}decisionIds.add(String(d.ref.id));operationIds.add(d.operation_id);
 }

 const abortDecisions=decisions.filter(d=>record(d)&&record(d.intent)&&d.intent.kind==='abort_outcome');
 if(v.termination===null){if(abortDecisions.length!==0)return false;}
 else {
  const d=abortDecisions[0],t=v.termination;
  if(abortDecisions.length!==1||!record(d)||!record(t)||!equal(t.original_decision_ref,d.ref)||t.operation_id!==d.operation_id||t.effective_at!==d.at)return false;
 }
 const abortActors=new Set<string>();
 for(const item of v.abort_reports as unknown[]){
  if(!record(item)||!fields(item,['report','delivery'])||!record(item.report)||!record(item.delivery)||!record(v.termination))return false;const r=item.report,d=item.delivery,t=v.termination;
  if(!fields(r,['cancelled_primary_refs','ref','notification_ref','original_decision_ref','actor','observed','source_event_time','source_published','cleanup_deadline'])||!dense_array(r.cancelled_primary_refs)||!r.cancelled_primary_refs.every(item=>ref(item,'work_item',run))||r.actor!=='INTEL'&&r.cancelled_primary_refs.length!==0||!one(r.actor,'R','W','H','INTEL')||abortActors.has(String(r.actor))||!ref(r.ref,'abort_report',run)||!record(r.ref)||!ref(r.notification_ref,'abort_notification',run)||!record(r.notification_ref)||!equal(r.original_decision_ref,t.original_decision_ref)||!record(t.original_decision_ref)||!decisionIds.has(String(t.original_decision_ref.id))||r.notification_ref.id!==t.original_decision_ref.id+'-'+r.actor||r.ref.id!==r.notification_ref.id+'-accepted'||!observed(r.observed,at)||!record(r.observed)||Number(r.observed.value)<Number(t.effective_at)+1000||!unknown(r.source_event_time)||r.source_published!==r.observed.value||r.cleanup_deadline!==t.cleanup_deadline)return false;
  if(!fields(d,['ref','report_ref','target','sent','received','channel'])||!ref(d.ref,'abort_delivery',run)||!equal(d.report_ref,r.ref)||d.target!=='HQ'||d.sent!==r.source_published||d.received!==Number(d.sent)+1000||Number(d.received)>at||!one(d.channel,'R-portable','H-fixed','B-fixed')||d.channel==='R-portable'&&r.actor!=='R'||d.channel==='B-fixed'&&r.actor!=='W')return false;
  abortActors.add(String(r.actor));
 }
 if(plans.length>2)return false;const actors=new Set<string>();
 for(const plan of plans){if(!record(plan)||!fields(plan,['actor','status','issued_at','accepted_at'])||!one(plan.actor,'R','W')||actors.has(String(plan.actor))||!one(plan.status,'issued','returning','arrived','cutoff','hold')||!integer(plan.issued_at)||plan.issued_at>at||!(plan.accepted_at===null||integer(plan.accepted_at)&&plan.accepted_at<=at))return false;actors.add(String(plan.actor));}
 if(!dense_array(v.return_candidates)||v.return_candidates.length!==2)return false;const candidateActors=new Set<string>();
 for(const c of v.return_candidates){if(!record(c)||!fields(c,['actor','available','missing'])||!one(c.actor,'R','W')||candidateActors.has(String(c.actor))||typeof c.available!=='boolean'||!dense_array(c.missing)||!c.missing.every(t=>typeof t==='string'&&t.length>0&&t.length<=200)||c.available!==(c.missing.length===0))return false;candidateActors.add(String(c.actor));}
 const reportRefs=new Map<string,{kind:string;at:number}>(),receivedPeople=new Set<string>(),returnIds=new Set<string>();
 for(const item of returns){
  if(!record(item)||!fields(item,['report','delivery'])||!record(item.report)||!record(item.delivery))return false;const r=item.report,d=item.delivery;
  if(!fields(r,['ref','actor','phase','observed','source_event_time','source_published','position_scope','confirmation','reason'])||!ref(r.ref,'return_report',run)||!record(r.ref)||returnIds.has(String(r.ref.id))||!one(r.actor,'R','W')||!one(r.phase,'accepted','completed','refused','cutoff')||!observed(r.observed,at)||!record(r.observed)||!unknown(r.source_event_time)||r.source_published!==r.observed.value||!valid_id(r.position_scope)||!(r.reason===null||typeof r.reason==='string'&&r.reason.length<=200))return false;
  const c=r.confirmation;if(!record(c)||!fields(c,['position','resources','load','space'])||!integer(c.load)||!integer(c.space)||!record(c.position)||!fields(c.position,['site','point'])||c.position.site!==r.position_scope||!dense_array(c.position.point)||c.position.point.length!==2||!c.position.point.every(n=>typeof n==='number'&&Number.isFinite(n))||!record(c.resources)||!fields(c.resources,['movement_energy','movement_energy_reserved','record_energy','work_energy','equipment_energy_reserved','durability','record_packs','repair_packs','packs_reserved','link_energy','link_durability'])||!Object.values(c.resources).every(integer))return false;
  if(!fields(d,['ref','report_ref','target','sent','received','channel'])||!ref(d.ref,'return_delivery',run)||!ref(d.report_ref,'return_report',run)||!record(d.report_ref)||d.report_ref.id!==r.ref.id||d.target!=='HQ'||d.sent!==r.source_published||!integer(d.received)||d.received>at||d.received!==Number(d.sent)+1000||!one(d.channel,'B-fixed','R-portable','H-fixed'))return false;
  returnIds.add(String(r.ref.id));reportRefs.set(String(r.ref.id),{kind:'return_report',at:Number(r.observed.value)});
 }
 for(const plan of plans){if(!record(plan))return false;const reports=returns.filter(x=>record(x)&&record(x.report)&&x.report.actor===plan.actor).map(x=>(x as {report:Record<string,unknown>}).report),terminal=reports.find(r=>r.phase==='completed'),cutoff=reports.find(r=>r.phase==='cutoff'),accepted=reports.find(r=>r.phase==='accepted'),refused=reports.find(r=>r.phase==='refused');
  if(reports.length>2||plan.status!==(terminal?'arrived':cutoff?'cutoff':accepted?'returning':refused?'hold':'issued')||plan.accepted_at!==(accepted&&record(accepted.observed)?accepted.observed.value:null))return false;
 }
 const receptionIds=new Set<string>();
 for(const item of receptions){
  if(!record(item)||!fields(item,['report','delivery'])||!record(item.report)||!record(item.delivery))return false;const r=item.report,d=item.delivery;
  if(!fields(r,['ref','subject_actor','original_decision_ref','batch_ref','phase','reason','observed','source_event_time','source_published','people_ids','artifact_refs'])||!reportSubject(r,decisions,run)||!ref(r.ref,'reception_report',run)||!record(r.ref)||receptionIds.has(String(r.ref.id))||!ref(r.batch_ref,'reception_batch',run)||!one(r.phase,'accepted','completed','cutoff','hold')||!(r.phase==='hold'?typeof r.reason==='string'&&r.reason.length>0&&r.reason.length<=200:r.reason===null)||!observed(r.observed,at)||!record(r.observed)||!unknown(r.source_event_time)||r.source_published!==r.observed.value||!dense_array(r.people_ids)||r.people_ids.length!==3||new Set(r.people_ids).size!==3||!r.people_ids.every(valid_id)||!dense_array(r.artifact_refs)||r.artifact_refs.length>2||!r.artifact_refs.every(a=>ref(a,'mission_artifact',run)))return false;
  if(!fields(d,['ref','report_ref','target','sent','received'])||!ref(d.ref,'reception_delivery',run)||!ref(d.report_ref,'reception_report',run)||!record(d.report_ref)||d.report_ref.id!==r.ref.id||d.target!=='HQ'||d.sent!==r.source_published||!integer(d.received)||d.received>at||d.received!==Number(d.sent)+1000)return false;
  receptionIds.add(String(r.ref.id));reportRefs.set(String(r.ref.id),{kind:'reception_report',at:Number(r.observed.value)});if(r.phase==='completed')for(const id of r.people_ids)receivedPeople.add(String(id));
 }
 if(v.handover.received_personnel!==receivedPeople.size)return false;
 const verificationIds=new Set<string>();
 for(const item of verifications){
  if(!record(item)||!fields(item,['report','delivery'])||!record(item.report)||!record(item.delivery))return false;const r=item.report,d=item.delivery;
  if(!fields(r,['purpose','ref','subject_actor','original_decision_ref','reception_ref','batch_ref','observed','source_event_time','source_published','personnel','artifacts'])||!one(r.purpose,'primary','personnel_cleanup')||!reportSubject(r,decisions,run)||!ref(r.reception_ref,'reception_batch',run)||!ref(r.ref,'verification_report',run)||!record(r.ref)||verificationIds.has(String(r.ref.id))||!ref(r.batch_ref,'verification_batch',run)||!record(r.batch_ref)||!observed(r.observed,at)||!record(r.observed)||!unknown(r.source_event_time)||r.source_published!==r.observed.value||!dense_array(r.personnel)||r.personnel.length!==3||!r.personnel.every(p=>record(p)&&fields(p,['person_id','status'])&&valid_id(p.person_id)&&one(p.status,'verified','inconclusive'))||!dense_array(r.artifacts)||r.artifacts.length>2||!r.artifacts.every(a=>record(a)&&fields(a,['artifact_ref','status','reason'])&&ref(a.artifact_ref,'mission_artifact',run)&&one(a.status,'verified','inconclusive')&&(a.reason===null||typeof a.reason==='string'&&a.reason.length<=200)))return false;
  if(!fields(d,['ref','report_ref','target','sent','received'])||!ref(d.ref,'verification_delivery',run)||!ref(d.report_ref,'verification_report',run)||!record(d.report_ref)||d.report_ref.id!==r.ref.id||d.target!=='HQ'||d.sent!==r.source_published||!integer(d.received)||d.received>at||d.received!==Number(d.sent)+Number(v.verification_receipt_delay))return false;
  const batch=String(r.batch_ref.id);const manifest=receptions.find(x=>record(x)&&record(x.report)&&record(x.report.batch_ref)&&x.report.phase==='completed'&&(r.purpose==='personnel_cleanup'?'VC-':'V-')+x.report.batch_ref.id===batch);if(!record(manifest)||!record(manifest.report)||!record(manifest.delivery)||!equal(r.reception_ref,manifest.report.batch_ref)||!equal(r.original_decision_ref,manifest.report.original_decision_ref)||r.subject_actor!==manifest.report.subject_actor||Number(r.observed.value)<Number(manifest.delivery.received)+20000||!record(v.public_rules)||Number(r.observed.value)>Number(v.public_rules.deadline)||!equal((r.personnel as Array<{person_id:string}>).map(p=>p.person_id),manifest.report.people_ids)||!equal((r.artifacts as Array<{artifact_ref:unknown}>).map(a=>a.artifact_ref),(r.purpose==='personnel_cleanup'?[]:manifest.report.artifact_refs)))return false;
  verificationIds.add(String(r.ref.id));reportRefs.set(String(r.ref.id),{kind:'verification_report',at:Number(r.observed.value)});
 }
 const feedbackIds=new Set<string>();
 for(const item of v.verification_feedback as unknown[]){
  if(!record(item)||!fields(item,['report','delivery'])||!record(item.report)||!record(item.delivery))return false;const r=item.report,d=item.delivery;
  if(!fields(r,['expected_until','purpose','ref','subject_actor','original_decision_ref','reception_ref','batch_ref','phase','reason','observed','source_event_time','source_published'])||!one(r.purpose,'primary','personnel_cleanup')||!reportSubject(r,decisions,run)||!(r.expected_until===null||one(r.phase,'queued','accepted')&&integer(r.expected_until)&&r.expected_until>Number(r.source_published)&&record(v.public_rules)&&r.expected_until<=Number(v.public_rules.deadline)+Number(v.public_rules.receipt_grace))||!ref(r.ref,'verification_status_report',run)||!record(r.ref)||feedbackIds.has(String(r.ref.id))||!ref(r.reception_ref,'reception_batch',run)||!record(r.reception_ref)||!ref(r.batch_ref,'verification_batch',run)||!record(r.batch_ref)||r.batch_ref.id!==(r.purpose==='personnel_cleanup'?'VC-':'V-')+r.reception_ref.id||!one(r.phase,'queued','accepted','hold','cutoff')||!(r.phase==='accepted'?r.reason===null:typeof r.reason==='string'&&r.reason.length>0&&r.reason.length<=200)||!observed(r.observed,at)||!record(r.observed)||!unknown(r.source_event_time)||r.source_published!==r.observed.value)return false;
  if(!fields(d,['ref','report_ref','target','sent','received'])||!ref(d.ref,'verification_status_delivery',run)||!ref(d.report_ref,'verification_status_report',run)||!record(d.report_ref)||d.report_ref.id!==r.ref.id||d.target!=='HQ'||d.sent!==r.source_published||!integer(d.received)||d.received>at||d.received!==Number(d.sent)+1000)return false;
  const manifest=receptions.find(x=>record(x)&&record(x.report)&&x.report.phase==='completed'&&equal(x.report.batch_ref,r.reception_ref));if(!record(manifest)||!record(manifest.report)||!record(manifest.delivery)||!equal(r.original_decision_ref,manifest.report.original_decision_ref)||r.subject_actor!==manifest.report.subject_actor||Number(r.observed.value)<Number(manifest.delivery.received))return false;
  feedbackIds.add(String(r.ref.id));reportRefs.set(String(r.ref.id),{kind:'verification_status_report',at:Number(r.observed.value)});
 }
 for(const c of continuations){if(!record(c)||!fields(c,['ref','original_decision_ref','actor','action','at','notification_ref','report_ref'])||!ref(c.ref,'continuation_record',run)||!ref(c.original_decision_ref,'decision_record',run)||!record(c.original_decision_ref)||!decisionIds.has(String(c.original_decision_ref.id))||!one(c.actor,'R','W','H','INTEL')||!one(c.action,'return','handover_batch','verify_manifest','notify_HQ')||!integer(c.at)||c.at>at||!ref(c.notification_ref,'return_notification',run)||!record(c.notification_ref)||c.notification_ref.id!==c.original_decision_ref.id+'-'+c.actor||!record(c.report_ref)||!valid_id(c.report_ref.id)||!ref(c.report_ref,String(c.report_ref.kind),run))return false;const report=reportRefs.get(c.report_ref.id);if(!report||report.kind!==c.report_ref.kind||report.at!==c.at)return false;}
 if(record(v.outcome)&&record(v.public_rules)){
  const o=v.outcome,artifacts=o.qualified_artifacts as string[],missing=o.missing_people as string[];
  const hard=record(v.hard_boundary)&&at===v.hard_boundary.hard_close_time;
  const expected=hard?'failure':v.termination===null&&artifacts.length===2&&missing.length===0?'success':artifacts.length>0?'partial':v.termination!==null?'aborted':'failure';
  const cutoff=record(v.termination)?v.termination.scoring_cutoff:Math.min(at,Number(v.public_rules.deadline));
  if(o.result!==expected||o.scoring_cutoff!==cutoff)return false;
 }
 return outcomeEvidence(v as unknown as OutcomePlayerView);
}
