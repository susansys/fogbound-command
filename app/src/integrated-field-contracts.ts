import type {Mode} from './contracts';
export const integratedSensitivityPolicy={nominal:{work_scale:1,throughput_scale:1,AB_wet_all_time:false},'AB-wet-all-time':{work_scale:1,throughput_scale:1,AB_wet_all_time:true},'work-1.5':{work_scale:1.5,throughput_scale:1,AB_wet_all_time:false},'throughput-half':{work_scale:1,throughput_scale:0.5,AB_wet_all_time:false},'combined-slow':{work_scale:1.5,throughput_scale:0.5,AB_wet_all_time:true}} as const;
export type IntegratedSensitivity=keyof typeof integratedSensitivityPolicy;
export const integratedWorkConfigurations={standard:{work_scale:1,throughput_scale:1},'work-1.5':{work_scale:1.5,throughput_scale:1},'throughput-half':{work_scale:1,throughput_scale:0.5},'work-1.5-throughput-half':{work_scale:1.5,throughput_scale:0.5}} as const;
export function integrated_work_configuration(profile:IntegratedSensitivity):keyof typeof integratedWorkConfigurations{return profile==='nominal'||profile==='AB-wet-all-time'?'standard':profile==='combined-slow'?'work-1.5-throughput-half':profile;}
// Definition identities, not live property versions or private inventories.
export const integratedObjectDefinitions=[
 {id:'HQ',kind:'facility',scope:'H',configuration:null,properties:['received_evidence']},
 {id:'H',kind:'facility',scope:'H',configuration:null,properties:['reception']},
 {id:'INTEL',kind:'facility',scope:'H',configuration:null,properties:['processing']},
 {id:'A',kind:'facility',scope:'A',configuration:null,properties:['data_source']},
 {id:'B',kind:'facility',scope:'B',configuration:null,properties:['facility_condition','data_source']},
 {id:'HA',kind:'road',scope:'HA',configuration:null,properties:['ground_condition']},
 {id:'AB',kind:'road',scope:'AB',configuration:null,properties:['ground_condition']},
 {id:'RAIN-HA-AB',kind:'environment',scope:'HA-AB',configuration:null,properties:['rain']},
 {id:'FOG-HA-AB',kind:'environment',scope:'HA-AB',configuration:null,properties:['fog']},
 {id:'R',kind:'actor',scope:'HA-AB',configuration:'R-INTEGRATED-4KG',properties:['position']},
 {id:'W',kind:'actor',scope:'HA-AB',configuration:'W-INTEGRATED-3KG',properties:['position']},
 {id:'B-connector',kind:'component',scope:'B',configuration:null,properties:['component_inventory']},
 {id:'EQ-G2-TU',kind:'equipment',scope:'HA-AB',configuration:'R-INTEGRATED-4KG',properties:['configuration']},
 {id:'W-FICTIONAL-TOOL',kind:'equipment',scope:'HA-AB',configuration:'W-INTEGRATED-3KG',properties:['configuration']},
] as const;
export type IntegratedObjectDefinition=typeof integratedObjectDefinitions[number];
export type IntegratedFieldObject={object_ref:{run_id:string;kind:IntegratedObjectDefinition['kind'];id:IntegratedObjectDefinition['id'];version:1};scope_ref:{run_id:string;kind:'scope';id:IntegratedObjectDefinition['scope'];version:1};configuration_ref:null|{run_id:string;kind:'configuration';id:NonNullable<IntegratedObjectDefinition['configuration']>;version:1};properties:Array<IntegratedObjectDefinition['properties'][number]>};
export type IntegratedFieldEvidenceRef={run_id:string;id:string;version:1};
export const integratedProcessPolicy={id:'B33-RETURN-PROCESS',version:1,stream:'return_processing',link_ms:1000,handover_phase:'H-HANDOVER',verification_phase:'INTEL-VERIFY',H_slots:1,INTEL_slots:1,report_kinds:['actor_progress','artifact_verification']} as const;
export type IntegratedProcessRef<K extends 'report'|'delivery'|'message'|'command'|'artifact'|'process'|'phase'|'parameter_set'>=IntegratedFieldEvidenceRef&{kind:K};
export type IntegratedProcessReport={ref:IntegratedProcessRef<'report'>;command_ref:IntegratedProcessRef<'command'>;reporter:'H'|'INTEL';actor:'R'|'W';method:'handover'|'HQ_verify';object_ref:{run_id:string;kind:'facility';id:'H'|'INTEL';version:1};scope_ref:{run_id:string;kind:'scope';id:'H';version:1};configuration_ref:NonNullable<IntegratedFieldObject['configuration_ref']>;model_ref:{id:'INTEGRATED-FIELD-MODEL-3';version:1};definition_hash:string;process_ref:IntegratedProcessRef<'process'>&{hash:string};phase_ref:IntegratedProcessRef<'phase'>;parameter_set_ref:IntegratedProcessRef<'parameter_set'>&{hash:string};occupancy_refs:Array<{run_id:string;kind:'facility'|'actor';id:'H'|'INTEL'|'R'|'W';version:1}>;observed_at:number;generated_at:number;source_reported_at:number|null;source_time_status:{status:'known';basis_ref:IntegratedProcessRef<'report'>}|{status:'unknown';reason:'not_provided'};precision_kind:'model_exact';window:{from:number;to:number};time_basis:{observed_ref:IntegratedProcessRef<'report'>;generated_ref:IntegratedProcessRef<'report'>};body:
 |{kind:'actor_progress';stage:'handover';phase:'completed';qualified:boolean;artifact_refs:Array<IntegratedProcessRef<'artifact'>>;recovered_old:number}
 |{kind:'artifact_verification';stage:'HQ_verify';handover_ref:IntegratedProcessRef<'report'>;verified:boolean;artifact_refs:Array<IntegratedProcessRef<'artifact'>>;logical_size_bytes:number}
 |{kind:'actor_progress';stage:'HQ_verify';phase:'completed';handover_ref:IntegratedProcessRef<'report'>;maintenance_verified:boolean;recovered_old:number}};
