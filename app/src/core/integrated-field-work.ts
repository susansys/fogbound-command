import {GameError} from '../contracts';
import type {IntegratedFieldEnvelope,IntegratedFieldEvidenceRef,IntegratedRefusalReason,IntegratedMaterialReport} from '../integrated-field-contracts';
import {material_report} from './integrated-field-reports';
import {integrated_knowledge} from './integrated-field-knowledge';
import type {IntegratedFieldDefinition} from './integrated-field-definition';
import {integrated_object} from './integrated-field-definition';
import type {IntegratedFieldState} from './integrated-field-state';
import {integrate_movement,next_movement_boundary,complete_integrated_movement,settle_integrated_movement,report_integrated_stop} from './integrated-field-geometry';
import {apply_integrated_environment,next_environment_boundary} from './integrated-field-environment';
type Site='A'|'B';type Actor='R'|'W';
type ActivityIntent=Extract<IntegratedFieldEnvelope['intent'],{kind:'integrated_activity'}>;
type Facility={condition:'faulted'|'unverified_after_replacement'|'operable';version:number};
type Approval={plan_ref:IntegratedFieldEvidenceRef;approval_ref:IntegratedFieldEvidenceRef;approved_at:number};
export type IntegratedArtifact={id:string;source:Site;logical_size_bytes:number;verified:true;completed_at:number;synthetic_payload_ref:string;logical_checksum_ref:string;model_integrity_digest:string};
type Activity={operation_id:string;actor:Actor;action:'read'|'observe'|'inspect'|'repair';target:Site;phase:'prepare'|'copy'|'verify'|'stow'|'observe'|'inspect'|'isolate'|'replace'|'functional_verify'|'safe_stow'|'completed'|'blocked';started_at:number;phase_started_at:number;phase_ends_at:number;copied_bytes:number;verified_bytes:number;ended_at:number|null;stop_reason:'protection_unavailable'|'termination'|null;functional_completed_at:number|null};
type WorkReport={id:string;operation_id:string;actor:Actor;action:Activity['action'];target:Site;phase:'accepted'|'completed'|'refused'|'blocked';reason:IntegratedRefusalReason|null;observed_at:number;generated_at:number;artifact:IntegratedArtifact|null;facility:Facility|null;material:IntegratedMaterialReport};
export type IntegratedProtectionLoss={site:Site;at:number};
export type IntegratedTerminationState={decision_ref:{run_id:string;kind:'termination_decision';id:string;version:1};issued_at:number;reason:string|null;notifications:Array<{actor:Actor;request_seq:number;sent_at:number;arrives_at:number;received_at:number|null}>;actors:Record<Actor,{activity_operation_id:string|null;stow_end_at:number|null;shutdown_at:number|null;receipt_ref:string|null;receipt_kind:'work'|'position'|null}>};
export type IntegratedReportFixture={protection_loss?:IntegratedProtectionLoss|null;repeat_terminal_delivery?:boolean};
export type IntegratedWorkState={
 initial_spares:0|1;
 protection_loss:IntegratedProtectionLoss|null;repeat_terminal_delivery:boolean;termination:IntegratedTerminationState|null;
 pending:Array<{operation_id:string;start_at:number;intent:ActivityIntent;carried_approval:Approval|null;carried_facility:Facility|null}>;
 activities:Activity[];artifacts:IntegratedArtifact[];reports:WorkReport[];
 deliveries:Array<{id:string;report_id:string;sent_at:number;received_at:number;recipient:'HQ'}>;
 portable_energy_uJ:Record<Actor,number>;fixed_source_energy_uJ:Record<Site,number>;storage_free_bytes:Record<'R'|'H',number>;
 facility:Facility;inventory:{available_spares:number;reserved_spares:number;installed_new:number;installed_old:number;recovered_old:number};
 processing_busy_until:number;
 preparation:null|{plan_ref:IntegratedFieldEvidenceRef;approval_ref:IntegratedFieldEvidenceRef;status:'queued'|'validating'|'preparing'|'approved'|'cancelled';start_at:number;validation_end:number;preparation_end:number;approved_at:number|null};
};
export function initial_integrated_work(definition:IntegratedFieldDefinition,initial_spares:0|1=1,fixture:IntegratedReportFixture={}):IntegratedWorkState{if(initial_spares!==0&&initial_spares!==1)throw new GameError('INVALID_DEFINITION');const loss=fixture.protection_loss??null;if(loss&&(!['A','B'].includes(loss.site)||!Number.isSafeInteger(loss.at)||loss.at<0||loss.at>900000)||fixture.repeat_terminal_delivery!==undefined&&typeof fixture.repeat_terminal_delivery!=='boolean')throw new GameError('INVALID_DEFINITION');return{initial_spares,protection_loss:loss?structuredClone(loss):null,repeat_terminal_delivery:fixture.repeat_terminal_delivery??false,termination:null,pending:[],activities:[],artifacts:[],reports:[],deliveries:[],portable_energy_uJ:{R:0,W:0},fixed_source_energy_uJ:{A:0,B:0},storage_free_bytes:{R:definition.configurations.find(config=>config.actor==='R')!.storage_bytes!,H:16000000000},facility:{condition:'faulted',version:1},inventory:{available_spares:initial_spares,reserved_spares:0,installed_new:0,installed_old:1,recovered_old:0},processing_busy_until:definition.work_parameters.intel_busy_until_ms,preparation:null};}
export function integrate_energy_uJ(previous:number,watts:number,elapsed_ms:number):number{
 const amount=watts*1000*elapsed_ms,next=previous+amount;
 if(!Number.isSafeInteger(previous)||previous<0||!Number.isFinite(watts)||watts<0||!Number.isSafeInteger(elapsed_ms)||elapsed_ms<0||!Number.isSafeInteger(amount)||!Number.isSafeInteger(next))throw new GameError('INVALID_DEFINITION');return next;
}
const active=(state:IntegratedFieldState)=>state.work.activities.filter(activity=>!['completed','blocked'].includes(activity.phase));
const protected_at=(state:IntegratedFieldState,site:Site,at:number)=>!state.work.protection_loss||state.work.protection_loss.site!==site||at<state.work.protection_loss.at;
function begin_stow(state:IntegratedFieldState,activity:Activity,at:number,reason:'protection_unavailable'|'termination'){
 if(activity.phase==='safe_stow')return;
 activity.stop_reason=reason;activity.phase='safe_stow';activity.phase_started_at=at;activity.phase_ends_at=at+state.definition.work_parameters.safe_stow_ms;
 if(activity.action==='repair'&&state.work.inventory.reserved_spares){state.work.inventory.available_spares+=state.work.inventory.reserved_spares;state.work.inventory.reserved_spares=0;}
}
function fail_unprotected_work(state:IntegratedFieldState,at:number){for(const activity of active(state)){if(activity.phase==='safe_stow'||!['read','repair'].includes(activity.action)||protected_at(state,activity.target,at))continue;begin_stow(state,activity,at,'protection_unavailable');}}
export function issue_integrated_abort(state:IntegratedFieldState,envelope:IntegratedFieldEnvelope){
 const intent=envelope.intent;if(intent.kind!=='integrated_abort')throw new GameError('INVALID_INPUT');if(state.sim_time>=900000)throw new GameError('CONSTRAINT_DENIED');if(state.work.termination)throw new GameError('ORDER_EXISTS');
 const policy=state.definition.termination_policy,notifications=policy.target_order.map((actor,request_seq)=>{const sent_at=Math.max(state.sim_time,state.hq_sender_free_at),arrives_at=sent_at+policy.link_service_ms;state.hq_sender_free_at=arrives_at;return{actor,request_seq,sent_at,arrives_at,received_at:null};}),actor=()=>({activity_operation_id:null,stow_end_at:null,shutdown_at:null,receipt_ref:null,receipt_kind:null});
 state.work.termination={decision_ref:{run_id:state.run_id,kind:'termination_decision',id:envelope.operation_id+'-decision',version:1},issued_at:state.sim_time,reason:intent.reason??null,notifications,actors:{R:actor(),W:actor()}};
 const prep=state.work.preparation;if(prep&&prep.status!=='approved'){prep.status='cancelled';state.work.processing_busy_until=state.sim_time;}
}
function receive_termination(state:IntegratedFieldState,at:number){
 const termination=state.work.termination;if(!termination)return;
 for(const notification of termination.notifications){if(notification.received_at!==null||notification.arrives_at!==at)continue;notification.received_at=at;const actor=notification.actor,cleanup=termination.actors[actor],motion=state.actors[actor].motion;
  state.pending_moves=state.pending_moves.filter(command=>command.actor!==actor);state.work.pending=state.work.pending.filter(command=>command.intent.actor!==actor);
  if(motion&&(motion.status==='moving'||motion.status==='queued')){motion.status='blocked';motion.ended_at=at;}
  const activity=active(state).find(activity=>activity.actor===actor);if(activity){cleanup.activity_operation_id=activity.operation_id;if(state.definition.termination_policy.non_preemptible.some(phase=>phase===activity.phase))activity.stop_reason='termination';else begin_stow(state,activity,at,'termination');}
  else cleanup.stow_end_at=at+state.definition.work_parameters.safe_stow_ms;
 }
 for(const actor of state.definition.termination_policy.target_order){const cleanup=termination.actors[actor];if(cleanup.activity_operation_id===null&&cleanup.stow_end_at===at&&cleanup.receipt_ref===null){const report=report_integrated_stop(state,actor,at,termination.decision_ref.id+'-'+actor);cleanup.receipt_ref=report.evidence;cleanup.receipt_kind='position';cleanup.shutdown_at=report.received_at;}}
 if(state.definition.termination_policy.target_order.every(actor=>termination.actors[actor].shutdown_at!==null&&termination.actors[actor].shutdown_at!<=at)){state.ended=true;state.finished=true;state.paused=true;}
}
export function delivered_work_reports(state:IntegratedFieldState){return state.work.deliveries.filter(delivery=>delivery.received_at<=state.sim_time).sort((a,b)=>a.received_at-b.received_at||a.id.localeCompare(b.id)).map(delivery=>({delivery,report:state.work.reports.find(report=>report.id===delivery.report_id)!}));}
export function termination_view(state:IntegratedFieldState):import('../integrated-field-contracts').IntegratedTerminationView|null{
 const termination=state.work.termination;if(!termination)return null;
 const receipts:import('../integrated-field-contracts').IntegratedTerminationView['receipts']=[];
 for(const actor of state.definition.termination_policy.target_order){const cleanup=termination.actors[actor];if(cleanup.receipt_kind==='position'){const report=state.position_reports.find(report=>report.evidence===cleanup.receipt_ref&&report.received_at<=state.sim_time);if(report)receipts.push({actor,ref:{run_id:state.run_id,kind:'position_report',id:report.evidence,version:1},observed_at:report.observed_at,received_at:report.received_at,position:[report.point_um[0]/1000000,report.point_um[1]/1000000]});}else if(cleanup.receipt_kind==='work'){const item=delivered_work_reports(state).find(item=>item.report.id===cleanup.receipt_ref);if(item)receipts.push({actor,ref:{run_id:state.run_id,kind:'report',id:item.report.id,version:1},observed_at:item.report.observed_at,received_at:item.delivery.received_at,position:null});}}
 return{decision_ref:structuredClone(termination.decision_ref),issued_at:termination.issued_at,reason:termination.reason,status:receipts.length===2?'confirmed':'terminating',receipts};
}
export function delivered_work_evidence(state:IntegratedFieldState){return delivered_work_reports(state).map(({report,delivery},index)=>({id:delivery.id,report_ref:report.id,message_ref:report.id+'-message',sender:report.actor,recipient:'HQ' as const,sent_at:delivery.sent_at,knowledge_seq:index+1,artifact_ref:report.artifact?.id??null,actor:report.actor,action:report.action,target:report.target,object_ref:structuredClone(report.material.object_ref),scope_ref:structuredClone(report.material.scope_ref),configuration_ref:structuredClone(report.material.configuration_ref),phase:report.phase,reason:report.reason,observed_at:report.observed_at,received_at:delivery.received_at}));}
export function work_knowledge(state:IntegratedFieldState){return integrated_knowledge({run_id:state.run_id,as_of:state.sim_time,reports:state.work.reports.map(report=>report.material),deliveries:delivered_work_evidence(state),relations:[]});}
function report(state:IntegratedFieldState,activity:Pick<Activity,'operation_id'|'actor'|'action'|'target'>&Partial<Pick<Activity,'started_at'|'functional_completed_at'>>,phase:WorkReport['phase'],at:number,artifact:IntegratedArtifact|null=null,facility:Facility|null=null,reason:IntegratedRefusalReason|null=null){
 const target=integrated_object(state.definition,activity.target,'facility');if(artifact&&(artifact.source!==activity.target||!target.properties.some(property=>property==='data_source'))||facility&&(activity.target!=='B'||!target.properties.some(property=>property==='facility_condition')))throw new GameError('INVALID_DEFINITION');
 const actor=state.actors[activity.actor],sent_at=Math.max(at,actor.sender_free_at),received_at=sent_at+1000;actor.sender_free_at=received_at;
 const stoppedRepair=phase==='blocked'&&activity.actor==='W'&&activity.action==='repair'&&state.work.termination?.actors.W.activity_operation_id===activity.operation_id,disclosed=stoppedRepair?state.work.facility:facility;
 const id=activity.operation_id+'-'+phase+'-report',material=material_report(state,{...activity,id,phase,at,started_at:activity.started_at??at,reason,artifact,facility:disclosed,...(stoppedRepair?{installation_account:state.work.inventory}:{})});state.work.reports.push({id,operation_id:activity.operation_id,actor:activity.actor,action:activity.action,target:activity.target,phase,reason,observed_at:material.observed_at,generated_at:at,artifact:artifact?structuredClone(artifact):null,facility:disclosed?structuredClone(disclosed):null,material});
 state.work.deliveries.push({id:activity.operation_id+'-'+phase+'-delivery',report_id:id,sent_at,received_at,recipient:'HQ'});
 if(state.work.repeat_terminal_delivery&&phase!=='accepted'){state.work.deliveries.push({id:activity.operation_id+'-'+phase+'-redelivery',report_id:id,sent_at:received_at,received_at:received_at+1000,recipient:'HQ'});actor.sender_free_at=received_at+1000;}
 return{id,received_at};
}
export function issue_integrated_prepare(state:IntegratedFieldState,envelope:IntegratedFieldEnvelope){
 const intent=envelope.intent;if(intent.kind!=='integrated_prepare')throw new GameError('INVALID_INPUT');
 if(state.sim_time>=900000)throw new GameError('CONSTRAINT_DENIED');
 if(intent.plan_ref.run_id!==state.run_id||intent.plan_ref.id!=='B33-PLAN-1')throw new GameError('INVALID_REQUEST');
 if(state.work.preparation)throw new GameError('ORDER_EXISTS');
 const p=state.definition.work_parameters,start_at=Math.max(state.sim_time,state.work.processing_busy_until),validation_end=start_at+p.validation_ms,preparation_end=validation_end+p.preparation_ms;
 if(preparation_end>=900000)throw new GameError('CONSTRAINT_DENIED');
 state.work.preparation={plan_ref:structuredClone(intent.plan_ref),approval_ref:{run_id:state.run_id,id:'B33-PLAN-1-preparation-approval',version:1},status:'queued',start_at,validation_end,preparation_end,approved_at:null};state.work.processing_busy_until=preparation_end;
}
export function issue_integrated_activity(state:IntegratedFieldState,envelope:IntegratedFieldEnvelope){
 const intent=envelope.intent;if(intent.kind!=='integrated_activity')throw new GameError('INVALID_INPUT');
 if(state.sim_time>=900000)throw new GameError('CONSTRAINT_DENIED');
 const basis=intent.basis_refs;if(basis.some(ref=>ref.run_id!==state.run_id)||new Set(basis.map(ref=>ref.id)).size!==basis.length)throw new GameError('INVALID_REQUEST');
 const delivered=delivered_work_reports(state),legal=new Set<string>(),point=state.definition.geometry.points[intent.target];
 const samePoint=(value:readonly number[])=>value.every((coordinate,index)=>coordinate===point[index]);
 const known=state.actors[intent.actor].known;if(known&&samePoint(known.point))legal.add(known.evidence);
 for(const position of state.position_reports)if(position.actor===intent.actor&&position.received_at<=state.sim_time&&samePoint(position.point_um.map(value=>value/1000000)))legal.add(position.evidence);
 if(intent.actor==='R'&&intent.action==='read'&&intent.target==='A')legal.add('opening-A-access');
 // Resolve the registered approval identity here; the hard gate below still requires actual approval.
 if(intent.actor==='W'&&intent.action==='repair'&&state.work.preparation)legal.add(state.work.preparation.approval_ref.id);
 for(const {report,delivery} of delivered)if(report.actor==='W'&&report.target==='B'&&(intent.actor==='W'&&intent.action==='repair'&&report.phase==='completed'&&report.action==='inspect'||intent.actor==='R'&&intent.action==='read'&&intent.target==='B'&&report.action==='repair'&&(report.phase==='completed'||report.phase==='blocked')&&report.material.method==='functional'&&report.facility?.condition==='operable'))legal.add(delivery.id);
 if(basis.some(ref=>!legal.has(ref.id)))throw new GameError('INVALID_REQUEST');
 let carried_approval:Approval|null=null,carried_facility:Facility|null=null;
 if(intent.actor==='R'){
  const position=state.actors.R.known,target=state.definition.geometry.points[intent.target];
  if(!position||!basis.some(ref=>ref.id===position.evidence)||position.point.some((value,index)=>value!==target[index]))throw new GameError('EVIDENCE_REQUIRED');
  if(intent.target==='A'){if(intent.action==='read'&&!basis.some(ref=>ref.id==='opening-A-access'))throw new GameError('EVIDENCE_REQUIRED');}
  else{
   const available=work_knowledge(state).functional_proofs,proof=delivered.find(({report,delivery})=>report.action==='repair'&&report.material.method==='functional'&&report.target==='B'&&report.facility?.condition==='operable'&&available.some(candidate=>candidate.report_ref===report.id&&candidate.object_version===report.facility!.version)&&basis.some(ref=>ref.id===delivery.id));
   if(!proof?.report.facility)throw new GameError('EVIDENCE_REQUIRED');
   carried_facility=structuredClone(proof.report.facility);
  }
 }else{
  if(intent.plan_ref.run_id!==state.run_id||intent.plan_ref.id!=='B33-PLAN-1')throw new GameError('INVALID_REQUEST');
  if(intent.action==='repair'){
   const prep=state.work.preparation,inspection=delivered_work_reports(state).find(item=>item.report.action==='inspect'&&item.report.phase==='completed'&&item.report.target==='B'&&basis.some(ref=>ref.id===item.delivery.id));
   if(!prep||prep.status!=='approved'||prep.plan_ref.id!==intent.plan_ref.id||prep.plan_ref.version!==intent.plan_ref.version||!basis.some(ref=>ref.id===prep.approval_ref.id)||!inspection)throw new GameError('EVIDENCE_REQUIRED');
   carried_approval={plan_ref:structuredClone(prep.plan_ref),approval_ref:structuredClone(prep.approval_ref),approved_at:prep.approved_at!};
  }
 }
 if(state.inputs.filter(input=>'actor' in input.envelope.intent&&input.envelope.intent.actor===intent.actor).length>=16)throw new GameError('CAPACITY_CONFLICT');
 const start_at=Math.max(state.sim_time,state.hq_sender_free_at)+1000;state.hq_sender_free_at=start_at;state.work.pending.push({operation_id:envelope.operation_id,start_at,intent:structuredClone(intent),carried_approval,carried_facility});
}
function complete_work(state:IntegratedFieldState,at:number){
 const p=state.definition.work_parameters,prep=state.work.preparation;
 if(prep&&prep.status!=='cancelled'){if(at===prep.start_at)prep.status='validating';if(at===prep.validation_end)prep.status='preparing';if(at===prep.preparation_end){prep.status='approved';prep.approved_at=at;}}
 for(const activity of active(state)){
  if(activity.phase_ends_at===at){
   const stopBeforeNext=activity.stop_reason==='termination'||state.work.termination?.notifications.some(notification=>notification.actor===activity.actor&&notification.arrives_at===at);
   if(stopBeforeNext&&['prepare','copy','verify','isolate'].includes(activity.phase)){begin_stow(state,activity,at,'termination');continue;}
   if(activity.phase==='safe_stow'){activity.phase='blocked';activity.ended_at=at;const receipt=report(state,activity,'blocked',at,null,null,activity.stop_reason??'protection_unavailable'),cleanup=state.work.termination?.actors[activity.actor];if(cleanup?.activity_operation_id===activity.operation_id){cleanup.receipt_ref=receipt.id;cleanup.receipt_kind='work';cleanup.shutdown_at=receipt.received_at;}}
   else if(activity.phase==='prepare'){activity.phase='copy';activity.phase_ends_at=at+Math.ceil(p.read_bytes/p.copy_bytes_per_second*1000);}
   else if(activity.phase==='copy'){activity.phase='verify';activity.phase_ends_at=at+Math.ceil(p.read_bytes/p.verify_bytes_per_second*1000);}
   else if(activity.phase==='verify'){activity.phase='stow';activity.phase_ends_at=at+p.read_stow_ms;}
   else if(activity.phase==='isolate'){activity.phase='replace';activity.phase_ends_at=at+p.replace_ms;}
   else if(activity.phase==='replace'){
    const inventory=state.work.inventory;if(inventory.reserved_spares!==1||inventory.installed_old!==1)throw new GameError('INVALID_SAVE');
    inventory.reserved_spares--;inventory.installed_new++;inventory.installed_old--;inventory.recovered_old++;state.work.facility={condition:'unverified_after_replacement',version:state.work.facility.version+1};if(stopBeforeNext)begin_stow(state,activity,at,'termination');else{activity.phase='functional_verify';activity.phase_ends_at=at+p.functional_verify_ms;}
   }else{
    const phase=activity.phase;if(phase==='functional_verify'){state.work.facility={condition:'operable',version:state.work.facility.version+1};activity.functional_completed_at=at;}if(activity.stop_reason==='termination'){begin_stow(state,activity,at,'termination');continue;}activity.phase='completed';activity.ended_at=at;
    if(phase==='stow'){
     const source=state.definition.synthetic_data_sources.find(source=>source.site===activity.target)!;
     const artifact:IntegratedArtifact={id:activity.operation_id+'-artifact',source:activity.target,logical_size_bytes:p.read_bytes,verified:true,completed_at:at,synthetic_payload_ref:source.id,logical_checksum_ref:source.logical_checksum_ref,model_integrity_digest:state.hashes['data_payload_'+activity.target]};
     state.work.artifacts.push(artifact);state.work.storage_free_bytes.R-=p.read_bytes;report(state,activity,'completed',at,artifact);
    }else{
     report(state,activity,'completed',at,null,phase==='observe'?null:state.work.facility);
    }
   }
   activity.phase_started_at=at;
  }
  if(at>=900000&&activity.phase!=='completed'&&activity.phase!=='blocked'&&activity.phase!=='safe_stow'){activity.phase='blocked';activity.ended_at=at;report(state,activity,'blocked',at);}
 }
}
function accept_work(state:IntegratedFieldState,at:number){
 const pending=state.work.pending.filter(order=>order.start_at===at);state.work.pending=state.work.pending.filter(order=>order.start_at!==at);
 for(const order of pending){
  const intent=order.intent,p=state.definition.work_parameters,target=state.definition.geometry.points[intent.target],position=state.actors[intent.actor].position_um;
  const localTarget=integrated_object(state.definition,intent.target,'facility');integrated_object(state.definition,intent.actor,'actor');if(intent.action==='read'&&!localTarget.properties.some(property=>property==='data_source')||(intent.action==='inspect'||intent.action==='repair')&&!localTarget.properties.some(property=>property==='facility_condition'))throw new GameError('INVALID_DEFINITION');
  const occupied=active(state).some(activity=>activity.actor===intent.actor||activity.target===intent.target);
  let reason:IntegratedRefusalReason|null=null;
  if(at>=900000)reason='deadline';else if(occupied)reason='station_busy';else if(state.actors[intent.actor].motion?.status==='moving')reason='actor_in_transit';else if(position.some((value,index)=>value!==target[index]*1000000))reason='position_unconfirmed';else if((intent.action==='read'||intent.action==='repair')&&!protected_at(state,intent.target,at))reason='protection_unavailable';
  else if(intent.action==='read'&&state.work.storage_free_bytes.R<p.read_bytes)reason='capacity';
  else if(intent.action==='read'&&intent.target==='B'&&(!order.carried_facility||state.work.facility.condition!=='operable'||state.work.facility.version!==order.carried_facility.version))reason='facility_unconfirmed';
  else if(intent.action==='repair'){if(!order.carried_approval)reason='preparation_unavailable';else if(state.work.inventory.available_spares<1)reason='missing_part';else if(state.work.facility.condition!=='faulted')reason='facility_condition';else if(at+p.isolate_ms+p.replace_ms+p.functional_verify_ms+10000>900000)reason='deadline';}
  if(reason){report(state,{operation_id:order.operation_id,actor:intent.actor,action:intent.action,target:intent.target},'refused',at,null,null,reason);continue;}
  const phase=intent.action==='read'?'prepare':intent.action==='observe'?'observe':intent.action==='inspect'?'inspect':'isolate',duration=intent.action==='read'?p.read_prepare_ms:intent.action==='observe'?p.observe_ms:intent.action==='inspect'?p.inspect_ms:p.isolate_ms;
  if(intent.action==='repair'){state.work.inventory.available_spares--;state.work.inventory.reserved_spares++;}
  const activity:Activity={operation_id:order.operation_id,actor:intent.actor,action:intent.action,target:intent.target,phase,started_at:at,phase_started_at:at,phase_ends_at:at+duration,copied_bytes:0,verified_bytes:0,ended_at:null,stop_reason:null,functional_completed_at:null};state.work.activities.push(activity);report(state,activity,'accepted',at);
 }
}
function power(state:IntegratedFieldState,actor:Actor,at:number){
 const shutdown=state.work.termination?.actors[actor].shutdown_at;if(shutdown!=null&&at>=shutdown)return 0;
 const p=state.definition.work_parameters,activity=active(state).find(activity=>activity.actor===actor);
 if(activity?.phase==='safe_stow')return actor==='R'?p.R_idle_watts:p.W_idle_watts;
 if(actor==='R')return activity?activity.action==='observe'?p.R_observe_watts:p.R_read_watts:p.R_idle_watts;
 if(activity)return activity.phase==='inspect'?p.W_inspect_watts:activity.phase==='isolate'?p.W_isolate_watts:activity.phase==='replace'?p.W_replace_watts:p.W_verify_watts;
 if(state.actors.W.motion?.status==='moving')return p.W_idle_watts;
 const h=state.definition.geometry.points.H;return state.actors.W.position_um.every((value,index)=>value===h[index]*1000000)?p.W_off_watts:p.W_idle_watts;
}
export function advance_integrated_world(state:IntegratedFieldState,to:number):number{
 let cursor=state.sim_time,steps=0;const p=state.definition.work_parameters;
 const settle=(at:number)=>{complete_work(state,at);complete_integrated_movement(state,at);apply_integrated_environment(state,at);fail_unprotected_work(state,at);receive_termination(state,at);settle_integrated_movement(state,at,new Set(active(state).map(activity=>activity.actor)));accept_work(state,at);};settle(cursor);
 while(cursor<to&&!state.ended){
  if(++steps>128)throw new GameError('INVALID_DEFINITION');let boundary=Math.min(next_movement_boundary(state,cursor,to),next_environment_boundary(state,cursor,to));
  for(const activity of active(state))if(activity.phase_ends_at>cursor)boundary=Math.min(boundary,activity.phase_ends_at);
  for(const order of state.work.pending)if(order.start_at>cursor)boundary=Math.min(boundary,order.start_at);
  for(const item of state.work.deliveries)if(item.received_at>cursor)boundary=Math.min(boundary,item.received_at);
  if(state.work.termination){for(const notification of state.work.termination.notifications)if(notification.arrives_at>cursor)boundary=Math.min(boundary,notification.arrives_at);for(const actor of state.definition.termination_policy.target_order)for(const at of [state.work.termination.actors[actor].stow_end_at,state.work.termination.actors[actor].shutdown_at])if(at!==null&&at>cursor)boundary=Math.min(boundary,at);}
  if(state.work.protection_loss&&state.work.protection_loss.at>cursor)boundary=Math.min(boundary,state.work.protection_loss.at);
  if(state.work.preparation&&state.work.preparation.status!=='cancelled')for(const at of [state.work.preparation.start_at,state.work.preparation.validation_end,state.work.preparation.preparation_end])if(at>cursor)boundary=Math.min(boundary,at);
  if(boundary<=cursor)throw new GameError('INVALID_SAVE');const elapsed=boundary-cursor,running=active(state);
  state.work.portable_energy_uJ.R=integrate_energy_uJ(state.work.portable_energy_uJ.R,power(state,'R',cursor),elapsed);state.work.portable_energy_uJ.W=integrate_energy_uJ(state.work.portable_energy_uJ.W,power(state,'W',cursor),elapsed);
  integrate_movement(state,cursor,boundary);
  for(const activity of running)if(activity.action==='read'&&activity.phase!=='safe_stow'){
   state.work.fixed_source_energy_uJ[activity.target]=integrate_energy_uJ(state.work.fixed_source_energy_uJ[activity.target],p.fixed_source_watts,elapsed);
   if(activity.phase==='copy')activity.copied_bytes=Math.min(p.read_bytes,activity.copied_bytes+p.copy_bytes_per_second*elapsed/1000);
   if(activity.phase==='verify')activity.verified_bytes=Math.min(p.read_bytes,activity.verified_bytes+p.verify_bytes_per_second*elapsed/1000);
  }
  cursor=boundary;settle(cursor);
 }
 return cursor;
}
