import {GameError} from '../contracts';
import type {CollectionPhysicalRecord,CollectionRef,CollectionReport,CollectionHandoverReport,CollectionProcessDelivery,CollectionVerificationResult} from '../knowledge-collection-contracts';
import {valid_collection_ref} from '../knowledge-collection-protocol';
import {record,fields} from '../protocol';
import {canonical,json_data} from './snapshot';
import {hash} from './scenario';

export async function register_collection_record(input:{definition_ref:CollectionPhysicalRecord['definition_ref'];collection_task_ref:CollectionRef<'collection_task'>;report:CollectionReport;mass_kg:number;qualification_ref:CollectionRef<'qualification'>}):Promise<CollectionPhysicalRecord>{
  const {report}=input,run=report.ref.run_id,actor=report.source_actor;
  if(!report.record_ref||!report.observation_ref||report.observed_time.kind!=='known'||report.body.kind!=='limited_indication'&&report.body.kind!=='qualified_facility_field'||input.mass_kg!==0.01||input.definition_ref.id!=='KA-TEXT-KNOWLEDGE-01'||input.definition_ref.version!==1)throw new GameError('INVALID_REQUEST');
  for(const [value,kind]of [[report.ref,'report'],[report.record_ref,'record'],[report.observation_ref,'observation'],[input.collection_task_ref,'collection_task'],[input.qualification_ref,'qualification']] as const)if(!valid_collection_ref(value,run,kind))throw new GameError('INVALID_REQUEST');
  const record_kind=actor==='R'?'B-limited-collection-record':'B-qualified-inspection-record',qualification_refs=[structuredClone(input.qualification_ref)];
  // Registered bytes bind public package identity. The private resolved-World hash stays in the snapshot.
  const payload={record_ref:structuredClone(report.record_ref),definition_ref:structuredClone(input.definition_ref),record_kind,source_actor:actor,collection_task_ref:structuredClone(input.collection_task_ref),observation_ref:structuredClone(report.observation_ref),report_ref:structuredClone(report.ref),scope_ref:structuredClone(report.scope_ref),method_ref:structuredClone(report.method_ref),qualification_refs,registered_at:report.generated_at,report:structuredClone(report)};
  const canonical_content=JSON.stringify(canonical(payload));
  return {ref:payload.record_ref,record_kind,source_actor:actor,definition_ref:payload.definition_ref,collection_task_ref:payload.collection_task_ref,observation_ref:payload.observation_ref,report_ref:payload.report_ref,report_digest:report.content_digest,scope_ref:payload.scope_ref,method_ref:payload.method_ref,qualification_refs,holder:actor,mass_kg:input.mass_kg,canonical_content,logical_size_bytes:new TextEncoder().encode(canonical_content).byteLength,content_digest:await hash(canonical(payload)),custody:[{ref:{run_id:run,kind:'custody',id:report.record_ref.id+'.created',version:1},kind:'created',at:report.generated_at,from:null,to:actor,material_ref:{run_id:run,kind:'material',id:actor+'.blank-registration',version:1},handover_ref:null}]};
}

export function transfer_collection_record(record:CollectionPhysicalRecord,input:{run_id:string;actor:CollectionPhysicalRecord['source_actor'];handover_ref:CollectionRef<'handover'>;at:number}){
  if(!valid_collection_ref(record.ref,input.run_id,'record')||!valid_collection_ref(input.handover_ref,input.run_id,'handover')||record.source_actor!==input.actor)throw new GameError('INVALID_REQUEST');
  const existing=record.custody.find(event=>event.handover_ref?.id===input.handover_ref.id);
  if(existing)return false;
  if(record.holder!==input.actor)throw new GameError('INVALID_REQUEST');
  record.holder='H';record.custody.push({ref:{run_id:input.run_id,kind:'custody',id:record.ref.id+'.transfer.'+input.handover_ref.id,version:1},kind:'transferred',at:input.at,from:input.actor,to:'H',material_ref:null,handover_ref:structuredClone(input.handover_ref)});return true;
}

