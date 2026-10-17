import {record,fields,valid_id} from './protocol';import {dense_array} from './spatial';import {intelligence_player_view} from './intelligence-dto';import {parse_outcome_envelope} from './outcome-protocol';
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const one=(v:unknown,...values:unknown[])=>values.includes(v);
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const ref=(v:unknown,kind:string,run:unknown)=>record(v)&&fields(v,['run_id','kind','id','version'])&&v.run_id===run&&v.kind===kind&&valid_id(v.id)&&v.version===1;
const observed=(v:unknown,at:number)=>record(v)&&fields(v,['kind','value','evidence'])&&v.kind==='known'&&integer(v.value)&&v.value<=at&&valid_id(v.evidence);
const unknown=(v:unknown)=>record(v)&&fields(v,['kind'])&&v.kind==='unknown';
const extra=['decision_records','continuation_records','return_reports','reception_reports','verification_reports','verification_feedback','return_candidates','return_plans','handover'];
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
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
 if(!record(value)||value.scenario_kind!=='play_outcome'||value.finished!==false||!integer(value.sim_time))return false;
 const v=value,at=value.sim_time,run=v.run_id,base=Object.fromEntries(Object.entries(v).filter(([key])=>!extra.includes(key)));base.scenario_kind='play_intelligence';base.finished=false;
 const returnPositionValid=returnPosition(v,base);if(returnPositionValid===false)return false;if(returnPositionValid===true)base.position_knowledge=initialPosition(base);
 if(!intelligence_player_view(base)||!extra.every(key=>Object.hasOwn(v,key))||!extra.filter(key=>key!=='handover').every(key=>dense_array(v[key])))return false;
 if(!record(v.handover)||!fields(v.handover,['capacity','received_personnel'])||v.handover.capacity!==6||!integer(v.handover.received_personnel)||v.handover.received_personnel>6)return false;
 const decisions=v.decision_records as unknown[],continuations=v.continuation_records as unknown[],plans=v.return_plans as unknown[],returns=v.return_reports as unknown[],receptions=v.reception_reports as unknown[],verifications=v.verification_reports as unknown[];
 const decisionIds=new Set<string>(),operationIds=new Set<string>();
 for(const d of decisions){
  if(!record(d)||!fields(d,['ref','operation_id','at','actor','intent','knowledge','knowledge_digest','policy_ref','reason'])||!ref(d.ref,'decision_record',run)||!record(d.ref)||decisionIds.has(String(d.ref.id))||!valid_id(d.operation_id)||operationIds.has(d.operation_id)||!integer(d.at)||d.at>at||d.actor!=='HQ'||d.policy_ref!=='B24-OUTCOME-DESIGN-1.0.0'||!record(d.reason)||!(d.reason.kind==='not_recorded'&&fields(d.reason,['kind'])||d.reason.kind==='recorded'&&fields(d.reason,['kind','text'])&&typeof d.reason.text==='string'&&d.reason.text.trim().length>0&&d.reason.text.length<=600)||!digest(d.knowledge_digest)||!knowledge(d.knowledge,base,d.at))return false;
  try{parse_outcome_envelope({run_id:run,operation_id:d.operation_id,expected_revision:1,intent:d.intent});}catch{return false;}decisionIds.add(String(d.ref.id));operationIds.add(d.operation_id);
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
  if(!fields(r,['ref','subject_actor','original_decision_ref','reception_ref','batch_ref','observed','source_event_time','source_published','personnel','artifacts'])||!reportSubject(r,decisions,run)||!ref(r.reception_ref,'reception_batch',run)||!ref(r.ref,'verification_report',run)||!record(r.ref)||verificationIds.has(String(r.ref.id))||!ref(r.batch_ref,'verification_batch',run)||!record(r.batch_ref)||!observed(r.observed,at)||!record(r.observed)||!unknown(r.source_event_time)||r.source_published!==r.observed.value||!dense_array(r.personnel)||r.personnel.length!==3||!r.personnel.every(p=>record(p)&&fields(p,['person_id','status'])&&valid_id(p.person_id)&&one(p.status,'verified','inconclusive'))||!dense_array(r.artifacts)||r.artifacts.length>2||!r.artifacts.every(a=>record(a)&&fields(a,['artifact_ref','status','reason'])&&ref(a.artifact_ref,'mission_artifact',run)&&one(a.status,'verified','inconclusive')&&(a.reason===null||typeof a.reason==='string'&&a.reason.length<=200)))return false;
  if(!fields(d,['ref','report_ref','target','sent','received'])||!ref(d.ref,'verification_delivery',run)||!ref(d.report_ref,'verification_report',run)||!record(d.report_ref)||d.report_ref.id!==r.ref.id||d.target!=='HQ'||d.sent!==r.source_published||!integer(d.received)||d.received>at||d.received!==Number(d.sent)+1000)return false;
  const batch=String(r.batch_ref.id);const manifest=receptions.find(x=>record(x)&&record(x.report)&&record(x.report.batch_ref)&&x.report.phase==='completed'&&'V-'+x.report.batch_ref.id===batch);if(!record(manifest)||!record(manifest.report)||!record(manifest.delivery)||!equal(r.reception_ref,manifest.report.batch_ref)||!equal(r.original_decision_ref,manifest.report.original_decision_ref)||r.subject_actor!==manifest.report.subject_actor||Number(r.observed.value)<Number(manifest.delivery.received)+20000||!equal((r.personnel as Array<{person_id:string}>).map(p=>p.person_id),manifest.report.people_ids)||!equal((r.artifacts as Array<{artifact_ref:unknown}>).map(a=>a.artifact_ref),manifest.report.artifact_refs))return false;
  verificationIds.add(String(r.ref.id));reportRefs.set(String(r.ref.id),{kind:'verification_report',at:Number(r.observed.value)});
 }
 const feedbackIds=new Set<string>();
 for(const item of v.verification_feedback as unknown[]){
  if(!record(item)||!fields(item,['report','delivery'])||!record(item.report)||!record(item.delivery))return false;const r=item.report,d=item.delivery;
  if(!fields(r,['ref','subject_actor','original_decision_ref','reception_ref','batch_ref','phase','reason','observed','source_event_time','source_published'])||!reportSubject(r,decisions,run)||!ref(r.ref,'verification_status_report',run)||!record(r.ref)||feedbackIds.has(String(r.ref.id))||!ref(r.reception_ref,'reception_batch',run)||!record(r.reception_ref)||!ref(r.batch_ref,'verification_batch',run)||!record(r.batch_ref)||r.batch_ref.id!=='V-'+r.reception_ref.id||!one(r.phase,'queued','accepted','hold','cutoff')||!(r.phase==='accepted'?r.reason===null:typeof r.reason==='string'&&r.reason.length>0&&r.reason.length<=200)||!observed(r.observed,at)||!record(r.observed)||!unknown(r.source_event_time)||r.source_published!==r.observed.value)return false;
  if(!fields(d,['ref','report_ref','target','sent','received'])||!ref(d.ref,'verification_status_delivery',run)||!ref(d.report_ref,'verification_status_report',run)||!record(d.report_ref)||d.report_ref.id!==r.ref.id||d.target!=='HQ'||d.sent!==r.source_published||!integer(d.received)||d.received>at||d.received!==Number(d.sent)+1000)return false;
  const manifest=receptions.find(x=>record(x)&&record(x.report)&&x.report.phase==='completed'&&equal(x.report.batch_ref,r.reception_ref));if(!record(manifest)||!record(manifest.report)||!record(manifest.delivery)||!equal(r.original_decision_ref,manifest.report.original_decision_ref)||r.subject_actor!==manifest.report.subject_actor||Number(r.observed.value)<Number(manifest.delivery.received))return false;
  feedbackIds.add(String(r.ref.id));reportRefs.set(String(r.ref.id),{kind:'verification_status_report',at:Number(r.observed.value)});
 }
 for(const c of continuations){if(!record(c)||!fields(c,['ref','original_decision_ref','actor','action','at','notification_ref','report_ref'])||!ref(c.ref,'continuation_record',run)||!ref(c.original_decision_ref,'decision_record',run)||!record(c.original_decision_ref)||!decisionIds.has(String(c.original_decision_ref.id))||!one(c.actor,'R','W','H','INTEL')||!one(c.action,'return','handover_batch','verify_manifest','notify_HQ')||!integer(c.at)||c.at>at||!ref(c.notification_ref,'return_notification',run)||!record(c.notification_ref)||c.notification_ref.id!==c.original_decision_ref.id+'-'+c.actor||!record(c.report_ref)||!valid_id(c.report_ref.id)||!ref(c.report_ref,String(c.report_ref.kind),run))return false;const report=reportRefs.get(c.report_ref.id);if(!report||report.kind!==c.report_ref.kind||report.at!==c.at)return false;}
 return true;
}
