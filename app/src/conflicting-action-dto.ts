import {record,fields,valid_id} from './protocol';
import {dense_array} from './spatial';
import {source_time_player_view} from './source-time-dto';

const time=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function conflicting_action_player_view(value:unknown):boolean{
 if(!record(value)||!record(value.conflicting_action))return false;
 const {conflicting_action:action,...source}=value;
 const condition=source.repair_condition;
 if(!record(condition)||condition.status==='required')return false;
 if(!dense_array(source.field_reports)||!dense_array(source.artifact_reports))return false;
 const facilityReports:Array<{delivery:Record<string,unknown>;report:Record<string,unknown>;confirmation:{target:'B';condition:'operable'|'faulted';version:number}}>=[];
 for(const item of source.field_reports){
  if(!record(item)||!record(item.report)||!record(item.delivery))return false;
  const report=item.report,confirmation=report.facility_confirmation;
  if(Object.hasOwn(report,'facility_confirmation')){
   if(!record(confirmation)||!fields(confirmation,['target','condition','version'])||confirmation.target!=='B'||typeof confirmation.condition!=='string'||!['operable','faulted'].includes(confirmation.condition)||typeof confirmation.version!=='number'||![1,2].includes(confirmation.version)||report.actor!=='W'||report.phase!=='completed'||!record(report.typed_payload)||!record(report.typed_payload.activity_ref)||!['W-inspect','W-repair'].includes(String(report.typed_payload.activity_ref.id))||!record(report.confirmation)||!record(report.confirmation.position)||report.confirmation.position.site!=='B')return false;
   if(report.typed_payload.activity_ref.id==='W-repair'&&(confirmation.condition!=='operable'||confirmation.version!==2)||confirmation.version===2&&confirmation.condition!=='operable')return false;
   facilityReports.push({delivery:item.delivery,report,confirmation:confirmation as typeof facilityReports[number]['confirmation']});
  }else if(record(report.typed_payload)&&record(report.typed_payload.activity_ref)&&['W-inspect','W-repair'].includes(String(report.typed_payload.activity_ref.id))&&report.phase==='completed')return false;
 }
 const latest=facilityReports.at(-1),expectedCondition=latest?{site:'B',status:(latest.report.typed_payload as {activity_ref:{id:string}}).activity_ref.id==='W-repair'?'confirmed_repaired':latest.confirmation.condition==='operable'?'confirmed_operable':'confirmed_faulted',confirmed_at:latest.delivery.received,evidence_ref:(latest.delivery.ref as {id:string})?.id}:{site:'B',status:'unknown',confirmed_at:null,evidence_ref:null};
 if(!fields(condition,Object.keys(expectedCondition))||Object.entries(expectedCondition).some(([key,expected])=>condition[key]!==expected))return false;
 if(source.artifact_reports.some(item=>!record(item)||!record(item.report)||Object.hasOwn(item.report,'facility_confirmation')))return false;
 // Reuse the unchanged legacy validator for the common frame. This temporary
 // shape is never returned to the player or written to storage.
 const strip=(item:unknown)=>{if(!record(item)||!record(item.report))return item;const {facility_confirmation,...report}=item.report;void facility_confirmation;return {...item,report};};
 const common={...source,field_reports:source.field_reports.map(strip),artifact_reports:source.artifact_reports.map(strip),repair_condition:{site:'B',status:'required',confirmed_at:0,evidence_ref:'B23-INITIAL-B-REPAIR'}};
 if(!source_time_player_view(common)||!fields(action,['package','reports','deliveries','independence','assessments'])||!record(action.package)||!fields(action.package,['id','version'])||action.package.id!=='B32-CONFLICTING-ACTION-01'||action.package.version!==1)return false;
 if(!record(action.independence)||!fields(action.independence,['kind'])||action.independence.kind!=='unknown'||!dense_array(action.reports)||!dense_array(action.deliveries)||!dense_array(action.assessments)||action.assessments.length>32)return false;
 const ref=(v:unknown,kind:string,version=1):v is {run_id:string;kind:string;id:string;version:number}=>record(v)&&fields(v,['run_id','kind','id','version'])&&v.run_id===value.run_id&&v.kind===kind&&valid_id(v.id)&&v.version===version;
 const expected=Number(value.sim_time)>=22000?['FC1','FC2']:Number(value.sim_time)>=20000?['FC1']:[];
 if(action.reports.length!==expected.length||action.deliveries.length!==expected.length)return false;
 const received=new Map<string,number>();
 for(const [index,raw]of action.deliveries.entries()){
  const id=expected[index],at=id==='FC1'?20000:22000;
  if(!record(raw)||!fields(raw,['ref','report_ref','message_ref','sender','recipient','sent','received'])||!ref(raw.ref,'facility_delivery')||raw.ref.id!=='D-'+id||!ref(raw.report_ref,'facility_report')||raw.report_ref.id!==id||!ref(raw.message_ref,'facility_message')||raw.message_ref.id!=='MSG-D-'+id||raw.sender!=='FacilityArchive'||raw.recipient!=='HQ'||raw.sent!==at-1000||raw.received!==at)return false;
  received.set(id,at);
 }
 for(const [index,raw]of action.reports.entries()){
  const id=expected[index];
  if(!record(raw)||!fields(raw,['ref','target','source','claim','text','event_time','observed_time','source_reported_time','verification'])||!ref(raw.ref,'facility_report')||raw.ref.id!==id||raw.target!=='B'||raw.source!=='B点设施档案'||raw.claim!==(id==='FC1'?'operable':'faulted')||typeof raw.text!=='string'||raw.text.length>2000||raw.verification!=='unverified'||!record(raw.event_time)||!fields(raw.event_time,['kind'])||raw.event_time.kind!=='unknown')return false;
  for(const [field,ms,basis]of [['observed_time',10000,'observation'],['source_reported_time',id==='FC1'?15000:17000,'source-reported']] as const){const t=raw[field];if(!record(t)||!fields(t,['kind','value','basis_ref'])||t.kind!=='known'||t.value!==ms||!ref(t.basis_ref,'facility_basis')||t.basis_ref.id!==id+'-'+basis)return false;}
 }
 let previousTime=0;
 for(const [index,raw]of action.assessments.entries()){
  if(!record(raw)||!fields(raw,['ref','target_scope','explanations','preferred','basis_refs','supersedes','recorded_at',...(Object.hasOwn(raw,'reason')?['reason']:[])])||!ref(raw.ref,'working_assessment',index+1)||raw.ref.id!=='WA-B'||raw.target_scope!=='B'||!dense_array(raw.explanations)||JSON.stringify(raw.explanations)!==JSON.stringify(['operable','faulted'])||typeof raw.preferred!=='string'||!['operable','faulted','undecided'].includes(raw.preferred)||Object.hasOwn(raw,'reason')&&(typeof raw.reason!=='string'||raw.reason.length>1000)||!time(raw.recorded_at)||raw.recorded_at<previousTime||raw.recorded_at>Number(value.sim_time)||!dense_array(raw.basis_refs)||raw.basis_refs.length>8)return false;
  if(index===0?raw.supersedes!==null:!ref(raw.supersedes,'working_assessment',index)||raw.supersedes.id!=='WA-B')return false;
  const keys=new Set<string>();
  for(const basis of raw.basis_refs){if(!ref(basis,'facility_report')||!received.has(basis.id)||received.get(basis.id)!>raw.recorded_at||keys.has(basis.id))return false;keys.add(basis.id);}
  previousTime=raw.recorded_at;
 }
 return true;
}