export type IntegratedProcessDelivery={ref:IntegratedProcessRef<'delivery'>;report_ref:IntegratedProcessRef<'report'>;message_ref:IntegratedProcessRef<'message'>;stream:'return_processing';sender:'H'|'INTEL';recipient:'INTEL'|'HQ';sent_at:number;received_at:number;knowledge_seq:number};
export type IntegratedReturnDelivery={ref:IntegratedProcessRef<'delivery'>;command_ref:IntegratedProcessRef<'command'>;message_ref:IntegratedProcessRef<'message'>;sender:'HQ';recipient:'R'|'W'|'H';sent_at:number;received_at:number};
export type IntegratedReturnNotification={actor:'R'|'W';request_seq:number;operation_id:string;command_ref:IntegratedProcessRef<'command'>;message_ref:IntegratedProcessRef<'message'>;deliveries:[IntegratedReturnDelivery,IntegratedReturnDelivery]};
export const integratedKnowledgePolicy={version:2,facility_precedence:'observed_at',functional_qualification:'delivered_unrevoked_report_version',revocation_issuer:'W',revocation_authority:'own_facility_observation',scope:'B'} as const;
export const integratedTerminationPolicy={version:1,authority:'HQ-task-management',target_order:['R','W'],link_service_ms:1000,stow_parameter:'safe_stow_ms',non_preemptible:['replace','functional_verify'],completed_phase_before_notification:true} as const;
export type IntegratedRefusalReason='missing_part'|'station_busy'|'actor_in_transit'|'position_unconfirmed'|'capacity'|'facility_unconfirmed'|'preparation_unavailable'|'facility_condition'|'deadline'|'protection_unavailable'|'termination';
type UnsupportedQuantity={status:'unknown';reason:'method_not_supported'};
export type IntegratedReportBody={kind:'actor_progress';phase:'accepted'|'completed'|'refused'|'blocked';reason:IntegratedRefusalReason|null}|{kind:'facility_status';condition:'faulted'|'unverified_after_replacement'|'operable';object_version:number;installation_account?:{available_spares:number;reserved_spares:number;installed_new:number;installed_old:number;recovered_old:number}}|{kind:'artifact_verification';artifact_ref:string;logical_size_bytes:number;verified:true}|{kind:'weather_observation';rain_object_ref:IntegratedFieldObject['object_ref'];fog_object_ref:IntegratedFieldObject['object_ref'];rain:'present'|'not_seen';fog:'present'|'not_seen';reference_50:'visible'|'unavailable';reference_100:'visible'|'not_visible';rain_rate:UnsupportedQuantity;meteorological_visibility:UnsupportedQuantity;identification_probability:UnsupportedQuantity};
export type IntegratedMaterialReport={ref:{run_id:string;kind:'report';id:string;version:1};object_ref:IntegratedFieldObject['object_ref'];scope_ref:IntegratedFieldObject['scope_ref'];configuration_ref:NonNullable<IntegratedFieldObject['configuration_ref']>;actor:'R'|'W';action:'read'|'observe'|'inspect'|'repair';target:'A'|'B';phase:'accepted'|'completed'|'refused'|'blocked';method:'activity_receipt'|'reference_comparison'|'diagnostic'|'functional'|'installation_receipt'|'digest_verification';observed_at:number;generated_at:number;source_reported_at:null;source_time_status:{status:'unknown';reason:'not_provided'};precision_kind:'qualitative'|'model_exact';window:{from:number;to:number};time_basis:{observed_ref:IntegratedFieldEvidenceRef;generated_ref:IntegratedFieldEvidenceRef};body:IntegratedReportBody};
export type IntegratedRevocation={ref:IntegratedFieldEvidenceRef&{kind:'report_relation'};kind:'report_revocation';issuer:'W';authority:'own_facility_observation';target_ref:IntegratedMaterialReport['ref'];object_ref:IntegratedFieldObject['object_ref'];scope_ref:IntegratedFieldObject['scope_ref'];generated_at:number;delivery:{ref:IntegratedFieldEvidenceRef&{kind:'delivery'};message_ref:IntegratedFieldEvidenceRef&{kind:'message'};sender:'W';recipient:'HQ';sent_at:number;received_at:number}};
export type IntegratedKnowledge={as_of:number;reports:Array<{report_ref:string;observed_at:number;generated_at:number;source_reported_at:null;first_received_at:number;age_ms:number;late:boolean;status:'current'|'older'|'conflicting'|'revoked'}>;conflicts:Array<{object_id:'B';observed_at:number;report_refs:string[]}>;revocations:IntegratedRevocation[];functional_proofs:Array<{report_ref:string;object_version:number}>;facility_knowledge:IntegratedFieldPlayerView['facility_knowledge'];road_knowledge:[]};
type IntegratedModelRef={id:'INTEGRATED-FIELD-MODEL-3';version:1};
export type IntegratedTerminationView={decision_ref:IntegratedFieldEvidenceRef&{kind:'termination_decision'};issued_at:number;reason:string|null;status:'terminating'|'confirmed';receipts:Array<{actor:'R'|'W';ref:IntegratedFieldEvidenceRef&{kind:'report'|'position_report'};observed_at:number;received_at:number;position:[number,number]|null}>};
type IntegratedAbortIntent={kind:'integrated_abort';model_ref:IntegratedModelRef;reason?:string};
export const integratedPlanningPolicy={version:1,assessment_versions:32,basis_limit:8,plan_versions:32,problems:{facility_B:{target_scope:'B',question_type:'facility_condition',explanations:['operable','faulted','unverified_after_replacement'],report_scopes:['B'],assumption_ids:[]},field_task:{target_scope:'HA-AB',question_type:'field_action_conditions',explanations:['ready','requires_check','blocked'],report_scopes:['A','B'],assumption_ids:['P-MOVE-HA','P-MOVE-AB-DRY','P-MOVE-AB-WET','P-READ','P-STOW']}}} as const;
export type IntegratedProblemId=keyof typeof integratedPlanningPolicy.problems;
export type IntegratedPreference='undecided'|'operable'|'faulted'|'unverified_after_replacement'|'ready'|'requires_check'|'blocked';
export type IntegratedPlanningRef<K extends 'working_assessment'|'field_plan'>={run_id:string;kind:K;id:string;version:number};
export type IntegratedPlanningBasis=IntegratedFieldEvidenceRef&{kind:'report'|'delivery'};
export type IntegratedAssumptionRef=IntegratedFieldEvidenceRef&{kind:'parameter'};
export type IntegratedAssessment={ref:IntegratedPlanningRef<'working_assessment'>;problem_id:IntegratedProblemId;target_scope:'B'|'HA-AB';question_type:'facility_condition'|'field_action_conditions';explanations:IntegratedPreference[];preferred:IntegratedPreference;basis_refs:IntegratedPlanningBasis[];assumption_refs:IntegratedAssumptionRef[];as_of:number;supersedes:IntegratedPlanningRef<'working_assessment'>|null;reason?:string};
export type IntegratedActionPayload={kind:'integrated_move';actor:'R'|'W';target:'H'|'A'|'B';model_ref:IntegratedModelRef}|{kind:'integrated_prepare';plan_ref:IntegratedFieldEvidenceRef;model_ref:IntegratedModelRef}|{kind:'integrated_activity';actor:'R';action:'read'|'observe';target:'A'|'B';model_ref:IntegratedModelRef;basis_refs:IntegratedFieldEvidenceRef[]}|{kind:'integrated_activity';actor:'W';action:'inspect'|'repair';target:'B';plan_ref:IntegratedFieldEvidenceRef;model_ref:IntegratedModelRef;basis_refs:IntegratedFieldEvidenceRef[]};
export type IntegratedActionIntent=IntegratedActionPayload&{saved_plan_ref?:IntegratedPlanningRef<'field_plan'>};
export function integrated_plan_gates(action:IntegratedActionPayload):string[]{
 const gates=['HQ_authority','same_model_configuration','deadline','local_acceptance'];if(action.kind!=='integrated_prepare')gates.push('message_service');
 if(action.kind==='integrated_activity'){gates.push('legal_position');if(action.action==='read'){gates.push('local_capacity_and_protection');if(action.target==='B')gates.push('delivered_functional_version','local_same_functional_version');}if(action.action==='repair')gates.push('same_plan_approval','delivered_diagnostic','local_spare_and_protection');}
 else if(action.kind==='integrated_move')gates.push('local_guidance');else gates.push('shared_INTEL_slot');return gates;
}
export type IntegratedPlanEstimate={lower_ms:number|null;upper_ms:number|null;classification:'conditional_not_measured'|'unknown';excludes:'queue_and_local_refusal'};
export function integrated_plan_estimate(view:Pick<IntegratedFieldPlayerView,'actors'|'geometry'>&{parameters:readonly IntegratedFieldParameter[]},action:IntegratedActionPayload):IntegratedPlanEstimate{
 const value=(id:string)=>view.parameters.find(parameter=>parameter.id===id)?.value;
 let lower:number|undefined,upper:number|undefined;
 if(action.kind==='integrated_move'){
  const from=view.actors.find(actor=>actor.id===action.actor)?.position.point[0],to=view.geometry.points[action.target][0],middle=view.geometry.points.A[0],ha=value('P-MOVE-HA'),dry=value('P-MOVE-AB-DRY'),wet=value('P-MOVE-AB-WET'),link=value('P-LINK');
  if(from!==undefined&&ha&&dry&&wet&&link){const haDistance=Math.max(0,Math.min(Math.max(from,to),middle)-Math.min(from,to)),abDistance=Math.abs(to-from)-haDistance;lower=Math.ceil(haDistance/ha*1000)+Math.ceil(abDistance/dry*1000)+link;upper=Math.ceil(haDistance/ha*1000)+Math.ceil(abDistance/wet*1000)+link;}
 }else{
  const id=action.kind==='integrated_prepare'?'P-PREPARE':action.action==='read'?'P-READ':action.action==='observe'?'P-OBSERVE':action.action==='inspect'?'P-INSPECT':'P-REPAIR',duration=value(id),link=action.kind==='integrated_prepare'?0:value('P-LINK');if(duration!==undefined&&link!==undefined)lower=upper=duration+link;
 }
 return{lower_ms:lower??null,upper_ms:upper??null,classification:lower===undefined?'unknown':'conditional_not_measured',excludes:'queue_and_local_refusal'};
}

