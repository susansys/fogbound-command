import {GameError} from '../contracts';
import type {IntelligenceState} from './intelligence-state';
import type {IntelligenceDefinition} from './intelligence-definition';
import type {IntelligenceSourceRequest} from '../intelligence-protocol';
import {validate_source_request} from './intelligence-validation';
import type {IntelligencePreparationRequest} from '../intelligence-contracts';
import {complete_preparation} from './intelligence-ledger';

export type SharedProcessingAdmission={blocked_intervals?:ReadonlyArray<{from:number;to:number}>;external_head?:{accepted_at:number;eligible_at:number;id:string}};
export function request_preparation_work(state:IntelligenceState,input:IntelligencePreparationRequest,definition:IntelligenceDefinition,admission:SharedProcessingAdmission={}){
  if(input.run_id!==state.run_id||input.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  const plan=state.plan,ref=input.intent.plan_ref;
  if(!plan||plan.ref.run_id!==ref.run_id||plan.ref.id!==ref.id||plan.ref.version!==ref.version)throw new GameError('STALE_PLAN');
  const p=definition.profile.parameters;if(state.sim_time>=p.deadline)throw new GameError('RUN_ENDED');
  const cost=p.preparation_work;if(state.processing.energy-state.processing.energy_reserved<cost)throw new GameError('CONSTRAINT_DENIED');
  const sequence=state.processing.items.length+1,workRef={run_id:state.run_id,kind:'work_item' as const,id:'J'+sequence,version:1},reservation={run_id:state.run_id,kind:'reservation' as const,id:'E-J'+sequence,version:1};
  state.processing.items.push({ref:workRef,kind:'preparation',owner:'INTEL',request_ref:{run_id:state.run_id,kind:'work_request',id:input.operation_id,version:1},basis_delivery_refs:[],plan:structuredClone(plan),accepted_at:state.sim_time,accepted_sequence:sequence,eligible_at:state.sim_time,work_required_ms:p.preparation_work*p.ms_per_work,work_done_ms:0,started_at:null,completed_at:null,status:'queued',generation:state.generation,phase:'committed',reservation_ref:reservation});
  state.processing.energy_reserved+=cost;
  state.processing.reservations.push({ref:reservation,owner:'INTEL',action_ref:workRef,resource_ref:{run_id:state.run_id,kind:'processing_energy',id:'processing',version:1},quantity:cost,from:state.sim_time,to:p.deadline,status:'held',consumed:0});
  advance_processing_work(state,state.sim_time,definition,admission);
}

export function request_source_work(state:IntelligenceState,input:IntelligenceSourceRequest,definition:IntelligenceDefinition,admission:SharedProcessingAdmission={}){
  validate_source_request(state,input);
  if(state.sim_time>=definition.profile.parameters.deadline)throw new GameError('RUN_ENDED');
  const basis=input.intent.basis_delivery_refs.map(ref=>state.deliveries.find(d=>d.id===ref.id)!),reports=basis.map(d=>state.reports.find(r=>r.id===d.report_ref.id)!);
  if(!reports.some(r=>r.origin.kind==='known'&&r.origin.actor===definition.catalogs.source.actor))throw new GameError('EVIDENCE_REQUIRED');
  const p=definition.profile.parameters,cost=p.validation_work;
  if(state.processing.energy-state.processing.energy_reserved<cost)throw new GameError('CONSTRAINT_DENIED');
  const sequence=state.processing.items.length+1,ref={run_id:state.run_id,kind:'work_item' as const,id:'J'+sequence,version:1},reservation={run_id:state.run_id,kind:'reservation' as const,id:'E-J'+sequence,version:1};
  state.processing.items.push({ref,kind:'source_validation',owner:'INTEL',request_ref:{run_id:state.run_id,kind:'work_request',id:input.operation_id,version:1},basis_delivery_refs:structuredClone(input.intent.basis_delivery_refs),plan:null,accepted_at:state.sim_time,accepted_sequence:sequence,eligible_at:state.sim_time,work_required_ms:p.validation_work*p.ms_per_work,work_done_ms:0,started_at:null,completed_at:null,status:'queued',generation:state.generation,phase:'committed',reservation_ref:reservation});
  state.processing.energy_reserved+=cost;
  state.processing.reservations.push({ref:reservation,owner:'INTEL',action_ref:ref,resource_ref:{run_id:state.run_id,kind:'processing_energy',id:'processing',version:1},quantity:cost,from:state.sim_time,to:p.deadline,status:'held',consumed:0});
  advance_processing_work(state,state.sim_time,definition,admission);
}

export function advance_processing_work(state:IntelligenceState,to:number,definition:IntelligenceDefinition,admission:SharedProcessingAdmission={}){
  const p=definition.profile.parameters;
  let available=p.processing_initial_busy_until;
  for(const item of state.processing.items){
    if(item.status==='completed'||item.status==='cutoff'){available=Math.max(available,item.completed_at!);continue;}
    let begin=item.started_at??Math.max(item.eligible_at,available);
    if(item.started_at===null){
      for(const window of admission.blocked_intervals??[])if(begin<window.to&&begin+item.work_required_ms>window.from)begin=window.to;
      const head=admission.external_head;
      if(head&&head.eligible_at<=begin&&(head.accepted_at<item.accepted_at||head.accepted_at===item.accepted_at&&head.id<item.ref.id))break;
    }
    const end=begin+item.work_required_ms;
    const reservation=state.processing.reservations.find(r=>r.ref.id===item.reservation_ref.id)!;
    if(item.started_at===null&&begin>=p.deadline){
      if(to<p.deadline)break;
      item.status='cutoff';item.completed_at=p.deadline;reservation.to=p.deadline;
      state.processing.energy_reserved-=reservation.quantity;reservation.status='released';
      available=p.deadline;continue;
    }
    if(to<begin)break;
    item.started_at=begin;item.status='running';reservation.from=begin;reservation.to=Math.min(end,p.deadline);
    item.work_done_ms=Math.max(0,Math.min(to,end,p.deadline)-begin);
    if(to<Math.min(end,p.deadline))break;
    item.completed_at=Math.min(end,p.deadline);item.status=end<=p.deadline?'completed':'cutoff';
    const consumed=Math.ceil(reservation.quantity*item.work_done_ms/item.work_required_ms);state.processing.energy-=consumed;state.processing.energy_reserved-=reservation.quantity;reservation.consumed=consumed;reservation.status=item.status==='completed'?'consumed':'released';
    if(item.status==='completed'&&item.kind==='source_validation'){
      const subject=item.basis_delivery_refs.map(ref=>state.deliveries.find(d=>d.id===ref.id)!).map(d=>state.reports.find(r=>r.id===d.report_ref.id)!).find(r=>r.origin.kind==='known'&&r.origin.actor===definition.catalogs.source.actor)!;
      const ref={run_id:state.run_id,kind:'assessment' as const,id:'A-'+item.ref.id,version:1};
      state.processing.assessments.push({ref,kind:'source_validation',author:'INTEL',subject_ref:{run_id:state.run_id,kind:'report',id:subject.id,version:subject.version},basis_delivery_refs:structuredClone(item.basis_delivery_refs),work_ref:structuredClone(item.ref),completed_at:end,conclusion:{kind:'access_verified',value:subject.typed_payload.value}});
      state.processing.deliveries.push({ref:{run_id:state.run_id,kind:'product_delivery',id:'D-'+ref.id,version:1},product_ref:ref,sender:'INTEL',target:'HQ',sent:end,received:end+p.link_ms});
    }
    if(item.status==='completed'&&item.kind==='preparation')complete_preparation(state,item,end,definition);
    available=item.completed_at;
  }
}
