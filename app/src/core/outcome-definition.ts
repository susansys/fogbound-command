import type {IntelligenceDefinition} from './intelligence-definition';
import registered from './outcome-definition.json';
import {load_intelligence_definition} from './intelligence-definition';
import {hash} from './scenario';
import {GameError} from '../contracts';
import {record} from '../protocol';
export type OutcomeDecisionProfile={id:'B24-DQ-01';version:1;source_ref:string;rules:Array<{id:'DQ-E'|'DQ-A'|'DQ-C'|'DQ-V';version:1;checks:[string,string]}>;bindings:Array<{operation:string;activity_id:string|null;required:string[];auxiliary:string[];authority:string;confirmation:'remote'|'local'|'management'|'none'}>};
export const outcome_decision_profile:OutcomeDecisionProfile={id:'B24-DQ-01',version:1,source_ref:'B24-OUTCOME-DESIGN-1.0.0/debrief-contract/decision-quality',rules:[{id:'DQ-E',version:1,checks:['E1','E2']},{id:'DQ-A',version:1,checks:['A1','A2']},{id:'DQ-C',version:1,checks:['C1','C2']},{id:'DQ-V',version:1,checks:['V1','V2']}],bindings:[
 {operation:'issue_activity',activity_id:'R-to-A',required:[],auxiliary:[],authority:'HQ-field-authority',confirmation:'remote'},
 {operation:'issue_activity',activity_id:'A-record',required:['arrived_A'],auxiliary:[],authority:'HQ-field-authority',confirmation:'remote'},
 {operation:'issue_activity',activity_id:'R-to-B',required:['completed_A_record'],auxiliary:[],authority:'HQ-field-authority',confirmation:'remote'},
 {operation:'issue_activity',activity_id:'W-repair',required:['preparation_approved'],auxiliary:['source_assessment'],authority:'HQ-field-authority',confirmation:'remote'},
 {operation:'issue_activity',activity_id:'B-record',required:['arrived_B','access_green','repair_B'],auxiliary:['preparation_approved'],authority:'HQ-field-authority',confirmation:'remote'},
 {operation:'return_and_deliver',activity_id:null,required:['own_registered_or_received_position','batch_3_seats'],auxiliary:['own_artifact'],authority:'HQ-outcome-authority',confirmation:'remote'},
 {operation:'request_source_validation',activity_id:null,required:['selected_raw_report'],auxiliary:[],authority:'HQ-processing',confirmation:'local'},
 {operation:'request_preparation',activity_id:null,required:[],auxiliary:['source_report','source_assessment'],authority:'HQ-processing',confirmation:'local'},
 {operation:'abort_outcome',activity_id:null,required:[],auxiliary:[],authority:'HQ-outcome-management',confirmation:'management'},
 {operation:'save_plan',activity_id:null,required:[],auxiliary:[],authority:'HQ-plan',confirmation:'none'}
]};
export type OutcomeDefinition=Omit<IntelligenceDefinition,'schema'|'scenario_kind'|'profile'|'rules'|'catalogs'>&{schema:10;scenario_kind:'play_outcome';catalogs:IntelligenceDefinition['catalogs']&{no_public_obligations?:{id:'B24-OUTCOME-NO-OBLIGATIONS-01';version:1;source_ref:'B24-OUTCOME-DESIGN-1.0.0/acceptance.md:E19'};verification_receipt_delay?:10000|10001;hard_boundary?:{id:'B24-OUTCOME-HARD-BOUNDARY-02';version:1;hard_close_time:391000};receiver_conditions?:{prepared:boolean;authority_valid:boolean;initial_occupied_seats:number;source_ref:'B24-OUTCOME-DESIGN-1.0.0/acceptance.md:E04'};handover_faults?:Array<{actor:'R'|'W';kind:'missing_material'|'broken_custody'|'wrong_manifest'|'damaged_content'}>};prefix_definition:IntelligenceDefinition;profile:Omit<IntelligenceDefinition['profile'],'id'>&{id:string;outcome:{decision_evaluation?:unknown;source_ref:string;reception_seats:number;batch_people:number;handover_setup_ms:number;handover_work:number;verification_work:number;verification_energy:number;registry:Array<{id:string;value:number;unit:string;entry_version:number;source_ref:string;source_type:string;calibration_status:string}>;return_R_ms:number;return_W_ms:number;return_energy:number;allowed_followups:string[];R_H_terminal_actions:string[]}};rules:Omit<IntelligenceDefinition['rules'],'version'|'disabled_capabilities'>&{version:string;disabled_capabilities:string[];outcome_policy:string}};
// Closed public presets authored from the frozen E16/E17 tables. Hashes are
// computed during authoring, then independently verified by the normal loader.
// The original JSON and its schema9 prefix are never rewritten.
const presetIdentities=[
  {
    "reference": "B24-OUTCOME-NARROW-01",
    "kind": "narrow",
    "profile_sha256": "af52231dfa47cde97a20574abf60bcd113cb9f4d685ebfde1dc2d4eed1eab933",
    "catalogs_sha256": "c9a8b4b5105a29720402401693dcdc26f27ee46d1c89eb4cd83643835baf523d",
    "definition_hash": "acf6c134eaf7942d151a5e86e833e87551f3515c127de404a4577de78317d6d4"
  },
  {
    "reference": "B24-OUTCOME-HARD-BOUNDARY-02",
    "kind": "hard",
    "profile_sha256": "6c56109ba40302cbd37284f0e747d0b8f45e12ed5851997c48e48c606e133304",
    "catalogs_sha256": "6acc39674e7b7050383baee613cb0109a9787e5d710de59710acd70a2a565056",
    "definition_hash": "dcd5428a43fa5e4d37b5e7cd612b7141dfdced095b23418f87c4e8d112496a90"
  }
] as const;
const builtinOutcomes:OutcomeDefinition[]=[registered as OutcomeDefinition,...presetIdentities.map(preset=>{
 const value=structuredClone(registered) as OutcomeDefinition;
 if(preset.kind==='narrow'){value.profile.parameters.deadline=380000;Object.assign(value.profile.registry.find(entry=>entry.id==='deadline')!,{value:380000,source_ref:'B24-OUTCOME-DESIGN-1.0.0/acceptance.md:E16'});}
 else value.catalogs.hard_boundary={id:'B24-OUTCOME-HARD-BOUNDARY-02',version:1,hard_close_time:391000};
 value.hashes.profile=preset.profile_sha256;value.hashes.catalogs=preset.catalogs_sha256;value.definition_hash=preset.definition_hash;return value;
})];
// Preserve the three previously registered schema10 identities without granting
// them the later decision-evaluation capability. Their exact hashes still pass
// the full normal loader; no caller-supplied unregistered identity is accepted.
const preservedIdentities=[
 {profile:'98cda1d9f8608015708ba9912c23651f1dfab35fa4a8826422b95f7bd717eb20',definition:'56f1644af745d263adb1973616e9cd29e3fc7f3f8114879d5f37e3585b7c0e36'},
 {profile:'274e11d2694f7d42b69e92a32cbec9f671d8af78a9fab84954d42e437f6e41f6',definition:'9ca2c46ccf42e8b559a1bd63a386443f660ff4f2ed55cc62d4d2fa89a1f85aeb'},
 {profile:'98cda1d9f8608015708ba9912c23651f1dfab35fa4a8826422b95f7bd717eb20',definition:'8088414ed5da24e2894bc77bdbacf29b2bb68c21af1dc3934b7f8c12566ed744'}
];
const preservedOutcomes=builtinOutcomes.map((current,index)=>{const value=structuredClone(current);delete value.profile.outcome.decision_evaluation;value.hashes.profile=preservedIdentities[index].profile;value.definition_hash=preservedIdentities[index].definition;return value;});
export function outcome_decision_profile_for(definition:OutcomeDefinition):OutcomeDecisionProfile|null{
 const value=definition.profile.outcome.decision_evaluation;if(value===undefined)return null;
 if(JSON.stringify(value)!==JSON.stringify(outcome_decision_profile))throw new GameError('INVALID_DEFINITION');return structuredClone(outcome_decision_profile);
}
export function outcome_definition_by_ref(reference:string):OutcomeDefinition{
 const index=reference==='B24-OUTCOME-01'?0:presetIdentities.findIndex(preset=>preset.reference===reference)+1;
 if(index<1&&reference!=='B24-OUTCOME-01')throw new GameError('INVALID_REQUEST');return structuredClone(builtinOutcomes[index]);
}
export function is_outcome_definition(value:{schema:number}):value is OutcomeDefinition{return value.schema===10;}
export function outcome_definition_for_package(digest:unknown,owned:readonly OutcomeDefinition[]=[]):OutcomeDefinition{
 const found=[...builtinOutcomes,...preservedOutcomes,...owned].find(d=>d.definition_hash===digest);if(!found)throw new GameError('INVALID_SAVE');return structuredClone(found) as OutcomeDefinition;
}
export async function load_outcome_definition(input:unknown,owned:readonly OutcomeDefinition[]=[]):Promise<OutcomeDefinition>{
 if(!record(input))throw new GameError('INVALID_DEFINITION');let selected:OutcomeDefinition;try{selected=outcome_definition_for_package(input.definition_hash,owned);}catch{throw new GameError('INVALID_DEFINITION');}
 if(JSON.stringify(input)!==JSON.stringify(selected)||selected.schema!==10||selected.scenario_kind!=='play_outcome'||selected.contract!=='0.5.1'||selected.id!=='B24-OUTCOME-01'||selected.version!==2||selected.profile.id!=='FIC-PLAY-B24-01'||selected.profile.version!==1)throw new GameError('INVALID_DEFINITION');
 const {definition_hash,...body}=selected;if(await hash(body)!==definition_hash)throw new GameError('INVALID_DEFINITION');for(const key of ['profile','capabilities','rules','catalogs'] as const)if(await hash(selected[key])!==selected.hashes[key])throw new GameError('INVALID_DEFINITION');if(await hash([])!==selected.hashes.media)throw new GameError('INVALID_DEFINITION');
 await load_intelligence_definition(selected.prefix_definition,[selected.prefix_definition]);
 // Only the frozen narrow entity deadline overrides the unchanged prefix.
 // Self-consistent hashes do not grant permission to invent new parameters.
 const baseParameters=selected.prefix_definition.profile.parameters,parameters=selected.profile.parameters;
 if(!record(parameters)||![baseParameters.deadline,380000].includes(parameters.deadline)||parameters.deadline>baseParameters.deadline||JSON.stringify({...parameters,deadline:baseParameters.deadline})!==JSON.stringify(baseParameters))throw new GameError('INVALID_DEFINITION');
 const expectedRegistry=selected.prefix_definition.profile.registry.map(entry=>parameters.deadline===380000&&entry.id==='deadline'?{...entry,value:380000,source_ref:'B24-OUTCOME-DESIGN-1.0.0/acceptance.md:E16'}:entry);
 if(JSON.stringify(selected.profile.registry)!==JSON.stringify(expectedRegistry))throw new GameError('INVALID_DEFINITION');
 const {handover_faults,receiver_conditions,hard_boundary,verification_receipt_delay,no_public_obligations,...baseCatalogs}=selected.catalogs;if(JSON.stringify(baseCatalogs)!==JSON.stringify(selected.prefix_definition.catalogs))throw new GameError('INVALID_DEFINITION');if(handover_faults!==undefined&&(!Array.isArray(handover_faults)||handover_faults.length>2||new Set(handover_faults.map(f=>f.actor)).size!==handover_faults.length||handover_faults.some(f=>!record(f)||Object.keys(f).sort().join(',')!=='actor,kind'||!['R','W'].includes(f.actor)||!['missing_material','broken_custody','wrong_manifest','damaged_content'].includes(f.kind))))throw new GameError('INVALID_DEFINITION');
 if(no_public_obligations!==undefined&&JSON.stringify(no_public_obligations)!==JSON.stringify({id:'B24-OUTCOME-NO-OBLIGATIONS-01',version:1,source_ref:'B24-OUTCOME-DESIGN-1.0.0/acceptance.md:E19'}))throw new GameError('INVALID_DEFINITION');
 if(verification_receipt_delay!==undefined&&![10000,10001].includes(verification_receipt_delay))throw new GameError('INVALID_DEFINITION');
 if(hard_boundary!==undefined&&JSON.stringify(hard_boundary)!==JSON.stringify({id:'B24-OUTCOME-HARD-BOUNDARY-02',version:1,hard_close_time:391000}))throw new GameError('INVALID_DEFINITION');
 if(receiver_conditions!==undefined&&(!record(receiver_conditions)||Object.keys(receiver_conditions).sort().join(',')!=='authority_valid,initial_occupied_seats,prepared,source_ref'||typeof receiver_conditions.prepared!=='boolean'||typeof receiver_conditions.authority_valid!=='boolean'||!Number.isSafeInteger(receiver_conditions.initial_occupied_seats)||receiver_conditions.initial_occupied_seats<0||receiver_conditions.initial_occupied_seats>6||receiver_conditions.source_ref!=='B24-OUTCOME-DESIGN-1.0.0/acceptance.md:E04'))throw new GameError('INVALID_DEFINITION');
 const p=selected.profile.outcome;outcome_decision_profile_for(selected);const expected:Array<[string,number,string]>=[['reception_seats',6,'seat'],['batch_people',3,'person'],['handover_setup_ms',5000,'ms'],['handover_work',2,'work'],['verification_work',2,'work'],['verification_energy',2,'energy'],['return_R_ms',57000,'ms'],['return_W_ms',56000,'ms'],['return_energy',2,'energy']];
 if(!Array.isArray(p.registry))throw new GameError('CONFIG_PARAMETER_MISSING','profile.outcome.registry');
 for(const[id,value,unit]of expected){const entries=p.registry.filter(e=>e.id===id),entry=entries[0];if(!entry)throw new GameError('CONFIG_PARAMETER_MISSING','profile.outcome.registry');if(entry.unit!==unit)throw new GameError('CONFIG_UNIT_MISMATCH','profile.outcome.registry');if(entries.length!==1||entry.value!==value||Reflect.get(p,id)!==value||entry.entry_version!==1||entry.source_ref!==p.source_ref||entry.source_type!=='design_assumption'||entry.calibration_status!=='uncalibrated')throw new GameError('INVALID_DEFINITION');}
 if(p.registry.length!==expected.length)throw new GameError('INVALID_DEFINITION');
 if(p.reception_seats!==6||p.batch_people!==3||p.handover_setup_ms!==5000||p.handover_work!==2||p.verification_work!==2||p.return_energy!==2||JSON.stringify(p.allowed_followups)!==JSON.stringify(['return','handover_batch','verify_manifest','notify_HQ']))throw new GameError('INVALID_DEFINITION');
 const expectedCapabilities=[...selected.prefix_definition.capabilities,...[{"id":"R:return","actor":"R","action":"return","qualification":"none","equipment":"movement","unit":"fictional_metre","capacity":1},{"id":"W:return","actor":"W","action":"return","qualification":"none","equipment":"movement","unit":"fictional_metre","capacity":1},{"id":"H:reception","actor":"H","action":"receive","qualification":"receiver","equipment":"fixed_H","unit":"seat","capacity":6},{"id":"H:handover","actor":"H","action":"handover","qualification":"receiver","equipment":"fixed_H","unit":"batch","capacity":1},{"id":"INTEL:verify","actor":"INTEL","action":"verify_manifest","qualification":"verifier","equipment":"processing","unit":"work","capacity":1}]];
 for(const required of expectedCapabilities){const entries=selected.capabilities.filter(c=>c.id===required.id);if(!entries.length)throw new GameError('CONFIG_CAPABILITY_MISSING');if(entries[0].unit!==required.unit)throw new GameError('CONFIG_UNIT_MISMATCH');if(entries.length!==1||JSON.stringify(entries[0])!==JSON.stringify(required))throw new GameError('INVALID_DEFINITION');}
 if(selected.capabilities.length!==expectedCapabilities.length||JSON.stringify(p.R_H_terminal_actions)!==JSON.stringify(['return_terminal','handover','cleanup']))throw new GameError('INVALID_DEFINITION');
 return selected;
}
