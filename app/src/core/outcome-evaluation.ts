import type {OutcomeState} from './outcome-state';
import type {OutcomeDefinition} from './outcome-definition';
import {outcome_decision_profile_for,outcome_decision_profile} from './outcome-definition';
import type {OutcomeEvaluation} from '../outcome-contracts';
import type {DecisionRecord,OutcomeDebriefAnswer,OutcomeDecisionEvaluation,OutcomeDecisionDimension} from '../outcome-contracts';
import {hash} from './scenario';
import {canonical} from './snapshot';
import {record} from '../protocol';

export async function evaluate_outcome_decision_record(decision:DecisionRecord,definition:OutcomeDefinition,binding:{run_id:string;run_digest:string;finished_seq:number},original:{receipt:{run_id:string;operation_id:string;revision:number;sim_time:number;fingerprint:string}|undefined;evidence:OutcomeDebriefAnswer['entries']}):Promise<OutcomeDecisionEvaluation>{
  const profile=outcome_decision_profile_for(definition),required=[decision.ref,decision.administrative_receipt_ref,...decision.basis_refs],fingerprint=await hash(canonical({run_id:binding.run_id,operation_id:decision.operation_id,expected_revision:decision.knowledge_revision,intent:decision.intent}));
  const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  const receipt=original.receipt,proof=receipt?.run_id===binding.run_id&&receipt.operation_id===decision.operation_id&&receipt.revision===decision.knowledge_revision+1&&receipt.sim_time===decision.at&&receipt.fingerprint===fingerprint&&await hash(decision.knowledge)===decision.knowledge_digest&&decision.known_then_refs.every(ref=>original.evidence.some(entry=>same(entry.ref,ref)));
  const result:OutcomeDecisionEvaluation={...binding,decision_ref:structuredClone(decision.ref),profile_ref:profile?{id:profile.id,version:profile.version,definition_hash:definition.definition_hash}:null,knowledge_revision:decision.knowledge_revision,at:decision.at,reason_status:decision.reason.kind,dimensions:[]};
  function unavailable(message:string){result.dimensions=(profile?.rules??outcome_decision_profile.rules).map(rule=>({rule_ref:{id:rule.id,version:rule.version},result:'not_evaluable',necessary_refs:structuredClone(required),known_then_refs:[],matched_conditions:[],missing:[message]}));return result;}
  if(!profile)return unavailable('本场景未登记四维评价规则，不能自动补入新能力。');
  if(!proof)return unavailable('必要的原始收据、知识摘要或当时引用无法核验，不能据此判为违规。');
  const intent=decision.intent,registration=profile.bindings.find(binding=>binding.operation===intent.kind&&binding.activity_id===('activity_ref' in intent?intent.activity_ref.id:null));
  if(!registration)return unavailable('这个实际动作没有注册适用的四维检查。');
  const selectedRefs=[...('actor_ref' in intent?[intent.actor_ref]:[]),...('activity_ref' in intent?[intent.activity_ref]:[]),...('authority_ref' in intent?[intent.authority_ref]:[]),...('receiver_ref' in intent?[intent.receiver_ref]:[]),...('return_route_ref' in intent?[intent.return_route_ref]:[]),...('plan_ref' in intent?[intent.plan_ref]:[])],rules=profile.rules;
  const make=(index:number,value:OutcomeDecisionDimension['result'],conditions:string[],missing:string[]):OutcomeDecisionDimension=>({rule_ref:{id:rules[index].id,version:1},result:value,necessary_refs:structuredClone([...required,...selectedRefs]),known_then_refs:structuredClone(decision.known_then_refs),matched_conditions:conditions,missing});

  if(intent.kind==='abort_outcome'){
    const authority=registration.authority==='HQ-outcome-management'&&decision.actor==='HQ'&&decision.at<definition.profile.parameters.deadline,version=decision.policy_ref===definition.rules.outcome_policy;
    if(!authority||!version)return unavailable('任务管理权限、签发窗口或原政策版本无法核验。');
    result.dimensions=[make(0,'not_evaluable',[],['not_applicable']),make(1,2,['A1','A2'],[]),make(2,1,['C1'],['管理中止已生效；远端获知和收尾仍待确认，不能由管理权限推定远端已接受。']),make(3,2,['V1','V2'],[])];return result;
  }
  if(intent.kind==='save_plan')return unavailable('not_applicable');
  if(intent.kind==='issue_activity'){
    const activity=definition.catalogs.activities.find(activity=>activity.id===intent.activity_ref.id),authority=definition.catalogs.authorities.find(authority=>authority.id===intent.authority_ref.id);
    const registered=!!activity&&activity.actor===intent.actor_ref.id&&!!authority&&authority.id===registration.authority&&authority.actors.includes(intent.actor_ref.id)&&definition.capabilities.some(capability=>capability.id===activity.capability&&capability.actor===activity.actor&&capability.action===activity.action);
    const window=!!authority&&decision.at>=authority.valid_from&&decision.at+definition.profile.parameters.link_ms<Math.min(authority.valid_to,definition.profile.parameters.deadline);
    const known=original.evidence.filter(entry=>decision.known_then_refs.some(ref=>same(ref,entry.ref))),basis=intent.basis_delivery_refs.every(ref=>known.some(entry=>entry.ref.kind==='delivery'&&entry.ref.run_id===ref.run_id&&entry.ref.id===ref.id&&entry.ref.version===ref.version));
    const fields=known.filter(entry=>entry.ref.kind==='report'&&record(entry.record.typed_payload)&&entry.record.typed_payload.kind==='field_status');
    const selected=intent.basis_delivery_refs.flatMap(ref=>known.filter(entry=>entry.ref.kind==='delivery'&&entry.ref.id===ref.id&&entry.ref.version===ref.version&&entry.ref.run_id===ref.run_id));
    const selectedProducts=selected.flatMap(delivery=>known.filter(entry=>record(entry.record.ref)&&same(entry.record.ref,delivery.record.product_ref??delivery.record.report_ref)));
    const arrived=(site:string)=>decision.knowledge.actors.some(actor=>actor.actor===intent.actor_ref.id&&actor.position_scope===site)&&fields.some(entry=>entry.record.actor===intent.actor_ref.id&&entry.record.phase==='completed'&&record(entry.record.confirmation)&&record(entry.record.confirmation.position)&&entry.record.confirmation.position.site===site);
    const requirements=registration.required.every(requirement=>{
      switch(requirement){
        case 'arrived_A':return arrived('A');
        case 'arrived_B':return arrived('B');
        case 'completed_A_record':return fields.some(entry=>entry.record.actor===intent.actor_ref.id&&entry.record.phase==='completed'&&record(entry.record.typed_payload)&&record(entry.record.typed_payload.activity_ref)&&entry.record.typed_payload.activity_ref.id==='A-record');
        case 'preparation_approved':return selectedProducts.some(entry=>entry.ref.kind==='event'&&entry.record.status==='approved'&&record(entry.record.ref)&&entry.record.ref.kind==='preparation_approval'&&same(entry.record.plan_ref,decision.knowledge.plan?.ref));
        case 'access_green':return selectedProducts.some(entry=>entry.ref.kind==='event'&&entry.record.kind==='source_validation'&&record(entry.record.conclusion)&&entry.record.conclusion.kind==='access_verified'&&entry.record.conclusion.value==='green');
        case 'repair_B':return selectedProducts.some(entry=>entry.ref.kind==='report'&&entry.record.actor==='W'&&entry.record.phase==='completed'&&entry.record.repair_condition==='repaired'&&record(entry.record.confirmation)&&record(entry.record.confirmation.position)&&entry.record.confirmation.position.site==='B');
        default:return false;
      }
    });
    const versions=intent.activity_ref.version===1&&intent.authority_ref.version===1&&intent.actor_ref.version===1&&same(decision.selected_versions.activity_ref,intent.activity_ref)&&same(decision.selected_versions.authority_ref,intent.authority_ref);
    if(!registered||!basis||!requirements||!versions)return unavailable('原始活动、授权、必要的不同凭证或实际版本无法核验。');
    result.dimensions=[make(0,2,['E1','E2'],[]),make(1,window?2:1,window?['A1','A2']:['A1'],window?[]:['当地执行窗口仍待确认。']),make(2,1,['C1'],['本决定所需前置凭证已核验；当地接令确认仍待收到。']),make(3,1,['V1'],['当前签发版本已绑定；当地接受版本仍待回报。'])];return result;
  }
  if(intent.kind==='request_source_validation'){
    const known=original.evidence.filter(entry=>decision.known_then_refs.some(ref=>same(ref,entry.ref)));
    const selected=intent.basis_delivery_refs.map(ref=>known.find(entry=>entry.ref.kind==='delivery'&&entry.ref.id===ref.id&&entry.ref.version===ref.version&&entry.ref.run_id===ref.run_id));
    const reports=selected.flatMap(delivery=>delivery&&'report_ref' in delivery.record?known.filter(entry=>entry.ref.kind==='report'&&same(entry.record.ref??{run_id:entry.ref.run_id,kind:'report',id:entry.ref.id,version:entry.ref.version},delivery.record.report_ref)):[]);
    const source=reports.some(entry=>{const origin=entry.record.origin;return typeof origin==='object'&&origin!==null&&'kind' in origin&&origin.kind==='known'&&'actor' in origin&&origin.actor===definition.catalogs.source.actor;});
    if(selected.some(entry=>!entry)||!source)return unavailable('被选中的原始来源报告及实际送达记录无法核验。');
    const legalWindow=decision.at<definition.profile.parameters.deadline,capacity=decision.knowledge.processing.energy_confirmed-decision.knowledge.processing.energy_reserved>=definition.profile.parameters.validation_work;
    result.dimensions=[make(0,2,['E1','E2'],[]),make(1,legalWindow?2:'not_evaluable',legalWindow?['A1','A2']:[],legalWindow?[]:['本次处理签发窗口无法核验。']),make(2,capacity?1:'not_evaluable',capacity?['C1']:[],[capacity?'请求已合法排队，核实结果仍待实际完成与送达。':'原始公开处理容量无法核验。']),make(3,2,['V1','V2'],[])];return result;
  }
  if(intent.kind==='request_preparation'){
    const snapshot=decision.knowledge,plan=snapshot.plan;
    const boundPlan=!!plan&&same(plan.ref,intent.plan_ref)&&same(decision.selected_versions.plan_ref,intent.plan_ref);
    if(!boundPlan)return unavailable('原始准备请求的计划版本无法核验。');
    const known=original.evidence.filter(entry=>decision.known_then_refs.some(ref=>same(ref,entry.ref)));
    const optionalComplete=known.some(entry=>entry.ref.kind==='report'&&'origin' in entry.record)&&known.some(entry=>entry.ref.kind==='event'&&entry.record.kind==='source_validation');
    const legalWindow=decision.at<definition.profile.parameters.deadline,canQueue=snapshot.processing.energy_confirmed-snapshot.processing.energy_reserved>=definition.profile.parameters.preparation_work;
    result.dimensions=[
      make(0,optionalComplete?2:1,optionalComplete?['E1','E2']:['E1'],optionalComplete?[]:['来源报告或核实结果属于辅助材料；尚未齐备，准备请求保留未知。']),
      make(1,legalWindow?2:'not_evaluable',legalWindow?['A1','A2']:[],legalWindow?[]:['签发窗口无法核验。']),
      make(2,canQueue?1:'not_evaluable',canQueue?['C1']:[],[canQueue?'已合法排队；准备工作及后续使用确认仍待收到。':'当时的公开处理容量无法核验。']),
      make(3,2,['V1','V2'],[])
    ];return result;
  }
  if(intent.kind!=='return_and_deliver')return unavailable('该动作的逐维检查尚未齐备，当前不能评价。');
  const actor=decision.knowledge.actors.find(actor=>actor.actor===intent.actor_ref.id),position=actor?.position_scope;
  const ownPosition=position!==undefined&&intent.return_route_ref.id===intent.actor_ref.id+'-'+position+'-H'&&['A','B'].includes(position);
  const basisKnown=decision.basis_refs.every(ref=>original.evidence.some(entry=>decision.known_then_refs.some(known=>same(known,entry.ref))&&entry.ref.kind==='delivery'&&entry.ref.run_id===ref.run_id&&entry.ref.id===ref.id&&entry.ref.version===ref.version));
  const authority=intent.authority_ref.id===registration.authority&&['R','W'].includes(intent.actor_ref.id)&&intent.receiver_ref.id==='H';
  const capabilities=definition.capabilities.some(capability=>capability.id===intent.actor_ref.id+':return');
  const timeWindow=decision.at>=intent.effective_window.from&&decision.at<Math.min(intent.effective_window.to,definition.profile.parameters.deadline);
  const executionWindow=decision.at+definition.profile.parameters.link_ms<Math.min(intent.effective_window.to,definition.profile.parameters.deadline);
  const ownCapacity=definition.profile.outcome.batch_people===3&&definition.profile.outcome.reception_seats>=3;
  const versions=intent.actor_ref.version===1&&intent.receiver_ref.version===1&&intent.authority_ref.version===1&&intent.return_route_ref.version===1&&same(decision.selected_versions.authority_ref,intent.authority_ref);
  function dimension(index:number,first:boolean,second:'met'|'partial'|'missing',message:string):OutcomeDecisionDimension{
    const rule=rules[index];return make(index,!first||second==='missing'?'not_evaluable':second==='partial'?1:2,[...(first?[rule.checks[0]]:[]),...(second==='met'?[rule.checks[1]]:[])],!first||second!=='met'?[message]:[]);
  }
  result.dimensions=[dimension(0,basisKnown,ownPosition?'met':'missing','必要的本组位置或实际引用无法核验。'),dimension(1,authority&&capabilities&&timeWindow,executionWindow?'met':'partial','当地执行窗口仍需确认，不能将签发当成当地已经接受。'),dimension(2,ownPosition&&ownCapacity,'partial','本决定只核本组与接收方；签发时接令、接收和保管确认仍待回报，不要求无关编组到齐。'),dimension(3,versions,'partial','实际请求绑定当前冻结版本；当地接受与后续引用在当时仍待确认。')];
  return result;
}

