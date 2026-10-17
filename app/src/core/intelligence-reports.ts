import type {IntelligenceState} from './intelligence-state';
import type {IntelligenceDefinition} from './intelligence-definition';
import {intelligence_original_metadata} from './intelligence-definition';
import type {IntelligenceReport} from '../intelligence-contracts';
export function advance_intelligence_reports(state:IntelligenceState,to:number,definition:IntelligenceDefinition){
  const forwardings=definition.catalogs.forwardings,original=intelligence_original_metadata(definition),publication=original.published;
  for(const forwarding of forwardings){
    const report_id=forwarding.report_id??'R1';
    if(to>=publication&&!state.reports.some(r=>r.id===report_id))state.reports.push({run_id:state.run_id,id:report_id,version:1,kind:'raw_record',origin:{kind:'unknown'},source_descriptor:'转交的档案摘录；原始主体尚不明确',subject:'B访问凭证',text:'原文称：B处访问凭证为蓝色。',source_event_time:{kind:'unknown'},observed:{kind:'known',value:original.observed,evidence:report_id+'-observation'},source_published:publication,quality:'unknown',reliability:'unassessed',claimed_confirmation:'unverified',typed_payload:{kind:'access',value:'blue'},provenance:{kind:'original'},attachment_refs:[]} satisfies IntelligenceReport);
    if(forwarding.received>to||state.deliveries.some(d=>d.id===forwarding.id))continue;
    state.deliveries.push({run_id:state.run_id,id:forwarding.id,kind:'report_delivery',version:1,report_ref:{run_id:state.run_id,kind:'report',id:report_id,version:1},sender:'转交席位',target:'HQ',sent:forwarding.received-definition.profile.parameters.link_ms,received:forwarding.received,forward_of:forwarding.proof===null?null:{kind:'confirmed',report_ref:{run_id:state.run_id,kind:'report',id:report_id,version:1},supporting_evidence_ref:{run_id:state.run_id,kind:'lineage_evidence',id:forwarding.proof,version:1},received:forwarding.proof_received??forwarding.received}});
  }
  const sourcePublication=state.source.published_report_ref===null?undefined:state.reports.find(r=>r.id===state.source.published_report_ref);
  if(sourcePublication&&sourcePublication.source_published+definition.profile.parameters.link_ms<=to&&!state.deliveries.some(d=>d.report_ref.id===sourcePublication.id)){
    const facility=definition.catalogs.fixed_facilities.find(f=>f.id===definition.catalogs.source.actor&&f.actors.includes(definition.catalogs.source.actor));
    if(!facility)return;
    state.deliveries.push({run_id:state.run_id,id:'D-R3',kind:'report_delivery',version:1,report_ref:{run_id:state.run_id,kind:'report',id:sourcePublication.id,version:1},sender:definition.catalogs.source.actor,target:'HQ',sent:sourcePublication.source_published,received:sourcePublication.source_published+definition.profile.parameters.link_ms,forward_of:null});
  }
}
