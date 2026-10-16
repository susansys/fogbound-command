import {GameError} from '../contracts';
import type {IntelligenceActivityRequest,IntelligenceFieldOrder,IntelligenceFieldActor} from '../intelligence-contracts';
import type {IntelligenceState} from './intelligence-state';
import type {IntelligenceDefinition} from './intelligence-definition';
import {path_timing,ceil_fraction,progress_on_path,fraction_to_number,multiply_fraction,number_fraction,fraction} from './play-timing';
import {carried_preparation,current_preparation,carried_record_conditions} from './intelligence-gates';

export function intelligence_site(definition:IntelligenceDefinition,id:string):[number,number]{
  const site=definition.catalogs.map.scopes.find(s=>s.id===id);
  if(!site||site.kind!=='point'||!site.typed_geometry||!('position' in site.typed_geometry)||!site.typed_geometry.position)throw new GameError('INVALID_DEFINITION');
  return [...site.typed_geometry.position] as [number,number];
}
export function initial_field_actors(definition:IntelligenceDefinition):IntelligenceFieldActor[]{
  const p=definition.profile.parameters;
  return definition.catalogs.actors.map(a=>({actor:a.id,role:a.role,qualifications:structuredClone(definition.catalogs.local_conditions.find(c=>c.actor===a.id)?.qualifications??a.qualifications),equipment:structuredClone(definition.catalogs.local_conditions.find(c=>c.actor===a.id)?.equipment??a.equipment),facility_authorized:definition.catalogs.local_conditions.find(c=>c.actor===a.id)?.facility_authorized??true,people:a.people,load:a.load-((a.record_packs??0)-(definition.catalogs.local_conditions.find(c=>c.actor===a.id)?.record_packs??a.record_packs??0)),space:a.space-((a.record_packs??0)-(definition.catalogs.local_conditions.find(c=>c.actor===a.id)?.record_packs??a.record_packs??0)),position:{site:definition.catalogs.local_conditions.find(c=>c.actor===a.id)?.position_scope??a.origin,point:intelligence_site(definition,definition.catalogs.local_conditions.find(c=>c.actor===a.id)?.position_scope??a.origin)},resources:{movement_energy:p.movement_energy,movement_energy_reserved:0,record_energy:definition.catalogs.local_conditions.find(c=>c.actor===a.id)?.record_energy??a.record_energy??0,work_energy:a.work_energy??0,equipment_energy_reserved:0,durability:p.equipment_durability,record_packs:definition.catalogs.local_conditions.find(c=>c.actor===a.id)?.record_packs??a.record_packs??0,repair_packs:a.repair_packs??0,packs_reserved:0,link_energy:a.link_energy??0,link_durability:p.equipment_durability}}));
}
function timing(actor:IntelligenceFieldActor,activity:IntelligenceDefinition['catalogs']['activities'][number],definition:IntelligenceDefinition){
  return path_timing([intelligence_site(definition,activity.from),intelligence_site(definition,activity.to)],{capability_ref:activity.capability,speed:definition.profile.parameters.base_speed,unit:'fictional_metre/s',load:actor.load,terrain_factor:1,environment_factor:1,load_factor_per_unit:definition.rules.load_factor_per_unit,length_scale:1000000,applied_causes:[],evidence_refs:[activity.id]});
}
function movement_energy(distance:import('./play-timing').Fraction,definition:IntelligenceDefinition){
  const entry=definition.profile.resolved_registry.find(r=>r.id==='PLAY S07 movement.energy'),value=entry?.value;
  if(!value||typeof value!=='object'||Array.isArray(value)||!('energy_per_100_metre' in value)||typeof value.energy_per_100_metre!=='number')throw new GameError('INVALID_DEFINITION');
  return ceil_fraction(multiply_fraction(distance,number_fraction(value.energy_per_100_metre/100)));
}
export function issue_intelligence_activity(state:IntelligenceState,input:IntelligenceActivityRequest,definition:IntelligenceDefinition){
  const i=input.intent,p=definition.profile.parameters;
  const activity=definition.catalogs.activities.find(a=>a.id===i.activity_ref.id),actor=definition.catalogs.actors.find(a=>a.id===i.actor_ref.id),authority=definition.catalogs.authorities.find(a=>a.id===i.authority_ref.id);
  if(!activity||!actor)throw new GameError('UNSUPPORTED');
  if(activity.actor!==actor.id||!authority||!authority.actors.includes(actor.id)||state.sim_time<authority.valid_from||state.sim_time>=authority.valid_to)throw new GameError('INVALID_REQUEST');
  if(state.sim_time>=p.deadline)throw new GameError('RUN_ENDED');
  if(state.field.orders.length>=p.field_attempt_budget)throw new GameError('CONSTRAINT_DENIED');
  // Only HQ's own issued commitments are consulted here. Private execution and
  // inventory are rechecked after the message arrives, not exposed as errors.
  if(state.field.orders.some(o=>o.payload.actor_ref.id===actor.id&&!state.field.deliveries.some(d=>d.received<=state.sim_time&&state.field.reports.some(r=>r.ref.id===d.report_ref.id&&r.order_ref.id===o.ref.id&&r.phase!=='accepted'))))throw new GameError('CAPACITY_CONFLICT');
  if(i.basis_delivery_refs.some(ref=>!(ref.kind==='product_delivery'?state.processing.deliveries:state.field.deliveries).some(d=>d.ref.id===ref.id&&d.received<=state.sim_time)))throw new GameError('INVALID_REQUEST');
  if(activity.action==='repair'&&!current_preparation(state,i,state.sim_time))throw new GameError('EVIDENCE_REQUIRED');
  if(activity.conditions.length&&!carried_record_conditions(state,i,state.sim_time,activity.to))throw new GameError('EVIDENCE_REQUIRED');
  if(activity.prerequisite&&!state.field.deliveries.some(d=>d.received<=state.sim_time&&state.field.reports.some(r=>r.ref.id===d.report_ref.id&&r.phase==='completed'&&state.field.orders.some(o=>o.ref.id===r.order_ref.id&&o.payload.activity_ref.id===activity.prerequisite))))throw new GameError('EVIDENCE_REQUIRED');
  const order:IntelligenceFieldOrder={ref:{run_id:state.run_id,kind:'field_order',id:'O'+(state.field.orders.length+1),version:1},payload:structuredClone(i),issued_at:state.sim_time,arrives_at:state.sim_time+p.link_ms,status:'issued',started_at:null,terminal_at:null,completes_at:null,duration_ms:0,generation:state.generation,report_ids:[],reserved_energy:0,reserved_packs:0,work_done_ms:0,wear_charged:false,settled:false};
  state.field.orders.push(order);
}
function report(state:IntelligenceState,order:IntelligenceFieldOrder,actor:IntelligenceFieldActor,phase:'accepted'|'completed'|'refused'|'cutoff',at:number,definition:IntelligenceDefinition,reason:string|null=null){
  if(order.report_ids.length>=definition.profile.parameters.reports_per_activity)throw new GameError('ENGINE_UNCONFIRMED');
  const moving=state.field.orders.some(o=>o.payload.actor_ref.id===actor.actor&&o.status==='running'&&definition.catalogs.activities.some(a=>a.id===o.payload.activity_ref.id&&a.action==='move'));
  const resources=actor.resources,facility=actor.facility_authorized&&!moving?definition.catalogs.fixed_facilities.find(f=>f.location===actor.position.site&&f.actors.includes(actor.actor)):undefined;
  const portable=actor.equipment.includes('LINK')&&resources.link_energy>=definition.profile.parameters.send_energy_cost&&resources.link_durability>=definition.profile.parameters.send_wear_cost,canSend=!!facility||portable;
  if(facility===undefined&&portable){resources.link_energy-=definition.profile.parameters.send_energy_cost;resources.link_durability-=definition.profile.parameters.send_wear_cost;}
  const id=order.ref.id+'-'+phase;order.report_ids.push(id);
  const ref={run_id:state.run_id,kind:'field_report' as const,id,version:1};
  const artifact=state.field.artifacts.find(a=>a.origin_event===order.ref.id+'-complete')??null;
  const activity=definition.catalogs.activities.find(a=>a.id===order.payload.activity_ref.id)!;
  const confirmation={position:structuredClone(actor.position),load:actor.load,space:actor.space,resources:{...(activity.action==='move'?{movement_energy:resources.movement_energy}:activity.action==='record'?{record_energy:resources.record_energy,record_packs:resources.record_packs,durability:resources.durability}:{work_energy:resources.work_energy,repair_packs:resources.repair_packs,durability:resources.durability}),...(facility?{}:{link_energy:resources.link_energy,link_durability:resources.link_durability})}};
  state.field.reports.push({ref,order_ref:structuredClone(order.ref),actor:actor.actor,phase,source_event_time:{kind:'unknown'},observed:{kind:'known',value:at,evidence:id},source_published:at,source_descriptor:actor.actor+'在本次现场活动中的回报',subject:activity.label,text:activity.label+'：'+({accepted:'已接令',completed:'当地已完成',refused:'当地条件受阻',cutoff:'实体时限已到'})[phase],quality:'unknown',reliability:'unassessed',claimed_confirmation:'unverified',typed_payload:{kind:'field_status',activity_ref:structuredClone(order.payload.activity_ref),phase},provenance:{kind:'local_observation',origin_event:id},attachment_refs:[],confirmation,artifact:structuredClone(artifact),repair_condition:phase==='completed'&&activity.action==='repair'?'repaired':null,reason});
  state.field.messages.push({actor:actor.actor,report_ref:ref,status:canSend?'sent':'unsent',sent:canSend?at:null,reason:canSend?null:'no_authorized_channel'});
  if(!canSend)return;
  state.field.deliveries.push({ref:{run_id:state.run_id,kind:'field_delivery',id:'D-'+id,version:1},report_ref:ref,sender:actor.actor,target:'HQ',sent:at,received:at+definition.profile.parameters.link_ms,facility_ref:facility?.id??null});
}
export function advance_field_work(state:IntelligenceState,to:number,definition:IntelligenceDefinition){
  const p=definition.profile.parameters;
  for(const order of state.field.orders){
    const actor=state.field.actors.find(a=>a.actor===order.payload.actor_ref.id)!,activity=definition.catalogs.activities.find(a=>a.id===order.payload.activity_ref.id)!;
    if(order.status==='issued'&&order.arrives_at<=to){
      const at=order.arrives_at;
      const record=activity.action==='record',repair=activity.action==='repair',work=record||repair,capability=definition.capabilities.find(c=>c.id===activity.capability),r=actor.resources;
      const cost=record?p.record_energy_cost:p.repair_energy_cost,packs=record?p.record_pack_cost:p.repair_pack_cost,wear=record?p.record_first_wear:p.repair_first_wear,energy=record?r.record_energy:r.work_energy;
      const movement=work?null:timing(actor,activity,definition),movement_cost=movement?movement_energy(fraction(movement.length_units.reduce((sum,n)=>sum+BigInt(n),0n),1000000),definition):0;
      if(activity.conditions.length&&!carried_record_conditions(state,order.payload,order.issued_at,activity.to)){order.status='refused';order.terminal_at=at;report(state,order,actor,'refused',at,definition,'local_evidence_unmet');continue;}
      if(at>=p.deadline||actor.position.site!==activity.from||work&&(!capability||!actor.qualifications.includes(capability.qualification)||!actor.equipment.includes(capability.equipment)||capability.equipment!==(record?'REC':'WORK')||energy-r.equipment_energy_reserved<cost||(record?r.record_packs:r.repair_packs)-r.packs_reserved<packs||r.durability<wear)||repair&&!carried_preparation(state,order.payload,order.issued_at)||!work&&r.movement_energy-r.movement_energy_reserved<movement_cost){order.status='refused';order.terminal_at=at;report(state,order,actor,'refused',at,definition,'local_conditions_unmet');continue;}
      const duration=work?p.setup_ms+(record?p.record_work:p.repair_work)*p.ms_per_work:ceil_fraction(timing(actor,activity,definition).duration_ms);
      order.status='running';order.started_at=at;order.duration_ms=duration;order.completes_at=at+duration;order.reserved_energy=work?cost:movement_cost;
      if(work){order.reserved_packs=packs;r.equipment_energy_reserved+=order.reserved_energy;r.packs_reserved+=order.reserved_packs;}else r.movement_energy_reserved+=movement_cost;
      report(state,order,actor,'accepted',at,definition);
    }
    if(order.status!=='running')continue;
    const end=Math.min(to,order.completes_at!,p.deadline),elapsed=Math.max(0,end-order.started_at!),record=activity.action==='record',repair=activity.action==='repair',work=record||repair,r=actor.resources;
    let movement_consumed=0;
    if(work){order.work_done_ms=Math.max(0,elapsed-p.setup_ms);if(order.work_done_ms>0&&!order.wear_charged){r.durability-=record?p.record_first_wear:p.repair_first_wear;order.wear_charged=true;}}
    else{const path=[intelligence_site(definition,activity.from),intelligence_site(definition,activity.to)],progress=progress_on_path(path,timing(actor,activity,definition),elapsed);actor.position.point=[fraction_to_number(progress.position.x),fraction_to_number(progress.position.y)];movement_consumed=movement_energy(progress.distance,definition);}
    if(end<Math.min(order.completes_at!,p.deadline))continue;
    const complete=order.completes_at!<=p.deadline;order.status=complete?'completed':'cutoff';order.terminal_at=end;order.settled=true;
    if(work){const duration=(record?p.record_work:p.repair_work)*p.ms_per_work,energy=Math.ceil(order.reserved_energy*order.work_done_ms/duration),packs=Math.ceil(order.reserved_packs*order.work_done_ms/duration);if(record){r.record_energy-=energy;r.record_packs-=packs;}else{r.work_energy-=energy;r.repair_packs-=packs;}r.equipment_energy_reserved-=order.reserved_energy;r.packs_reserved-=order.reserved_packs;actor.load-=packs;actor.space-=packs;
      if(complete&&record){const materialRef={run_id:state.run_id,kind:'record_material' as const,id:'MAT-'+order.ref.id,version:1};state.field.materials.push({ref:materialRef,site:activity.to,captured_at:end,source_event_time:{kind:'unknown'},work_ref:structuredClone(order.ref),typed_payload:{kind:'site_record',site:activity.to},body:activity.label+'的虚构采集素材。'});state.field.artifacts.push({ref:{run_id:state.run_id,kind:'mission_artifact',id:'ART-'+order.ref.id,version:1},site:activity.to,activity_ref:structuredClone(order.payload.activity_ref),created_at:end,origin_event:order.ref.id+'-complete',custody_holder:actor.actor,condition:'intact',lifecycle_state:'collected',verification_state:'not_requested',material_refs:[materialRef],custody_events:[],verification_events:[]});}
    }else{r.movement_energy-=movement_consumed;r.movement_energy_reserved-=order.reserved_energy;if(complete)actor.position.site=activity.to;}
    report(state,order,actor,complete?'completed':'cutoff',end,definition);
  }
}