export async function verify_collection_record(material:CollectionPhysicalRecord,input:{run_id:string;package_hash:string;geometry_hash:string;handover_report:CollectionHandoverReport|undefined;handover_delivery:CollectionProcessDelivery|undefined;qualifications:CollectionRef<'qualification'>[]}):Promise<{result:CollectionVerificationResult;reasons:string[];source_report:CollectionReport|null;evidence_refs:CollectionRef[]}>{
  const outcome=(result:CollectionVerificationResult,reason:string,source_report:CollectionReport|null=null,evidence_refs:CollectionRef[]=[])=>({result,reasons:reason?[reason]:[],source_report,evidence_refs});
  const handover=input.handover_report,delivery=input.handover_delivery;
  if(!handover||!delivery)return outcome('not_evaluable','missing_handover_receipt');
  try{
    if(!json_data(material)||!valid_collection_ref(material.ref,input.run_id,'record')||material.definition_ref.id!=='KA-TEXT-KNOWLEDGE-01'||material.definition_ref.version!==1||material.definition_ref.hash!==input.package_hash||material.mass_kg!==0.01)return outcome('invalid','record_identity_or_mass');
    if(material.holder!=='H')return outcome('not_evaluable','record_not_in_H_custody');
    const actor=material.source_actor,qualification=actor==='R'?'R-LIMITED-COLLECTOR':'W-FACILITY-INSPECTOR',method=actor==='R'?'limited-text-collection':'qualified-facility-inspection';
    if(actor!=='R'&&actor!=='W'||material.record_kind!==(actor==='R'?'B-limited-collection-record':'B-qualified-inspection-record'))return outcome('invalid','source_record_kind');
    if(!input.qualifications.some(ref=>valid_collection_ref(ref,input.run_id,'qualification')&&ref.id===qualification))return outcome('not_evaluable','missing_method_qualification');
    const expectedRef=(value:unknown,kind:string)=>valid_collection_ref(value,input.run_id,kind);
    for(const [value,kind]of [[material.collection_task_ref,'collection_task'],[material.observation_ref,'observation'],[material.report_ref,'report'],[material.scope_ref,'scope'],[material.method_ref,'method']] as const)if(!expectedRef(value,kind))return outcome('invalid','record_reference');
    if(material.qualification_refs.length!==1||!expectedRef(material.qualification_refs[0],'qualification')||material.qualification_refs[0].id!==qualification)return outcome('not_evaluable','missing_record_qualification');
    if(!expectedRef(handover.ref,'report')||!expectedRef(handover.observed_time.evidence,'handover')||!expectedRef(delivery.ref,'delivery')||!expectedRef(delivery.report_ref,'report')||!expectedRef(delivery.message_ref,'message')||delivery.report_ref.id!==handover.ref.id||delivery.sender!=='H'||delivery.recipient!=='HQ'||delivery.sent_at<handover.generated_at||delivery.received_at!==delivery.sent_at+1000||handover.body.outcome!=='transferred'||handover.body.actor!==actor||handover.body.record_refs.length!==1||handover.body.record_refs[0].id!==material.ref.id)return outcome('not_evaluable','inapplicable_handover_evidence');
    if(handover.body.record_digests[0]!==material.content_digest)return outcome('invalid','handover_record_digest_mismatch');
    if(material.custody.length!==2)return outcome('invalid','custody_chain');
    const [created,transferred]=material.custody;
    if(created.kind!=='created'||created.from!==null||created.to!==actor||created.material_ref?.id!==actor+'.blank-registration'||transferred.kind!=='transferred'||transferred.from!==actor||transferred.to!=='H'||transferred.handover_ref?.id!==handover.observed_time.evidence.id||transferred.at!==handover.body.completed_at||transferred.at<created.at)return outcome('invalid','custody_chain');
    for(const event of material.custody)if(!expectedRef(event.ref,'custody')||event.material_ref!==null&&!expectedRef(event.material_ref,'material')||event.handover_ref!==null&&!expectedRef(event.handover_ref,'handover'))return outcome('invalid','custody_reference');
    if(material.logical_size_bytes!==new TextEncoder().encode(material.canonical_content).byteLength)return outcome('invalid','logical_size');
    const payload:unknown=JSON.parse(material.canonical_content);
    if(!record(payload)||!record(payload.report)||!record(payload.report.body)||!json_data(payload))return outcome('invalid','registered_content');
    const source=payload.report as unknown as CollectionReport;
    if(!fields(payload.report,['ref','source_actor','method','target_ref','scope_ref','method_ref','requested_method_ref','observation_ref','record_ref','observed_time','generated_at','source_reported_time','body','control_outcomes','resource_snapshot','coverage','content_digest',...(source.root_registration?['root_registration']:[])]))return outcome('invalid','unsupported_report_fields');
    const expected={record_ref:material.ref,definition_ref:material.definition_ref,record_kind:material.record_kind,source_actor:actor,collection_task_ref:material.collection_task_ref,observation_ref:material.observation_ref,report_ref:material.report_ref,scope_ref:material.scope_ref,method_ref:material.method_ref,qualification_refs:material.qualification_refs,registered_at:source.generated_at,report:source};
    if(material.canonical_content!==JSON.stringify(canonical(expected))||material.content_digest!==await hash(canonical(expected)))return outcome('invalid','registered_content_digest');
    const {content_digest,...sourceContent}=source;
    if(content_digest!==material.report_digest||content_digest!==await hash(canonical(sourceContent)))return outcome('invalid','source_content_digest');
    if(source.source_actor!==actor||source.method!==method||source.method_ref.id!==method||source.requested_method_ref.id!==method||source.target_ref.id!=='B'||source.scope_ref.id!==(actor==='R'?'B-LIMITED':'B-QUALIFIED')||source.scope_ref.id!==material.scope_ref.id||source.method_ref.id!==material.method_ref.id||source.ref.id!==material.report_ref.id||source.record_ref?.id!==material.ref.id||source.observation_ref?.id!==material.observation_ref.id||source.observed_time.kind!=='known'||source.observed_time.evidence.id!==material.observation_ref.id||source.generated_at!==source.observed_time.value+(actor==='R'?1000:2000)||created.at!==source.generated_at)return outcome('invalid','source_method_scope_or_time');
    for(const [value,kind]of [[source.ref,'report'],[source.method_ref,'method'],[source.requested_method_ref,'method'],[source.target_ref,'facility'],[source.scope_ref,'scope'],[source.record_ref,'record'],[source.observation_ref,'observation'],[source.observed_time.evidence,'observation']] as const)if(!expectedRef(value,kind))return outcome('invalid','source_reference');
    const planned=actor==='R'?{min_x:245,max_x:255,min_y:145,max_y:155}:{min_x:249,max_x:251,min_y:149,max_y:151},actual=actor==='R'?{min_x:245,max_x:250,min_y:145,max_y:155}:planned;
    if(source.coverage.geometry_version!==input.geometry_hash||source.coverage.actual_area_m2!==(actor==='R'?50:4)||source.coverage.planned_area_m2!==(actor==='R'?100:4)||JSON.stringify(canonical(source.coverage.planned_scope))!==JSON.stringify(canonical(planned))||JSON.stringify(canonical(source.coverage.actual_scope))!==JSON.stringify(canonical([actual])))return outcome('invalid','registered_coverage');
    if(actor==='R'?(source.body.kind!=='limited_indication'||source.body.quality!=='limited'||source.body.outcome!=='inconclusive'):(source.body.kind!=='qualified_facility_field'||source.body.object_version!==1||source.body.quality!=='qualified'||!expectedRef(source.body.qualification_ref,'qualification')||source.body.qualification_ref.id!==qualification))return outcome('invalid','source_content_qualification');
    return outcome(actor==='R'?'authentic_limited':'authentic_qualified','',source,[material.ref,material.report_ref,material.observation_ref,handover.ref,delivery.ref,...material.qualification_refs]);
  }catch{return outcome('invalid','malformed_registered_content');}
}