export function outcome_public_obligations(definition:OutcomeDefinition):string[]{
  return definition.catalogs.no_public_obligations?[]:definition.catalogs.actors.flatMap(a => Array.from({length:a.people}, (_,i) => a.id+'-person-'+(i+1)));
}

// Credit is based on existing verified completion and actual HQ delivery, never
// on an artifact merely present in the private field world.
export function evaluate_outcome(state:OutcomeState, at:number, definition:OutcomeDefinition, fallback:OutcomeEvaluation['result']):OutcomeEvaluation {
  const cutoff = state.termination?.scoring_cutoff ?? Math.min(at, definition.profile.parameters.deadline);
  const known = state.verification_deliveries.filter(d => d.received <= at).map(d => state.verification_reports.find(r => r.ref.id === d.report_ref.id)!);
  const qualified_artifacts = [...new Set(known.filter(r => r.observed.value <= cutoff).flatMap(r => r.artifacts.filter(a => a.status === 'verified').map(a => a.artifact_ref.id)))].sort();
  const confirmed_people = [...new Set(known.flatMap(r => r.personnel.filter(p => p.status === 'verified').map(p => p.person_id)))].sort();
  const required = outcome_public_obligations(definition);
  const acquisitions=state.prefix.field.deliveries.filter(d=>d.received<=at).map(d=>state.prefix.field.reports.find(r=>r.ref.id===d.report_ref.id)!).filter(r=>r.artifact!==null);
  const receptions=state.reception_deliveries.filter(d=>d.target==='HQ'&&d.received<=at).map(d=>state.reception_reports.find(r=>r.ref.id===d.report_ref.id)!).filter(r=>r.phase==='completed');
  const returns=state.return_deliveries.filter(d=>d.target==='HQ'&&d.received<=at).map(d=>state.return_reports.find(r=>r.ref.id===d.report_ref.id)!).filter(r=>r.phase==='completed');
  const artifactIds=[...new Set([...acquisitions.map(r=>r.artifact!.ref.id),...receptions.flatMap(r=>r.artifact_refs.map(a=>a.id)),...known.flatMap(r=>r.artifacts.map(a=>a.artifact_ref.id))])].sort();
  const artifact_status=artifactIds.map(id=>{
    const acquired_at=acquisitions.find(r=>r.artifact?.ref.id===id)?.artifact?.created_at??null;
    const delivered_at=receptions.find(r=>r.artifact_refs.some(a=>a.id===id))?.observed.value??null;
    const verification=state.verification_deliveries.filter(d=>d.received<=at).map(delivery=>({delivery,report:state.verification_reports.find(r=>r.ref.id===delivery.report_ref.id)!})).find(r=>r.report.artifacts.some(a=>a.artifact_ref.id===id&&a.status==='verified'));
    const verified_at=verification?.report.observed.value??null,confirmed_at=verification?.delivery.received??null;
    return {id,acquired_at,delivered_at,verified_at,confirmed_at,qualified:qualified_artifacts.includes(id),post_cutoff_effect:[acquired_at,delivered_at,verified_at].some(time=>time!==null&&time>cutoff)};
  });
  const personnel_status=required.map(id=>{
    const actor=id.startsWith('R-')?'R':'W',returned_at=returns.find(r=>r.actor===actor)?.observed.value??null;
    const received_at=receptions.find(r=>r.people_ids.includes(id))?.observed.value??null;
    const verification=state.verification_deliveries.filter(d=>d.received<=at).map(delivery=>({delivery,report:state.verification_reports.find(r=>r.ref.id===delivery.report_ref.id)!})).find(r=>r.report.personnel.some(p=>p.person_id===id&&p.status==='verified'));
    return {id,returned_at,received_at,verified_at:verification?.report.observed.value??null,confirmed_at:verification?.delivery.received??null};
  });
  const complete = qualified_artifacts.length === 2 && required.every(id => confirmed_people.includes(id));
  return {result: fallback === 'success' && complete ? 'success' : qualified_artifacts.length > 0 ? 'partial' : fallback,
    finished_at:at, scoring_cutoff:cutoff, qualified_artifacts, confirmed_people, missing_people:required.filter(id => !confirmed_people.includes(id)),artifact_status,personnel_status};
}

