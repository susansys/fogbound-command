import {GameError} from '../contracts';import type {ReturnReport,ReceptionBatch} from '../outcome-contracts';import type {OutcomeState,ReturnPlan} from './outcome-state';import type {OutcomeDefinition} from './outcome-definition';
import {path_timing,ceil_fraction,progress_on_path,fraction_to_number,multiply_fraction,number_fraction,fraction,type Fraction} from './play-timing';import {intelligence_site} from './intelligence-execution';
import {create_reception_manifest,verify_reception_manifest} from './outcome-validation';
const ref=<K extends string>(s:OutcomeState,kind:K,id:string)=>({run_id:s.run_id,kind,id,version:1});
function return_energy(distance:Fraction,d:OutcomeDefinition){
 const value=d.prefix_definition.profile.resolved_registry.find(r=>r.id==='PLAY S07 movement.energy')?.value;
 if(!value||typeof value!=='object'||Array.isArray(value)||!('energy_per_100_metre' in value)||typeof value.energy_per_100_metre!=='number')throw new GameError('INVALID_DEFINITION');
 return ceil_fraction(multiply_fraction(distance,number_fraction(value.energy_per_100_metre/100)));
}
function publish_return(s:OutcomeState,plan:ReturnPlan,phase:ReturnReport['phase'],at:number,d:OutcomeDefinition){
 const local=s.prefix.field.actors.find(a=>a.actor===plan.actor)!,p=d.profile.parameters;
 const atFacility=JSON.stringify(local.position.point)===JSON.stringify(intelligence_site(d.prefix_definition,local.position.site));
 const fixed=local.facility_authorized&&atFacility&&((local.position.site==='H'&&(plan.actor==='W'||d.profile.outcome.R_H_terminal_actions.includes('return_terminal')))||local.position.site==='B'&&d.prefix_definition.catalogs.fixed_facilities.some(f=>f.location==='B'&&f.actors.includes(plan.actor)));
 const portable=!fixed&&plan.actor==='R'&&local.equipment.includes('LINK')&&local.resources.link_energy>=p.send_energy_cost&&local.resources.link_durability>=p.send_wear_cost;
 if(portable){local.resources.link_energy-=p.send_energy_cost;local.resources.link_durability-=p.send_wear_cost;}
 const r=ref(s,'return_report',plan.original_decision_ref.id+'-'+phase);
 if(s.return_reports.some(old=>old.ref.id===r.id))throw new GameError('ENGINE_UNCONFIRMED');
 s.return_reports.push({ref:r,actor:plan.actor,phase,observed:{kind:'known',value:at,evidence:r.id},source_event_time:{kind:'unknown'},source_published:at,position_scope:local.position.site,confirmation:structuredClone({position:local.position,resources:local.resources,load:local.load,space:local.space}),reason:plan.reason});
 if(fixed||portable)for(const target of phase==='completed'?['HQ','H'] as const:['HQ'] as const)s.return_deliveries.push({ref:ref(s,'return_delivery','D-'+r.id+'-'+target),report_ref:r,target,sent:at,received:at+p.link_ms,channel:fixed?(local.position.site==='H'?'H-fixed':'B-fixed'):'R-portable'});
 return r;
}
function publish_reception(s:OutcomeState,b:ReceptionBatch,phase:'accepted'|'completed'|'cutoff'|'hold',at:number,d:OutcomeDefinition){
 const r=ref(s,'reception_report',b.ref.id+'-'+phase);s.reception_reports.push({ref:r,subject_actor:b.actor,original_decision_ref:structuredClone(b.original_decision_ref),batch_ref:b.ref,phase,reason:b.hold_reason,observed:{kind:'known',value:at,evidence:r.id},source_event_time:{kind:'unknown'},source_published:at,people_ids:[...b.people_ids],artifact_refs:structuredClone(b.artifact_refs)});
 for(const target of phase==='completed'?['HQ','INTEL'] as const:['HQ'] as const)s.reception_deliveries.push({ref:ref(s,'reception_delivery','D-'+r.id+'-'+target),report_ref:r,target,sent:at,received:at+d.profile.parameters.link_ms});return r;
}
export function next_outcome_time(s:OutcomeState,to:number,d:OutcomeDefinition):number{
 const candidates=[to,d.profile.parameters.deadline,d.profile.parameters.processing_initial_busy_until,...s.prefix.processing.items.flatMap(i=>i.status==='running'&&i.started_at!==null?[i.started_at+i.work_required_ms]:i.status==='queued'?[Math.max(i.eligible_at,d.profile.parameters.processing_initial_busy_until)]:[]),...s.return_plans.flatMap(p=>p.status==='issued'?[p.arrives_at]:p.status==='returning'&&p.completes_at!==null?[p.completes_at]:[]),...s.return_deliveries.map(x=>x.received),...s.reception_batches.flatMap(b=>b.status==='running'&&b.started_at!==null?[b.started_at+d.profile.outcome.handover_setup_ms+d.profile.outcome.handover_work*d.profile.parameters.ms_per_work]:[]),...s.reception_deliveries.map(x=>x.received),...s.verification_batches.flatMap(b=>b.status==='running'&&b.started_at!==null?[b.started_at+d.profile.outcome.verification_work*d.profile.parameters.ms_per_work]:[])];
 return Math.min(...candidates.filter(t=>t>s.sim_time));
}
export async function advance_return_reception(s:OutcomeState,at:number,d:OutcomeDefinition){
 const p=d.profile.parameters;
 for(const notification of s.notifications)if(['H','INTEL'].includes(notification.target)&&notification.received===null&&notification.eligible_at<=at)notification.received=notification.eligible_at;
 for(const plan of s.return_plans){
  const local=s.prefix.field.actors.find(a=>a.actor===plan.actor)!,r=local.resources;
  if(plan.status==='issued'&&plan.arrives_at<=at){
   const facility=local.facility_authorized&&JSON.stringify(local.position.point)===JSON.stringify(intelligence_site(d.prefix_definition,local.position.site))&&d.prefix_definition.catalogs.fixed_facilities.some(f=>f.location===local.position.site&&f.actors.includes(plan.actor));
   if(!facility&&!(local.equipment.includes('LINK')&&r.link_durability>0))continue;
   const notification=s.notifications.find(n=>n.target===plan.actor&&n.original_decision_ref.id===plan.original_decision_ref.id)!;notification.received=Math.max(notification.eligible_at,at);plan.arrives_at=notification.received;
   if(plan.arrives_at>=p.deadline||plan.arrives_at<plan.request.intent.effective_window.from||plan.arrives_at>=plan.request.intent.effective_window.to||plan.request.intent.return_route_ref.id!==plan.actor+'-'+local.position.site+'-H'||s.prefix.field.orders.some(o=>o.payload.actor_ref.id===plan.actor&&['issued','running'].includes(o.status))){plan.status='hold';plan.reason='等待当地返回条件';publish_return(s,plan,'refused',plan.arrives_at,d);continue;}
   plan.path=[structuredClone(local.position.point),intelligence_site(d.prefix_definition,'H')];plan.timing=path_timing(plan.path,{capability_ref:plan.actor+':return',speed:p.base_speed,unit:'fictional_metre/s',load:local.load,terrain_factor:1,environment_factor:1,load_factor_per_unit:d.rules.load_factor_per_unit,length_scale:1000000,applied_causes:[],evidence_refs:[plan.request.intent.return_route_ref.id]});
   const cost=return_energy(fraction(plan.timing.length_units.reduce((sum,n)=>sum+BigInt(n),0n),1000000),d);if(r.movement_energy-r.movement_energy_reserved<cost){plan.status='hold';plan.reason='等待当地返回条件';publish_return(s,plan,'refused',plan.arrives_at,d);continue;}
   plan.accepted_at=plan.arrives_at;plan.completes_at=plan.arrives_at+ceil_fraction(plan.timing.duration_ms);plan.reserved_energy=cost;r.movement_energy_reserved+=plan.reserved_energy;plan.status='returning';const report_ref=publish_return(s,plan,'accepted',plan.arrives_at,d);
   s.continuation_records.push({ref:ref(s,'continuation_record',plan.original_decision_ref.id+'-return'),original_decision_ref:plan.original_decision_ref,actor:plan.actor,action:'return',at:plan.arrives_at,notification_ref:s.notifications.find(n=>n.target===plan.actor&&n.original_decision_ref.id===plan.original_decision_ref.id)!.ref,report_ref});
  }
  if(plan.status==='returning'&&plan.accepted_at!==null&&plan.completes_at!==null&&plan.timing){
   const end=Math.min(at,plan.completes_at,p.deadline),progress=progress_on_path(plan.path,plan.timing,Math.max(0,end-plan.accepted_at));local.position.point=[fraction_to_number(progress.position.x),fraction_to_number(progress.position.y)];
   if(end===Math.min(plan.completes_at,p.deadline)){
    const energy=return_energy(progress.distance,d);r.movement_energy-=energy;r.movement_energy_reserved-=plan.reserved_energy;plan.settled=true;plan.status=plan.completes_at<=p.deadline?'arrived':'cutoff';if(plan.status==='arrived')local.position.site='H';publish_return(s,plan,plan.status==='arrived'?'completed':'cutoff',end,d);
   }
  }
 }
 // H has its own received plan and terminal proof; global coordinates never open this gate.
 for(const delivery of s.return_deliveries.filter(x=>x.target==='H'&&x.received<=at)){
  const report=s.return_reports.find(r=>r.ref.id===delivery.report_ref.id)!;if(report.phase!=='completed')continue;const plan=s.return_plans.find(r=>r.actor===report.actor)!;
  if(s.reception_batches.some(b=>b.actor===report.actor)||!s.notifications.some(n=>n.target==='H'&&n.original_decision_ref.id===plan.original_decision_ref.id&&n.received!==null&&n.received<=delivery.received))continue;
  const people=d.catalogs.actors.find(a=>a.id===plan.actor)!.people,artifact_refs=s.prefix.field.artifacts.filter(a=>a.custody_holder===plan.actor).map(a=>structuredClone(a.ref));
  s.reception_batches.push({ref:ref(s,'reception_batch','H-'+plan.original_decision_ref.id),actor:plan.actor,original_decision_ref:plan.original_decision_ref,arrival_delivery_ref:delivery.ref,ready_at:delivery.received,status:'queued',hold_reason:null,started_at:null,completed_at:null,people_ids:Array.from({length:people},(_,i)=>plan.actor+'-person-'+(i+1)),artifact_refs,generation:s.generation});
 }
 s.reception_batches.sort((a,b)=>a.ready_at-b.ready_at||s.return_deliveries.findIndex(x=>x.ref.id===a.arrival_delivery_ref.id)-s.return_deliveries.findIndex(x=>x.ref.id===b.arrival_delivery_ref.id)||(a.ref.id<b.ref.id?-1:a.ref.id>b.ref.id?1:0));
 // Complete the current batch before selecting the next same-time FIFO batch.
 for(const b of s.reception_batches)if(b.status==='running'&&b.started_at!==null){const finish=b.started_at+d.profile.outcome.handover_setup_ms+d.profile.outcome.handover_work*p.ms_per_work;if(at<Math.min(finish,p.deadline))continue;
  if(finish>p.deadline){b.status='cutoff';b.completed_at=p.deadline;publish_reception(s,b,'cutoff',p.deadline,d);continue;}
  if(b.people_ids.some(id=>s.person_receipts.some(r=>r.person_id===id))||b.artifact_refs.some(a=>s.custody_events.some(c=>c.artifact_ref.id===a.id)))throw new GameError('ENGINE_UNCONFIRMED');
  b.status='completed';b.completed_at=finish;const confirmation_refs=([b.actor,'H'] as const).map(actor=>{const confirmation={ref:ref(s,'handover_confirmation',b.ref.id+'-confirm-'+actor),batch_ref:structuredClone(b.ref),actor,at:finish,people_ids:[...b.people_ids],artifact_refs:structuredClone(b.artifact_refs)};s.handover_confirmations.push(confirmation);return structuredClone(confirmation.ref);});for(const id of b.people_ids)s.person_receipts.push({ref:ref(s,'person_receipt',b.ref.id+'-'+id),batch_ref:b.ref,person_id:id,received_at:finish,confirmation_refs:structuredClone(confirmation_refs)});for(const artifact_ref of b.artifact_refs)s.custody_events.push({ref:ref(s,'custody_event',b.ref.id+'-'+artifact_ref.id),batch_ref:b.ref,artifact_ref,from:b.actor,to:'H',at:finish,lifecycle:'delivered',verification:'pending',confirmation_refs:structuredClone(confirmation_refs)});s.reception_manifests.push(await create_reception_manifest(s,b,d));publish_reception(s,b,'completed',finish,d);
 }
 for(const delivery of s.reception_deliveries.filter(x=>x.target==='INTEL'&&x.received<=at)){
  const manifest=s.reception_reports.find(r=>r.ref.id===delivery.report_ref.id)!;if(manifest.phase!=='completed'||s.verification_batches.some(b=>b.reception_ref.id===manifest.batch_ref.id))continue;const reception=s.reception_batches.find(b=>b.ref.id===manifest.batch_ref.id)!;
  s.verification_batches.push({ref:ref(s,'verification_batch','V-'+reception.ref.id),reception_ref:reception.ref,manifest_delivery_ref:delivery.ref,original_decision_ref:reception.original_decision_ref,queued_at:delivery.received,status:'queued',started_at:null,completed_at:null,work_done_ms:0,reserved_energy:0,consumed_energy:0,settled:false,generation:s.generation});
 }
 for(const b of s.verification_batches)if(b.status==='running'&&b.started_at!==null){const duration=d.profile.outcome.verification_work*p.ms_per_work,finish=b.started_at+duration;b.work_done_ms=Math.max(0,Math.min(at,finish,p.deadline)-b.started_at);if(at<Math.min(finish,p.deadline))continue;b.completed_at=Math.min(finish,p.deadline);b.status=finish<=p.deadline?'completed':'cutoff';b.consumed_energy=Math.ceil(b.reserved_energy*b.work_done_ms/duration);s.prefix.processing.energy-=b.consumed_energy;s.prefix.processing.energy_reserved-=b.reserved_energy;b.settled=true;
  if(b.status==='completed'){const reception=s.reception_batches.find(r=>r.ref.id===b.reception_ref.id)!,r=ref(s,'verification_report',b.ref.id+'-completed');s.verification_reports.push({ref:r,subject_actor:reception.actor,original_decision_ref:structuredClone(b.original_decision_ref),reception_ref:structuredClone(reception.ref),batch_ref:b.ref,observed:{kind:'known',value:finish,evidence:r.id},source_event_time:{kind:'unknown'},source_published:finish,...await verify_reception_manifest(s.reception_manifests.find(m=>m.batch_ref.id===reception.ref.id),reception)});s.verification_deliveries.push({ref:ref(s,'verification_delivery','D-'+r.id),report_ref:r,target:'HQ',sent:finish,received:finish+p.link_ms});for(const action of ['verify_manifest','notify_HQ'] as const)s.continuation_records.push({ref:ref(s,'continuation_record',b.ref.id+'-'+action),original_decision_ref:b.original_decision_ref,actor:'INTEL',action,at:finish,notification_ref:s.notifications.find(n=>n.target==='INTEL'&&n.original_decision_ref.id===b.original_decision_ref.id)!.ref,report_ref:r});}
 }
 if(!s.verification_batches.some(b=>b.status==='running')&&at>=p.processing_initial_busy_until){const b=s.verification_batches.filter(b=>b.status==='queued').sort((a,b)=>a.queued_at-b.queued_at||a.ref.id.localeCompare(b.ref.id))[0];const earlier=b&&s.prefix.processing.items.some(i=>i.status==='running'||i.status==='queued'&&i.eligible_at<=at&&(i.accepted_at<b.queued_at||i.accepted_at===b.queued_at&&i.ref.id<b.ref.id));if(b&&!earlier&&at<p.deadline&&s.prefix.processing.energy-s.prefix.processing.energy_reserved>=d.profile.outcome.verification_energy){b.status='running';b.started_at=at;b.reserved_energy=d.profile.outcome.verification_energy;s.prefix.processing.energy_reserved+=b.reserved_energy;}}
 if(!s.reception_batches.some(b=>b.status==='running')){
  const b=s.reception_batches.find(b=>b.status==='queued'),receiver=d.catalogs.receiver_conditions;
  if(b&&at<p.deadline){const free=d.profile.outcome.reception_seats-(receiver?.initial_occupied_seats??0)-s.person_receipts.length;
   const reason=receiver?.prepared===false?'接收准备凭证未齐':receiver?.authority_valid===false?'接收授权未满足':free<b.people_ids.length?'可用接收席位不足3人':null;
   if(reason){b.status='hold';b.hold_reason=reason;publish_reception(s,b,'hold',at,d);return;}
b.status='running';b.started_at=at;const report_ref=publish_reception(s,b,'accepted',at,d);s.continuation_records.push({ref:ref(s,'continuation_record',b.ref.id+'-handover'),original_decision_ref:b.original_decision_ref,actor:'H',action:'handover_batch',at,notification_ref:s.notifications.find(n=>n.target==='H'&&n.original_decision_ref.id===b.original_decision_ref.id)!.ref,report_ref});}
 }
}
