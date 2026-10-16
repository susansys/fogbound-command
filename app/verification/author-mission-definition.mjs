import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const old=JSON.parse(await fs.readFile(new URL('../src/core/play-definition.json',import.meta.url)));
const source='B22-MISSION-DESIGN-1.0.0';
const entries=[
 ['mission_budget',1,'mission'],['objective_budget',1,'objective'],['phase_budget',2,'phase'],
 ['plan_version_budget',32,'version'],['attempt_budget',16,'attempt'],['route_point_budget',64,'point'],
 ['total_route_point_budget',128,'point'],['evidence_budget',32,'reference'],['expression_depth_budget',4,'level'],
 ['expression_node_budget',32,'node'],['text_budget',2000,'unicode_codepoint'],['hold_ms',5000,'ms'],
 ['deadline',900000,'ms'],['receipt_grace',10000,'ms'],['link_ms',1000,'ms'],['send_window_ms',1000,'ms'],
 ['grant_from',0,'ms'],['grant_until',900000,'ms'],['position_max_age_ms',900000,'ms'],['evidence_valid_until',900000,'ms'],
 ['move_capacity',1,'slot'],['link_capacity',1,'slot'],['send_energy_cost',1,'energy'],['send_wear_cost',1,'wear'],
 ['base_speed',4,'fictional_metre/s'],['terrain_factor',1,'ratio'],['environment_factor',1,'ratio'],
 ['load_capacity',20,'load'],['space_capacity',12,'space'],['movement_energy',20,'energy'],
 ['equipment_energy',16,'energy'],['equipment_wear',100,'wear'],['hq_energy',16,'energy'],['hq_wear',100,'wear']
];
const profile={id:'B22-MISSION-01',version:1,parameters:Object.fromEntries(entries.map(([id,value])=>[id,value])),registry:entries.map(([id,value,unit])=>({id,entry_version:1,value,unit,source_ref:source+'/mission-contract',source_type:'design_assumption',calibration_status:'uncalibrated'}))};
const rules={version:'b22-mission-1',movement_rule_ref:'B21-CORRIDOR-01/b21-route-1',coordinate_grid:.01,length_scale:1000000,length_rounding:'round_half_up',duration_rounding:'ceil_total_only',load_factor_per_unit:.02,movement_energy_per_distance:.01,cause_policy:'once_per_cause_rule_consumer',report_policy:'accepted_and_one_terminal_or_hold_and_not_started_or_refused',reports_per_attempt:2,move_concurrency_group:'R:execution',link_concurrency_group:'R:communication',condition_fields:['position.scope','phase.confirmed','route.permitted','capability.ready'],disabled_capabilities:['record','repair','handover','withdrawal','executing_replacement','free_surface','full_play_outcome']};
const capabilities=[{id:'R:move',actor:'R',action:'move',speed:4,unit:'fictional_metre/s',capacity:1,concurrency_group:'R:execution',evidence_refs:['B22-INITIAL-CAPABILITY']},{id:'R:link',actor:'R',action:'send',unit:'message',capacity:1,concurrency_group:'R:communication',evidence_refs:['B22-INITIAL-LINK']}];
const catalogs={map:old.catalogs.map,actor:{...old.catalogs.actor,qualification_refs:['R:move','R:link']},equipment:old.catalogs.equipment,items:old.catalogs.items,hq_terminal:old.catalogs.hq_terminal,initial_evidence:{id:'B22-INITIAL-POSITION',scope_ref:'H',observed:{kind:'known',value:0,evidence:'B22-INITIAL-POSITION'},source_event_time:{kind:'unknown'},origin:'registered_initial_evidence',max_age_ms:900000,valid_until_time_ms:900000},authority:{id:'B22-STATIC-GRANT',version:1,issuer:'commander',holder:'staff',mission_scope:['M1'],actors:['R'],action_kinds:['move'],spatial_scope:['HA','AB'],valid_from_time_ms:0,valid_to_time_ms:900000,risk_limits:['registered_low'],delegation_allowed:false},movement_causes:old.catalogs.movement_causes};
rules.decision_checks=['context_completeness','public_rule_compliance','declared_reason_evaluability'].map(id=>({id,version:1,source_ref:source+'/mission-contract/AT236/'+id}));
const payload={schema:8,contract:'0.5.1',id:'B22-MISSION-01',version:1,scenario_kind:'play_mission',profile,capabilities,rules,catalogs,hashes:{profile:hash(profile),capabilities:hash(capabilities),rules:hash(rules),catalogs:hash(catalogs),media:hash([])}};
const bytes=JSON.stringify({...payload,definition_hash:hash(payload)},null,2)+'\n';
const target=new URL('../src/core/mission-definition.json',import.meta.url);
if(process.argv.includes('--check')){if(await fs.readFile(target,'utf8')!==bytes)throw Error('Registered mission definition differs from frozen-source authoring');}
else await fs.writeFile(target,bytes);
console.log(JSON.stringify({schema:8,definition_hash:hash(payload),mode:process.argv.includes('--check')?'check':'author',source}));