export type IntegratedSavedPlan={ref:IntegratedPlanningRef<'field_plan'>;assessment_ref:IntegratedPlanningRef<'working_assessment'>;as_of:number;supersedes:IntegratedPlanningRef<'field_plan'>|null;evidence_version_refs:IntegratedFieldEvidenceRef[];action:IntegratedActionPayload;model_ref:IntegratedModelRef;definition_hash:string;model_hash:string;configuration_ref:IntegratedFieldObject['configuration_ref'];path_refs:Array<IntegratedFieldEvidenceRef&{kind:'road'}>;parameter_snapshot:IntegratedFieldParameter[];position_snapshot:IntegratedFieldPlayerView['actors'];estimate:IntegratedPlanEstimate;hard_gates:string[];conditions:string[];unknowns:string[];note?:string};
export type IntegratedPlanIssue={plan_ref:IntegratedPlanningRef<'field_plan'>;operation_id:string;issued_at:number;payload:IntegratedActionIntent};
export type IntegratedPlanningView={catalog:typeof integratedPlanningPolicy;position_evidence:IntegratedFieldPlayerView['actors'];assessments:IntegratedAssessment[];plans:Array<{plan:IntegratedSavedPlan;has_new_material:boolean}>;issues:IntegratedPlanIssue[]};
export type IntegratedAssessmentIntent={kind:'integrated_assess';model_ref:IntegratedModelRef;base_ref:IntegratedPlanningRef<'working_assessment'>|null;draft:{problem_id:IntegratedProblemId;preferred?:IntegratedPreference;basis_refs:IntegratedPlanningBasis[];assumption_refs:IntegratedAssumptionRef[];reason?:string}};
export type IntegratedSavePlanIntent={kind:'integrated_save_plan';model_ref:IntegratedModelRef;base_ref:IntegratedPlanningRef<'field_plan'>|null;assessment_ref:IntegratedPlanningRef<'working_assessment'>;action:IntegratedActionPayload;note?:string};
export type IntegratedFieldIntent=IntegratedAssessmentIntent|IntegratedSavePlanIntent|IntegratedActionIntent|IntegratedAbortIntent|Extract<import('./contracts').Intent,{kind:'advance'|'tick'|'pause'|'continue'|'rate'|'mode'|'save'|'restore'}>;
export type IntegratedFieldEnvelope={run_id:string;operation_id:string;expected_revision:number;intent:IntegratedFieldIntent};
export type IntegratedFieldSourceRef={id:string;version:1};
export type IntegratedFieldParameter={id:string;value:number;unit:string;category:'A'|'C'|'T';label:string;source_ref:IntegratedFieldSourceRef};
export type IntegratedFieldCatalog={
  execution_profile:{id:keyof typeof integratedWorkConfigurations;configuration_hash:string};
  model_ref:{id:'INTEGRATED-FIELD-MODEL-3';version:1};
  objects:IntegratedFieldObject[];
  geometry:{id:string;version:1;unit:'m';metres_per_coordinate:1;extent:[number,number];
    points:Record<'H'|'A'|'B',[number,number]>;
    segments:Array<{id:'HA'|'AB';length_m:number}>};
  configurations:Array<{actor:'R'|'W';id:string;load_kg:number;capacity_l:number;occupied_l:number;storage_bytes?:number;
    equipment:{id:string;mass_kg:number;battery_included:boolean;battery_wh:number;battery_nominal_j:number;battery_available_j:number}}>;
  definition_hash:string;model_hash:string;
  calibration_status:'conditional_not_measured';parameters:IntegratedFieldParameter[];
  sources:Array<{id:string;version:number;document_version:string;publication_date:null;sales_sku:null;url?:string;reading_scope?:string;source_register_sha256?:string;content_sha256?:string}>;
};
export type IntegratedFieldPlayerView={
  scenario_kind:'play_integrated_field';run_id:string;revision:number;sim_time:number;
  mode:Mode;rate:1|2|4;paused:boolean;finished:boolean;source_run:string|null;
  status:'ready'|'queued'|'preparing'|'executing'|'terminating'|'finished'|'deadline';
  can_issue:boolean;next_action:string;gap:string;
  public_rules:{deadline:number;receipt_grace:number};model_catalog:IntegratedFieldCatalog;
  // Position entries exist only when HQ has lawful evidence. Object identity
  // remains in model_catalog.objects even when this list has no position.
  actors:Array<{id:'R'|'W';position:{point:[number,number];observed_at:number;received_at:number;evidence:string}}>;
  reports:IntegratedMaterialReport[];
  knowledge:IntegratedKnowledge;
  planning:IntegratedPlanningView;
  process_reports:IntegratedProcessReport[];process_deliveries:IntegratedProcessDelivery[];
  handover_receipts:Array<{actor:'R'|'W';ref:IntegratedProcessRef<'delivery'>;report_ref:IntegratedProcessRef<'report'>;message_ref:IntegratedProcessRef<'message'>;generated_at:number;sent_at:number;received_at:number;verified_at:number;qualified:boolean;artifact_refs:string[];recovered_old:number}>;
  result:null|{outcome:'success'|'failure'|'aborted'|'unconfirmed';at:number;finished_seq:number;missing:string[];evaluation:'not_evaluable'};
  termination:IntegratedTerminationView|null;
  artifacts:Array<{id:string;report_ref:string;delivery_ref:string;source:'A'|'B';logical_size_bytes:number;verified:true;observed_at:number;received_at:number}>;
  activity_reports:Array<{id:string;report_ref:string;message_ref:string;sender:'R'|'W';recipient:'HQ';sent_at:number;knowledge_seq:number;artifact_ref:string|null;actor:'R'|'W';action:'read'|'observe'|'inspect'|'repair';target:'A'|'B';object_ref:IntegratedFieldObject['object_ref'];scope_ref:IntegratedFieldObject['scope_ref'];configuration_ref:NonNullable<IntegratedFieldObject['configuration_ref']>;phase:'accepted'|'completed'|'refused'|'blocked';reason:IntegratedRefusalReason|null;observed_at:number;received_at:number}>;
  facility_knowledge:null|{condition:'faulted'|'unverified_after_replacement'|'operable';version:number;method:'diagnostic'|'functional'|'installation_receipt';observed_at:number;received_at:number;evidence:string;report_ref:string};
  preparation:null|{plan_ref:IntegratedFieldEvidenceRef;approval_ref:IntegratedFieldEvidenceRef|null;status:'queued'|'validating'|'preparing'|'approved'|'cancelled';approved_at:number|null};
  geometry:IntegratedFieldCatalog['geometry'];
  replay_nodes:Array<{revision:number;at:number;meaningful:boolean;label:string}>;
  log:Array<{id:string;at:number;kind:string;text:string;evidence:string}>;
};
export type IntegratedTerminalIdentity={run_id:string;run_digest:string;finished_seq:number};
export type IntegratedTruthRequest=IntegratedTerminalIdentity&{expected_meta_revision:number;operation_id:string};
export type IntegratedTruthAcknowledgement=IntegratedTruthRequest&{payload_digest:string};
export type IntegratedTruthGrant=IntegratedTerminalIdentity&{operation_id:string;request_digest:string;payload_digest:string;metadata_revision:number;ack_revision:number|null};
export type IntegratedExposureSource=IntegratedTerminalIdentity&{operation_id:string;payload_digest:string;ack_revision:number};
export type IntegratedOpeningFairness={run_id:string;definition_hash:string;truth_exposure:boolean;sources:IntegratedExposureSource[]};
export type IntegratedFairness=IntegratedOpeningFairness&{opening:{truth_exposure:boolean;sources:IntegratedExposureSource[]}};
export type IntegratedDebriefSession=IntegratedTerminalIdentity&{definition_hash:string;metadata_revision:number;truth_exposure:boolean;pending_grant:null|{operation_id:string;metadata_revision:number;payload_digest:string};result:NonNullable<IntegratedFieldPlayerView['result']>;records:Array<{id:string;layer:'known_then'|'declared_reason';at:number;text:string;report_ref:string|null;history:{run_id:string;revision:number;at:number}}>};
export type IntegratedTruthFacts={at:number;process_reports:IntegratedProcessReport[];process_deliveries:IntegratedProcessDelivery[];quantities:{portable_energy_j:Record<'R'|'W',number>;portable_energy_uJ:Record<'R'|'W',number>;fixed_source_j:Record<'A'|'B',number>;R_storage_free_bytes:number;H_qualified_bytes:number};actors:Array<{id:'R'|'W';point:[number,number]}>;facility:{condition:'faulted'|'unverified_after_replacement'|'operable';version:number};components:{available_spares:number;reserved_spares:number;installed_new:number;installed_old:number;recovered_old:number;recovered_at_H:number};handovers:Array<{actor:'R'|'W';operation_id:string;arrived_at:number;started_at:number|null;completed_at:number|null;report_received_at:number|null;verify_started_at:number|null;verified_at:number|null;received_at:number|null;qualified:boolean;interrupted_at:number|null}>};
export type IntegratedTruthPayload=IntegratedTerminalIdentity&{layer:'engine_event';grant:{operation_id:string;metadata_revision:number;payload_digest:string};facts:IntegratedTruthFacts};
export type IntegratedTruthConfirmation=IntegratedTerminalIdentity&{operation_id:string;payload_digest:string;truth_exposure:true;metadata_revision:number};
