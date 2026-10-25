import {GameError} from '../contracts';
import type {CollectionKnowledge,CollectionAssessmentIntent,KnowledgeCollectionPlayerView,CollectionReport,CollectionDelivery,CollectionRef} from '../knowledge-collection-contracts';
import {hash} from './scenario';
import {canonical} from './snapshot';
import {valid_collection_ref,dense_collection_list} from '../knowledge-collection-protocol';

const ref=<K extends string>(run_id:string,kind:K,id:string):CollectionRef<K>=>({run_id,kind,id,version:1});

export async function record_collection_assessment(knowledge:CollectionKnowledge,intent:CollectionAssessmentIntent,view:KnowledgeCollectionPlayerView){
  if(!dense_collection_list(intent.basis_refs)||new Set(intent.basis_refs.map(ref=>ref.id)).size!==intent.basis_refs.length||intent.basis_refs.some(ref=>!view.reports.some(report=>report.ref.id===ref.id&&report.ref.run_id===ref.run_id&&report.ref.version===ref.version)))throw new GameError('INVALID_REQUEST');
  const context_digest=await hash(canonical(view));
  knowledge.assessments.push({ref:ref(view.run_id,'assessment','assessment-'+(knowledge.assessments.length+1)),recorded_at:view.sim_time,field:intent.field,conclusion:intent.conclusion,basis_refs:structuredClone(intent.basis_refs),reason:intent.reason?.trim()?{kind:'recorded',text:intent.reason}:{kind:'not_recorded'},context_digest});
}

// This consumer receives only actually delivered evidence and the registered public geometry version.
export function apply_received_collection_report(knowledge:CollectionKnowledge,input:{run_id:string;report:CollectionReport;delivery:CollectionDelivery;received_reports:CollectionReport[];geometry_version:string}){
  const {report,delivery}=input,body=report.body;
  if(body.kind!=='qualified_facility_field'||body.field!=='B.condition'||body.object_version!==1||body.condition!=='operable'||body.quality!=='qualified'||body.outcome!=='detected'||report.source_actor!=='W'||report.method!=='qualified-facility-inspection'||report.method_ref.id!=='qualified-facility-inspection'||report.requested_method_ref.id!=='qualified-facility-inspection'||report.scope_ref.id!=='B-QUALIFIED'||report.target_ref.id!=='B'||body.qualification_ref.id!=='W-FACILITY-INSPECTOR'||report.observed_time.kind!=='known'||!report.observation_ref||!report.record_ref||report.observed_time.evidence.id!==report.observation_ref.id)return;
  for(const [value,kind] of [[report.ref,'report'],[report.target_ref,'facility'],[report.scope_ref,'scope'],[report.method_ref,'method'],[report.requested_method_ref,'method'],[report.observation_ref,'observation'],[report.record_ref,'record'],[report.observed_time.evidence,'observation'],[body.qualification_ref,'qualification'],[delivery.ref,'delivery'],[delivery.report_ref,'report'],[delivery.message_ref,'message']] as const)if(!valid_collection_ref(value,input.run_id,kind))return;
  if(report.coverage.geometry_version!==input.geometry_version||report.coverage.actual_area_m2!==4||report.coverage.model_version!==1||report.observed_time.value<90000||report.observed_time.value>91000||report.generated_at!==report.observed_time.value+2000||delivery.report_ref.id!==report.ref.id||delivery.sender!=='W'||delivery.recipient!=='HQ'||delivery.sent_at<report.generated_at||delivery.received_at!==delivery.sent_at+1000)return;
  if(report.coverage.actual_scope.length!==1||JSON.stringify(canonical(report.coverage.actual_scope[0]))!==JSON.stringify(canonical({min_x:249,max_x:251,min_y:149,max_y:151})))return;
  if(knowledge.facility?.report_ref.id===report.ref.id)return;
  const previous=input.received_reports.find(item=>item.body.kind==='limited_indication'&&item.target_ref.id===report.target_ref.id&&item.coverage.geometry_version===report.coverage.geometry_version);
  let correction_ref:CollectionRef<'correction'>|null=null;
  if(previous){
    correction_ref=ref(report.ref.run_id,'correction',report.ref.id+'.correction.B-condition.'+report.scope_ref.id);
    if(!knowledge.corrections.some(item=>item.ref.id===correction_ref!.id))knowledge.corrections.push({ref:correction_ref,field:'B.condition',scope_ref:structuredClone(report.scope_ref),superseded_report_ref:structuredClone(previous.ref),new_report_ref:structuredClone(report.ref),delivery_ref:structuredClone(delivery.ref),recorded_at:delivery.received_at,effective_knowledge_seq:delivery.knowledge_seq});
  }
  knowledge.facility={field:'B.condition',condition:body.condition,scope_ref:structuredClone(report.scope_ref),observed_at:report.observed_time.value,received_at:delivery.received_at,report_ref:structuredClone(report.ref),correction_ref};
}
