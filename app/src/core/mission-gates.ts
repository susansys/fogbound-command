import type {ConditionExpr,MissionGateEvaluation,MissionTruth,MissionExpiry} from '../mission-contracts';
import type {PositionKnowledge} from '../play-contracts';
import type {PublicMap} from '../spatial';
import {GameError} from '../contracts';
import {compare_mission_position} from './mission-geometry';

type GateContext={evaluated_by:'HQ'|'R';revision:number;at:number;rule_version:string;capability:{ready:boolean;evidence_refs:string[]};route:{permitted:boolean;evidence_refs:string[]};confirmation:{confirmed:boolean;evidence_refs:string[]};position:{knowledge:PositionKnowledge;max_age_ms:number;valid_until_time_ms:number};map:PublicMap};
type Result={result:MissionTruth;conditions:MissionGateEvaluation['conditions'];evidence_refs:string[];expires_at_time_ms:MissionExpiry};
function support_expiry(values:MissionExpiry[],latest:boolean):MissionExpiry{
  if(values.some(x=>x.kind==='unknown'))return {kind:'unknown'};
  if(latest&&values.some(x=>x.kind==='timeless'))return {kind:'timeless'};
  const times=values.flatMap(x=>x.kind==='known'?[x.value]:[]);
  return times.length?{kind:'known',value:latest?Math.max(...times):Math.min(...times)}:{kind:'timeless'};
}
export function evaluate_mission_gate(gate_id:string,expression:ConditionExpr,context:GateContext):MissionGateEvaluation{
  const visit=(expr:ConditionExpr):Result=>{
    if(expr.kind==='not'){
      const child=visit(expr.child);
      return {...child,result:child.result==='T'?'F':child.result==='F'?'T':'U'};
    }
    if(expr.kind==='all'||expr.kind==='any'){
      const children=expr.children.map(visit),dominant=expr.kind==='all'?'F':'T';
      const result:MissionTruth=children.some(x=>x.result===dominant)?dominant:children.some(x=>x.result==='U')?'U':expr.kind==='all'?'T':'F';
      return {result,conditions:children.flatMap(x=>x.conditions),evidence_refs:[...new Set(children.flatMap(x=>x.evidence_refs))],expires_at_time_ms:result==='U'?{kind:'unknown'}:support_expiry(children.filter(x=>x.result===result).map(x=>x.expires_at_time_ms),result===dominant)};
    }
    let result:MissionTruth='U',evidence_refs:string[]=[],expires_at_time_ms:MissionExpiry={kind:'unknown'};
    if(expr.kind==='compare'&&expr.field_ref==='capability.ready'){
      const matches=context.capability.ready===expr.typed_value;
      result=(expr.operator==='eq'?matches:!matches)?'T':'F';evidence_refs=[...context.capability.evidence_refs];expires_at_time_ms={kind:'timeless'};
    }
    if(expr.kind==='compare'&&expr.field_ref==='route.permitted'){
      const matches=context.route.permitted===expr.typed_value;
      result=(expr.operator==='eq'?matches:!matches)?'T':'F';evidence_refs=[...context.route.evidence_refs];expires_at_time_ms={kind:'timeless'};
    }
    if(expr.kind==='compare'&&expr.field_ref==='phase.confirmed'){
      const matches=context.confirmation.confirmed===expr.typed_value;
      result=(expr.operator==='eq'?matches:!matches)?'T':'F';evidence_refs=[...context.confirmation.evidence_refs];expires_at_time_ms={kind:'timeless'};
    }
    if(expr.kind==='compare'&&expr.field_ref==='position.scope'){
      const position=context.position.knowledge;
      evidence_refs=position.status==='conflicting'?[...new Set(position.candidates.flatMap(c=>c.evidence_refs))]:[...position.evidence_refs];
      if(position.observed.kind==='known'){
        if(position.observed.value>context.at)throw new GameError('EVIDENCE_REQUIRED');
        expires_at_time_ms={kind:'known',value:Math.min(position.observed.value+context.position.max_age_ms,context.position.valid_until_time_ms)};
      }
      if(position.status!=='conflicting'&&position.received!==null&&position.received>context.at)throw new GameError('EVIDENCE_REQUIRED');
      if(position.status==='conflicting'){
        const target=context.map.scopes.find(scope=>scope.id===expr.typed_value);
        const candidates=position.candidates.map(candidate=>{
          if(candidate.received!==null&&candidate.received>context.at||candidate.observed.kind==='known'&&candidate.observed.value>context.at)throw new GameError('EVIDENCE_REQUIRED');
          const expiry:MissionExpiry=candidate.observed.kind==='known'?{kind:'known',value:Math.min(candidate.observed.value+context.position.max_age_ms,context.position.valid_until_time_ms)}:{kind:'unknown'};
          return {expiry,result:expiry.kind==='known'&&context.at<expiry.value&&target?compare_mission_position(candidate.scope,target,expr.operator,context.map):'U' as MissionTruth};
        });
        result=candidates.length&&candidates.every(c=>c.result==='T')?'T':candidates.length&&candidates.every(c=>c.result==='F')?'F':'U';
        expires_at_time_ms=support_expiry(candidates.map(c=>c.expiry),false);
      }
      if(position.status==='known_scope'&&position.observed.kind==='known'&&expires_at_time_ms.kind==='known'&&context.at<expires_at_time_ms.value){
        const target=context.map.scopes.find(scope=>scope.id===expr.typed_value),scope=position.scope;
        if(target)result=compare_mission_position(scope,target,expr.operator,context.map);
      }
    }
    return {result,evidence_refs,expires_at_time_ms,conditions:[{condition:structuredClone(expr) as Extract<ConditionExpr,{kind:'compare'}>,result,evidence_refs:[...evidence_refs],expires_at_time_ms}]};
  };
  return {gate_id,rule_version:context.rule_version,evaluated_by:context.evaluated_by,knowledge_revision:context.revision,evaluated_at_time_ms:context.at,...visit(expression)};
}
