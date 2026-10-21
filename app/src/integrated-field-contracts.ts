import type {Mode} from './contracts';
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
export type IntegratedRefusalReason='missing_part'|'station_busy'|'actor_in_transit'|'position_unconfirmed'|'capacity'|'facility_unconfirmed'|'preparation_unavailable'|'facility_condition'|'deadline';
type IntegratedModelRef={id:'INTEGRATED-FIELD-MODEL-3';version:1};
export type IntegratedFieldIntent=Extract<import('./contracts').Intent,{kind:'advance'|'tick'|'pause'|'continue'|'rate'|'mode'|'save'|'restore'}>|{kind:'integrated_move';actor:'R'|'W';target:'H'|'A'|'B';model_ref:IntegratedModelRef}|{kind:'integrated_prepare';plan_ref:IntegratedFieldEvidenceRef;model_ref:IntegratedModelRef}|{kind:'integrated_activity';actor:'R';action:'read'|'observe';target:'A'|'B';model_ref:IntegratedModelRef;basis_refs:IntegratedFieldEvidenceRef[]}|{kind:'integrated_activity';actor:'W';action:'inspect'|'repair';target:'B';plan_ref:IntegratedFieldEvidenceRef;model_ref:IntegratedModelRef;basis_refs:IntegratedFieldEvidenceRef[]};
export type IntegratedFieldEnvelope={run_id:string;operation_id:string;expected_revision:number;intent:IntegratedFieldIntent};
export type IntegratedFieldSourceRef={id:string;version:1};
export type IntegratedFieldParameter={id:string;value:number;unit:string;category:'A'|'C'|'T';label:string;source_ref:IntegratedFieldSourceRef};
export type IntegratedFieldCatalog={
  model_ref:{id:'INTEGRATED-FIELD-MODEL-3';version:1};
  objects:IntegratedFieldObject[];
  geometry:{id:string;version:1;unit:'m';metres_per_coordinate:1;extent:[number,number];
    points:Record<'H'|'A'|'B',[number,number]>;
    segments:Array<{id:'HA'|'AB';length_m:number}>};
  configurations:Array<{actor:'R'|'W';id:string;load_kg:number;capacity_l:number;occupied_l:number;storage_bytes?:number;
    equipment:{id:string;mass_kg:number;battery_included:boolean;battery_wh:number;battery_nominal_j:number;battery_available_j:number}}>;
  calibration_status:'conditional_not_measured';parameters:IntegratedFieldParameter[];
  sources:Array<{id:string;version:number;document_version:string;publication_date:null;sales_sku:null;url?:string;reading_scope?:string;source_register_sha256?:string;content_sha256?:string}>;
};
export type IntegratedFieldPlayerView={
  scenario_kind:'play_integrated_field';run_id:string;revision:number;sim_time:number;
  mode:Mode;rate:1|2|4;paused:boolean;finished:boolean;source_run:string|null;
  status:'ready'|'queued'|'preparing'|'executing'|'terminating'|'finished'|'deadline';
  can_issue:boolean;next_action:string;gap:string;
  public_rules:{deadline:number;receipt_grace:number};model_catalog:IntegratedFieldCatalog;
  actors:Array<{id:'R'|'W';position:{point:[number,number];observed_at:number;received_at:number;evidence:string}}>;
  artifacts:Array<{id:string;report_ref:string;delivery_ref:string;source:'A'|'B';logical_size_bytes:number;verified:true;observed_at:number;received_at:number}>;
  activity_reports:Array<{id:string;report_ref:string;artifact_ref:string|null;actor:'R'|'W';action:'read'|'observe'|'inspect'|'repair';target:'A'|'B';object_ref:IntegratedFieldObject['object_ref'];scope_ref:IntegratedFieldObject['scope_ref'];configuration_ref:NonNullable<IntegratedFieldObject['configuration_ref']>;phase:'accepted'|'completed'|'refused'|'blocked';reason:IntegratedRefusalReason|null;observed_at:number;received_at:number}>;
  facility_knowledge:null|{condition:'faulted'|'unverified_after_replacement'|'operable';version:number;method:'diagnostic'|'functional';observed_at:number;received_at:number;evidence:string;report_ref:string};
  preparation:null|{plan_ref:IntegratedFieldEvidenceRef;approval_ref:IntegratedFieldEvidenceRef|null;status:'queued'|'validating'|'preparing'|'approved';approved_at:number|null};
  geometry:IntegratedFieldCatalog['geometry'];
  replay_nodes:Array<{revision:number;at:number;meaningful:boolean;label:string}>;
  log:Array<{id:string;at:number;kind:string;text:string;evidence:string}>;
};
