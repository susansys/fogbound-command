import type {IntelligenceState} from './intelligence-state';
import type {IntelligencePlayerView} from '../intelligence-contracts';
import {intelligence_definition_for_package} from './intelligence-definition';
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
  const position_knowledge:IntelligencePlayerView['position_knowledge']=scope.kind==='unresolved'?{status:'unresolved',observed:{kind:'unknown'},reported:{kind:'unknown'},source_event_time:{kind:'unknown'},received:null,provenance:{kind:'registered_initial',initial_evidence_ref:'B23-INITIAL-R-H'},evidence_refs:['B23-INITIAL-R-H']}:{status:'known_scope',scope,observed:{kind:'known',value:0,evidence:'B23-INITIAL-R-H'},reported:{kind:'unknown'},source_event_time:{kind:'unknown'},received:null,provenance:{kind:'registered_initial',initial_evidence_ref:'B23-INITIAL-R-H'},evidence_refs:['B23-INITIAL-R-H']};
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
  return {scenario_kind:'play_intelligence',run_id:state.run_id,revision:state.revision,sim_time:state.sim_time,mode:state.mode,rate:state.rate,paused:state.paused,finished:false,source_run:state.source_run,access,received_reports,source_groups,geometry,position_knowledge,actors,assessments,preparation,preparation_results,plan:structuredClone(state.plan),supply_commitments,repair_condition:{site:'B',status:definition.catalogs.initial_known.B_repair as 'required',confirmed_at:0,evidence_ref:'B23-INITIAL-B-REPAIR'},processing:{capacity:p.processing_capacity,initial_occupied_until:p.processing_initial_busy_until,energy_confirmed:state.processing.energy,energy_reserved:state.processing.energy_reserved,confirmed_at:state.sim_time,queue:structuredClone(state.processing.items)},can_issue:false,next_action:'查看总部已收到的原始资料',gap:access.blue==='verified'||access.green==='verified'?'B维修完成尚待合法回报':'访问凭证尚未核实',replay_nodes:state.inputs.map(x=>({revision:x.revision,at:x.clock_to??(x.envelope.intent.kind==='advance'||x.envelope.intent.kind==='tick'?x.envelope.intent.to:x.at),meaningful:true,label:(x.clock_to??(x.envelope.intent.kind==='advance'||x.envelope.intent.kind==='tick'?x.envelope.intent.to:x.at))/1000+'秒'})),log:structuredClone(state.log)};
}
