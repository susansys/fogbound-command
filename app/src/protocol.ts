import {parse_outcome_envelope} from './outcome-protocol';
import type { Request } from "./transport";
import type { Envelope } from "./contracts";
import {prestart_case_refs} from './contracts';
import {valid_route_draft,valid_route_plan} from './route-validation';
import {parse_evaluate_mission} from './mission-protocol';
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function valid_id(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,128}$/.test(value);
}
export function valid_public_field_path(value:unknown):value is string{
  if(typeof value!=='string'||value.length>180)return false;
  if(['mission_draft.phases.self_dependency','mission_draft.phases.cyclic_dependencies','mission_draft.phases.dangling_dependency'].includes(value))return true;
  if(/^route_draft(?:\.(?:actor|map_id|map_version|crs_id|geometry_version|path)|\[(?:0|[1-9]\d{0,2})\])*$/.test(value))return true;
  if(['catalogs.movement_causes','catalogs.hq_terminal'].includes(value)||/^(?:profile\.parameters|rules)\.(?:report_budget|report_energy_cost|report_wear_cost|cause_policy)$/.test(value))return true;
  if(/^(?:capabilities(?:\[0\])?(?:\.(?:unit|speed|evidence_refs))?|catalogs\.actor(?:\.(?:load|space|qualification_refs))?)$/.test(value))return true;
  return /^(catalogs\.map|catalogs\.initial_evidence|profile\.parameters|profile\.registry|rules)(?:\.(?:map_id|map_version|crs_id|geometry_version|extent|unit|scopes|id|kind|precision|uncertainty|typed_geometry|evidence_refs|position|outer|holes|area_refs|line|centerline|width|area_ref|value|evidence|scope_ref|observed|source_event_time|origin|deadline|receipt_grace|link_ms|base_speed|terrain_factor|environment_factor|load_capacity|space_capacity|movement_energy|record_energy|record_wear|equipment_energy|equipment_wear|record_packs|hq_energy|hq_wear|version|coordinate_grid|length_scale|length_rounding|duration_rounding|load_factor_per_unit|movement_energy_per_distance|report_policy|route_point_budget|conflict_candidate_budget|disabled_capabilities)|\[(?:0|[1-9]\d{0,9})\])*$/.test(value);
}
export function fields(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  return Object.keys(value).sort().join(",") === expected.sort().join(",");
}
export function valid_request(
  value: unknown,
): value is Request & { request_id: string } {
  if (!record(value) || !valid_id(value.request_id)) return false;
  if(value.kind==='operate_outcome'){if(!fields(value,['kind','request_id','envelope']))return false;try{parse_outcome_envelope(value.envelope);return true;}catch{return false;}}
  if(value.kind==='request_source_validation'||value.kind==='request_preparation'||value.kind==='issue_activity')return fields(value,['kind','request_id','envelope'])&&record(value.envelope);
  if(value.kind==='management_pause')return fields(value,['kind','reason','request_id'])&&typeof value.reason==='string'&&['manual','focus_lost','application_hidden'].includes(value.reason);
  if(value.kind==='preview_mission')return fields(value,['kind','request_id','run_id','revision','editing_seq','draft'])&&valid_id(value.run_id)&&typeof value.revision==='number'&&Number.isSafeInteger(value.revision)&&value.revision>=1&&typeof value.editing_seq==='number'&&Number.isSafeInteger(value.editing_seq)&&value.editing_seq>=0;
  if(value.kind==='save_plan')return fields(value,['kind','request_id','envelope'])&&record(value.envelope);
  if(value.kind==='issue_mission')return fields(value,['kind','request_id','envelope'])&&record(value.envelope);
  if(value.kind==='append_explanation')return fields(value,['kind','request_id','envelope'])&&record(value.envelope);
  if(value.kind==='evaluate_decision'){if(!fields(value,['kind','request_id','run_id','view_revision','decision_ref']))return false;try{parse_evaluate_mission({run_id:value.run_id,view_revision:value.view_revision,decision_ref:value.decision_ref});return true;}catch{return false;}}
  if(value.kind==='operate_mission')return fields(value,['kind','request_id','envelope'])&&valid_envelope(value.envelope,910000,true)&&['save','pause','continue','advance','rate'].includes(value.envelope.intent.kind);
  if(value.kind==='operate_intelligence')return fields(value,['kind','request_id','envelope'])&&valid_envelope(value.envelope,910000,true)&&['save','pause','continue','advance','rate'].includes(value.envelope.intent.kind);
  if (value.kind === "list") return fields(value, ["kind", "request_id"]);
  if (value.kind === "create")
    return (
      fields(value, ["kind", "mode", "operation_id", "request_id",...(value.definition_ref===undefined?[]:['definition_ref']),...(value.case_ref===undefined?[]:['case_ref'])]) &&
      (value.case_ref===undefined||prestart_case_refs.some(ref=>ref===value.case_ref))&&
      (value.case_ref===undefined||value.case_ref==='normal'||value.definition_ref==='ENG-PRESTART-REPLACE')&&
      (value.definition_ref===undefined||value.definition_ref==='FB01-ENG-MOVE'||value.definition_ref==='FB02-ENG-RECORD'||value.definition_ref==='ENG-PRESTART-REPLACE'||value.definition_ref==='B21-CORRIDOR-01'||value.definition_ref==='B22-MISSION-01'||value.definition_ref==='B23-INTELLIGENCE-01'||value.definition_ref==='B24-OUTCOME-01'||value.definition_ref==='B24-OUTCOME-NARROW-01'||value.definition_ref==='B24-OUTCOME-HARD-BOUNDARY-02') &&
      (value.mode === "command" || value.mode === "research") &&
      valid_id(value.operation_id)
    );
  if (value.kind === "view"||value.kind==='current'||value.kind==='previous')
    return (
      fields(value, ["kind", "run_id", "request_id"]) && valid_id(value.run_id)
    );
  if (value.kind === "preview")
    return (
      fields(value, [
        "kind",
        "run_id",
        "revision",
        "editing_seq",
        "request_id",
        ...(value.route_draft===undefined?[]:['route_draft']),
      ]) &&
      (value.route_draft===undefined||valid_route_draft(value.route_draft))&&
      valid_id(value.run_id) &&
      typeof value.revision === "number" &&
      Number.isSafeInteger(value.revision) &&
      typeof value.editing_seq === "number" &&
      Number.isSafeInteger(value.editing_seq) &&
      value.editing_seq >= 0
    );
  if(value.kind==='operate_corridor')return fields(value,['kind','request_id','envelope'])&&valid_envelope(value.envelope,910000,true)&&!['tick','restore','replace_task','mode'].includes(value.envelope.intent.kind)&&(value.envelope.intent.kind!=='issue'||'kind' in value.envelope.intent.plan&&value.envelope.intent.plan.kind==='corridor_move');
  if (value.kind === "operate")
    return (
      fields(value, ["kind", "request_id", "envelope"]) &&
      valid_envelope(value.envelope) && !['tick','restore'].includes(value.envelope.intent.kind)
    );
  if(value.kind==='replay')return fields(value,['kind','run_id','to','request_id',...(value.node_revision===undefined?[]:['node_revision'])])&&(value.node_revision===undefined||typeof value.node_revision==='number'&&Number.isSafeInteger(value.node_revision)&&value.node_revision>=1)&&valid_id(value.run_id)&&typeof value.to==='number'&&Number.isSafeInteger(value.to)&&value.to>=0;
  if (value.kind === "receipt" || value.kind==='takeover'||value.kind==='restart')
    return (
      fields(value, ["kind", "request_id", "run_id", "operation_id"]) &&
      valid_id(value.run_id) &&
      valid_id(value.operation_id)
    );
  return false;
}
export function correlation(value: unknown): string {
  return record(value) && valid_id(value.request_id)
    ? value.request_id
    : "invalid-request";
}
export function valid_envelope(value: unknown,time_limit=610000,allow_corridor=false): value is Envelope {
  if (
    !record(value) ||
    !fields(value, ["run_id", "operation_id", "expected_revision", "intent"]) ||
    !valid_id(value.run_id) ||
    !valid_id(value.operation_id) ||
    typeof value.expected_revision !== "number" ||
    !Number.isSafeInteger(value.expected_revision) ||
    value.expected_revision < 1 ||
    !record(value.intent)
  )
    return false;
  const intent = value.intent;
  if(intent.kind==='issue'&&record(intent.plan)&&intent.plan.kind==='corridor_move')return allow_corridor&&fields(intent,['kind','command_id','plan',...(intent.reason===undefined?[]:['reason'])])&&valid_id(intent.command_id)&&(intent.reason===undefined||typeof intent.reason==='string'&&intent.reason.length<=2000)&&valid_route_plan(intent.plan);
  if(intent.kind==='restore')return fields(intent,['kind','snapshot_revision'])&&typeof intent.snapshot_revision==='number'&&Number.isSafeInteger(intent.snapshot_revision)&&intent.snapshot_revision>=1;
  if(intent.kind==='save')return fields(intent,['kind']);
  if(intent.kind==='pause')return fields(intent,['kind','reason'])&&typeof intent.reason==='string'&&['manual','focus_lost','application_hidden'].includes(intent.reason);
  if(intent.kind==='continue')return fields(intent,['kind']);
  if(intent.kind==='rate')return fields(intent,['kind','rate'])&&[1,2,4].includes(Number(intent.rate))&&typeof intent.rate==='number';
  if(intent.kind==='mode')return fields(intent,['kind','mode'])&&typeof intent.mode==='string'&&['command','research'].includes(intent.mode);
  if (intent.kind === "advance" || intent.kind==='tick')
    return (
      fields(intent, ["kind", "to"]) &&
      typeof intent.to === "number" &&
      Number.isSafeInteger(intent.to) &&
      intent.to >= 0 &&
      intent.to <= time_limit
    );
  if (intent.kind === "issue"||intent.kind==='replace_task')
    return (
      fields(intent, [
        "kind",
        "command_id",
        "plan",
        ...(intent.kind==='replace_task'?['original_command_id','original_version']:[]),
        ...(intent.reason === undefined ? [] : ["reason"]),
      ]) &&
      valid_id(intent.command_id) &&
      (intent.reason === undefined ||
        (typeof intent.reason === "string" && intent.reason.length <= 2000)) &&
      record(intent.plan) &&
      (intent.kind!=='replace_task'||intent.plan.kind==='prestart_move'&&intent.plan.target==='T'&&valid_id(intent.original_command_id)&&intent.original_command_id===intent.plan.supersedes&&intent.original_version===1)&&
      (intent.plan.kind==='prestart_move'
        ? fields(intent.plan,['kind','run_id','revision','editing_seq','version','actor','target','path','distance','estimated_move_ms','setup_ms','link_ms','definition_hash','allowed','gap',...(intent.plan.supersedes===undefined?[]:['supersedes'])])&&
          (intent.plan.target==='N'&&intent.plan.path==='H-N'&&intent.plan.distance===60&&intent.plan.estimated_move_ms===15900&&intent.plan.supersedes===undefined||intent.plan.target==='T'&&intent.plan.path==='H-T'&&intent.plan.distance===120&&intent.plan.estimated_move_ms===31800&&valid_id(intent.plan.supersedes))&&intent.plan.setup_ms===5000&&typeof intent.plan.definition_hash==='string'&&/^[a-f0-9]{64}$/.test(intent.plan.definition_hash)
        :intent.plan.kind==='record'
        ? fields(intent.plan,['kind','run_id','revision','editing_seq','version','actor','target','station','definition_hash','report_id','delivery_id','setup_ms','work','estimated_record_ms','estimated_total_ms','link_ms','record_energy','record_wear','record_packs','allowed','gap'])&&
          intent.plan.target==='A'&&intent.plan.station==='H'&&typeof intent.plan.definition_hash==='string'&&/^[a-f0-9]{64}$/.test(intent.plan.definition_hash)&&valid_id(intent.plan.report_id)&&valid_id(intent.plan.delivery_id)&&
          intent.plan.setup_ms===5000&&intent.plan.work===4&&intent.plan.estimated_record_ms===40000&&intent.plan.estimated_total_ms===47000&&intent.plan.record_energy===4&&intent.plan.record_wear===3&&intent.plan.record_packs===1
        : fields(intent.plan, [
        "run_id",
        "revision",
        "editing_seq",
        "version",
        "actor",
        "target",
        "path",
        "distance",
        "estimated_move_ms",
        "link_ms",
        "allowed",
        "gap",
      ])&&intent.plan.target==='T'&&intent.plan.path==='H-T'&&intent.plan.distance===120&&intent.plan.estimated_move_ms===31800) &&
      valid_id(intent.plan.run_id) &&
      typeof intent.plan.revision==='number'&&Number.isSafeInteger(intent.plan.revision)&&intent.plan.revision>=1&&
      intent.plan.version===1&&intent.plan.actor==='R'&&intent.plan.link_ms===1000&&typeof intent.plan.allowed==='boolean'&&typeof intent.plan.gap==='string'&&intent.plan.gap.length<=300&&
      typeof intent.plan.editing_seq === "number" &&
      Number.isSafeInteger(intent.plan.editing_seq) &&
      intent.plan.editing_seq >= 0
    );
  return false;
}
