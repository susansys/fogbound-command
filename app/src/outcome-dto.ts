import {record,fields,valid_id} from './protocol';import {dense_array} from './spatial';import {intelligence_player_view} from './intelligence-dto';import {parse_outcome_envelope} from './outcome-protocol';
import type {OutcomePlayerView} from './outcome-contracts';
import {public_cleanup_complete} from './outcome-contracts';
import {parse_outcome_evidence_ref,parse_outcome_inference_request} from './outcome-protocol';
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const one=(v:unknown,...values:unknown[])=>values.includes(v);
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const ref=(v:unknown,kind:string,run:unknown)=>record(v)&&fields(v,['run_id','kind','id','version'])&&v.run_id===run&&v.kind===kind&&valid_id(v.id)&&v.version===1;
const observed=(v:unknown,at:number)=>record(v)&&fields(v,['kind','value','evidence'])&&v.kind==='known'&&integer(v.value)&&v.value<=at&&valid_id(v.evidence);
const unknown=(v:unknown)=>record(v)&&fields(v,['kind'])&&v.kind==='unknown';
const extra=['decision_records','continuation_records','return_reports','reception_reports','verification_reports','verification_feedback','return_candidates','return_plans','handover','termination','outcome','hard_boundary','verification_receipt_delay','public_obligations','progress','abort_reports'];
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
async function json_source_digest(value:unknown):Promise<string>{
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
export function outcome_participant_receipt(v:unknown):boolean{
 if(!record(v)||!fields(v,['template','source_digest'])||!digest(v.source_digest)||!record(v.template))return false;
 const t=v.template,actors=['HQ','INTEL','R','W','ArchiveSource','H'];
 if(!fields(t,['run_id','run_digest','finished_seq','template_version','agenda','branch_comparison','participants'])||!valid_id(t.run_id)||!digest(t.run_digest)||!integer(t.finished_seq)||t.finished_seq<1||t.template_version!=='B24-DEBRIEF-1'||!equal(t.agenda,['task_outcome','timeline','participants','coordination','questions'])||t.branch_comparison!=='not_provided'||!dense_array(t.participants)||t.participants.length!==actors.length)return false;
 return t.participants.every((p,index)=>{
  if(!record(p)||!fields(p,['actor','participation','declaration','claims','missing'])||p.actor!==actors[index]||!one(p.participation,'participated','not_participated')||!one(p.declaration,'recorded','not_recorded','record_missing')||!dense_array(p.claims)||p.claims.length>1||!dense_array(p.missing)||p.missing.length>4||!p.missing.every(s=>typeof s==='string'&&s.length>0&&s.length<=600))return false;
  if(p.participation==='not_participated'&&(p.claims.length!==0||p.declaration!=='not_recorded')||p.declaration==='record_missing'&&(p.claims.length!==0||p.missing.length===0)||p.participation==='participated'&&p.claims.length===0&&p.declaration!=='record_missing'||p.declaration==='recorded'&&p.actor!=='HQ')return false;
  return p.claims.every(c=>{
   if(!record(c)||!fields(c,['id','speaker_mode','layer','actor_scope','text','evidence_refs'])||c.id!=='TEMPLATE-'+p.actor||c.speaker_mode!=='template'||c.layer!=='known_then'||c.actor_scope!==p.actor||typeof c.text!=='string'||!c.text.length||c.text.length>600||!dense_array(c.evidence_refs)||c.evidence_refs.length<1||c.evidence_refs.length>3)return false;
   return c.evidence_refs.every(ref=>{try{const r=parse_outcome_evidence_ref(ref);return r.run_id===t.run_id&&r.actor_scope===p.actor&&r.layer==='known_then';}catch{return false;}});
  });
 });
}
export async function verify_outcome_participant_receipt(v:unknown):Promise<boolean>{
 if(!outcome_participant_receipt(v))return false;
 const receipt=v as import('./outcome-contracts').OutcomeParticipantReceipt;
 return await json_source_digest(receipt.template)===receipt.source_digest;
}
export function outcome_inference_receipt(v:unknown):boolean{
 if(!record(v)||!fields(v,['note','source_digest'])||!digest(v.source_digest)||!record(v.note))return false;
 const n=v.note;
 if(!fields(n,['run_id','run_digest','finished_seq','operation_id','target','basis_refs','text','id','version','created_sequence','created_time','speaker_mode','layer'])||typeof n.id!=='string'||!/^NOTE-[a-f0-9]{64}$/.test(n.id)||!integer(n.version)||n.version<1||!integer(n.created_sequence)||n.created_sequence<n.version||typeof n.created_time!=='string'||!Number.isFinite(Date.parse(n.created_time))||new Date(n.created_time).toISOString()!==n.created_time||n.speaker_mode!=='user'||n.layer!=='retrospective_inference')return false;
 const {id,version,created_sequence,created_time,speaker_mode,layer,...body}=n;void id;void created_sequence;void created_time;void speaker_mode;void layer;
 try{parse_outcome_inference_request({...body,expected_version:Number(version)-1});return true;}catch{return false;}
}
export async function verify_outcome_inference_receipt(v:unknown):Promise<boolean>{
 if(!outcome_inference_receipt(v))return false;
 const receipt=v as import('./outcome-contracts').OutcomeInferenceReceipt;
 return await json_source_digest(receipt.note)===receipt.source_digest;
}
export function outcome_truth_payload(v:unknown):boolean{
 if(!record(v)||!fields(v,['run_id','run_digest','finished_seq','layer','grant','facts'])||!valid_id(v.run_id)||!digest(v.run_digest)||!integer(v.finished_seq)||v.finished_seq<1||v.layer!=='engine_event'||!record(v.grant)||!fields(v.grant,['operation_id','metadata_revision','payload_digest'])||!valid_id(v.grant.operation_id)||!integer(v.grant.metadata_revision)||v.grant.metadata_revision<2||!digest(v.grant.payload_digest)||!record(v.facts)||!fields(v.facts,['source','reports','events','ledgers','custody','verification','outcome'])||!record(v.facts.source)||!fields(v.facts.source,['resources'])||!evidence_record(v.facts))return false;
 const r=v.facts.source.resources;if(!record(r)||!fields(r,['energy','durability','packs','energy_reserved','packs_reserved'])||!Object.values(r).every(integer)||!record(v.facts.outcome))return false;
 const groups:Record<string,string[]>={reports:['source','field','returns','receptions','abort'],events:['continuations','return_notifications','abort_notifications'],ledgers:['processing_reservations','verification_batches','field_orders'],custody:['reception_batches','manifests','person_receipts','custody_events'],verification:['reports','deliveries','status_reports','status_deliveries']};
 for(const [name,keys] of Object.entries(groups)){const group=v.facts[name];if(!record(group)||!fields(group,keys)||!Object.values(group).every(items=>dense_array(items)&&items.every(item=>record(item)&&(!record(item.ref)||item.ref.run_id===v.run_id)&&(!Object.hasOwn(item,'run_id')||item.run_id===v.run_id))))return false;}
 return true;
}
function evidence_record(v:unknown,seen=new WeakSet<object>()):boolean{
 if(v===null||typeof v==='string'||typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v);
 if(typeof v!=='object'||seen.has(v))return false;seen.add(v);
 const valid=Array.isArray(v)?dense_array(v)&&v.every(item=>evidence_record(item,seen)):Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).every(key=>typeof key==='string'&&Object.getOwnPropertyDescriptor(v,key)?.enumerable===true&&evidence_record(Reflect.get(v,key),seen));
 seen.delete(v);return valid;
}
function debrief_entry(v:unknown):boolean{
 if(!record(v)||!fields(v,['ref','record'])||!record(v.record)||!evidence_record(v.record))return false;
 try{parse_outcome_evidence_ref(v.ref);return true;}catch{return false;}
}
export function outcome_debrief_answer(v:unknown):boolean{
 if(!record(v)||!fields(v,['run_id','run_digest','finished_seq','topic','notes','status','actor','layer','as_of_revision','entries','missing'])||!valid_id(v.run_id)||!digest(v.run_digest)||!integer(v.finished_seq)||v.finished_seq<1||typeof v.topic!=='string'||!v.topic.length||v.topic.length>80||!dense_array(v.notes)||!v.notes.every(s=>typeof s==='string'&&s.length<=2000)||!one(v.status,'answered','insufficient_record','unsupported','rejected')||!one(v.actor,'HQ','R','W','INTEL','H','ArchiveSource')||!one(v.layer,'known_then','engine_event','declared_reason','retrospective_inference')||!integer(v.as_of_revision)||v.as_of_revision<1||!dense_array(v.entries)||!dense_array(v.missing)||!v.missing.every(s=>typeof s==='string'&&s.length<=2000))return false;
 if(v.status!=='answered'&&v.entries.length!==0||v.status==='answered'&&v.entries.length===0)return false;
 return v.entries.every(e=>debrief_entry(e)&&record(e)&&record(e.ref)&&e.ref.run_id===v.run_id&&e.ref.actor_scope===v.actor&&e.ref.layer===v.layer);
}
export function outcome_evidence_resolution(v:unknown):boolean{
 if(!record(v))return false;
 if(v.status==='rejected')return fields(v,['status','missing'])&&dense_array(v.missing)&&v.missing.every(s=>typeof s==='string'&&s.length<=2000);
 if(v.status!=='answered'||!fields(v,['status','entry','history'])||!debrief_entry(v.entry)||!record(v.entry)||!record(v.entry.ref)||!record(v.history))return false;
 const h=v.history,r=v.entry.ref;return fields(h,['run_id','revision','at','actor','layer','read_only'])&&h.run_id===r.run_id&&integer(h.revision)&&h.revision>=1&&integer(h.at)&&h.actor===r.actor_scope&&h.layer===r.layer&&h.read_only===true;
}
export async function verify_outcome_debrief_digest(value:unknown):Promise<boolean>{
 if(!outcome_debrief_answer(value)&&!outcome_evidence_resolution(value))return false;
 const payload=value as import('./outcome-contracts').OutcomeDebriefAnswer|import('./outcome-contracts').OutcomeEvidenceResolution;
 const entries='entries' in payload?payload.entries:payload.status==='answered'?[payload.entry]:[];
 for(const entry of entries)if(await json_source_digest(entry.record)!==entry.ref.source_digest)return false;
 return true;
}
export async function verify_outcome_truth_digest(value:unknown):Promise<boolean>{
 if(!outcome_truth_payload(value))return false;
 const payload=value as import('./outcome-contracts').OutcomeTruthPayload;
 return await json_source_digest(payload.facts)===payload.grant.payload_digest;
}
export function outcome_truth_confirmation(v:unknown):boolean{
 return record(v)&&fields(v,['run_id','run_digest','finished_seq','operation_id','payload_digest','truth_exposure','metadata_revision'])&&valid_id(v.run_id)&&digest(v.run_digest)&&integer(v.finished_seq)&&v.finished_seq>=1&&valid_id(v.operation_id)&&digest(v.payload_digest)&&v.truth_exposure===true&&integer(v.metadata_revision)&&v.metadata_revision>=3;
}
export function outcome_fairness(v:unknown):boolean{
 if(!record(v)||!fields(v,['run_id','definition_hash','truth_exposure','sources'])||!valid_id(v.run_id)||!digest(v.definition_hash)||typeof v.truth_exposure!=='boolean'||!dense_array(v.sources)||v.truth_exposure!==(v.sources.length>0))return false;
 const identities=new Set<string>();
 return v.sources.every(source=>{
  if(!record(source)||!fields(source,['run_id','run_digest','finished_seq','operation_id','payload_digest','ack_revision'])||!valid_id(source.run_id)||!digest(source.run_digest)||!integer(source.finished_seq)||source.finished_seq<1||!valid_id(source.operation_id)||!digest(source.payload_digest)||!integer(source.ack_revision)||source.ack_revision<3)return false;
  const key=source.run_id+':'+source.operation_id;if(identities.has(key))return false;identities.add(key);return true;
 });
}
export function outcome_debrief_session(v:unknown):boolean{
 if(!record(v)||!fields(v,['run_id','run_digest','finished_seq','template_version','status','lifecycle_revision','default_layer','actor','metadata_revision','truth_exposure','summary'])||!valid_id(v.run_id)||!digest(v.run_digest)||!integer(v.finished_seq)||v.finished_seq<1||v.template_version!=='B24-DEBRIEF-1'||!one(v.status,'ready','viewing','archived')||!integer(v.lifecycle_revision)||v.lifecycle_revision<1||v.default_layer!=='known_then'||v.actor!=='HQ'||!integer(v.metadata_revision)||v.metadata_revision<1||typeof v.truth_exposure!=='boolean')return false;
 const summary=v.summary;if(!record(summary)||!fields(summary,['result','missing_people','key_decisions'])||!one(summary.result,'success','partial','aborted','failure')||!dense_array(summary.missing_people)||summary.missing_people.length>6||summary.missing_people.some(p=>typeof p!=='string'||!/^([RW])-person-[123]$/.test(p))||new Set(summary.missing_people).size!==summary.missing_people.length||!dense_array(summary.key_decisions)||summary.key_decisions.length>3)return false;
 const ids=new Set<string>();
 for(const d of summary.key_decisions){
  if(!record(d)||!fields(d,['ref','at','operation_id','reason','knowledge_digest','action'])||!ref(d.ref,'decision_record',v.run_id)||!record(d.ref)||ids.has(String(d.ref.id))||!integer(d.at)||!valid_id(d.operation_id)||!digest(d.knowledge_digest)||!one(d.action,'save_plan','request_source_validation','request_preparation','issue_activity','return_and_deliver','abort_outcome'))return false;
  const reason=d.reason;if(!record(reason)||!(fields(reason,['kind'])&&reason.kind==='not_recorded'||fields(reason,['kind','text'])&&reason.kind==='recorded'&&typeof reason.text==='string'&&reason.text.length>0&&reason.text.length<=600))return false;
  ids.add(String(d.ref.id));
 }
 return true;
}
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
  if(!record(d)||!fields(d,['ref','operation_id','at','actor','intent','knowledge_revision','operation_seq','basis_refs','known_then_refs','selected_versions','administrative_receipt_ref','knowledge','knowledge_digest','policy_ref','reason'])||!ref(d.ref,'decision_record',run)||!record(d.ref)||decisionIds.has(String(d.ref.id))||!valid_id(d.operation_id)||operationIds.has(d.operation_id)||!integer(d.at)||d.at>at||d.actor!=='HQ'||d.policy_ref!=='B24-OUTCOME-DESIGN-1.0.0'||!record(d.reason)||!(d.reason.kind==='not_recorded'&&fields(d.reason,['kind'])||d.reason.kind==='recorded'&&fields(d.reason,['kind','text'])&&typeof d.reason.text==='string'&&d.reason.text.trim().length>0&&d.reason.text.length<=600)||!digest(d.knowledge_digest)||!knowledge(d.knowledge,base,d.at)||!integer(d.knowledge_revision)||d.knowledge_revision<1||d.knowledge_revision>=Number(v.revision)||d.operation_seq!==d.knowledge_revision||d.ref.id!=='DEC-'+d.knowledge_revision||!record(d.selected_versions)||!fields(d.selected_versions,['plan_ref','activity_ref','authority_ref'])||!ref(d.administrative_receipt_ref,'administrative_receipt',run)||!record(d.administrative_receipt_ref)||d.administrative_receipt_ref.id!==d.operation_id||!dense_array(d.known_then_refs))return false;
  for(const value of d.known_then_refs){try{const original=parse_outcome_evidence_ref(value);if(original.run_id!==run||original.actor_scope!=='HQ'||original.layer!=='known_then'||original.received_at.kind==='known'&&original.received_at.value>d.at)return false;}catch{return false;}}
  try{parse_outcome_envelope({run_id:run,operation_id:d.operation_id,expected_revision:d.knowledge_revision,intent:d.intent});}catch{return false;}
  if(!record(d.intent)||!equal(d.basis_refs,d.intent.basis_delivery_refs??[])||!equal(d.selected_versions.plan_ref,d.intent.plan_ref??(d.intent.kind==='save_plan'?d.intent.base_plan_ref:null))||!equal(d.selected_versions.activity_ref,d.intent.activity_ref??null)||!equal(d.selected_versions.authority_ref,d.intent.authority_ref??null))return false;
  decisionIds.add(String(d.ref.id));operationIds.add(d.operation_id);
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

