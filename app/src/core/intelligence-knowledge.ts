import type {IntelligenceState} from './intelligence-state';
import type {IntelligencePlayerView} from '../intelligence-contracts';
import {intelligence_definition_for_package} from './intelligence-definition';
import {current_preparation,carried_record_conditions} from './intelligence-gates';
import {intelligence_site} from './intelligence-execution';
import {path_timing,ceil_fraction} from './play-timing';
export function project_intelligence_view(state:IntelligenceState,owned:readonly import('./intelligence-definition').IntelligenceDefinition[]=[]):IntelligencePlayerView{
  const definition=intelligence_definition_for_package(state.definition_hash,owned);
  const received_reports=state.deliveries.filter(d=>d.target==='HQ'&&d.received<=state.sim_time).map(original=>{
    const delivery=structuredClone(original);if(delivery.forward_of&&delivery.forward_of.received>state.sim_time)delivery.forward_of=null;
    return {delivery,report:structuredClone(state.reports.find(r=>r.id===delivery.report_ref.id)!)};
  });
  const source_groups:IntelligencePlayerView['source_groups']=[];
  for(const {report,delivery} of received_reports){
    let group=source_groups.find(g=>g.report_ref.id===report.id&&g.report_ref.version===report.version);
    if(!group){group={report_ref:{run_id:state.run_id,kind:'report',id:report.id,version:report.version},delivery_refs:[],relation:'unknown',origin_attribution:{kind:'unknown'},independent_evidence_count:{kind:'unknown'},lineage_links:[]};source_groups.push(group);}
    group.delivery_refs.push(delivery.id);
    const proof=delivery.forward_of;
    if(proof&&proof.received<=state.sim_time&&proof.report_ref.run_id===state.run_id&&proof.report_ref.id===report.id&&proof.report_ref.version===report.version&&proof.supporting_evidence_ref.run_id===state.run_id){group.lineage_links.push({kind:'forward_of',certainty:'confirmed',supporting_evidence_ref:structuredClone(proof.supporting_evidence_ref),received:proof.received});}
    group.relation=group.lineage_links.length===group.delivery_refs.length?'confirmed_common_original':'unknown';
  }
  const geometry=structuredClone(definition.catalogs.map) as IntelligencePlayerView['geometry'],scope=geometry.scopes.find(s=>s.id===definition.catalogs.actors[0].origin)!;
  let position_knowledge:IntelligencePlayerView['position_knowledge']=scope.kind==='unresolved'?{status:'unresolved',observed:{kind:'unknown'},reported:{kind:'unknown'},source_event_time:{kind:'unknown'},received:null,provenance:{kind:'registered_initial',initial_evidence_ref:'B23-INITIAL-R-H'},evidence_refs:['B23-INITIAL-R-H']}:{status:'known_scope',scope,observed:{kind:'known',value:0,evidence:'B23-INITIAL-R-H'},reported:{kind:'unknown'},source_event_time:{kind:'unknown'},received:null,provenance:{kind:'registered_initial',initial_evidence_ref:'B23-INITIAL-R-H'},evidence_refs:['B23-INITIAL-R-H']};
  const p=definition.profile.parameters;
  const assessments:IntelligencePlayerView['assessments']=state.processing.deliveries.filter(d=>d.product_ref.kind==='assessment'&&d.received<=state.sim_time).map(delivery=>({delivery:structuredClone(delivery),assessment:structuredClone(state.processing.assessments.find(a=>a.ref.id===delivery.product_ref.id)!)}));
  const access:IntelligencePlayerView['access']={blue:'unverified',green:'unverified'};
  for(const {assessment} of assessments)access[assessment.conclusion.value]='verified';
  const preparing=state.plan&&state.processing.items.find(item=>item.kind==='preparation'&&item.plan?.ref.version===state.plan!.ref.version);
  const preparation_results:IntelligencePlayerView['preparation_results']=state.processing.deliveries.filter(d=>d.product_ref.kind!=='assessment'&&d.received<=state.sim_time).map(delivery=>({delivery:structuredClone(delivery),result:structuredClone(state.processing.preparations.find(a=>a.ref.id===delivery.product_ref.id)!)}));
  const receivedForPlan=preparation_results.filter(({result})=>result.plan_ref.version===state.plan?.ref.version&&result.plan_ref.id===state.plan.ref.id).reverse(),received=receivedForPlan.find(({result})=>result.status==='approved')??receivedForPlan[0];
  const preparation:IntelligencePlayerView['preparation']=received?{status:received.result.status,plan_ref:structuredClone(received.result.plan_ref),result_ref:structuredClone(received.result.ref)}:preparing?{status:'under_review',plan_ref:structuredClone(state.plan!.ref)}:{status:'not_requested'};
  const supply_commitments=state.processing.supply_commitments.filter(r=>preparation_results.some(({result})=>result.status==='approved'&&result.ref.id===r.approval_ref.id)).map(r=>structuredClone(r));
  const actors:IntelligencePlayerView['actors']=definition.catalogs.actors.map(a=>({actor:a.id==='R'?'R':'W',role:a.id==='R'?'record_keeper':'work_keeper',people:a.people,position_scope:a.origin,load:a.load,space:a.space,load_capacity:p.load_capacity,space_capacity:p.space_capacity,movement_energy:p.movement_energy,equipment_energy:a.id==='R'?a.record_energy!:a.work_energy!,durability:p.equipment_durability,packs:a.id==='R'?a.record_packs!:a.repair_packs!,link:a.id==='R'?{energy:a.link_energy!,durability:p.equipment_durability}:null,confirmed_at:0}));
  const field_reports=state.field.deliveries.filter(d=>d.received<=state.sim_time&&d.received<=p.deadline+p.receipt_grace).map(delivery=>({delivery:structuredClone(delivery),report:structuredClone(state.field.reports.find(r=>r.ref.id===delivery.report_ref.id)!)}));
  for(const {report,delivery} of field_reports){const actor=actors.find(a=>a.actor===report.actor)!,c=report.confirmation,r=c.resources;actor.position_scope=c.position.site;if(r.movement_energy!==undefined)actor.movement_energy=r.movement_energy;const energy=actor.actor==='R'?r.record_energy:r.work_energy,packs=actor.actor==='R'?r.record_packs:r.repair_packs;if(energy!==undefined)actor.equipment_energy=energy;if(r.durability!==undefined)actor.durability=r.durability;if(packs!==undefined)actor.packs=packs;actor.load=c.load;actor.space=c.space;if(actor.link&&r.link_energy!==undefined&&r.link_durability!==undefined)actor.link={energy:r.link_energy,durability:r.link_durability};actor.confirmed_at=delivery.received;}
  const repair_report=field_reports.filter(r=>r.report.repair_condition==='repaired').at(-1);
  const r_position=field_reports.filter(r=>r.report.actor==='R').at(-1);
  if(r_position){
    const {report,delivery}=r_position,registeredScope=geometry.scopes.find(s=>s.id===report.confirmation.position.site);
    if(registeredScope?.kind==='point'){
      const scope=structuredClone(registeredScope),point=report.confirmation.position.point;
      if(JSON.stringify(scope.typed_geometry.position)!==JSON.stringify(point))scope.id='position-'+report.ref.id;
      scope.typed_geometry.position=structuredClone(point);scope.uncertainty={kind:'known',value:0,unit:'fictional_metre',evidence:report.ref.id};scope.evidence_refs=[report.ref.id,delivery.ref.id];
      position_knowledge={status:'known_scope',scope,observed:{kind:'known',value:report.observed.value,evidence:report.ref.id},reported:{kind:'known',value:delivery.sent,evidence:report.ref.id},source_event_time:{kind:'unknown'},received:delivery.received,provenance:{kind:'delivered',report_ref:report.ref.id,delivery_ref:delivery.ref.id},evidence_refs:[report.ref.id,delivery.ref.id]};
    }
  }
  const repair_condition:IntelligencePlayerView['repair_condition']=repair_report?{site:'B',status:'confirmed_repaired',confirmed_at:repair_report.delivery.received,evidence_ref:repair_report.delivery.ref.id}:{site:'B',status:'required',confirmed_at:0,evidence_ref:'B23-INITIAL-B-REPAIR'};
  for(const commitment of supply_commitments){if(field_reports.some(({report})=>report.phase==='completed'&&report.repair_condition==='repaired'&&state.field.orders.find(o=>o.ref.id===report.order_ref.id)?.payload.basis_delivery_refs.some(ref=>ref.kind==='product_delivery'&&state.processing.deliveries.some(d=>d.ref.id===ref.id&&d.product_ref.id===commitment.approval_ref.id))))commitment.status='consumed';}
  const field_activities:IntelligencePlayerView['field_activities']=state.field.orders.map(order=>{const last=field_reports.filter(r=>r.report.order_ref.id===order.ref.id).at(-1);return{ref:structuredClone(order.ref),actor:order.payload.actor_ref.id,activity:order.payload.activity_ref.id,issued_at:order.issued_at,status:last?.report.phase??'issued'};});
  const field_options:IntelligencePlayerView['field_options']=definition.catalogs.activities.map(activity=>{
    const authority=definition.catalogs.authorities.find(a=>a.actors.includes(activity.actor))!,missing:string[]=[];
    const basis_delivery_refs=[...assessments.map(a=>a.delivery.ref),...preparation_results.filter(a=>a.result.status==='approved'&&a.result.plan_ref.version===state.plan?.ref.version).map(a=>a.delivery.ref),...field_reports.filter(r=>r.report.repair_condition==='repaired').map(r=>r.delivery.ref)];
    const intent={kind:'issue_activity' as const,actor_ref:{run_id:state.run_id,kind:'actor' as const,id:activity.actor,version:1},activity_ref:{run_id:state.run_id,kind:'activity' as const,id:activity.id,version:1},authority_ref:{run_id:state.run_id,kind:'authority' as const,id:authority.id,version:1},basis_delivery_refs};
    if(state.sim_time>=p.deadline)missing.push('实体作业时限已到');
    if(field_activities.some(o=>o.actor===activity.actor&&['issued','accepted'].includes(o.status)))missing.push('等待该编组上一指令的终态回报');
    if(actors.find(a=>a.actor===activity.actor)?.position_scope!==activity.from)missing.push('尚无起点位置确认');
    if(activity.prerequisite&&!field_activities.some(o=>o.activity===activity.prerequisite&&o.status==='completed'))missing.push('前置阶段完成回报尚未收到');
    if(field_activities.some(o=>o.activity===activity.id&&o.status==='completed'))missing.push('本阶段完成回报已收到');
    if(activity.action==='repair'&&!current_preparation(state,intent,state.sim_time))missing.push('当前版本准备批准尚未收到');
    if(activity.conditions.length&&!carried_record_conditions(state,intent,state.sim_time,activity.to))missing.push('核实或维修完成凭证尚未齐备');
    const confirmed=actors.find(a=>a.actor===activity.actor)!;
    const duration=activity.action==='move'?ceil_fraction(path_timing([intelligence_site(definition,activity.from),intelligence_site(definition,activity.to)],{capability_ref:activity.capability,speed:p.base_speed,unit:'fictional_metre/s',load:confirmed.load,terrain_factor:1,environment_factor:1,load_factor_per_unit:definition.rules.load_factor_per_unit,length_scale:1000000,applied_causes:[],evidence_refs:[activity.id]}).duration_ms):p.setup_ms+(activity.action==='record'?p.record_work:p.repair_work)*p.ms_per_work;
    return{intent,label:activity.label,available:missing.length===0,missing,estimated_complete_at:state.sim_time+p.link_ms+duration};
  });
  const record_sites=definition.catalogs.activities.filter(a=>a.action==='record').map(a=>a.to),milestone_received=record_sites.every(site=>field_reports.some(r=>r.report.artifact?.site===site));
  // The HQ processing queue is public. This estimate assumes no later requests
  // and uninterrupted FIFO work; it never reads a local actor's private state.
  let processingAvailable=Math.max(state.sim_time,p.processing_initial_busy_until);
  for(const item of state.processing.items)if(item.status==='queued'||item.status==='running')processingAvailable=Math.max(processingAvailable,item.eligible_at)+item.work_required_ms-item.work_done_ms;
  const estimated_complete_at={preparation:processingAvailable+p.preparation_work*p.ms_per_work,source_validation:processingAvailable+p.validation_work*p.ms_per_work};
  return {scenario_kind:'play_intelligence',public_rules:{deadline:p.deadline,receipt_grace:p.receipt_grace},run_id:state.run_id,revision:state.revision,sim_time:state.sim_time,mode:state.mode,rate:state.rate,paused:state.paused,finished:false,source_run:state.source_run,access,received_reports,source_groups,geometry,position_knowledge,actors,field_options,field_activities,field_reports,artifact_reports:field_reports.filter(r=>r.report.artifact!==null),assessments,preparation,preparation_results,plan:structuredClone(state.plan),supply_commitments,repair_condition,processing:{capacity:p.processing_capacity,initial_occupied_until:p.processing_initial_busy_until,energy_confirmed:state.processing.energy,energy_reserved:state.processing.energy_reserved,confirmed_at:state.sim_time,queue:structuredClone(state.processing.items),estimated_complete_at},can_issue:field_options.some(o=>o.available),next_action:milestone_received?record_sites.join('、')+'两处现场成果回报已收到；记录仍由R保管，返程与交接留待后续。':'查看总部已收到的原始资料',gap:milestone_received?'记录尚未交接或终局核验':access.blue==='verified'||access.green==='verified'?'B维修完成尚待合法回报':'访问凭证尚未核实',replay_nodes:state.inputs.map(x=>({revision:x.revision,at:x.clock_to??(x.envelope.intent.kind==='advance'||x.envelope.intent.kind==='tick'?x.envelope.intent.to:x.at),meaningful:true,label:(x.clock_to??(x.envelope.intent.kind==='advance'||x.envelope.intent.kind==='tick'?x.envelope.intent.to:x.at))/1000+'秒'})),log:structuredClone(state.log)};
}