export function finish_outcome(state:OutcomeState, evaluation:OutcomeEvaluation):void {
  state.outcome = evaluation;
  state.finished = true;
  state.ended = true;
  state.paused = true;
  state.prefix.ended = true;
  state.prefix.paused = true;
}

export async function evaluate_outcome_rejection(rejection:import('../outcome-contracts').OutcomeRejectedDecision,definition:OutcomeDefinition,binding:{run_id:string;run_digest:string;finished_seq:number},proof:{record:import('../outcome-contracts').OutcomeRejectedDecision|undefined;source_digest:string|undefined}):Promise<OutcomeDecisionEvaluation>{
 const profile=outcome_decision_profile_for(definition),{ref,...body}=rejection,same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 const complete=!!profile&&same(proof.record,rejection)&&proof.source_digest===rejection.source_digest&&rejection.source_revision<binding.finished_seq&&ref.run_id===binding.run_id&&ref.id==='REJECT-'+await hash(canonical(body))&&rejection.request_digest===await hash(canonical(rejection.request))&&rejection.knowledge_digest===await hash(rejection.knowledge);
 let violation:string|null=null,violationCheck:string|null=null;const intent=rejection.request.intent;
 if(complete){
  if(rejection.code==='STALE_REVISION'&&rejection.request.expected_revision!==rejection.source_revision){violation='DQ-V';violationCheck='V1:violated';}
  if(rejection.code==='EVIDENCE_REQUIRED'&&intent.kind==='issue_activity'&&intent.basis_delivery_refs.length===0&&profile?.bindings.some(binding=>binding.operation===intent.kind&&binding.activity_id===intent.activity_ref.id&&binding.required.includes('preparation_approved'))){violation='DQ-E';violationCheck='E2:violated';}
  if(rejection.code==='INVALID_REQUEST'&&intent.kind==='issue_activity'){
   const activity=definition.catalogs.activities.find(activity=>activity.id===intent.activity_ref.id),grant=definition.catalogs.authorities.find(grant=>grant.id===intent.authority_ref.id);
   if(activity&&(!grant||activity.actor!==intent.actor_ref.id||!grant.actors.includes(intent.actor_ref.id))){violation='DQ-A';violationCheck='A1:violated';}else if(activity&&grant&&(rejection.at<grant.valid_from||rejection.at>=grant.valid_to)){violation='DQ-A';violationCheck='A2:violated';}
  }
  if(rejection.code==='CAPACITY_CONFLICT'&&intent.kind==='issue_activity'&&rejection.public_constraints.return_plans.some(plan=>plan.actor===intent.actor_ref.id)){violation='DQ-C';violationCheck='C1:violated';}
 }
 const messages={'DQ-E':'实际请求缺少公开必需的准备凭证，已被拒绝。','DQ-A':'实际请求不符合公开主体、动作或授权窗口，已被拒绝。','DQ-C':'本组已有返回承诺，新的主活动违反公开协调约束，已被拒绝。','DQ-V':'实际旧版本提交已被拒绝，未形成World输入。'};
 const dimensions:OutcomeDecisionDimension[]=(profile?.rules??outcome_decision_profile.rules).map(rule=>({rule_ref:{id:rule.id,version:1},result:complete&&rule.id===violation?0:'not_evaluable',necessary_refs:[structuredClone(ref)],known_then_refs:complete?structuredClone(rejection.known_then_refs):[],matched_conditions:complete&&rule.id===violation&&violationCheck?[violationCheck]:[],missing:[complete?(rule.id===violation?messages[rule.id]:'被拒绝请求未形成已提交决定，不据此推定其他维度。'):'原始拒绝记录或来源节点无法核验，不能据此判为违规。']}));
 return {...binding,decision_ref:structuredClone(ref),profile_ref:profile?{id:profile.id,version:1,definition_hash:definition.definition_hash}:null,knowledge_revision:rejection.source_revision,at:rejection.at,reason_status:'reason' in rejection.request.intent&&rejection.request.intent.reason!==undefined?'recorded':'not_recorded',dimensions};
}