export function outcome_decision_evaluation(v:unknown):boolean{
 if(!record(v)||!fields(v,['run_id','run_digest','finished_seq','decision_ref','profile_ref','knowledge_revision','at','reason_status','dimensions'])||!valid_id(v.run_id)||!digest(v.run_digest)||!integer(v.finished_seq)||v.finished_seq<1||!integer(v.knowledge_revision)||v.knowledge_revision<1||v.knowledge_revision>=v.finished_seq||!integer(v.at)||!one(v.reason_status,'recorded','not_recorded')||!dense_array(v.dimensions)||v.dimensions.length!==4)return false;
 const ordinary=(r:unknown)=>record(r)&&fields(r,['run_id','kind','id','version'])&&r.run_id===v.run_id&&valid_id(r.kind)&&valid_id(r.id)&&integer(r.version)&&r.version>=1;
 if(!ordinary(v.decision_ref)||!record(v.decision_ref)||!one(v.decision_ref.kind,'decision_record','rejected_decision'))return false;
 if(v.profile_ref!==null&&(!record(v.profile_ref)||!fields(v.profile_ref,['id','version','definition_hash'])||v.profile_ref.id!=='B24-DQ-01'||v.profile_ref.version!==1||!digest(v.profile_ref.definition_hash)))return false;
 const rules=['DQ-E','DQ-A','DQ-C','DQ-V'];return v.dimensions.every((d,index)=>{
  if(!record(d)||!fields(d,['rule_ref','result','necessary_refs','known_then_refs','matched_conditions','missing'])||!record(d.rule_ref)||!fields(d.rule_ref,['id','version'])||d.rule_ref.id!==rules[index]||d.rule_ref.version!==1||!one(d.result,0,1,2,'not_evaluable')||v.profile_ref===null&&d.result!=='not_evaluable'||!dense_array(d.necessary_refs)||d.necessary_refs.length<1||!d.necessary_refs.every(ordinary)||!dense_array(d.known_then_refs)||!dense_array(d.matched_conditions)||!d.matched_conditions.every(s=>typeof s==='string'&&s.length<=2000)||!dense_array(d.missing)||!d.missing.every(s=>typeof s==='string'&&s.length<=2000))return false;
  const prefix=['E','A','C','V'][index],conditions=d.matched_conditions as string[];
  if(conditions.some(condition=>!new RegExp('^'+prefix+'[12](?::violated)?$').test(condition))||d.result!==0&&conditions.some(condition=>condition.endsWith(':violated'))||d.result===0&&!conditions.some(condition=>condition.endsWith(':violated'))||v.profile_ref===null&&conditions.length>0)return false;
  return d.known_then_refs.every(r=>{try{const value=parse_outcome_evidence_ref(r);return value.run_id===v.run_id&&value.actor_scope==='HQ'&&value.layer==='known_then'&&(value.recorded_at.kind==='unknown'||value.recorded_at.value<=Number(v.at))&&(value.received_at.kind==='unknown'||value.received_at.value<=Number(v.at));}catch{return false;}});
 });
}
